# HANDOFF — Happy Fence "Quote a Job" App

Single source of truth for app state. Read this first in any new session, then
`README.md` (run/deploy) and `lib/pricing.ts` (the engine). History: spec in
`../_archive/from-big-ant-fencing/V1-SPEC-quote-a-job.md`, strategy in
`../_archive/from-big-ant-fencing/MIGRATION-PLAN-custom-rebuild.md`. Last updated **2026-06-13**.

## What this is

Custom replacement for the AppSheet quoting app. Field workflow: measure the job on a
phone → record sections as pure measurements → render the job's price under whichever
materials Anthony picks (the **price board**) → set one as the **Active fence** → that
plus gates is the project total. AppSheet remains feature-frozen as fallback until
Anthony retires it.

## Live infrastructure

- **App:** https://happy-fence-app.vercel.app (Vercel project `happy-fence-app`, team "Anthony Lara's projects", framework preset **Next.js** — must stay Next.js, see gotchas)
- **Repo:** https://github.com/alara592/happy-fence-app (pushes auto-deploy; local git
  credentials work, so Claude can push after checking in with Anthony). **NB 2026-06-10:
  the repo is PUBLIC** (handoff previously said private — wrong). No secrets committed
  (SA key + .env git-ignored, never in history), but `seed/price-tables-*.json` exposes
  real pricing — Anthony should make it private: repo Settings → General → Danger Zone.
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
- `gate_prices`, `extras`, `settings` (GLOBAL: tear-down 3, dump 3, permit 800 — was 300, raised 2026-06-06).

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
- **Deletion reconcile** (built ~2026-06-10, committed + deployed 2026-06-10): after the
  upsert, in-window appointments the calendar no longer returns (deleted, renamed off
  "Site Visit", or moved out of window) flip `Scheduled → Cancelled`; ones that reappear
  flip back. Only ever toggles those two statuses; rows + linked projects are kept.
  Cancelled appointments are hidden from the list (`GET /api/appointments` filters
  `status != 'Cancelled'`). Pure diff helper `reconcile()` unit-tested. Verified live:
  a manual sync returned `{updated: 22, cancelled: 2, resurrected: 0}` and the 2 were
  genuinely-deleted same-day visits.
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
mockups in `mockups/` (`*-mockup.html`, kept as reference). Verified live against the
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

**Client cache + prefetch (2026-06-06):** new `lib/cache.ts` — a ~90-line homegrown
stale-while-revalidate cache keyed by API path (no new dependency). `useCached(key)`
renders cached data instantly and revalidates in the background; `load(key)` refreshes in
place (keeps old data visible, dedupes); `prefetch(key)` warms a key; `setCache`/`invalidate`
for mutations. Anthony's preference: **pay a longer first load for instant use after** — so
the home screen prefetches `/api/reference` AND every project bundle on entry. The detail
page and all forms (Section/Gate/Extra/Project) read reference/bundles from the cache; after
a save, forms call `load(bundleKey)` so returning to the detail shows fresh data without a
spinner; detail mutations revalidate via `load`. Module cache persists across client-side
navigation (one session). Verified live: home warms all bundles, project opens with no
loading flash, discount edit revalidates total/board correctly.

**localStorage persistence (2026-06-06):** the cache also persists to `localStorage`
(`hfc-cache-v2`) and `hydrate()`s synchronously at module load, so a full app reopen /
refresh / deep-link shows last-known data **instantly** (no "Loading…" flash) then
revalidates. Only the very first launch ever (empty storage) shows a spinner. **BUMP the
`PERSIST_KEY` version** whenever the bundle/list payload shape changes, so a deploy doesn't
render stale-shaped data before revalidation. Verified live: cold full-load directly onto a
project rendered client/total/section price with no loading flash.

**Edit screens read the cache too (2026-06-06):** the project-settings edit, section/measurement
edit, and gate edit pages previously did their own fresh bundle fetch (own "Loading…"), so
opening an edit screen always flashed a spinner even with the project cached. They now derive
their initial form values from the cached bundle via `useCached`, so editing opens instantly.
(The form components seed their state from `initial` once on mount, so a background revalidate
won't clobber in-progress edits.) Verified live: section/project/gate edit all open populated
with no loading flash.

Not built (open for later): per-material "show to customer" flag to present multiple options;
shareable/PDF quote (pairs with quote-freezing); home status/stats; brand logo on the Present
hero (placeholder text today — drop in from `../Logo`).

## Material picker with live totals + tap-row-to-set-active (2026-06-10)

Anthony's pick from a mockup round (the others — $/ft on board rows and a total-bar
material cycler — were REJECTED, see product rules below).

