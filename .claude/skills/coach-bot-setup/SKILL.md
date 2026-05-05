---
name: coach-bot-setup
description: Guided end-to-end setup wizard for the coach-bot-template — a brandable AI coaching chatbot with auth, RAG over training docs, auto user-memory, and image/PDF/audio attachments. Walks the user through everything in chat: branding (name, tagline, logo, persona prompt, accent color), creating Supabase + OpenAI accounts, writing all environment variables for them, initializing the database, transcribing video/audio (optional), ingesting training content, testing locally, and deploying to Vercel. CRITICAL DESIGN PRINCIPLE — Claude runs every command on the user's behalf via the Bash tool. The user only ever types in chat (answers, pasted values from their browser). Never tell the user to "run X command" or "edit Y file" — Claude does it for them. Trigger this skill whenever the user has cloned the coach-bot-template repo and is starting setup, OR when the user is in any directory containing `lib/brand.ts` and `scripts/init-supabase.ts` and has not yet completed setup, OR when the user says any of: "set up my coaching bot", "configure this template", "I just cloned coach-bot-template", "onboard me", "help me launch my chatbot", "I want to build my own coaching AI", "ready to start", "ready". Always proactively offer this skill when the user enters a directory with `lib/brand.ts` and looks unfamiliar with the codebase or hasn't run setup yet.
---

# Coach Bot Setup Wizard

You're walking the user through standing up their own branded AI coaching chatbot from scratch. The end state: a working app at their own URL, populated with their training content, with their voice and brand, deployed to Vercel.

## Core principle — Claude runs everything

The user is a **non-technical coach**. They are NOT a developer. They cannot type bash commands. They cannot edit `.env` files. They cannot understand "URL-encode the password" or "transaction pooler port 6543."

**You run every command for them via the Bash tool.** They only type in chat: short answers, pasted values from their browser tabs.

Never say things like:
- ❌ "Run `bun install`"
- ❌ "Edit `.env.local` and add..."
- ❌ "Open a new terminal and..."
- ❌ "URL-encode special characters in your password"

Always say things like:
- ✅ "I'll install dependencies now." [then run `bun install` via Bash]
- ✅ "I'll write that into your config for you." [then write the file]
- ✅ "Paste your password here and I'll handle the encoding."
- ✅ "I'll run the setup script now." [then run it]

Treat them like a client meeting with a developer. They explain what they want; you handle the keys and the typing.

## When to start

When the user triggers this skill, first figure out where they are:

1. Use Bash to check whether `lib/brand.ts`, `app/api/chat/route.ts`, and `scripts/init-supabase.ts` exist in the current working directory.
2. **If they exist**: skip "Bootstrap"; greet them and lay out the 6-phase roadmap.
3. **If they don't exist**: run the Bootstrap below. You will clone the repo for them — they will not type any commands.

## Bootstrap (Claude clones for them — no terminal commands from the user)

Greet warmly, then ask:

> "Welcome! Before we start branding your bot, I need to download the template code to your computer. Where would you like it to live?
>
> A few common spots:
> - Your Desktop (good if you want easy access)
> - Your Documents folder
> - Your home folder (`~`)
>
> Just tell me where, and a name for the project folder (e.g. 'shosh-ai' or 'my-coach'), and I'll set it up."

Once they answer (parse loosely — accept "desktop", "documents", paths with `~`, etc.), run the clone yourself:

```bash
git clone https://github.com/martincw/coach-bot-template <full-path>
```

Then **stay in this same Claude session.** You don't need them to relaunch Claude. From now on, every Bash command you run will use the project path as a prefix:

```bash
cd <full-path> && <command>
```

…because cwd doesn't persist between Bash calls. Use absolute paths or the `cd && cmd` pattern for everything from here on.

After the clone succeeds, confirm it worked by checking that `lib/brand.ts` exists at the new path. Then tell the user: "Cloned to `<path>`. Let's start with branding."

## The 6 phases

Once you're confirmed inside the cloned template, tell them:

> "Welcome! I'm going to walk you through setup — about 30 minutes if everything goes smoothly. There are 6 phases:
> 1. **Branding** — what your bot's called, how it sounds
> 2. **Accounts + keys** — Supabase + OpenAI signup
> 3. **Database** — I'll set it up for you
> 4. **Training content** — your coaching material
> 5. **Test locally** — chat with your bot
> 6. **Deploy** — ship it live
>
> Two questions to start thinking about:
> - What's your bot's name and what kind of coaching does it do?
> - Do you have your training content already (text? PDFs? video?)
>
> Ready to start?"

Wait for "yes" or similar. Then proceed.

### Phase 1 — Branding

Walk them through `lib/brand.ts` field by field, but **don't ask them to open or edit the file**. You'll write it for them when you're done.

Use AskUserQuestion to gather efficiently. Ask 2-4 questions at a time, not one at a time:

**First batch:**
- **Bot's name** (e.g. "Shosh A.I.", "Marcus", "Atlas")
- **Tagline** (e.g. "Your Vortex coach", "Your business strategist") — one short line, shown under the name
- **Bot's coaching domain** (e.g. "business strategy for service founders", "embodiment coaching for women", "fitness for desk workers") — informs the persona

**Second batch:**
- **Logo** — ask them where the image file is on their computer (Desktop, Downloads, etc.). Then YOU copy it via Bash to `public/logo.<ext>` and update `BRAND.logoSrc`. If they don't have a logo, fall back to the gold-text rendering (have them say "use a text logo" — you'll set `logoSrc: ''` and the chat.tsx will render the wordmark from name).
- **Brand color** — used for the user's chat bubbles. Show them a few options (pink #ff8fa3, blue #6cb4ff, green #6cd6a8, gold #c8a25f, purple #b388ff) or ask for a hex code. If they say "match my logo" and don't know hex, suggest they tell you a color word ("dusty pink", "navy") and you'll pick a hex.
- **Where their existing site or dashboard lives** — for the "Back to Dashboard" link in the sidebar. If they don't have one, leave the default or ask if they want to remove that link.

**Third batch — the persona:**
This is the most important field. Read [references/persona-writing-guide.md](references/persona-writing-guide.md) before this step so you can guide them well.

Tell them: "The persona is what makes your bot's voice distinctive. It's the most important part — bad persona = bad bot. I can either:
- (a) Walk you through writing it from scratch — I'll ask you 5-6 questions and draft it for you to refine
- (b) Take a draft you've already written and polish it
- (c) Skip it for now (use the default Shosh-style persona) and refine later

Which works for you?"

If (a): walk them through identity, voice, constraints, fallback behavior. Draft a 200-400 word persona prompt. Show it to them. Iterate based on their feedback.

If (b): paste their draft, gently tighten it (remove vague language, add structure if missing), show the result.

If (c): note that they should come back to this later. Keep the existing Shosh persona as a placeholder.

After all fields gathered, **YOU write `lib/brand.ts`** using Edit with all the new values. Show them a summary, not a diff: "I updated your branding. Your bot is named [Name], with [tagline]. Persona is set. Ready for accounts?"

### Phase 2 — Accounts + keys

Three accounts to set up. Walk them through one at a time.

#### Supabase (database + auth)

Tell them:
> "Supabase is where your bot's data lives — user accounts, chat history, training material. Free tier is plenty for thousands of users.
>
> 1. Go to https://supabase.com and sign up (use Google or GitHub for fastest signup).
> 2. Click 'New Project'.
> 3. Name it whatever (e.g. 'shosh-ai-prod'). Pick the region closest to you.
> 4. **WRITE DOWN THE DATABASE PASSWORD** when it shows it to you — it's only shown once. Save it somewhere safe.
> 5. Click 'Create new project' and wait ~1 minute for it to finish provisioning.
>
> Tell me when the project is ready."

Once they say it's ready:

> "Great. Now I need 4 values from your Supabase dashboard. I'll tell you exactly where to click for each one.
>
> **First**: Click 'Project Settings' (gear icon, bottom left) → 'API' (in the sidebar). You'll see two values I need. Paste them both here, separated by a space or new lines:
> - 'Project URL' (looks like `https://abcdefg.supabase.co`)
> - 'anon public' API key (the one labeled `sb_publishable_...`)"

When they paste, parse out the URL and anon key.

