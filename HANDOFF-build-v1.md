# HANDOFF — Happy Fence "Quote a Job" App

Single source of truth for app state. Read this first in any new session, then
`README.md` (run/deploy) and `lib/pricing.ts` (the engine). History: spec in
`../Big Ant Fencing/V1-SPEC-quote-a-job.md`, strategy in
`../Big Ant Fencing/MIGRATION-PLAN-custom-rebuild.md`. Last updated **2026-06-05**.

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
- **Env vars** (Vercel + `.env.local`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PIN`.
- **Auth:** one shared device PIN (D1; revisited 2026-06-05 — Anthony considered no-PIN, risk explained, PIN kept). RLS on all tables with NO policies: the service-role key via server routes is the only path in.

## Current data model (v1.1 price board — replaced per-section materials)

- `projects` — client, address, date, permit, labor_cost_ft, profit_margin (decimal), discount (signed), notes, price_mod_notes.
- `project_sections` — **pure measurements**: name, description, linear_ft, tear_down, dump, take_down_ft, tear_down_rate/dump_rate (null = global default). No material, no stored price.
- `project_materials` — the board. Row = (project, fence type); `is_active` marks the Active fence (partial unique index, max one per project). Removing the active row clears the total.
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
Plus data updates 2026-06-05: Cypress 121 (confirmed), new Vinyl(Sand) 112 @ 6 ft.
Current state + drift notes: `seed/price-tables-2026-06-04.json`.

## Decided, not yet built

**Gate margin rebuild** (build when Anthony provides per-gate material costs):
`gatePrice = (materialCost + subLabor) ÷ (1 − projectMargin)`, no rounding; sub labor
flat $125 single / $300 double (→ settings); same margin as sections. Quote-integrity
rule: when it ships, existing projects keep their saved gate prices. Until then gates
stay flat lookups.

## Open data questions (Anthony/Mimi)

- Vinyl/Double gate $1,429 unconfirmed (CHANGELOG said 1,395).
- Walnut & Chainlink at $0 — price or remove. Anthony's sheet implies Chainlink ≈ $96/section.
- Sheet vs app catalog drift: DuraFence $65 here vs ≈$63–64 in his sheet; sheet has materials the app lacks (Wood Horizontal; Semi-Priv Horizontal Vinyl 6ft White/Sand/Clay; Horizontal Wood Infill Aluminum 4ft-center; Vinyl White "Broward only"). Sync catalog against the sheet feeding his "Job Quote Calculator".

## Wish list / later

- Address autocomplete on project form (Google Places or similar; needs API key; also fixes city parsing).
- Home-page upgrades (mocked, deferred): project status + filter chips, search, stats strip, call/map buttons (needs phone field), month grouping, brand styling.
- Admin screen for price tables (today: edit via Supabase dashboard or ask Claude).
- Present-to-Customer screen, calendar sync, photos (migration plan §6–7).
- Quote freezing for sent quotes (board recomputes live by design — revisit when quotes are presented to customers).

## Process rules (project conventions)

- Propose and confirm with Anthony before building; check in before every deploy.
- All DB access through server routes with the service-role key; nothing client-side.
- Engine tests green before any deploy; full live E2E against the real DB after server changes (create → verify math → delete; clean up test rows).
- Update this handoff + commit after every meaningful change. Anthony runs `git push`.

## Deploy gotchas (hit once already)

- Vercel framework preset MUST be "Next.js" — "Other" breaks middleware (`__dirname` / alias bundling errors).
- `middleware.ts` imports `./lib/auth-token` RELATIVELY on purpose — Vercel's edge bundler rejects the `@/` alias there.
- Stale `.git/*.lock` files from sandbox commits: delete via `find .git -name "*.lock" -delete`.
