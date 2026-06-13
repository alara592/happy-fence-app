# Happy Fence — Quote a Job

Next.js (App Router) PWA. **Current state, decisions, and conventions live in
`HANDOFF-build-v1.md` — read that first.** All quote math lives in `lib/pricing.ts` —
never re-implement it elsewhere.

## Run locally

1. `npm install`
2. Copy `.env.local.example` → `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API → service_role
   - `APP_PIN` — the shared device PIN
3. `npm run dev` → http://localhost:3000

## Tests

`npm test` — pricing fixture suite (Frank $3,600 / Pedro $3,300 + unit tests). Must be
43/43 green before any deploy.

## Deploy

Push to `main` → Vercel auto-deploys https://happy-fence-app.vercel.app. Framework
preset must stay **Next.js**. Env vars set in Vercel Project Settings.

## Architecture notes

- RLS is on with no policies — the service-role key (server only) is the only way into
  the DB. Every read/write goes through `app/api/*` route handlers; the browser never
  talks to Supabase directly. `middleware.ts` gates everything behind the PIN cookie.
- **Price-board model:** sections are pure measurements. `project_materials` rows render
  the job under each chosen material (sections + permit + extras + discount — no gates),
  computed on read via `lib/server/projects.ts` → `lib/pricing.ts`. The Active fence row
  + gates (unit × quantity) = the project total.
- Unpriced fence types ($0/section) render warnings, never silent $0 quotes.
- `db/schema.sql` is the historical v1 migration; later migrations are in `db/` and
  listed in the handoff. The live DB is the source of truth.
