-- Happy Fence Company — v1 schema (2026-06-04)
-- Translation of the AppSheet/Sheets data model (How-It-Works §4) into Postgres.
-- Referential integrity replaces the AppSheet guardrails: FKs make orphans/phantoms
-- impossible; ON DELETE CASCADE replaces "Is a part of?"; the FK to price tables
-- replaces the Type Valid-If dropdowns.

create table settings (
  id text primary key default 'GLOBAL' check (id = 'GLOBAL'),
  default_tear_down_rate numeric not null default 3,
  default_dump_rate numeric not null default 3,
  permit_fee numeric not null default 300
);

create table fence_prices (
  type text primary key,
  per_section numeric not null check (per_section >= 0), -- 0 = unpriced flag (UI must warn)
  ft_per_section numeric not null check (ft_per_section > 0)
);

create table gate_prices (
  type text not null,
  style text not null check (style in ('Single', 'Double')),
  price numeric not null check (price >= 0),
  primary key (type, style)
);

create table extras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  address text,
  date date not null default current_date,
  permit boolean not null default false,
  labor_cost_ft numeric not null default 10,
  profit_margin numeric not null default 0.30 check (profit_margin >= 0 and profit_margin < 1),
  discount numeric not null default 0, -- signed: negative = discount, positive = surcharge
  notes text,
  price_mod_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  type text not null references fence_prices(type) on update cascade,
  linear_ft numeric not null check (linear_ft > 0),
  tear_down boolean not null default false,
  dump boolean not null default false,
  take_down_ft numeric not null default 0,
  tear_down_rate numeric, -- null = use global default (CHANGELOG #5 semantics)
  dump_rate numeric,      -- null = use global default
  actual_price numeric not null, -- computed by lib/pricing.ts at save; recomputed on edit
  created_at timestamptz not null default now()
);

create table project_gates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  type text not null,
  style text not null check (style in ('Single', 'Double')),
  actual_price numeric not null, -- flat lookup at save (current gate model)
  created_at timestamptz not null default now(),
  foreign key (type, style) references gate_prices(type, style) on update cascade
);

create table project_extras (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  extra_id uuid not null references extras(id),
  name text not null,
  price numeric not null
);

create index idx_sections_project on project_sections(project_id);
create index idx_gates_project on project_gates(project_id);
create index idx_extras_project on project_extras(project_id);
create index idx_projects_created on projects(created_at desc);

-- Lock everything down: no anon/public access. All reads/writes go through the
-- app server (service role) behind the device-PIN gate. No policies = no access.
alter table settings enable row level security;
alter table fence_prices enable row level security;
alter table gate_prices enable row level security;
alter table extras enable row level security;
alter table projects enable row level security;
alter table project_sections enable row level security;
alter table project_gates enable row level security;
alter table project_extras enable row level security;

-- ── Seed data (live values pulled from the backing Sheets 2026-06-04) ──

insert into settings (id) values ('GLOBAL');

insert into fence_prices (type, per_section, ft_per_section) values
  ('Privacy Vinyl - White', 91, 6),
  ('Aluminum (6x6)', 180, 6),
  ('Aluminum (6x4)', 133, 6),
  ('Wood - Dog Ear', 60, 4),
  ('DuraFence', 65, 4),
  ('Vinyl (Solid Gray)', 169.92, 6),
  ('Vinyl(Cypress)', 120, 6),
  ('Vinyl(Driftwood)', 280.92, 6),
  ('Vinyl - Walnut', 0, 6),
  ('Wood - Board-on-Board', 73, 4),
  ('Vinyl W/ Stiff - White', 130, 6),
  ('Wood - Shadowbox', 73, 4),
  ('Horizontal DuraFence', 70, 4),
  ('Chainlink', 0, 10),
  ('Picket Vinyl - White', 123, 6),
  ('Louvered Vinyl - White', 123, 6),
  ('Privacy Vinyl 4ft(White)', 90, 6),
  ('Horizontal Privacy Vinyl - White', 108, 6),
  ('Vinyl w/ stiff - Tan', 170, 6),
  ('Vinyl - Tan', 115, 6);

insert into gate_prices (type, style, price) values
  ('Vinyl', 'Single', 695),
  ('Vinyl', 'Double', 1429),
  ('Aluminum(4ft)', 'Single', 916),
  ('Aluminum(4ft)', 'Double', 1919),
  ('Wood', 'Single', 504),
  ('Wood', 'Double', 926),
  ('Durafence', 'Single', 534),
  ('Durafence', 'Double', 1000),
  ('Aluminum(6ft)', 'Single', 1058),
  ('Aluminum(6ft)', 'Double', 2212),
  ('Picket Vinyl(4ft)', 'Single', 832),
  ('Picket Vinyl(4ft)', 'Double', 1786),
  ('Louvered Vinyl(White-6ft)', 'Single', 491),
  ('Louvered Vinyl(White-6ft)', 'Double', 1037),
  ('Privacy Vinyl 4ft(White)', 'Single', 695),
  ('Privacy Vinyl 4ft(White)', 'Double', 1429),
  ('Privacy Vinyl - Cypress', 'Single', 765),
  ('Privacy Vinyl - Cypress', 'Double', 1565),
  ('Privacy Vinyl - Tan', 'Single', 700),
  ('Privacy Vinyl - Tan', 'Double', 1489),
  ('Horizontal Vinyl - White', 'Single', 670),
  ('Horizontal Vinyl - White', 'Double', 1375);

insert into extras (name, price) values
  ('Dump Fee', 300);
