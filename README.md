# Happy Fence — Quote a Job (v1)

Next.js (App Router) PWA per `../Big Ant Fencing/V1-SPEC-quote-a-job.md`. All quote math
lives in `lib/pricing.ts` — never re-implement it elsewhere.

## Run locally

1. `npm install`
2. Copy `.env.local.example` → `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API → service_role
   - `APP_PIN` — the shared device PIN
3. `npm run dev` → http://localhost:3000

## Tests

`npm test` — pricing fixture suite (Frank $3,600 / Pedro $3,300 + unit tests). Must be
11/11 green before any deploy.

## Deploy (Vercel)

Import the repo/folder in Vercel (sign in via GitHub), framework = Next.js, then set the
same three env vars in Project Settings → Environment Variables. Free `.vercel.app` URL (D4).

## Architecture notes

- RLS is on with no policies — the service-role key (server only) is the only way into the
  DB. Every read/write goes through `app/api/*` route handlers; the browser never talks to
  Supabase directly.
- `middleware.ts` gates every page and API route behind the PIN cookie (D1).
- Section `actual_price` is computed server-side at save and recomputed on edit, and when
  a project's labor rate or margin changes (AppSheet Reset_If semantics).
- Project totals are recomputed from inputs on every read via `lib/pricing.ts`.
- $0 fence types (Vinyl - Walnut, Chainlink) are flagged in the section form — never
  silently quoted.
