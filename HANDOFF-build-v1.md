# HANDOFF — Happy Fence "Quote a Job" App

Single source of truth for app state. Read this first in any new session, then
`README.md` (run/deploy) and `lib/pricing.ts` (the engine). History: spec in
`../Big Ant Fencing/V1-SPEC-quote-a-job.md`, strategy in
`../Big Ant Fencing/MIGRATION-PLAN-custom-rebuild.md`. Last updated **2026-06-06**.

## What this is

Custom replacement for the AppSheet quoting app. Field workflow: measure the job on a
phone → record sections as pure measurements → render the job's price under whichever
materials Anthony picks (the **price board**) → set one as the **Active fence** → that
plus gates is the project total. AppSheet remains feature-frozen as fallback until
Anthony retires it.

## Live infrastructure

- **App:** https://happy-fence-app.vercel.app (Vercel project `happy-fence-app`, team "Anthony Lara's projects", framework preset **Next.js** — must stay Next.js, see gotchas)
- **Repo:** https://github.com/alara592/happy-fence-app (private; Anthony pushes — the sandbox has no git credentials; pushes auto-deploy)
- **DB:** Supabase "Happy Fence Calculator", ref `knbyonagksvaqpqkkehj`, us-east-1, Postgres 17, owner anthony@happyfencecompany.com. Supabase MCP connector is connected — use it directly. Vercel MCP connector also connected (logs, deployments).
- **Env vars** (Vercel + `.env.local`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PIN`, and for calendar sync: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (PEM with `\n`-escaped newlines), `GOOGLE_CALENDAR_ID` (`anthony@happyfencecompany.com`), `CRON_SECRET`.
- **Auth:** one shared device PIN (D1; revisited 2026-06-05 — Anthony considered no-PIN, risk explained, PIN kept). RLS on all tables with NO policies: the service-role key via server routes is the only path in.
- **Google service account:** `claude@happy-fence-company.iam.gserviceaccount.com` (GCP project `happy-fence-company`). The HFC calendar is shared to it ("See all event details"). Key file `happy-fence-company-71cfc78820ed.json` lives in the repo root, **git-ignored** — its `client_email`/`private_key` are the source for the `GOOGLE_SA_*` env vars. If sync ever 401s on Google, re-share the calendar or regenerate the key.

## Current data model (v1.1 price board — replaced per-section materials)

- `projects` — client, address, date, permit, labor_cost_ft, profit_margin (decimal), discount (signed), notes, price_mod_notes.
- `project_sections` — **pure measurements**: name, description, linear_ft, tear_down, dump, take_down_ft, tear_down_rate/dump_rate (null = global default). No material, no stored price.
- `project_materials` — the board. Row = (project, fence type); `is_active` marks the Active fence (partial unique index, max one per project). Removing the active row clears the total.
- `appointments` — calendar-sync target (migration #6). `calendar_event_id` unique = upsert key; `project_id` (FK, on delete set null) links to the project created from it. See Calendar sync below.
- `project_gates` — type+style flat lookup; `actual_price` is the UNIT price, `quantity` multiplies it.
- `project_extras` — name+price copied from `extras` catalog at add time.
- `fence_prices` — type (named **"Material - Style - Color"**, bare vinyls = Privacy), per_section ($0 = unpriced flag), ft_per_section, sort_order (dropdown + board order).
- `gate_prices`, `extras`, `settings` (GLOBAL: tear-down 3, dump 3, permit 300).

**Board math (server glue, `lib/server/projects.ts`):** each board row = engine
`projectTotal` with all sections typed as that material and **gates excluded** →
sections + permit + extras + discount. Project total = active row + Σ(gate unit × qty).
No active fence → no total. Unpriced materials render a warning row, never $0.
Everything is computed on read — price-table changes flow into all projects instantly
(deliberate; mirrors Anthony's old Sheets calculator).

**Home list** shows client · city · date · permit only — no totals (Anthony's call).
City = address text after the first comma.

## Pricing engine — DO NOT REIMPLEMENT

`lib/pricing.ts` is the only place quote math lives; UI and server import it.
Section formula: CEIL(whole sections)×per_section + $0.50/ft hardware + labor +
override-or-global tear-down/dump on take_down_ft, all ÷ (1−margin), CEIL to $100.
Tests: `npm test` → 11/11 must pass. Fixtures: Frank Theye $3,600, Pedro Bravo $3,300
(RECOVERY doc), plus Anthony's sheet case verified live: 200 ft Dog Ear, tear 200,
labor 12, margin 35% → fence $9,400 exact.

UI conveniences: take_down_ft auto-mirrors linear_ft until manually edited; Take Down Ft
field renders inside the tear-down block (or dump block if tear-down is off).

## DB migrations applied (in order; copies in `db/`)

1. `v1_initial_schema_and_seed` (`db/schema.sql` — historical v1 schema; sections have since changed)
2. `rename_fence_types_material_style_color_and_sort_order`
3. `price_board_sections_lose_material`
4. `active_material_on_board`
5. `gate_quantity`
6. `appointments_table` (2026-06-06) — calendar-sync target.
Plus data updates 2026-06-05: Cypress 121 (confirmed), new Vinyl(Sand) 112 @ 6 ft.
Current state + drift notes: `seed/price-tables-2026-06-04.json`.

## Calendar sync (Google Calendar → appointments) — built 2026-06-06

Replaces the AppSheet `calendar-sync.gs`. One-way, upserts on `calendar_event_id`.

- **Engine:** `lib/server/calendar.ts` (service-account JWT → Calendar REST) +
  `lib/server/calendar-sync.ts` (the port: `Site Visit` prefix filter, field mapping,
  HTML-strip on notes, ±14/120-day window). Pure helpers unit-tested in
  `tests/calendar-sync.test.ts` (5 tests). Times stored UTC; displayed in
  `America/New_York` via `lib/format.ts` (`fmtApptTime` / `etDate`).
- **On update**, only sync fields refresh — `status` and `project_id` are preserved.
- **Create Project** (`/api/appointments/[id]/create-project`): copies client/address,
  seeds project `date` from the visit (ET), links `project_id`. No-duplicate guard =
  the link itself (set → button hidden, FK `on delete set null` re-opens it if the
  project is deleted). Drops the AppSheet pre-generated-Project-ID hack.
- **Screen:** `app/appointments/page.tsx` — list (newest first) + **Sync now** button
  (`POST /api/appointments/sync`, behind the PIN). Reached from a link on the home screen.
  **Default view is windowed** to [today−3 … tomorrow] in Miami time (far-out estimates
  clog the screen); a quiet **Show all** toggle (`GET /api/appointments?all=1`) reveals
  everything. All appointments stay synced regardless — the window only narrows display.
- **Scheduler:** **Supabase pg_cron**, every 15 min, calling
  `GET /api/cron/calendar-sync` (Bearer `CRON_SECRET`; exempt from the PIN middleware).
  Chosen because Vercel **Hobby** caps crons at once/day; pg_cron is free + matches
  AppSheet's cadence. **LIVE since 2026-06-06** — `cron.job` jobname
  `calendar-sync-15min` (active). pg_cron + pg_net extensions enabled (migration
  `enable_pg_cron_and_pg_net`). Verified in prod: a manual `net.http_get` to the
  deployed endpoint returned `200 {ok:true, siteVisits:20, updated:20}`. To inspect
  runs: `select * from cron.job_run_details order by start_time desc limit 5;`.
  (The `CRON_SECRET` is embedded in the job body in `cron.job` — rotate there if changed.)
  SQL job below for reference / re-creation:

  ```sql
  -- one-time: enable extensions (Supabase: Database → Extensions, or)
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  -- the job:
  select cron.schedule('calendar-sync-15min', '*/15 * * * *', $$
    select net.http_get(
      'https://happy-fence-app.vercel.app/api/cron/calendar-sync',
      headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb
    ); $$);
  ```

- **WHEN ANTHONY UPGRADES TO VERCEL PRO** (planned): native Vercel cron becomes the
  cleaner home for the schedule. Swap = add a `vercel.json` with
  `{"crons":[{"path":"/api/cron/calendar-sync","schedule":"*/15 * * * *"}]}` (Vercel
  cron auto-sends `Authorization: Bearer $CRON_SECRET`), redeploy, then drop the
  pg_cron job: `select cron.unschedule('calendar-sync-15min');`. The route code is
  identical either way — only the trigger moves.

### Deploy checklist (Anthony)

1. Vercel → project `happy-fence-app` → Settings → Environment Variables, add:
   `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (paste the PEM; Vercel handles
   newlines), `GOOGLE_CALENDAR_ID`, `CRON_SECRET` (any long random string). Values are
   in local `.env.local`.
2. `git push` (auto-deploys). Verify `/appointments` loads and **Sync now** populates it.
3. Tell Claude the deploy is live → Claude creates the pg_cron job with the real
   `CRON_SECRET` and verifies a scheduled run.

## Decided, not yet built

**Gate margin rebuild** (build when Anthony provides per-gate material costs):
`gatePrice = (materialCost + subLabor) ÷ (1 − projectMargin)`, no rounding; sub labor
flat $125 single / $300 double (→ settings); same margin as sections. Quote-integrity
rule: when it ships, existing projects keep their saved gate prices. Until then gates
stay flat lookups.

## UX v2 — home, project, present (built 2026-06-06)

Client-only UI pass (no schema, no engine, no server-route changes). Designed from
mockups in repo root (`*-mockup.html`, kept as reference). Verified live against the
real DB via dev preview; `npm test` 17/17 and `npm run build` green.

- **Home** (`app/page.tsx`): search box (filters client + address), date grouping into
  **This week / Upcoming / Earlier** by job date (This week = today→end of week; soonest-
  first for current/future, most-recent-first for past), and a 📍 map pin per card. Totals
  still off the list. The card layout splits into a text `<Link>` + a sibling pin `<a>` to
  avoid nested anchors. "Needs quote" badge was considered and **deliberately dropped** (Anthony).
- **Project** (`app/projects/[id]/page.tsx`):
  - Sticky green **Project Total** bar (full-bleed via negative margins) with a **‹** back
    chip (left, → Projects list — "Up", not history-back) and a **Present →** link; replaces
    the old total card. Shows `—` until an Active fence is set. The not-found/error state also
    carries a "‹ Projects" link so a dead link never strands you.
  - Header line is inconspicuous: address + 📍 (Maps) / 🌐 (Google Earth) icons, then a bare
    `{margin}% | {labor}/ft` readout (no "margin"/"labor" labels — Anthony reads it at a glance,
    customers don't clock it). Margin/labor are still edited only on the project form.
  - "Sections" heading renamed **Measurements** (form titles + spec unchanged).
  - Each measurement shows its **computed price under the Active fence** as small green
    subtext, left of the footage (`$5,700 · 120 ft · …`). Computed server-side in
    `getProjectBundle` via the engine's `sectionPrice` and returned as `sections[].price`
    (null when no/unpriced active fence). It's exact, not an estimate: the engine rounds
    each section to $100 individually and the fence subtotal is their sum, so per-section
    prices add up to the sections portion (NB: that's fence-only — permit/gates/extras are
    project-level, so they sum to the board subtotal minus permit/extras, not the grand total).
  - Price board rows show `$X / section` (from reference `perSection`) and a **delta vs the
    Active fence** (`+$200` etc.) on non-active rows.
  - Empty **Gates/Extras** collapse to a single quiet line; expand to full list once populated.
  - **Discount** is a plain `$` field parked at the bottom; saves on blur (PATCH `discount`)
    → reload → "Saved ✓" toast. (Margin intentionally has NO inline control — set-and-forget.)
  - Native `confirm()` replaced with a styled modal sheet (Cancel / Delete); deletes + set-active
    flash a toast.
- **Present** (`app/projects/[id]/present/page.tsx`, NEW route): customer-facing read-only
  estimate. Branded hero, client, address, the **Active fence + Project total**, a "what's
  included" list (fence + linear ft, permit, gates, extras), and discount as a positive line
  (`Your discount −$X` when `discount < 0`). **Safe by construction** — margin, labor, the
  price board, and internal notes are simply not rendered on this screen, so nothing leaks if
  the phone is handed over. Falls back to a "no fence selected" message when there's no Active
  fence. Still behind the PIN (shown on Anthony's device, not truly public).
- **Project form** (`components/ProjectForm.tsx`): Profit Margin is now entered as a
  **percent** (`30`, with a `%` suffix) and converted to the stored decimal (0.30) on
  submit; the edit page converts decimal→percent when loading. Labor gets a `$/ft` suffix;
  both use `inputMode="decimal"` for the phone number pad. **Discount removed from this form**
  — it lives only on the project page now (PATCH leaves it untouched when omitted; create
  defaults to 0). `ProjectFormValues` no longer has a `discount` field.
- **Shared helpers** added to `lib/format.ts`: `mapsUrl()`, `earthUrl()`.

**Perf pass (2026-06-06):** `loadReference()` now caches the price tables in-process
for 60s (`clearReferenceCache()` to bust) — they change rarely and never in the field, so
this collapses the repeated reference loads per page into one DB hit. `getProjectBundle`
also returns `fencePrices`, so the project detail page reads the catalog from the bundle
instead of a second `/api/reference` round trip (one request per project open, was two).
Vercel functions confirmed on default `iad1` = co-located with Supabase us-east-1.
NOT done (deferred, riskier): RSC/server-rendered pages (would remove the load-on-mount
"Loading…" flash entirely); optimistic UI (rejected — would misreport saves on field signal
and can't predict prices without duplicating the engine).

Not built (open for later): per-material "show to customer" flag to present multiple options;
shareable/PDF quote (pairs with quote-freezing); home status/stats; brand logo on the Present
hero (placeholder text today — drop in from `../Logo`).

## Open data questions (Anthony/Mimi)

- Vinyl/Double gate $1,429 unconfirmed (CHANGELOG said 1,395).
- Walnut & Chainlink at $0 — price or remove. Anthony's sheet implies Chainlink ≈ $96/section.
- Sheet vs app catalog drift: DuraFence $65 here vs ≈$63–64 in his sheet; sheet has materials the app lacks (Wood Horizontal; Semi-Priv Horizontal Vinyl 6ft White/Sand/Clay; Horizontal Wood Infill Aluminum 4ft-center; Vinyl White "Broward only"). Sync catalog against the sheet feeding his "Job Quote Calculator".

## Wish list / later

- Address autocomplete on project form (Google Places or similar; needs API key; also fixes city parsing).
- Home-page upgrades: search + date grouping (This week / Upcoming / Earlier) + 📍 map pin **DONE 2026-06-06, see UX v2 below**. Still deferred: project status + filter chips, stats strip, call button (needs phone field), brand styling.
- Admin screen for price tables (today: edit via Supabase dashboard or ask Claude).
- Present-to-Customer screen **DONE 2026-06-06 (basic), see UX v2 below**; photos still deferred (migration plan §6–7). *(Calendar sync — DONE 2026-06-06, see above.)*
- Quote freezing for sent quotes (board recomputes live by design — revisit when quotes are presented to customers).
- Per-user calendar sync (later): sync each team member's own calendar, not just `anthony@happyfencecompany.com`. Single-user for now by design — Anthony is the only user.

## Process rules (project conventions)

- Propose and confirm with Anthony before building; check in before every deploy.
- All DB access through server routes with the service-role key; nothing client-side.
- Engine tests green before any deploy; full live E2E against the real DB after server changes (create → verify math → delete; clean up test rows).
- Update this handoff + commit after every meaningful change. Anthony runs `git push`.

## Deploy gotchas (hit once already)

- Vercel framework preset MUST be "Next.js" — "Other" breaks middleware (`__dirname` / alias bundling errors).
- `middleware.ts` imports `./lib/auth-token` RELATIVELY on purpose — Vercel's edge bundler rejects the `@/` alias there.
- Stale `.git/*.lock` files from sandbox commits: delete via `find .git -name "*.lock" -delete`.