- **Picker** (`components/MaterialPicker.tsx`, NEW; `.mp-*` in globals.css): "+ Add
  material — see all prices" replaces the old dropdown. Bottom sheet lists the WHOLE
  catalog with this job's computed total per material, cheapest first (toggle to catalog
  order), delta vs the Active fence on every row (green when cheaper), unpriced types
  labeled and sorted last. Tap adds to the board, tap again removes — so "what would it
  cost in X?" is answerable without board churn. Sheet stays open across taps; Done closes.
- **Server:** `getProjectBundle` returns `catalog` (type, perSection, total, unpriced) for
  every fence type, computed via a new shared `rowPricing()` helper in
  `lib/server/projects.ts` that `computeBoard` also uses — picker and board totals come from
  the same code path and CANNOT drift. (~20 extra pure-math `projectTotal` calls per bundle
  read; negligible.) `catalog` is optional in the client `Bundle` type — stale persisted
  caches just show "Loading prices…" until revalidation, so no PERSIST_KEY bump.
- **Tap row = set active:** the whole non-active board card is the tap target
  (`onClick` → existing `setActive`); the "Set active" button is gone; ✕ keeps working via
  `stopPropagation`. Heading hint: "tap a row to set active".
- `addMaterial`/`removeMaterial` now `await reload()` so the picker's ✓ state flips with
  the data.
- Verified live (dev preview, real DB): 22 catalog rows sorted $8,000→$16,200 with unpriced
  last; first add auto-actived; second add showed +$300 delta; board row tap flipped active
  fence + total + deltas; ✕ removed without setting active; no console errors; test project
  deleted. `npm test` 23/23, `npm run build` green.

**Product rules (Anthony, 2026-06-10):**
- **Never display $/ft anywhere.** He doesn't charge by the foot and a memorable $/ft turns
  him into an easy-to-compare commodity price. (Per-SECTION $ on board rows is fine.)
- No total-bar material cycler — tap-row-to-set-active covers it.

## Gate picker — stacked cards + quantity stepper (2026-06-11)

