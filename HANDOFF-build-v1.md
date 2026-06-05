# Handoff — Build the v1 "Quote a Job" App

For a fresh Claude session working in the `Happy Fence Company` folder. Read this first, then `../Big Ant Fencing/V1-SPEC-quote-a-job.md` (the approved spec) and `lib/pricing.ts` (the tested engine). The full migration strategy is in `../Big Ant Fencing/MIGRATION-PLAN-custom-rebuild.md`.

## State as of 2026-06-05 (everything below is DONE)

- **Decision made:** migrating off AppSheet to a custom app. AppSheet stays production until this app reaches parity — it is feature-frozen, do not touch it.
- **Spec approved** with decisions resolved: D1 no user accounts — one shared PIN per device; D2 start with an empty DB (no project import); D3 Supabase owned by anthony@happyfencecompany.com; D4 free `.vercel.app` URL for v1.
- **Pricing engine built and verified:** `lib/pricing.ts` + `tests/pricing.test.ts` — 11/11 tests pass (`npx tsx --test tests/pricing.test.ts`). Ground truth: Frank Theye $3,600, Pedro Bravo $3,300 (RECOVERY doc). Do NOT alter the math; the engine is the single source of truth for all quote calculations.
- **Database is LIVE:** Supabase project **"Happy Fence Calculator"**, ref `knbyonagksvaqpqkkehj`, us-east-1, Postgres 17. Migration `v1_initial_schema_and_seed` applied (`db/schema.sql` is the exact copy). Verified seeded: 20 fence_prices, 22 gate_prices, 1 extra (Dump Fee $300), settings GLOBAL (rates $3/ft, permit $300), 0 projects. RLS enabled on all 8 tables with NO policies — all access must go through server routes using the service-role key. The **Supabase MCP connector is connected** — use it (`list_tables`, `execute_sql`, etc.) rather than asking Anthony to run SQL.
- **Seed snapshot:** `seed/price-tables-2026-06-04.json` — includes drift notes (Vinyl(Cypress) restored at 120; Vinyl/Double gate 1,429; Vinyl - Walnut & Chainlink at $0 = unpriced, UI must warn, never silently quote $0 material).

## What to build next (spec §3 — the six screens)

Next.js (App Router) PWA, TypeScript. Plain/default styling — v1 is about correct math, not looks:
1. PIN unlock (shared PIN, remembered per device; server-side check; keeps the API closed)
2. Project list (client · city · date · total · permit, newest first)
3. Project form (client, address, date, permit, labor $/ft, margin, discount, notes)
4. Project detail (header, total, sections/gates/extras lists, add/edit/delete; project delete cascades)
5. Section form (name, type dropdown from fence_prices, linear ft, tear-down/dump toggles, take-down ft, conditional rate overrides defaulting from settings; price computed via `lib/pricing.ts` on save, recomputed on edit)
6. Gate form (type + Single/Double → flat lookup) and Extra form (pick from extras)

Rules: all DB access through server routes (service-role key in env vars, never client-side); import the pricing module — never re-implement math in components; currency always formatted with $ and commas; acceptance tests in spec §6.

## After the app works locally

Deploy to Vercel (Anthony has/creates the free account, sign-in via GitHub). Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PIN`. Then Anthony tests a real quote on his phone (spec acceptance test #3).

## Build status update — 2026-06-05

v1 app is BUILT (this session). Pricing tests re-run first: 11/11 green, engine untouched.
All six screens + API routes implemented per spec §3; `next build` green; smoke-tested:
PIN gate (middleware redirect/401, wrong-PIN 401, cookie unlock), graceful API errors.
Live DB re-verified via Supabase MCP: 20/22/1 price rows, 0 projects, RLS on, 0 policies.
See `README.md` for run/deploy. NOT yet deployed — awaiting Anthony: service-role key +
APP_PIN in `.env.local`, real-data E2E, then Vercel.

## Open items being tracked elsewhere (do not solve now)

- Price drift to confirm with Mimi (see seed JSON notes).
- Gate-pricing margin rebuild, Present-to-Customer screen, calendar sync, photos, material comparison — all post-v1 (migration plan §6–7).
