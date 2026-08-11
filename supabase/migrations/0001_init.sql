-- Third Space — initial schema.
--
-- Deviation from the spec worth knowing: third_spaces stores the raw Google
-- inputs (rating, review_count, popularity, price_level, transit_minutes)
-- rather than pre-normalised *_score columns. Every component is normalised
-- at query time in src/lib/scoring.js, so re-tuning the normalisation never
-- requires a re-seed. distance and total_score are, as specified, computed
-- per request and never stored.

create extension if not exists "pgcrypto";

-- ── profiles ──────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  age int check (age is null or age between 13 and 120),
  location text,
  lat double precision,
  lng double precision,
  interests text[] not null default '{}',
  profile_picture_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "delete own profile" on public.profiles
  for delete using (auth.uid() = id);

-- ── third_spaces ──────────────────────────────────────────────────────────

create table public.third_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  google_place_id text unique,
  name text not null,
  category text not null check (category in ('Gathering', 'Sport', 'Service', 'Other')),
  address text,
  lat double precision not null,
  lng double precision not null,

  -- Raw Google Places inputs.
  rating numeric(2, 1),
  reviews int not null default 0,
  price_level int check (price_level between 0 and 4),  -- null falls back to 2
  popularity int not null default 50,                   -- busy-times proxy, 0–100
  transit_minutes int,                                  -- Routes API, transit mode
  transit_line text,

  hours text,
  interests text[] not null default '{}',
  quote text,

  closed boolean not null default false,
  closed_on text,

  source text not null default 'manual_seed' check (source in ('google_places', 'manual_seed')),
  created_at timestamptz not null default now()
);

create index third_spaces_open_idx on public.third_spaces (closed) where closed = false;

alter table public.third_spaces enable row level security;

-- The catalogue is public reference data; writes go through the seed script.
create policy "anyone signed in can read places" on public.third_spaces
  for select to authenticated using (true);

-- ── favorites ─────────────────────────────────────────────────────────────

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  third_space_id uuid not null references public.third_spaces on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, third_space_id)
);

alter table public.favorites enable row level security;

create policy "read own favorites" on public.favorites
  for select using (auth.uid() = user_id);
create policy "add own favorites" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "remove own favorites" on public.favorites
  for delete using (auth.uid() = user_id);

-- ── score_weights ─────────────────────────────────────────────────────────
-- Stored raw. Normalised to 1.0 at query time so one slider never moves
-- the others.

create table public.score_weights (
  user_id uuid primary key references public.profiles on delete cascade,
  weight_interactability double precision not null default 0.30,
  weight_distance double precision not null default 0.25,
  weight_transport double precision not null default 0.20,
  weight_popularity double precision not null default 0.15,
  weight_cost double precision not null default 0.10,
  updated_at timestamptz not null default now()
);

alter table public.score_weights enable row level security;

create policy "read own weights" on public.score_weights
  for select using (auth.uid() = user_id);
create policy "insert own weights" on public.score_weights
  for insert with check (auth.uid() = user_id);
create policy "update own weights" on public.score_weights
  for update using (auth.uid() = user_id);

-- ── adopt_applications ────────────────────────────────────────────────────
-- Display only. No payment flow in the MVP.

create table public.adopt_applications (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,
  neighborhood text not null,
  lat double precision not null,
  lng double precision not null,
  ask int not null,
  reach int not null,
  need int not null check (need between 0 and 100),
  filed text not null,
  summary text not null,
  detail text not null,
  signals jsonb not null default '[]',
  contact text,
  open boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.adopt_applications enable row level security;

create policy "anyone signed in can read applications" on public.adopt_applications
  for select to authenticated using (true);
