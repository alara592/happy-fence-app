# Migration log — Supabase "Happy Fence Calculator" (knbyonagksvaqpqkkehj)

Applied via the Supabase MCP (`apply_migration`); the live `supabase_migrations` table
is authoritative. `schema.sql` is migration 1 verbatim. Later migrations below.

## 2. rename_fence_types_material_style_color_and_sort_order (2026-06-05)

Naming scheme "Material - Style - Color" (bare vinyls = Privacy) + explicit dropdown order.

```sql
alter table fence_prices add column sort_order integer not null default 999;
update fence_prices set type = 'Aluminum - 6x4', sort_order = 1 where type = 'Aluminum (6x4)';
update fence_prices set type = 'Aluminum - 6x6', sort_order = 2 where type = 'Aluminum (6x6)';
update fence_prices set sort_order = 3 where type = 'Chainlink';
update fence_prices set sort_order = 4 where type = 'DuraFence';
update fence_prices set type = 'DuraFence - Horizontal', sort_order = 5 where type = 'Horizontal DuraFence';
update fence_prices set type = 'Vinyl - Horizontal Privacy - White', sort_order = 6 where type = 'Horizontal Privacy Vinyl - White';
update fence_prices set type = 'Vinyl - Louvered - White', sort_order = 7 where type = 'Louvered Vinyl - White';
update fence_prices set type = 'Vinyl - Picket - White', sort_order = 8 where type = 'Picket Vinyl - White';
update fence_prices set type = 'Vinyl - Privacy - White', sort_order = 9 where type = 'Privacy Vinyl - White';
update fence_prices set type = 'Vinyl - Privacy 4ft - White', sort_order = 10 where type = 'Privacy Vinyl 4ft(White)';
update fence_prices set type = 'Vinyl - Privacy - Tan', sort_order = 11 where type = 'Vinyl - Tan';
update fence_prices set type = 'Vinyl - Privacy - Walnut', sort_order = 12 where type = 'Vinyl - Walnut';
update fence_prices set type = 'Vinyl - Privacy - Solid Gray', sort_order = 13 where type = 'Vinyl (Solid Gray)';
update fence_prices set type = 'Vinyl - Privacy w/ Stiff - Tan', sort_order = 14 where type = 'Vinyl w/ stiff - Tan';
update fence_prices set type = 'Vinyl - Privacy w/ Stiff - White', sort_order = 15 where type = 'Vinyl W/ Stiff - White';
update fence_prices set type = 'Vinyl - Privacy - Cypress', sort_order = 16 where type = 'Vinyl(Cypress)';
update fence_prices set type = 'Vinyl - Privacy - Driftwood', sort_order = 17 where type = 'Vinyl(Driftwood)';
update fence_prices set type = 'Vinyl - Privacy - Sand', sort_order = 18 where type = 'Vinyl(Sand)';
update fence_prices set type = 'Wood - Board-on-Board', sort_order = 19 where type = 'Wood - Board-on-Board';
update fence_prices set sort_order = 20 where type = 'Wood - Dog Ear';
update fence_prices set sort_order = 21 where type = 'Wood - Shadowbox';
```

## 3. price_board_sections_lose_material (2026-06-05)

Sections become pure measurements; materials selected per project (the price board).

```sql
create table project_materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null references fence_prices(type) on update cascade,
  created_at timestamptz not null default now(),
  unique (project_id, type)
);
create index idx_materials_project on project_materials(project_id);
alter table project_materials enable row level security;

insert into project_materials (project_id, type)
select distinct project_id, type from project_sections;

alter table project_sections drop column type;
alter table project_sections drop column actual_price;
```

## 4. active_material_on_board (2026-06-05)

```sql
alter table project_materials add column is_active boolean not null default false;
create unique index uniq_active_material_per_project on project_materials(project_id) where is_active;
```

## 5. gate_quantity (2026-06-05)

```sql
alter table project_gates add column quantity integer not null default 1 check (quantity > 0);
```

## 6. appointments_table (2026-06-06)

Calendar-sync target — Google Calendar "Site Visit" events land here. `calendar_event_id`
is the unique upsert key. `project_id` links an appointment to the project created from it
(null = not yet created → "Create Project" button shows; set = linked). Replaces the AppSheet
pre-generated-Project-ID hack: the link is set at project-creation time instead.

```sql
create table appointments (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id text not null unique,
  client text not null default '',
  address text,
  start_at timestamptz,
  end_at timestamptz,
  meeting_title text,
  notes text,
  source text not null default 'Google Calendar',
  status text not null default 'Scheduled',
  created_by text,
  project_id uuid references projects(id) on delete set null,
  last_synced timestamptz,
  created_at timestamptz not null default now()
);
create index idx_appointments_start on appointments(start_at desc);
create index idx_appointments_project on appointments(project_id);
alter table appointments enable row level security;
```

## 7. project_photos (2026-06-09)

Per-project site photos + a private storage bucket. Photos are project-level (not tied to
a section/gate). `caption` doubles as the per-photo note. Bucket is private — the app server
(service role) mints short-lived signed URLs on read; no public access, same model as the
RLS-locked tables. Project delete cascades the rows (FK); the storage objects are purged by
the DELETE route.

```sql
create table project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_photos_project on project_photos(project_id);
alter table project_photos enable row level security;

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', false)
on conflict (id) do nothing;
```

## 8. project_dump_included (2026-06-09)

Dump/haul-away becomes a separate, optional, per-foot line on the quote (pulled out of the
fence price; see lib/pricing.ts). This project-level flag is the customer's include/exclude
choice. Default true so existing quotes are unchanged.

```sql
alter table projects add column dump_included boolean not null default true;
```

## Data updates outside migrations (2026-06-05)

```sql
update fence_prices set per_section = 121 where type = 'Vinyl(Cypress)'; -- confirmed by Anthony
insert into fence_prices (type, per_section, ft_per_section) values ('Vinyl(Sand)', 112, 6); -- new
```
