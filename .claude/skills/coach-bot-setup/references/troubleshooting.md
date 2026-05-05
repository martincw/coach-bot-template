# Troubleshooting

Common issues you'll hit during onboarding and what to do.

## Database / Supabase

### `connect EHOSTUNREACH` or `ECONNREFUSED` on port 5432
The user is trying to connect via the **direct connection** instead of the pooler. The direct connection only accepts IPv6, which most networks block.

Fix: have them re-copy the Transaction Pooler URL from Supabase dashboard → Project Settings → Database → Connection string → "Transaction pooler" tab. The host should be `aws-X-<region>.pooler.supabase.com:6543`, not `db.<ref>.supabase.co:5432`.

### `password authentication failed`
The password in their connection string is wrong, or special characters weren't URL-encoded.

Fix: encode special chars in the password:
- `#` → `%23`
- `*` → `%2A`
- `&` → `%26`
- `?` → `%3F`
- `@` → `%40`
- space → `%20`

If they don't remember the password, have them reset it in Supabase: Project Settings → Database → "Reset database password".

### `relation "X" does not exist`
They haven't run `bun run db:init` yet. Run it.

### `permission denied for table X`
The user is connecting with a non-superuser role. Confirm they're using the connection string from the dashboard (which uses the `postgres` role), not a custom one.

### `extension "vector" is not available`
pgvector isn't enabled on this project. The `db:init` script enables it as the first step, so this shouldn't happen if they ran it. Have them run `bun run db:init` again.

## OpenAI

### `Insufficient credits` / `You exceeded your quota`
The user's OpenAI account has no balance. Have them add credit at https://platform.openai.com/settings/organization/billing/overview.

### `model "gpt-5.5" not found`
The model name has changed since the template was written, OR their account doesn't have access to gpt-5.5 yet.

Fix: edit `lib/brand.ts` → `chatModel` to a model their account supports. Common alternatives: `gpt-4.1`, `gpt-4o`. They can find their available models at https://platform.openai.com/models.

### `401 Unauthorized` from OpenAI
The API key in `.env.local` is wrong or revoked. Have them generate a new key at https://platform.openai.com/api-keys.

## Vercel deploy

### Build succeeds locally but fails on Vercel
Almost always: missing env var. Have them check Vercel dashboard → project → Settings → Environment Variables. Required:
- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Make sure each is set for **both Production AND Preview** environments.

### `DATABASE_URL is not set`
They forgot to add `DATABASE_URL` in Vercel env vars. Add it.

### Function timeouts in production
The default Vercel timeout is 10 seconds on Hobby plan, 60 seconds on Pro. Long chat responses can hit this. Solutions:
- Upgrade to Vercel Pro for 60s timeout
- Or keep responses short (most coaching responses fit in 10s)

The route already declares `export const maxDuration = 60` which raises it to 60s on Pro.

## Auth / Login flow

### Email confirmation link goes to localhost
They didn't update the Site URL in Supabase after deploying.

Fix: Supabase → Authentication → URL Configuration → set Site URL to their Vercel production URL. Add the same as a Redirect URL.

### "Confirmation email never arrives"
Check spam. Supabase emails come from `noreply@mail.app.supabase.io` by default. For production, recommend setting up a custom SMTP (Supabase → Authentication → Email Templates → SMTP Settings).

For MVP testing, they can disable email confirmation entirely: Supabase → Authentication → Providers → Email → uncheck "Confirm email".

### "I'm logged in but the chat creates a new chat each time"
Working as designed — every visit to `/` creates a fresh chat. They can navigate between past chats via the sidebar.

## Memory / RAG behavior

### Bot keeps saying "I don't have information on that"
Either:
1. The training content didn't get ingested. Check: `SELECT COUNT(*) FROM documents` in Supabase SQL editor. Should be > 0.
2. The persona prompt is being too literal about the fallback. Soften the constraint in `BRAND.personaPrompt`.

### Bot doesn't seem to remember past conversations
Check the dev logs for `[memory]` lines. Each successful extraction logs `extracted=N saved=N deduped=N`. If you see saved=0 every time, the LLM isn't extracting anything — review the conversation; it may be too generic to extract from.

You can also peek directly: `SELECT fact FROM user_memory WHERE user_id = '<user-uuid>' ORDER BY created_at DESC`.

### Bot mentions its training data / breaks character
The persona prompt isn't strict enough. Tighten constraint #1 in `BRAND.personaPrompt` ("Never mention or imply that you have training data...").

## Attachments

### Image attachment doesn't get described
Make sure the chat model supports vision. `gpt-5.5` does; some smaller/older models don't. If using a non-vision model, swap to `gpt-4o` or another vision-capable one in `lib/brand.ts`.

### PDF/DOCX upload fails or comes back empty
Some PDFs are scanned images (no extractable text). The current pipeline doesn't OCR — text-only PDFs work, scanned PDFs return empty. If users complain, OCR support is a future enhancement.

### "File too large"
The default limit is 8MB per file (set in `app/chat/[id]/chat.tsx` as `MAX_FILE_BYTES`). Adjust if needed.

## Generic Next.js / build issues

### "Cannot find module './vendor-chunks/...'"
Stale `.next` cache. Run `rm -rf .next && bun run dev`.

### "Module not found" after pulling new code
Run `bun install` to pick up new deps.

### TypeScript errors during build
The template excludes `scripts/` from typecheck (in `tsconfig.json`) since those are CLI-only. If they added new app code with type errors, fix the errors normally.