Anthony sketched the layout himself (card per gate type, name on top, big Single/Double
buttons under it) after rejecting two earlier mockups (chips truncated names; a
Single/Double segmented switch hid the other style's price). UX = material picker ×
quick-add measurement, with quantity folded into repeated taps.

- **`components/QuickAddGate.tsx` (rewritten):** sheet lists every gate type as a card —
  full name header, Single/Double buttons showing catalog prices (Single always left).
  Tap = add one; tap again = +1 (blue `×N` badge); red `−` = −1, row deleted at zero.
  **Duplicates merge into quantity on one row** (Anthony's call), auto-named by TYPE
  (Present renders "Vinyl / Single · ×2" cleanly). Implemented client-side as
  find-or-bump over the bundle's gate rows: existing (type,style) row → PATCH
  quantity±1, else POST / DELETE — NO server changes. Each tap awaits the bundle reload
  so badges/subtotal stay truthful (no optimistic UI, per the field-signal rule).
- **Fence-match ordering:** gate types containing the active fence's material keyword
  (first token, e.g. "Vinyl", "Wood", "Aluminum", "WPC", "DuraFence") sort first with an
  "Other gates" divider — soft ordering, heuristic, nothing hidden. Hint line shows
  "X gates first — matches your active fence".
- Running `Gates: $X` subtotal in the sheet header (= bundle `gatesTotal`); the sticky
  project total updates live behind the sheet. "More options →" still links to the full
  form (`gates/new`) for custom name/description; Edit on gate rows unchanged.
- `/api/reference` reverted to plain `loadReference()` — the gate usage counts that
  ordered the v1 chips are gone (fence-match replaced them). CSS: `.gc-*` replaces
  `.qa-chip*` in globals.css.
- Verified live (dev preview, real DB): 12 type cards, 7 vinyl-matched first + divider;
  3 taps → 2 merged rows (Single ×2 $695, Double $1,429), gates $2,819, total $4,000+
  gates correct at every step; minus stepped ×2→×1→row deleted; no console errors; test
  project deleted, no orphan gate rows. `npm test` 23/23, `npm run build` green.

## Home redesign — brand header, stats strip, bundle-backed cards (2026-06-11)

- `app/page.tsx` rewritten. The list now USES the bundles it was already prefetching:
  each card shows active fence + total ft (or amber "No fence selected"),
  city · job date · Permit · 📷 photo count. Whole card is the tap target (chevron
  dropped); 📍 pin kept as an absolute-positioned corner target.
- **Product rule (Anthony, 2026-06-11): NO dollar amounts on the home list** — no
  per-card totals, no summed "$ quoted" in the stats strip. Prices live on the
  project page and Present view only. (First build had them; removed same day.)
- Sticky green brand header (`.hm-head`, same full-bleed pattern as `.sticky-total`):
  Projects title + Appointments (translucent chip) + "+ New" (white chip). "+ New" is
  always reachable mid-scroll.
- Stats strip under the search: "N quotes" — follows the search filter live.
- Loading…" replaced with shimmer skeleton cards (`.skel`); empty state got a
  "+ New Project" button.
- `lib/cache.ts` gained `subscribe(key, fn)` so the page can `peek` every bundle and
  re-render as prefetches land (no per-card hooks). `useCached` untouched.
- New `--warn-text` var (#9a6700) shared by `.mp-unpriced` and `.hm-nofence`.
- Wish-list items still deferred (need schema/data): status + filter chips, call
  button (phone field), per-card thumbnails.
- Verified live (dev preview, real DB, read-only): totals/fence lines/photo counts
  correct on 9 real projects, search updates strip + cards, sticky header pins,
  card tap navigates, no console errors. `npm test` 23/23.

## UI consistency pass — CSS variables + button tiers (2026-06-11)

- `globals.css` now defines the palette as CSS variables in `:root` (`--brand`,
  `--brand-tint`, `--brand-tint-border`, `--danger`, `--link`, `--text`, `--muted`,
  `--quiet`, `--bg`, `--border-strong`, `--border`, `--border-light`). All recurring
  hexes swapped to vars (58 usages), including the handful of inline styles in
  `page.tsx` / `MaterialPicker` / `QuickAddMeasurement`. One-off colors (toast,
  warn yellow, photo-viewer darks) stay literal on purpose. **New colors should use
  the vars** — retheming = edit `:root`.
- Button tiers: `.primary` (solid green, one per screen), **`.secondary`** (green
  outline — now on all four "+ Add" buttons incl. `.mp-open`, which is layout-only
  now), `.danger` (red outline), **`.quiet`** (borderless gray text — quick-add
  Cancel, was inline-styled).
- Form rhythm: `form .actions` gets 16px top margin (cards keep 8px); quick-add
  measurement sheet's Name input got a label to match Linear Ft.
- Verified live (dev preview, real DB, read-only — no rows touched): home, project
  dashboard, quick-add sheet, edit form, present view all render identically except
  the intended green-outline "+ Add" buttons; no console errors; `npm test` green.

## Appointments grouped by date (2026-06-06)

`app/appointments/page.tsx` now groups the list by Miami-time date: **Today / Tomorrow /
Upcoming / Previous** (empty groups hidden; Today first). Today & Tomorrow show just the
clock time (`fmtApptClock`); Upcoming/Previous show date + time (`fmtApptTime`). Today/Tomorrow/
Upcoming sort soonest-first; Previous most-recent-first. Client-only change; the window +
"Show all" toggle still control which appointments are fetched, grouping is presentational on top.

Cards also reworked to **match the projects scan design**: compact row with client + `time · city`
(city = tail of address), a 📍 map pin, and the action on the right (Create → for unlinked, › to
the project for linked). The long calendar notes (job description + booking URLs) are tucked into
a native `<details>` "Notes ▸" expander so the list stays scannable — full notes one tap away.

## Present page redesign — itemized proposal (2026-06-06)

The customer Present page was reworked from a single-number card to an **itemized proposal
grouped by category** (Anthony picked this over a minimal one-number layout). Sections:
**Fence & installation** (active type + linear ft → fence-only price), **Gates** (each gate
name/style → unit×qty), **Add-ons** (extras), **Permits & fees** (permit), then a discount
line (green "Your discount −$X" when `discount < 0`) and a highlighted **Total estimate** box.
Header is a green band with the company wordmark + contact; footer has validity + a back link.
Still customer-safe — margin/labor/board never render. Now reads the cached bundle via
`useCached`, so Present opens instantly. Styles are `.pv-*` in globals.css (replaced the old
`.p-*`). The line items sum exactly to the total (verified live: Manoah Made = 12,700 + 534 +
1,000 + 800 = $15,034).

- **Bundle additions** (`getProjectBundle`): `fenceSubtotal` (board active total minus permit,
  extras, discount = the fence-only line) and `permitFee` (the permit line amount from settings).
- **Company contact** is a `COMPANY` const at the top of the present page: `{ name, phone, web }`.
  `phone` is intentionally blank (we don't show a fake number) — **fill it with the real phone to
  surface it on the estimate.** Web = happyfencecompany.com.

## Workflow speed-ups (2026-06-06)

- **Quick-add measurement** (`components/QuickAddMeasurement.tsx`): an in-flow add that never
  leaves the project page. Opens instantly (no fetch — it's a blank entry). **Responsive via
  CSS only** (`.qa-*` in globals.css): bottom sheet on phones (<560px), centered modal on
  desktop. Fields: name, linear ft, Tear Down (default ON), Dump (default OFF); `take_down_ft`
  mirrors the footage when either is on. **"Save & add another"** keeps it open for the next
  run (jobs run ≤3). Per-run rate overrides still live on the full Edit screen. POSTs to the
  same `/api/projects/[id]/sections` endpoint; parent refreshes the cache + flashes "Saved ✓".
  The Measurements "+ Add" now opens this instead of routing to `/sections/new` (that route
  still exists, just unlinked).
- **First material auto-active**: `POST /api/projects/[id]/materials` now sets `is_active` when
  the board has no Active fence yet — saves a "Set active" tap on the common single-material job.
- **Defaults** are now labor **$12/ft**, margin **30%** — in `emptyProject`, the `POST
  /api/projects` fallback, and the appointment `create-project` route (which previously relied
  on DB column defaults).
- **Permit fee → $800** (DONE 2026-06-06, Anthony's call: all projects). `settings.permit_fee`
  raised 300 → 800 via SQL — a global value, so every permitted project re-prices on read
  (+$500). Verified live: Manoah Made $14,534 → $15,034. Data-only change (no code); picked up
  within the reference cache TTL (~60s).

## Quick-pick chips — gates + materials (2026-06-10)

App context (Anthony, 2026-06-10): this is NOT a quoting app — it creates and prices jobs
on the spot. Jobber does quoting/sales; HighLevel (GoHighLevel) is the CRM. Field speed wins;
avoid duplicating quote/pipeline features that belong to Jobber.

- **Usage counts on `/api/reference`**: the route now also returns
  `usage: { materials: Record<type, n>, gates: Record<"type|style", n> }` — counts across
  `project_materials` / `project_gates` (two extra cheap selects per call; `loadReference()`
  itself untouched so the pricing cache stays pure). Additive + read with optional chaining,
  so the persisted client cache needed no `PERSIST_KEY` bump.
- **Quick-add gate v1** (`components/QuickAddGate.tsx`, NEW): top-8 usage-ordered one-tap
  chips. SUPERSEDED same week by the stepper sheet (see "Gate picker" 2026-06-11 below).
- **Material chips — REMOVED same day** (Anthony: "extremely non-problem", the dropdown was
  already easy). Replaced by the material picker below. The reference route's usage payload
  now counts gates only.
- CSS: `.qa-chips`/`.qa-chip`, `.qa-more`, `.linkbtn` in globals.css.
- Verified live (dev preview, real DB): throwaway project → material chip tap put DuraFence
  on the board (auto-active) and the chip backfilled with the next most-used; gate chip tap
  added `Gate 1 · Durafence · Single · $534` and the total updated to $534; no console
  errors; test project deleted (gate cascade confirmed via SQL). `npm test` 17/17,
  `npm run build` green. NOT yet pushed/deployed.

## Desktop shell + Quick Quote (2026-06-12) — DEPLOYED

Desktop concept steps 1+2 (of the plan Anthony approved 2026-06-12: shell → Quick Quote →
price snapshots → Prices screen → morning view). Commit `d9945b8`, pushed by Anthony,
verified READY on Vercel. Phones render exactly as before — everything desktop sits
behind `min-width: 1024px`.

**Who it's for (changes the product framing):** the desktop's PRIMARY user is Anthony's
assistant/appointment setter qualifying leads live on the phone; Anthony uses it to verify
costs after the fact + morning planning. Full trust model kept deliberately — one PIN, no
roles (Anthony's call).

- **Shell** (`components/AppFrame.tsx`, NEW; root layout now wraps children in it):
  desktop top nav (Projects / Quick Quote / Appointments) + persistent left project rail
  on `/projects/*` (not on home — the home list IS the list). `/unlock` and `*/present`
  stay bare (pre-auth / customer-facing). Project page is a workbench via CSS grid:
  `.pd-top`/`.pd-side`/`.pd-bottom` wrappers put the price board in a sticky right column;
  source order unchanged so phone layout is byte-identical.
- **Quick Quote** (`app/quick-quote/page.tsx`, NEW): scratch-pad calculator — footage,
  walk/double gate steppers, tear-down toggle (assumes the FULL run, decided), permit
  toggle (default on). Headline = the **−5%/+10% qualifying range** (what the assistant
  reads to callers; rounded out to $100s), exact price in small print. Right column prices
  the WHOLE catalog live, cheapest first, unpriced types ⚠ last. Click a row to quote it
  (auto-follows cheapest until a manual pick). **Save as project** promotes: real project
  (date = today ET) + "Phone estimate" section + material (auto-actives) + gates; scratch
  clears. Otherwise NOTHING is written; state survives refresh via localStorage
  (`hfc-qq-v1`). Esc clears.
- **`lib/quickquote.ts`** (NEW, pure, tested): `matchGateType` (gates auto-match the fence
  family, decided — mixed combos go through the project screen), `quoteRange`, `quickTotal`
  (wraps the engine — NO math reimplementation). `QQ_LABOR_COST_FT = 12` /
  `QQ_PROFIT_MARGIN = 0.3` MIRROR the `POST /api/projects` fallbacks — verified against
  live data (all 9 projects use exactly 12 / 0.30). These become editable settings rows
  (`default_labor_cost_ft`, `default_margin`) when the Prices screen ships.
- Tests: `tests/quickquote.test.ts` (11) — suite now 34/34. E2E verified: Quick Quote
  exact $7,395 (120 ft Vinyl White + walk gate + tear + permit) promoted to a project the
  server also priced at exactly $7,395; test project deleted after.
- Mockups kept as reference: `mockups/desktop-mockup.html` (early three-pane concept),
  `mockups/quickquote-mockup.html` (approved interactive Screen A).

## Desktop dashboard home + appointments week board (2026-06-12) — DEPLOYED

Designed first (`mockups/desktop-views-mockup.html` — Anthony picked Option A over a list-first
Option B kept in the same file), then built. Desktop-only via `useIsDesktop()`
(`lib/useIsDesktop.ts`, matchMedia ≥1024px) — pages SWAP whole trees, so phones never
mount desktop components or pay for their fetches. Phone home + appointments verified
unchanged at 375px. Suite 34/34, build green, zero console errors, verified live
against real data.

- **Dashboard home** (`components/DesktopHome.tsx`; `app/page.tsx` returns it when
  desktop): Today strip (synced appointments filtered to today ET; map link; linked
  project chip with total, else + Create project via the existing endpoint) →
  Needs-attention strip (measured-but-no-active-fence, or no measurements; cap 6; hidden
  when empty) → card grid 3-across WITH totals (desktop-only; phone keeps the no-dollars
  rule) + search + Created today / Earlier groups. All data from the existing prefetched
  bundle cache + `/api/appointments?all=1` through the client cache.
- **Week board** (`components/WeekBoard.tsx`; `app/appointments/page.tsx` returns it
  when desktop): 5 rolling days starting today (today tinted), per-day visit cards
  (clock time, client, address, map, Create Project / Project ✓), Sync now, "Show all"
  toggles a list of everything off the board (same one `?all=1` fetch). Decided:
  forward-only (yesterday lives under Show all), 5 days not 7.
- `lib/format.ts` gains shared `city()`. New CSS: `.dk-*` / `.wk-*` blocks.
- NB totals like $8,034 are correct: gates/discounts add flat amounts after per-section
  $100 rounding.

## Brand pass — E2 app-wide + E1 Present (2026-06-12) — DEPLOYED

The app now wears the actual Happy Fence brand (Brand Brief v2:
`../design_handoff_present_to_customer/Happy Fence Brand Brief v2.html`; tokens
summarized in Claude's memory `happy-fence-brand.md`). Design process: A–D invented
directions, then Anthony supplied the brand files → E1 (full brand) / E2 (dialed for
work) added to `mockups/design-directions-mockup.html`. Anthony's call: **E2 everywhere, E1 on
Present**, with the badge + more brand worked into E2.

- **Tokens** (`globals.css` :root): cream canvas `#FBF7E8`, surfaces `#FFFCF1`, navy
  ink `#1C2533` replaces green as `--brand` (buttons, headers, money text), sky
  `#BFE3EF` = money lozenges + selection tints, butter `#FFDF6B` = attention, active
  tab, +New, Present button. Danger red kept — functional, not brand. `--surface` is
  new; all former `#fff` backgrounds use it.
- **Fonts** (`layout.tsx`, next/font self-hosted, ONLY used weights): Quicksand
  500/600/700 (body default 500), Bagel Fat One 400 (display — wordmark + Present
  headings only, E2 restraint), Space Mono 400/700 (labels/kickers/times). Exposed as
  `--font-body/--font-display/--font-label`.
- **Badge**: `public/brand/logo-96.png` (11KB, desktop nav + phone hm-head) and
  `logo-280.png` (44KB, Present header) — resized via sips from the 338KB original
  (NOT shipped). Picket-run divider utility `.pickets` (sanctioned brief motif) on the
  dashboard + Present.
- **Present** = full E1: navy header w/ badge, Bagel client name + group headings,
  butter Total Estimate card with 2.5px ink border + `5px 5px 0` ink offset shadow,
  picket divider, mono footer. Verified live (Juan $17,700).
- Phone same E2 language (navy header + badge, cream cards, butter +New); phone rules
  intact (no dollar amounts on the list). Suite 34/34, build green, all screens
  verified live at 1400 + 375.

**Decided, next up (desktop concept, in order):**
1. ~~Price snapshots / effective-date pricing~~ — **DONE 2026-06-13, see "Price snapshots" below.**
2. **Prices screen** — inline editing of all price tables + new default labor/margin
   settings. Now unblocked (snapshots shipped). Keep this order — editable prices before the
   freeze would have silently repriced every open quote.
3. **Morning view** — Anthony's desktop home: today's site visits + needs-attention list.

## Price snapshots — effective-date pricing (2026-06-13)

Quotes no longer silently reprice when the price tables change. Each project freezes the
reference tables it was quoted under (`projects.price_snapshot` jsonb; migration #9 in
`db/migrations.md`) and `getProjectBundle` prices from that copy. Only **fence prices + the
global rates** are captured — gates/extras are already frozen at add-time (their price is
copied onto the project row), so they can't drift. New projects snapshot current prices at
creation (both create paths). When the active fence's live total differs from the frozen one,
the project page shows a butter banner — **"Prices changed since this quote was made → Update
to current / Keep as quoted"** — Update re-freezes at live (`POST /api/projects/[id]/reprice`).

- **Pure core** in `lib/snapshot.ts` (`snapshotFromReference`, `coerceSnapshot`,
  `pricesChangedForProject`), unit-tested (suite now **43/43**). The engine (`lib/pricing.ts`)
  is UNCHANGED — it already takes the tables as input, so "snapshot" just feeds a project its
  frozen copy. In `getProjectBundle` the live load is `liveRef` (used for the drift check), and
  `ref` is the snapshot (or live fallback when a project has none); `pricesChanged` is true only
  when the active fence's board total moved.
- **Backfill froze all existing projects at today's prices** (Anthony's call) — so the deploy
  changes no one's number (snapshot == live at freeze time; verified 0 drift across 13 projects).
- Cache `PERSIST_KEY` bumped v4 → v5 (bundle gained `pricesChanged`). The `.price-drift` banner
  style is in globals.css (butter + ink border + offset shadow).
- Verified live (dev preview, real DB): Juan $17,700 unchanged + no banner; a drifted test
  project showed the banner + frozen total, "Update to current" restored it; the create route
  writes a snapshot; no console errors. `npm test` 43/43, `npm run build` green.

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
- NEVER run `npm run build` while the dev server is running — they share `.next/` and the
  prod build clobbers the dev chunks (every route 500s with `Cannot find module './NNN.js'`).
  Fix: stop dev, `rm -rf .next`, restart dev. Build first or stop the preview first.
- Editing `app/layout.tsx` (e.g. the next/font setup) while dev is running can silently
  wedge hydration: pages serve as frozen SSR HTML (no React fibers, skeletons forever,
  sometimes "Application error: a client-side exception"), with NO console/server errors.
  Hit 2026-06-12 during the brand pass. Fix: stop dev, `rm -rf .next`, restart. Dev-only —
  cannot happen in production.