> "Got it. Now for the database connection.
>
> **Second**: In Project Settings → 'Database' → scroll down to 'Connection string'. There are tabs at the top. Click the **'Transaction pooler'** tab. Click 'Reveal' or 'Show password' if there's a button. Then copy the WHOLE string and paste it here.
>
> Don't worry if it has `[YOUR-PASSWORD]` in it — I'll handle that."

When they paste:
- If the string contains `[YOUR-PASSWORD]` literally, ask: "What's the database password you wrote down?"
- URL-encode the password yourself (replace `#` with `%23`, `*` with `%2A`, `&` with `%26`, etc.)
- Substitute it into the connection string.

> "Last one: I also need the **service role** key (it's a more powerful key, server-side only). Back in Project Settings → API → scroll down to 'Project API keys'. There should be one labeled 'service_role' (starts with `sb_secret_...`). Paste it here."

Once you have all 4 values, **YOU write them to `.env.local`** using Write tool. Don't show the values back to them in chat — that re-leaks them. Just say: "Saved. Supabase is wired up."

#### OpenAI (chat + embeddings)

> "OpenAI powers the actual conversation. It's the only thing you'll pay for as your bot grows — about $0.30 per active user per month.
>
> 1. Sign up at https://platform.openai.com if you don't have an account.
> 2. **Important: add billing first.** Go to https://platform.openai.com/settings/organization/billing — click 'Add payment method' and add at least $5 of prepaid credit. Without this, your API key won't work.
> 3. Once billing is set up, go to https://platform.openai.com/api-keys and click 'Create new secret key'. Give it a name like 'shosh-ai-prod'. Copy the key.
> 4. Paste it here."

When they paste, write to `.env.local` (append to existing). Don't echo it back.

#### AssemblyAI (transcription — only if they have video/audio)

Ask: "Do you have any video or audio files you want to use as training material? (Zoom recordings, voice memos, course videos, etc.)"

- If **no**: skip this account. Move on to Phase 3.
- If **yes**: walk them through https://www.assemblyai.com — sign up, get key from https://www.assemblyai.com/app/api-keys, paste it here. Free tier covers 5 hours/month.

#### Install dependencies

