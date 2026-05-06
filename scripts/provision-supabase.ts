/**
 * Provision a new Supabase project automatically using the Management API.
 *
 * The user's only job: generate a Personal Access Token at
 * https://supabase.com/dashboard/account/tokens and paste it.
 *
 * This script then:
 *   1. Creates a new Supabase project (asks for name + region).
 *   2. Generates a strong random database password.
 *   3. Polls until provisioning completes (~60–120 sec).
 *   4. Fetches the URL, anon key, and service-role key.
 *   5. Probes the pooler URL prefix (aws-0 vs aws-1) and builds DATABASE_URL.
 *   6. Writes everything to .env.local.
 *
 * Usage:
 *   bun run provision-supabase
 *
 * Required env: SUPABASE_ACCESS_TOKEN (the PAT from supabase.com/dashboard/account/tokens)
 *
 * Optional env:
 *   SUPABASE_PROJECT_NAME — defaults to "coach-bot-prod"
 *   SUPABASE_REGION       — defaults to "us-east-1"
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

const API = 'https://api.supabase.com';
const ENV_FILE = '.env.local';

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MINUTES = 5;

async function main() {
  const PAT = process.env.SUPABASE_ACCESS_TOKEN;
  if (!PAT) {
    console.error('SUPABASE_ACCESS_TOKEN not set.');
    console.error('');
    console.error('Get one at: https://supabase.com/dashboard/account/tokens');
    console.error('Then paste it like:');
    console.error('  SUPABASE_ACCESS_TOKEN=sbp_... bun run provision-supabase');
    process.exit(1);
  }
  const projectName = process.env.SUPABASE_PROJECT_NAME || 'coach-bot-prod';
  const region = process.env.SUPABASE_REGION || 'us-east-1';

  // 1. Find the user's organization.
  console.log('Looking up your Supabase organization...');
  const orgs = await sbApi<Array<{ id: string; name: string }>>(PAT, 'GET', '/v1/organizations');
  if (orgs.length === 0) {
    console.error('No Supabase organizations found. Sign up at https://supabase.com first.');
    process.exit(1);
  }
  const org = orgs[0]; // first org (free tier users have exactly one)
  console.log(`  Organization: ${org.name} (${org.id})`);

  // 2. Generate a strong DB password — URL-safe so we don't need to encode.
  const dbPassword = randomBytes(24).toString('base64url');

  // 3. Create the project.
  console.log(`Creating project "${projectName}" in ${region}...`);
  const project = await sbApi<{ id: string; name: string; status: string }>(
    PAT,
    'POST',
    '/v1/projects',
    {
      name: projectName,
      organization_id: org.id,
      db_pass: dbPassword,
      region,
      plan: 'free',
    },
  );
  const ref = project.id;
  console.log(`  Project ref: ${ref}`);
  console.log('  Provisioning... (this takes 1–2 minutes)');

  // 4. Poll until healthy.
  const startedAt = Date.now();
  const deadline = startedAt + POLL_MAX_MINUTES * 60_000;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await sbApi<{ status: string }>(PAT, 'GET', `/v1/projects/${ref}`);
    process.stdout.write(`  status: ${status.status}\n`);
    if (status.status === 'ACTIVE_HEALTHY') break;
    if (status.status.startsWith('REMOVED') || status.status === 'INIT_FAILED') {
      console.error(`Project failed to provision: ${status.status}`);
      process.exit(1);
    }
  }

  // 5. Enable pgvector now (the Management API has a config endpoint for this,
  //    but we can also enable it later via direct SQL after we connect).

  // 6. Fetch API keys.
  console.log('Fetching API keys...');
  const keys = await sbApi<Array<{ name: string; api_key: string }>>(
    PAT,
    'GET',
    `/v1/projects/${ref}/api-keys`,
  );
  const anonKey = keys.find((k) => k.name === 'anon')?.api_key;
  const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!anonKey || !serviceKey) {
    console.error('Could not find anon and service_role keys in API response.');
    console.error('Got:', keys.map((k) => k.name).join(', '));
    process.exit(1);
  }

  // 7. Probe the pooler URL — try aws-0 first, then aws-1.
  console.log('Locating the pooler endpoint...');
  let databaseUrl: string | null = null;
  for (const prefix of ['aws-0', 'aws-1']) {
    const candidate = `postgresql://postgres.${ref}:${encodeURIComponent(dbPassword)}@${prefix}-${region}.pooler.supabase.com:6543/postgres`;
    process.stdout.write(`  trying ${prefix}-${region}.pooler.supabase.com... `);
    if (await testConnection(candidate)) {
      console.log('✓');
      databaseUrl = candidate;
      break;
    }
    console.log('✗');
  }
  if (!databaseUrl) {
    console.error('Could not reach the pooler. The project may need another minute. Try re-running.');
    process.exit(1);
  }

  // 8. Write .env.local.
  console.log(`Writing credentials to ${ENV_FILE}...`);
  await upsertEnv({
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  });

  // 9. Save the DB password too — they may want it later. (Same file; gitignored.)
  await upsertEnv({ SUPABASE_DB_PASSWORD: dbPassword });

  console.log('\n✓ Done. Your Supabase project is provisioned and credentials are in .env.local.');
  console.log(`\n  Project URL: https://${ref}.supabase.co`);
  console.log(`  Dashboard:   https://supabase.com/dashboard/project/${ref}`);
  console.log('\nNext: run `bun run db:init` to create the tables and RLS policies.');
}

// --- helpers ---

async function sbApi<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${method} ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function testConnection(url: string): Promise<boolean> {
  const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 5 });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    try {
      await sql.end();
    } catch {
      // ignore
    }
  }
}

async function upsertEnv(entries: Record<string, string>): Promise<void> {
  let current = '';
  try {
    await access(ENV_FILE);
    current = await readFile(ENV_FILE, 'utf8');
  } catch {
    // file doesn't exist — fine, we'll create it
  }
  for (const [key, value] of Object.entries(entries)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(current)) {
      current = current.replace(re, `${key}=${value}`);
    } else {
      if (current && !current.endsWith('\n')) current += '\n';
      current += `${key}=${value}\n`;
    }
  }
  await writeFile(ENV_FILE, current, 'utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
