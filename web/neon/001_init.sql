-- Výprava schema for Neon Postgres.
-- Run in the Neon SQL editor (or psql) before web/neon/002_seed.sql.
--
-- Plain Postgres only. No Row Level Security, no auth.uid(), no Supabase
-- Storage, no Realtime. The role in DATABASE_URL can read and write;
-- keep that connection string on the server.

create extension if not exists pgcrypto;

do $$
begin
  create type goal_kind as enum (
    'daily',
    'weekly',
    'long_term',
    'shared',
    'campaign',
    'party'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  mc_uuid text unique,
  name text not null,
  chapter int not null default 1,
  total_points int not null default 0,
  weekly_points int not null default 0,
  party_id text,
  updated_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key,
  kind goal_kind not null,
  name text not null,
  description text not null default '',
  objective_type text not null default 'BREAK_BLOCK',
  targets text[] not null default '{}',
  amount int not null default 1,
  points int not null default 0,
  min_chapter int not null default 1,
  chapter_id text,
  chapter_order int,
  rewards jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  period_key text,
  created_at timestamptz not null default now()
);

create table if not exists milestones (
  id text primary key,
  chapter_id text not null,
  chapter_order int not null,
  chapter_name text not null,
  name text not null,
  description text not null default '',
  points int not null default 0,
  rewards jsonb not null default '[]'::jsonb
);

create table if not exists player_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  goal_id text not null references goals(id) on delete cascade,
  current_amount int not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (player_id, goal_id)
);

create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id text not null references goals(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  amount int not null default 0,
  updated_at timestamptz not null default now(),
  unique (goal_id, player_id)
);

create table if not exists shared_goal_state (
  goal_id text primary key references goals(id) on delete cascade,
  progress int not null default 0,
  completed boolean not null default false,
  period_key text,
  updated_at timestamptz not null default now()
);

create table if not exists leaderboard_snapshot (
  player_id uuid primary key references players(id) on delete cascade,
  name text not null,
  total_points int not null default 0,
  weekly_points int not null default 0,
  chapter int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists admin_settings (
  id int primary key default 1 check (id = 1),
  rewards_enabled boolean not null default true,
  points_enabled boolean not null default true,
  min_chapter_enforced boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_goals_kind on goals(kind);
create index if not exists idx_player_progress_player on player_progress(player_id);
create index if not exists idx_contributions_goal on contributions(goal_id);
create index if not exists idx_leaderboard_total on leaderboard_snapshot(total_points desc);