Now run `bun install` (or `pnpm install` / `npm install` depending on what's available — try bun first). Don't ask permission, just do it: "Installing dependencies — this'll take ~30 seconds." [run the command]

If bun isn't installed, tell them: "I need to install Bun (a fast JavaScript runtime) on your machine. I'll run the installer." Then run `curl -fsSL https://bun.sh/install | bash`.

#### Sanity-check the connection

Run a quick test:
```bash
bun run -e 'import postgres from "postgres"; import {config} from "dotenv"; config({path:".env.local"}); const sql = postgres(process.env.DATABASE_URL, {ssl:"require"}); const r = await sql`SELECT 1`; console.log("ok"); await sql.end();'
```

If it works: "Connection good. Moving to database setup."
If it fails: troubleshoot — the most common issue is a wrong password. Read [references/troubleshooting.md](references/troubleshooting.md) for fixes.

### Phase 3 — Database setup

Run `bun run db:init` for them.

> "Setting up your database tables now — this takes about 10 seconds." [run command]

When done: "Done. Your database has the tables it needs."

Tell them about email confirmation:
> "One Supabase setting to know about: by default, Supabase sends a confirmation email to new users when they sign up. For testing, that's annoying. You can turn it off in Supabase dashboard → Authentication → Providers → Email → uncheck 'Confirm email'. Want me to walk you through that, or leave it on?"

### Phase 4 — Training content

Ask: "Where on your computer is your training material? Tell me the full folder path. If it's on your Desktop, you can just say 'Desktop/folder-name'."

Once they give a path:
1. Run `ls -la <path>` to see what's there.
2. Categorize files: text/PDF/DOCX vs video/audio.

#### If they have video/audio

Tell them how much there is:
> "I see [N] video/audio files totaling [size]. Transcribing those will cost about $X via AssemblyAI (rough math at $0.65/hour audio). Want me to transcribe everything, or start with a small subset to test quality first?"

Run `bun run transcribe <path>` (with `--max-depth=1` if they only want top-level). Show progress.

#### Ingest

Run `bun run ingest <path>` for them. Show progress as it streams. When done:
> "Ingested [N] chunks from [M] files. Your bot now has access to your full corpus."

### Phase 5 — Test locally

> "Let's test your bot. I'll start the dev server now." [run `bun run dev` in background, capture the URL it prints]

> "It's running at http://localhost:3000. Open that in your browser and let me know what you see."

Walk them through:
1. Sign up with their real email.
2. If email confirmation is on, check their inbox and click the link.
3. Log in.
4. Send a test message — something specific from their training material that should trigger retrieval.
5. Reload the page to confirm history persists.

If anything goes wrong, troubleshoot. Common issues are in [references/troubleshooting.md](references/troubleshooting.md).

If the response feels generic (not on-brand): offer to tighten the persona prompt. They tell you what's off; you edit `lib/brand.ts`. They send another message. Iterate.

### Phase 6 — Deploy to Vercel

This is the only phase with mandatory browser interaction (Vercel login).

> "Time to put your bot online. We're using Vercel — it's free for traffic at your scale.
>
> 1. Sign up at https://vercel.com (use GitHub login if possible — saves time later).
> 2. Tell me when you're signed in."

Then run `vercel link` with appropriate non-interactive flags or walk them through the prompts. The first time they run it, Vercel will open a browser to authenticate. Tell them: "A browser window will open — click 'Continue' to authorize. Then come back here."

After link succeeds, they need env vars in Vercel. Two paths:

**Path A — automated (preferred)**: `vercel env add` for each variable. You can pipe values in.

**Path B — manual fallback**: tell them to go to Vercel dashboard → their project → Settings → Environment Variables → add each one from `.env.local`. Apply to BOTH Production and Preview.

Run `vercel deploy --prod`. Capture the URL it prints.

> "Your bot is live at https://[url]. One more thing before clients can use it..."

Walk them through Supabase Site URL update:
> "Go back to Supabase → Authentication → URL Configuration. Set 'Site URL' to https://[url]. Add the same as a Redirect URL. Click Save. (Without this, the email confirmation links in production will break.)"

Test the deployed app: have them sign up with a fresh email, send a message, confirm it works.

If it works in dev but not prod, 95% of the time it's a missing env var in Vercel.

## Hand-off

After deploy works:

> "🎉 Your bot is live and yours. A quick reference for what to do next:
>
> **To update your bot's voice:** I can edit `lib/brand.ts` with you any time. Just say 'tighten the persona' and we'll iterate. Push the change to GitHub and Vercel auto-deploys.
>
> **To add new training content:** drop new files in your training folder and tell me 'ingest the new content'. I'll handle the rest.
>
> **To wipe and start over:** tell me 'wipe my training corpus' and I'll handle it.
>
> **To buy a custom domain** (e.g. shosh.com instead of shosh-ai-foo.vercel.app): get the domain anywhere (GoDaddy, Namecheap), then say 'connect my domain'. I'll walk you through the DNS in 2 min.
>
> Anything else you want to set up right now?"

## Style and tone

- Plain English. No jargon. If you must use a technical term, define it briefly the first time.
- Empathy for non-technical users. Explain WHAT a thing is before telling them WHERE it lives.
- Run commands; don't dictate them.
- Validate as you go. Don't proceed past a phase until the previous one demonstrably works.
- One thing at a time. Don't dump 8 instructions on someone unfamiliar with this stuff.
- If something fails twice, don't loop forever — surface the error and ask if they'd rather skip and come back later.

## What NOT to do

- ❌ Don't ask the user to run any command in their terminal. (Sole exception: the `cd <path> && claude` bootstrap if they opened Claude in the wrong folder.)
- ❌ Don't ask the user to edit any file. Edit it for them.
- ❌ Don't display API keys or passwords back in chat after they've pasted them. Save them silently.
- ❌ Don't "show your work" with raw bash output. Summarize: "Done." or "Here's what happened."
- ❌ Don't guess at values. If you need something specific, ask.
- ❌ Don't make them switch tools. If you can do something with the Bash/Edit/Write tools, do it.
- ❌ Don't change the DB schema, route handler logic, or middleware. Those are the engine — branding and content are the dials.

## Reference files

- [references/troubleshooting.md](references/troubleshooting.md) — common errors and fixes
- [references/persona-writing-guide.md](references/persona-writing-guide.md) — how to write a great persona prompt
