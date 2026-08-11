# ⚠️ THIS IS NOT coachclone.com

This is a local clone of the **coach-bot-template** repo
(https://github.com/martincw/coach-bot-template) — the brandable template that gets
handed to clients. (This folder was named `coachclone` until 2026-07-08, which caused
exactly the confusion you'd expect.)

**The real coachclone.com codebase lives at `~/coachclone`**
(GitHub: `martincw/coachclone`, Vercel project: `coachclone`, app in `platform/`).

Rules for this folder:

- Do NOT make product changes here thinking you're editing coachclone.com.
- The GitHub repo (`martincw/coach-bot-template`) is the source of truth for the
  template — this local copy should stay clean and in sync with it.
- Do NOT run `vercel deploy` from here; it must never point at the `coachclone`
  Vercel project (that's production coachclone.com).
