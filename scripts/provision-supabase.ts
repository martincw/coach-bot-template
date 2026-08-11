/**
 * Auto-provision a Supabase project end-to-end.
 *
 * Required env: SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 * Optional env:
 *   SUPABASE_PROJECT_NAME (default: "coach-bot-prod")
 *   SUPABASE_REGION       (default: "us-east-1")
 *   SUPABASE_ORG_ID       (default: first org returned)
 *
 * Writes results to .env.local. Saves intermediate state to .supabase-provision.json
 * so that retries can pick up an existing project (no free-tier slot wasted on transient failures).
 */

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import postgres from 'postgres';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Get one at https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const NAME = process.env.SUPABASE_PROJECT_NAME || 'coach-bot-prod';
const REGION = process.env.SUPABASE_REGION || 'us-east-1';
const STATE_FILE = '.supabase-provision.json';
const API = 'https://api.supabase.com';

type State = { ref: string; dbPass: string; orgId: string };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} → ${r.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function genPassword(): string {
  return randomBytes(32).toString('base64url');
}

function loadState(): State | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
  } catch {
    return null;
  }
}

function saveState(s: State) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

async function pickOrg(): Promise<string> {
  if (process.env.SUPABASE_ORG_ID) return process.env.SUPABASE_ORG_ID;
  const orgs = await api<Array<{ id: string; name: string }>>('/v1/organizations');
  if (!orgs.length) throw new Error('No Supabase organizations found for this token.');
  console.log(`  Using organization: ${orgs[0].name} (${orgs[0].id})`);
  return orgs[0].id;
}

async function createProject(orgId: string, dbPass: string) {
  console.log(`  Creating project "${NAME}" in ${REGION}…`);
  return api<{ id: number; ref: string; name: string; status: string }>('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({ name: NAME, organization_id: orgId, region: REGION, db_pass: dbPass, plan: 'free' }),
  });
}

async function waitActive(ref: string) {
  const start = Date.now();
  let lastStatus = '';
  while (true) {
    const p = await api<{ status: string }>(`/v1/projects/${ref}`);
    if (p.status !== lastStatus) {
      console.log(`  status: ${p.status}`);
      lastStatus = p.status;
    }
    if (p.status === 'ACTIVE_HEALTHY') return;
    if (p.status === 'INIT_FAILED' || p.status === 'REMOVED') throw new Error(`Provisioning failed: status=${p.status}`);
    if (Date.now() - start > 5 * 60 * 1000) throw new Error('Timed out waiting for project to become healthy.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

type ApiKeyItem = { name: string; api_key?: string; key?: string };

async function fetchKeys(ref: string): Promise<{ anon: string; service: string }> {
  const keys = await api<ApiKeyItem[]>(`/v1/projects/${ref}/api-keys?reveal=true`);
  const get = (n: string) => {
    const k = keys.find((x) => x.name === n);
    return k?.api_key || k?.key;
  };
  const anon = get('anon');
  const service = get('service_role');
  if (!anon || !service) throw new Error(`Missing anon/service_role keys: ${JSON.stringify(keys.map((k) => k.name))}`);
  return { anon, service };
}

async function fetchPoolerHost(ref: string): Promise<string | null> {
  const candidates = [
    `/v1/projects/${ref}/config/database/pooler`,
    `/v1/projects/${ref}/config/database`,
    `/v1/projects/${ref}/database`,
  ];
  for (const path of candidates) {
    try {
      const data = await api<any>(path);
      const host = data?.db_host || data?.host || data?.pooler_host || data?.connection_string;
      if (typeof host === 'string') {
        const m = host.match(/(aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com)/);
        if (m) return m[1];
      }
    } catch {}
  }
  return null;
}

async function tryConnect(url: string, label: string): Promise<boolean> {
  const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 10, idle_timeout: 1 });
  try {
    await sql`SELECT 1`;
    await sql.end({ timeout: 1 });
    console.log(`  pooler reachable: ${label}`);
    return true;
  } catch (e: any) {
    await sql.end({ timeout: 1 }).catch(() => {});
    return false;
  }
}

async function probePooler(ref: string, password: string, region: string): Promise<string> {
  const knownHost = await fetchPoolerHost(ref);
  const hosts: string[] = [];
  if (knownHost) hosts.push(knownHost);
  for (const prefix of ['aws-0', 'aws-1']) {
    for (const r of [region, 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'ap-southeast-1']) {
      const h = `${prefix}-${r}.pooler.supabase.com`;
      if (!hosts.includes(h)) hosts.push(h);
    }
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    if (attempt > 1) {
      console.log(`  attempt ${attempt}: waiting 20s for pooler to warm up…`);
      await new Promise((r) => setTimeout(r, 20000));
    }
    for (const host of hosts) {
      const url = `postgresql://postgres.${ref}:${password}@${host}:6543/postgres`;
      if (await tryConnect(url, host)) return url;
    }
  }
  throw new Error('Could not reach the pooler after multiple attempts. The project exists; retrying the script will resume.');
}

function upsertEnvLocal(updates: Record<string, string>) {
  const path = '.env.local';
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = existing.split('\n');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && updates[m[1]] !== undefined) {
      out.push(`${m[1]}=${updates[m[1]]}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  writeFileSync(path, out.join('\n'));
}

async function main() {
  console.log('Provisioning Supabase…');
  const existing = loadState();
  let state: State;

  if (existing) {
    console.log(`  Resuming from existing state: ref=${existing.ref}`);
    state = existing;
  } else {
    const orgId = await pickOrg();
    const dbPass = genPassword();
    const project = await createProject(orgId, dbPass);
    state = { ref: project.ref, dbPass, orgId };
    saveState(state);
    console.log(`  Project created: ref=${project.ref} (state saved to ${STATE_FILE})`);
  }

  console.log('  Waiting for project to become healthy…');
  await waitActive(state.ref);

  console.log('  Pausing 30s for pooler to come online…');
  await new Promise((r) => setTimeout(r, 30000));

  console.log('  Fetching API keys…');
  const { anon, service } = await fetchKeys(state.ref);

  console.log('  Probing pooler endpoint…');
  const databaseUrl = await probePooler(state.ref, state.dbPass, REGION);

  upsertEnvLocal({
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_SUPABASE_URL: `https://${state.ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  });

  console.log('');
  console.log('Done. Wrote .env.local.');
  console.log(`Dashboard: https://supabase.com/dashboard/project/${state.ref}`);
}

main().catch((e) => {
  console.error('\nProvisioning failed:', e.message || e);
  console.error('State saved to .supabase-provision.json — re-run the script to resume.');
  process.exit(1);
});
