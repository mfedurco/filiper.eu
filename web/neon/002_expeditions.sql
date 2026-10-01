-- Expeditions (výpravy) and quest definitions.
-- Player progress, contributions, shared state, and leaderboard rows are scoped
-- by expedition_id. Demo rows stay untouched (their expedition_id remains null).
-- Re-running upserts the seeded expedition cesta-prezivsich; it does not truncate.
-- Seeded quests: 78

create extension if not exists pgcrypto;

do $$ begin
  create type expedition_status as enum ('draft', 'active', 'ended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type quest_kind as enum ('kampan', 'denne', 'tyzdenne', 'dlhodobe', 'spolocne', 'party');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type quest_tracking as enum (
    'break_block', 'place_block', 'pickup', 'craft', 'smelt', 'kill', 'join', 'enter_world'
  );
exception when duplicate_object then null;
end $$;

create table if not exists expeditions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status expedition_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists expeditions_one_active
  on expeditions (status)
  where status = 'active';

create table if not exists quest_definitions (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references expeditions(id) on delete cascade,
  stable_key text not null,
  kind quest_kind not null,
  title text not null,
  description text not null default '',
  points int not null default 0,
  target_count int not null default 1,
  tracking_type quest_tracking not null,
  filter_values text[] not null default '{}',
  sort_order int not null default 0,
  active boolean not null default true,
  min_chapter int not null default 1,
  rewards jsonb not null default '[]'::jsonb,
  chapter_key text,
  chapter_order int,
  chapter_title text,
  chapter_description text,
  milestone_name text,
  milestone_points int,
  milestone_rewards jsonb,
  created_at timestamptz not null default now(),
  constraint quest_definitions_expedition_key unique (expedition_id, stable_key)
);

create index if not exists idx_quest_definitions_expedition
  on quest_definitions (expedition_id, kind, sort_order);

alter table player_progress add column if not exists expedition_id uuid references expeditions(id) on delete cascade;
alter table contributions add column if not exists expedition_id uuid references expeditions(id) on delete cascade;
alter table shared_goal_state add column if not exists expedition_id uuid references expeditions(id) on delete cascade;
alter table leaderboard_snapshot add column if not exists expedition_id uuid references expeditions(id) on delete cascade;

alter table shared_goal_state add column if not exists row_id uuid default gen_random_uuid();
alter table leaderboard_snapshot add column if not exists row_id uuid default gen_random_uuid();

update shared_goal_state set row_id = gen_random_uuid() where row_id is null;
update leaderboard_snapshot set row_id = gen_random_uuid() where row_id is null;

alter table player_progress drop constraint if exists player_progress_player_id_goal_id_key;
alter table contributions drop constraint if exists contributions_goal_id_player_id_key;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'shared_goal_state'::regclass
      and c.contype = 'p'
      and a.attname = 'goal_id'
  ) then
    alter table shared_goal_state drop constraint shared_goal_state_pkey;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'shared_goal_state'::regclass and contype = 'p'
  ) then
    alter table shared_goal_state alter column row_id set not null;
    alter table shared_goal_state add primary key (row_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'leaderboard_snapshot'::regclass
      and c.contype = 'p'
      and a.attname = 'player_id'
  ) then
    alter table leaderboard_snapshot drop constraint leaderboard_snapshot_pkey;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'leaderboard_snapshot'::regclass and contype = 'p'
  ) then
    alter table leaderboard_snapshot alter column row_id set not null;
    alter table leaderboard_snapshot add primary key (row_id);
  end if;
end $$;

create unique index if not exists player_progress_legacy_goal
  on player_progress (player_id, goal_id)
  where expedition_id is null;

create unique index if not exists player_progress_expedition_goal
  on player_progress (expedition_id, player_id, goal_id)
  where expedition_id is not null;

create unique index if not exists contributions_legacy_goal
  on contributions (goal_id, player_id)
  where expedition_id is null;

create unique index if not exists contributions_expedition_goal
  on contributions (expedition_id, goal_id, player_id)
  where expedition_id is not null;

create unique index if not exists shared_goal_state_legacy_goal
  on shared_goal_state (goal_id)
  where expedition_id is null;

create unique index if not exists shared_goal_state_expedition_goal
  on shared_goal_state (expedition_id, goal_id)
  where expedition_id is not null;

create unique index if not exists leaderboard_snapshot_legacy_player
  on leaderboard_snapshot (player_id)
  where expedition_id is null;

create unique index if not exists leaderboard_snapshot_expedition_player
  on leaderboard_snapshot (expedition_id, player_id)
  where expedition_id is not null;

alter table expeditions enable row level security;
alter table quest_definitions enable row level security;

drop policy if exists "Public read expeditions" on expeditions;
create policy "Public read expeditions" on expeditions for select using (true);

drop policy if exists "Public read quest definitions" on quest_definitions;
create policy "Public read quest definitions" on quest_definitions for select using (true);

create or replace function apply_expedition_schedule(as_of timestamptz)
returns table (changed boolean, active_id uuid, active_slug text, ended_slug text)
language plpgsql
as $$
declare
  winner uuid;
  did boolean := false;
  ended_list text := '';
  rec record;
begin
  perform pg_advisory_xact_lock(48271001);

  select e.id into winner
  from expeditions e
  where e.status in ('draft', 'active')
    and e.starts_at is not null
    and e.starts_at <= as_of
    and (e.ends_at is null or e.ends_at > as_of)
  order by e.starts_at desc, e.created_at desc
  limit 1;

  if winner is not null then
    for rec in
      select id, slug from expeditions
      where status = 'active' and id <> winner
    loop
      update expeditions set status = 'ended' where id = rec.id;
      ended_list := case when ended_list = '' then rec.slug else ended_list || ',' || rec.slug end;
      did := true;
    end loop;
    if (select status from expeditions where id = winner) is distinct from 'active' then
      update expeditions set status = 'active' where id = winner;
      did := true;
    end if;
  else
    for rec in
      select id, slug from expeditions
      where status = 'active'
        and ends_at is not null
        and ends_at <= as_of
    loop
      update expeditions set status = 'ended' where id = rec.id;
      ended_list := case when ended_list = '' then rec.slug else ended_list || ',' || rec.slug end;
      did := true;
    end loop;
  end if;

  select e.id, e.slug into active_id, active_slug
  from expeditions e
  where e.status = 'active'
  limit 1;

  changed := did;
  ended_slug := nullif(ended_list, '');
  return next;
end;
$$;

create or replace function end_active_expedition()
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(48271001);
  update expeditions set status = 'ended' where status = 'active';
end;
$$;

create or replace function activate_expedition(target uuid)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(48271001);
  if not exists (select 1 from expeditions where id = target and status = 'draft') then
    raise exception 'expedition % is not a draft', target;
  end if;
  update expeditions set status = 'ended' where status = 'active';
  update expeditions set status = 'active' where id = target;
end;
$$;

insert into expeditions (id, slug, title, description, status, starts_at, ends_at)
select
  '22222222-2222-2222-2222-222222222201',
  'cesta-prezivsich',
  'Cesta Preživších',
  'Prvá školská výprava. Úlohy sú skopírované z pôvodnej sady pluginu.',
  'active',
  timestamptz '2026-09-01 00:00:00 Europe/Bratislava',
  timestamptz '2027-06-30 23:59:59 Europe/Bratislava'
where not exists (select 1 from expeditions where slug = 'cesta-prezivsich')
  and not exists (select 1 from expeditions where status = 'active');

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c1_wood', 'kampan'::quest_kind, 'Zberač dreva', 'Získaj 32 dubových alebo brezových klád.', 10, 32,
  'break_block'::quest_tracking, array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 0, true, 1, '[]'::jsonb,
  'chapter_1', 1, 'Základy', 'Prvý deň v divočine. Drevo, kameň, jedlo.',
  'Prvý tábor', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c1_table', 'kampan'::quest_kind, 'Dielňa', 'Vyrob crafting table.', 10, 1,
  'craft'::quest_tracking, array['CRAFTING_TABLE']::text[], 1, true, 1, '[]'::jsonb,
  'chapter_1', 1, 'Základy', 'Prvý deň v divočine. Drevo, kameň, jedlo.',
  'Prvý tábor', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c1_pick', 'kampan'::quest_kind, 'Prvý nástroj', 'Vyrob drevený krumpáč.', 10, 1,
  'craft'::quest_tracking, array['WOODEN_PICKAXE']::text[], 2, true, 1, '[]'::jsonb,
  'chapter_1', 1, 'Základy', 'Prvý deň v divočine. Drevo, kameň, jedlo.',
  'Prvý tábor', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c1_stone', 'kampan'::quest_kind, 'Kameňolom', 'Vyťaž 24 kameňa / deepslate.', 15, 24,
  'break_block'::quest_tracking, array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 3, true, 1, '[]'::jsonb,
  'chapter_1', 1, 'Základy', 'Prvý deň v divočine. Drevo, kameň, jedlo.',
  'Prvý tábor', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c1_food', 'kampan'::quest_kind, 'Večera', 'Upeč 8 kusov mäsa (steak, bravčové, kuracie, baranie).', 15, 8,
  'smelt'::quest_tracking, array['COOKED_BEEF','COOKED_PORKCHOP','COOKED_CHICKEN','COOKED_MUTTON']::text[], 4, true, 1, '[]'::jsonb,
  'chapter_1', 1, 'Základy', 'Prvý deň v divočine. Drevo, kameň, jedlo.',
  'Prvý tábor', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c2_bed', 'kampan'::quest_kind, 'Posteľ', 'Vyrob posteľ.', 15, 1,
  'craft'::quest_tracking, array['WHITE_BED','RED_BED','BLUE_BED','GREEN_BED','YELLOW_BED','BLACK_BED','ORANGE_BED','MAGENTA_BED','LIGHT_BLUE_BED','LIME_BED','PINK_BED','GRAY_BED','LIGHT_GRAY_BED','CYAN_BED','PURPLE_BED','BROWN_BED']::text[], 5, true, 2, '[]'::jsonb,
  'chapter_2', 2, 'Domov', 'Postav si bezpečné zázemie.',
  'Vlastný dom', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c2_chest', 'kampan'::quest_kind, 'Sklad', 'Vyrob 2 truhlice.', 10, 2,
  'craft'::quest_tracking, array['CHEST']::text[], 6, true, 2, '[]'::jsonb,
  'chapter_2', 2, 'Domov', 'Postav si bezpečné zázemie.',
  'Vlastný dom', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c2_furnace', 'kampan'::quest_kind, 'Pec', 'Vyrob pec.', 10, 1,
  'craft'::quest_tracking, array['FURNACE']::text[], 7, true, 2, '[]'::jsonb,
  'chapter_2', 2, 'Domov', 'Postav si bezpečné zázemie.',
  'Vlastný dom', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c2_build', 'kampan'::quest_kind, 'Staviteľ', 'Polož 64 stavebných blokov (akýkoľvek plný blok).', 20, 64,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 8, true, 2, '[]'::jsonb,
  'chapter_2', 2, 'Domov', 'Postav si bezpečné zázemie.',
  'Vlastný dom', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c2_doors', 'kampan'::quest_kind, 'Vchod', 'Vyrob dvere.', 10, 1,
  'craft'::quest_tracking, array['OAK_DOOR','BIRCH_DOOR','SPRUCE_DOOR','DARK_OAK_DOOR','JUNGLE_DOOR','ACACIA_DOOR','MANGROVE_DOOR','CHERRY_DOOR','IRON_DOOR']::text[], 9, true, 2, '[]'::jsonb,
  'chapter_2', 2, 'Domov', 'Postav si bezpečné zázemie.',
  'Vlastný dom', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c3_coal', 'kampan'::quest_kind, 'Uhlík', 'Vyťaž 32 uhlia.', 20, 32,
  'break_block'::quest_tracking, array['COAL_ORE','DEEPSLATE_COAL_ORE']::text[], 10, true, 3, '[]'::jsonb,
  'chapter_3', 3, 'Baník', 'Zostúp do jaskýň a prinies ore.',
  'Hlbiny', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c3_iron', 'kampan'::quest_kind, 'Železná žila', 'Vyťaž 24 železnej rudy.', 25, 24,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 11, true, 3, '[]'::jsonb,
  'chapter_3', 3, 'Baník', 'Zostúp do jaskýň a prinies ore.',
  'Hlbiny', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c3_smelt_iron', 'kampan'::quest_kind, 'Hutník', 'Vyrob 24 železných ingotov.', 20, 24,
  'smelt'::quest_tracking, array['IRON_INGOT']::text[], 12, true, 3, '[]'::jsonb,
  'chapter_3', 3, 'Baník', 'Zostúp do jaskýň a prinies ore.',
  'Hlbiny', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c3_iron_pick', 'kampan'::quest_kind, 'Lepší nástroj', 'Vyrob železný krumpáč.', 15, 1,
  'craft'::quest_tracking, array['IRON_PICKAXE']::text[], 13, true, 3, '[]'::jsonb,
  'chapter_3', 3, 'Baník', 'Zostúp do jaskýň a prinies ore.',
  'Hlbiny', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c3_diamond', 'kampan'::quest_kind, 'Prvý diamant', 'Vyťaž 1 diamantovú rudu.', 40, 1,
  'break_block'::quest_tracking, array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 14, true, 3, '[]'::jsonb,
  'chapter_3', 3, 'Baník', 'Zostúp do jaskýň a prinies ore.',
  'Hlbiny', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c4_zombie', 'kampan'::quest_kind, 'Lov zombie', 'Zabi 15 zombie.', 25, 15,
  'kill'::quest_tracking, array['ZOMBIE','ZOMBIE_VILLAGER','HUSK','DROWNED']::text[], 15, true, 4, '[]'::jsonb,
  'chapter_4', 4, 'Lovec', 'Nauč sa brániť v noci.',
  'Nočný lovec', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c4_skeleton', 'kampan'::quest_kind, 'Lov kostlivcov', 'Zabi 10 kostlivcov.', 25, 10,
  'kill'::quest_tracking, array['SKELETON','STRAY','BOGGED']::text[], 16, true, 4, '[]'::jsonb,
  'chapter_4', 4, 'Lovec', 'Nauč sa brániť v noci.',
  'Nočný lovec', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c4_creeper', 'kampan'::quest_kind, 'Pozor, creeper!', 'Zabi 5 creeperov.', 30, 5,
  'kill'::quest_tracking, array['CREEPER']::text[], 17, true, 4, '[]'::jsonb,
  'chapter_4', 4, 'Lovec', 'Nauč sa brániť v noci.',
  'Nočný lovec', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c4_bow', 'kampan'::quest_kind, 'Strelec', 'Vyrob luk.', 15, 1,
  'craft'::quest_tracking, array['BOW']::text[], 18, true, 4, '[]'::jsonb,
  'chapter_4', 4, 'Lovec', 'Nauč sa brániť v noci.',
  'Nočný lovec', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c4_shield', 'kampan'::quest_kind, 'Štít', 'Vyrob štít.', 15, 1,
  'craft'::quest_tracking, array['SHIELD']::text[], 19, true, 4, '[]'::jsonb,
  'chapter_4', 4, 'Lovec', 'Nauč sa brániť v noci.',
  'Nočný lovec', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c5_wheat', 'kampan'::quest_kind, 'Obilie', 'Pozbieraj 32 pšenice.', 20, 32,
  'break_block'::quest_tracking, array['WHEAT']::text[], 20, true, 5, '[]'::jsonb,
  'chapter_5', 5, 'Farmár', 'Jedlo a zvieratá = dlhodobé prežitie.',
  'Hospodárstvo', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c5_bread', 'kampan'::quest_kind, 'Pekár', 'Vyrob 16 chlebov.', 20, 16,
  'craft'::quest_tracking, array['BREAD']::text[], 21, true, 5, '[]'::jsonb,
  'chapter_5', 5, 'Farmár', 'Jedlo a zvieratá = dlhodobé prežitie.',
  'Hospodárstvo', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c5_animals', 'kampan'::quest_kind, 'Pastier', 'Zabi 10 zvierat na mäso (krava, ošípaná, ovca, kura).', 15, 10,
  'kill'::quest_tracking, array['COW','PIG','SHEEP','CHICKEN']::text[], 22, true, 5, '[]'::jsonb,
  'chapter_5', 5, 'Farmár', 'Jedlo a zvieratá = dlhodobé prežitie.',
  'Hospodárstvo', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c5_wool', 'kampan'::quest_kind, 'Vlna', 'Získaj 16 vlny (položením/ťažbou vlnených blokov alebo craftom nie – break white wool from sheep drops via pickup).', 15, 16,
  'pickup'::quest_tracking, array['WHITE_WOOL','ORANGE_WOOL','MAGENTA_WOOL','LIGHT_BLUE_WOOL','YELLOW_WOOL','LIME_WOOL','PINK_WOOL','GRAY_WOOL','LIGHT_GRAY_WOOL','CYAN_WOOL','PURPLE_WOOL','BLUE_WOOL','BROWN_WOOL','GREEN_WOOL','RED_WOOL','BLACK_WOOL']::text[], 23, true, 5, '[]'::jsonb,
  'chapter_5', 5, 'Farmár', 'Jedlo a zvieratá = dlhodobé prežitie.',
  'Hospodárstvo', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c5_carrot', 'kampan'::quest_kind, 'Zelenina', 'Pozbieraj 16 mrkiev alebo zemiakov.', 15, 16,
  'break_block'::quest_tracking, array['CARROTS','POTATOES']::text[], 24, true, 5, '[]'::jsonb,
  'chapter_5', 5, 'Farmár', 'Jedlo a zvieratá = dlhodobé prežitie.',
  'Hospodárstvo', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c6_helmet', 'kampan'::quest_kind, 'Prilba', 'Vyrob železnú prilbu.', 20, 1,
  'craft'::quest_tracking, array['IRON_HELMET']::text[], 25, true, 6, '[]'::jsonb,
  'chapter_6', 6, 'Remeselník', 'Plná výbava zo železa a viac.',
  'Majster remesla', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c6_chest', 'kampan'::quest_kind, 'Hrudák', 'Vyrob železný hrudák.', 25, 1,
  'craft'::quest_tracking, array['IRON_CHESTPLATE']::text[], 26, true, 6, '[]'::jsonb,
  'chapter_6', 6, 'Remeselník', 'Plná výbava zo železa a viac.',
  'Majster remesla', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c6_legs', 'kampan'::quest_kind, 'Nohavice', 'Vyrob železné nohavice.', 25, 1,
  'craft'::quest_tracking, array['IRON_LEGGINGS']::text[], 27, true, 6, '[]'::jsonb,
  'chapter_6', 6, 'Remeselník', 'Plná výbava zo železa a viac.',
  'Majster remesla', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c6_boots', 'kampan'::quest_kind, 'Topánky', 'Vyrob železné topánky.', 20, 1,
  'craft'::quest_tracking, array['IRON_BOOTS']::text[], 28, true, 6, '[]'::jsonb,
  'chapter_6', 6, 'Remeselník', 'Plná výbava zo železa a viac.',
  'Majster remesla', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c6_diamond_pick', 'kampan'::quest_kind, 'Diamantový nástroj', 'Vyrob diamantový krumpáč.', 40, 1,
  'craft'::quest_tracking, array['DIAMOND_PICKAXE']::text[], 29, true, 6, '[]'::jsonb,
  'chapter_6', 6, 'Remeselník', 'Plná výbava zo železa a viac.',
  'Majster remesla', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c7_enter', 'kampan'::quest_kind, 'Portál', 'Vstúp do Netheru.', 40, 1,
  'enter_world'::quest_tracking, array['NETHER']::text[], 30, true, 7, '[]'::jsonb,
  'chapter_7', 7, 'Nether', 'Vstup do pekelného rozmeru.',
  'Pekelník', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c7_quartz', 'kampan'::quest_kind, 'Kremeň', 'Vyťaž 24 nether quartz.', 30, 24,
  'break_block'::quest_tracking, array['NETHER_QUARTZ_ORE']::text[], 31, true, 7, '[]'::jsonb,
  'chapter_7', 7, 'Nether', 'Vstup do pekelného rozmeru.',
  'Pekelník', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c7_gold', 'kampan'::quest_kind, 'Nether gold', 'Vyťaž 16 nether gold ore.', 30, 16,
  'break_block'::quest_tracking, array['NETHER_GOLD_ORE']::text[], 32, true, 7, '[]'::jsonb,
  'chapter_7', 7, 'Nether', 'Vstup do pekelného rozmeru.',
  'Pekelník', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c7_blaze', 'kampan'::quest_kind, 'Blaze', 'Zabi 8 blaze.', 40, 8,
  'kill'::quest_tracking, array['BLAZE']::text[], 33, true, 7, '[]'::jsonb,
  'chapter_7', 7, 'Nether', 'Vstup do pekelného rozmeru.',
  'Pekelník', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c7_debris', 'kampan'::quest_kind, 'Ancient Debris', 'Vyťaž 1 ancient debris.', 60, 1,
  'break_block'::quest_tracking, array['ANCIENT_DEBRIS']::text[], 34, true, 7, '[]'::jsonb,
  'chapter_7', 7, 'Nether', 'Vstup do pekelného rozmeru.',
  'Pekelník', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c8_eyes', 'kampan'::quest_kind, 'Oči Endera', 'Vyrob 12 očí Endera.', 50, 12,
  'craft'::quest_tracking, array['ENDER_EYE']::text[], 35, true, 8, '[]'::jsonb,
  'chapter_8', 8, 'Legenda triedy', 'Finálna skúška prežitia – End a sláva.',
  'Legenda servera', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c8_end', 'kampan'::quest_kind, 'Koniec sveta', 'Vstúp do Endu.', 60, 1,
  'enter_world'::quest_tracking, array['THE_END']::text[], 36, true, 8, '[]'::jsonb,
  'chapter_8', 8, 'Legenda triedy', 'Finálna skúška prežitia – End a sláva.',
  'Legenda servera', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c8_dragon', 'kampan'::quest_kind, 'Drak', 'Zabi Ender Dragona (spoločne).', 200, 1,
  'kill'::quest_tracking, array['ENDER_DRAGON']::text[], 37, true, 8, '[]'::jsonb,
  'chapter_8', 8, 'Legenda triedy', 'Finálna skúška prežitia – End a sláva.',
  'Legenda servera', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c8_elytra', 'kampan'::quest_kind, 'Elytra', 'Získaj elytru.', 80, 1,
  'pickup'::quest_tracking, array['ELYTRA']::text[], 38, true, 8, '[]'::jsonb,
  'chapter_8', 8, 'Legenda triedy', 'Finálna skúška prežitia – End a sláva.',
  'Legenda servera', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'c8_shulker', 'kampan'::quest_kind, 'Shulker shell', 'Získaj 4 shulker shelle.', 60, 4,
  'pickup'::quest_tracking, array['SHULKER_SHELL']::text[], 39, true, 8, '[]'::jsonb,
  'chapter_8', 8, 'Legenda triedy', 'Finálna skúška prežitia – End a sláva.',
  'Legenda servera', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_wood', 'denne'::quest_kind, 'Ráno v lese', 'Získaj 24 klád.', 8, 24,
  'break_block'::quest_tracking, array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 40, true, 1, '[{"material": "APPLE", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_stone', 'denne'::quest_kind, 'Kamenár', 'Vyťaž 48 kameňa.', 8, 48,
  'break_block'::quest_tracking, array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 41, true, 1, '[{"material": "COAL", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_cook', 'denne'::quest_kind, 'Kuchár dňa', 'Upeč 12 jedál.', 8, 12,
  'smelt'::quest_tracking, array['COOKED_BEEF','COOKED_PORKCHOP','COOKED_CHICKEN','COOKED_MUTTON','BAKED_POTATO','COOKED_SALMON','COOKED_COD']::text[], 42, true, 1, '[{"material": "BREAD", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_build', 'denne'::quest_kind, 'Stavba dňa', 'Polož 48 blokov.', 8, 48,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 43, true, 2, '[{"material": "IRON_NUGGET", "amount": 18}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_coal', 'denne'::quest_kind, 'Uhlíková smena', 'Vyťaž 20 uhlia.', 10, 20,
  'break_block'::quest_tracking, array['COAL_ORE','DEEPSLATE_COAL_ORE']::text[], 44, true, 3, '[{"material": "TORCH", "amount": 24}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_iron', 'denne'::quest_kind, 'Železná smena', 'Vyťaž 12 železnej rudy.', 12, 12,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 45, true, 3, '[{"material": "IRON_INGOT", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_zombie', 'denne'::quest_kind, 'Nočná hliadka', 'Zabi 10 zombie.', 12, 10,
  'kill'::quest_tracking, array['ZOMBIE','HUSK','DROWNED','ZOMBIE_VILLAGER']::text[], 46, true, 4, '[{"material": "IRON_INGOT", "amount": 3}, {"material": "ARROW", "amount": 16}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_skeleton', 'denne'::quest_kind, 'Lukostrelec', 'Zabi 8 kostlivcov.', 12, 8,
  'kill'::quest_tracking, array['SKELETON','STRAY','BOGGED']::text[], 47, true, 4, '[{"material": "BONE", "amount": 8}, {"material": "EXPERIENCE_BOTTLE", "amount": 2}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_wheat', 'denne'::quest_kind, 'Žatva', 'Pozbieraj 24 pšenice.', 10, 24,
  'break_block'::quest_tracking, array['WHEAT']::text[], 48, true, 5, '[{"material": "BREAD", "amount": 12}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_diamond', 'denne'::quest_kind, 'Diamantový deň', 'Vyťaž 2 diamantové rudy.', 20, 2,
  'break_block'::quest_tracking, array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 49, true, 6, '[{"material": "DIAMOND", "amount": 1}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_nether_walk', 'denne'::quest_kind, 'Pekelná prechádzka', 'Vstúp dnes do Netheru.', 15, 1,
  'enter_world'::quest_tracking, array['NETHER']::text[], 50, true, 7, '[{"material": "GOLD_INGOT", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'd_blaze', 'denne'::quest_kind, 'Blaze hunt', 'Zabi 4 blaze.', 18, 4,
  'kill'::quest_tracking, array['BLAZE']::text[], 51, true, 7, '[{"material": "BLAZE_POWDER", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_wood', 'tyzdenne'::quest_kind, 'Týždeň drevorubača', 'Získaj 200 klád počas týždňa.', 40, 200,
  'break_block'::quest_tracking, array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 52, true, 1, '[{"material": "IRON_INGOT", "amount": 12}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_stone', 'tyzdenne'::quest_kind, 'Kameňolom týždňa', 'Vyťaž 300 kameňa.', 40, 300,
  'break_block'::quest_tracking, array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 53, true, 1, '[{"material": "COAL", "amount": 32}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_build', 'tyzdenne'::quest_kind, 'Staviteľský týždeň', 'Polož 250 blokov.', 45, 250,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 54, true, 2, '[{"material": "EMERALD", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_iron', 'tyzdenne'::quest_kind, 'Železný týždeň', 'Vyťaž 64 železnej rudy.', 55, 64,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 55, true, 3, '[{"material": "IRON_BLOCK", "amount": 2}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_mobs', 'tyzdenne'::quest_kind, 'Hliadka týždňa', 'Zabi 60 nepriateľských mobov.', 55, 60,
  'kill'::quest_tracking, array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 56, true, 4, '[{"material": "GOLDEN_APPLE", "amount": 2}, {"material": "ARROW", "amount": 32}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_farm', 'tyzdenne'::quest_kind, 'Žatva týždňa', 'Pozbieraj 80 pšenice.', 45, 80,
  'break_block'::quest_tracking, array['WHEAT']::text[], 57, true, 5, '[{"material": "BREAD", "amount": 24}, {"material": "HAY_BLOCK", "amount": 4}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_diamond', 'tyzdenne'::quest_kind, 'Diamantový týždeň', 'Vyťaž 8 diamantových rúd.', 70, 8,
  'break_block'::quest_tracking, array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 58, true, 6, '[{"material": "DIAMOND", "amount": 3}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'w_nether', 'tyzdenne'::quest_kind, 'Netherovský týždeň', 'Zabi 15 blaze.', 75, 15,
  'kill'::quest_tracking, array['BLAZE']::text[], 59, true, 7, '[{"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_INGOT", "amount": 12}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_explorer', 'dlhodobe'::quest_kind, 'Prieskumník sezóny', 'Polož 1000 stavebných blokov počas sezóny.', 150, 1000,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 60, true, 1, '[{"material": "DIAMOND", "amount": 4}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_miner', 'dlhodobe'::quest_kind, 'Baník sezóny', 'Vyťaž 400 železnej rudy.', 180, 400,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 61, true, 3, '[{"material": "IRON_BLOCK", "amount": 8}, {"material": "DIAMOND", "amount": 6}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_hunter', 'dlhodobe'::quest_kind, 'Lovec sezóny', 'Zabi 250 nepriateľských mobov.', 180, 250,
  'kill'::quest_tracking, array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED','BLAZE']::text[], 62, true, 4, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "GOLDEN_APPLE", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_farmer', 'dlhodobe'::quest_kind, 'Farmár sezóny', 'Pozbieraj 400 pšenice.', 140, 400,
  'break_block'::quest_tracking, array['WHEAT']::text[], 63, true, 5, '[{"material": "HAY_BLOCK", "amount": 16}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_diamond', 'dlhodobe'::quest_kind, 'Diamantová sezóna', 'Vyťaž 40 diamantových rúd.', 220, 40,
  'break_block'::quest_tracking, array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 64, true, 6, '[{"material": "DIAMOND_BLOCK", "amount": 2}, {"material": "NETHERITE_SCRAP", "amount": 1}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'l_nether', 'dlhodobe'::quest_kind, 'Pekelná sezóna', 'Zabi 80 blaze.', 240, 80,
  'kill'::quest_tracking, array['BLAZE']::text[], 65, true, 7, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 24}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_bridge', 'spolocne'::quest_kind, 'Postavte spoločne most', 'Spoločne položte 800 blokov – postavte most cez údolie.', 60, 800,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 66, true, 1, '[{"material": "EMERALD", "amount": 8}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_iron', 'spolocne'::quest_kind, 'Spoločne vyťažte železo', 'Spoločne vyťažte 500 železnej rudy.', 70, 500,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 67, true, 3, '[{"material": "IRON_BLOCK", "amount": 4}, {"material": "DIAMOND", "amount": 2}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_wood', 'spolocne'::quest_kind, 'Spoločný sklad dreva', 'Spoločne získajte 1000 klád.', 50, 1000,
  'break_block'::quest_tracking, array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 68, true, 1, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "COOKED_BEEF", "amount": 32}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_mobs', 'spolocne'::quest_kind, 'Spoločná nočná hliadka', 'Spoločne zabite 300 nepriateľských mobov.', 70, 300,
  'kill'::quest_tracking, array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 69, true, 4, '[{"material": "GOLDEN_APPLE", "amount": 4}, {"material": "ARROW", "amount": 64}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_nether', 'spolocne'::quest_kind, 'Spoločná výprava do Netheru', 'Spoločne zabite 50 blaze.', 90, 50,
  'kill'::quest_tracking, array['BLAZE']::text[], 70, true, 7, '[{"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_INGOT", "amount": 16}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 's_dragon', 'spolocne'::quest_kind, 'Triedny drak', 'Spoločne zabiť Ender Dragona.', 120, 1,
  'kill'::quest_tracking, array['ENDER_DRAGON']::text[], 71, true, 8, '[{"material": "DIAMOND_BLOCK", "amount": 1}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_wood', 'party'::quest_kind, 'Triedny les', 'Spoločne získajte 120 klád.', 30, 120,
  'break_block'::quest_tracking, array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 72, true, 1, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "COOKED_BEEF", "amount": 16}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_mine', 'party'::quest_kind, 'Banícka partia', 'Spoločne vyťažte 80 železnej rudy.', 40, 80,
  'break_block'::quest_tracking, array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 73, true, 3, '[{"material": "DIAMOND", "amount": 2}, {"material": "IRON_BLOCK", "amount": 1}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_mobs', 'party'::quest_kind, 'Nočná hliadka triedy', 'Spoločne zabite 50 nepriateľských mobov.', 40, 50,
  'kill'::quest_tracking, array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 74, true, 4, '[{"material": "GOLDEN_APPLE", "amount": 4}, {"material": "ARROW", "amount": 64}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_build', 'party'::quest_kind, 'Spoločná stavba', 'Spoločne položte 200 blokov.', 35, 200,
  'place_block'::quest_tracking, array['ANY_SOLID']::text[], 75, true, 2, '[{"material": "EMERALD", "amount": 6}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_nether', 'party'::quest_kind, 'Výprava do Netheru', 'Spoločne zabite 20 blaze.', 50, 20,
  'kill'::quest_tracking, array['BLAZE']::text[], 76, true, 7, '[{"material": "NETHERITE_SCRAP", "amount": 1}, {"material": "BLAZE_ROD", "amount": 8}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into quest_definitions (
  expedition_id, stable_key, kind, title, description, points, target_count,
  tracking_type, filter_values, sort_order, active, min_chapter, rewards,
  chapter_key, chapter_order, chapter_title, chapter_description,
  milestone_name, milestone_points, milestone_rewards
)
select e.id, 'p_dragon', 'party'::quest_kind, 'Triedny drak', 'Spoločne zabiť Ender Dragona.', 100, 1,
  'kill'::quest_tracking, array['ENDER_DRAGON']::text[], 77, true, 8, '[{"material": "DIAMOND_BLOCK", "amount": 1}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb,
  null, null, null, null,
  null, null, null
from expeditions e
where e.slug = 'cesta-prezivsich'
on conflict (expedition_id, stable_key) do update set
  kind = excluded.kind,
  title = excluded.title,
  description = excluded.description,
  points = excluded.points,
  target_count = excluded.target_count,
  tracking_type = excluded.tracking_type,
  filter_values = excluded.filter_values,
  sort_order = excluded.sort_order,
  active = excluded.active,
  min_chapter = excluded.min_chapter,
  rewards = excluded.rewards,
  chapter_key = excluded.chapter_key,
  chapter_order = excluded.chapter_order,
  chapter_title = excluded.chapter_title,
  chapter_description = excluded.chapter_description,
  milestone_name = excluded.milestone_name,
  milestone_points = excluded.milestone_points,
  milestone_rewards = excluded.milestone_rewards;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c1_wood', 'campaign'::goal_kind, 'Zberač dreva', 'Získaj 32 dubových alebo brezových klád.', 'BREAK_BLOCK', array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 32, 10,
  1, 'chapter_1', 1, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c1_table', 'campaign'::goal_kind, 'Dielňa', 'Vyrob crafting table.', 'CRAFT_ITEM', array['CRAFTING_TABLE']::text[], 1, 10,
  1, 'chapter_1', 1, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c1_pick', 'campaign'::goal_kind, 'Prvý nástroj', 'Vyrob drevený krumpáč.', 'CRAFT_ITEM', array['WOODEN_PICKAXE']::text[], 1, 10,
  1, 'chapter_1', 1, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c1_stone', 'campaign'::goal_kind, 'Kameňolom', 'Vyťaž 24 kameňa / deepslate.', 'BREAK_BLOCK', array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 24, 15,
  1, 'chapter_1', 1, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c1_food', 'campaign'::goal_kind, 'Večera', 'Upeč 8 kusov mäsa (steak, bravčové, kuracie, baranie).', 'SMELT_ITEM', array['COOKED_BEEF','COOKED_PORKCHOP','COOKED_CHICKEN','COOKED_MUTTON']::text[], 8, 15,
  1, 'chapter_1', 1, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c2_bed', 'campaign'::goal_kind, 'Posteľ', 'Vyrob posteľ.', 'CRAFT_ITEM', array['WHITE_BED','RED_BED','BLUE_BED','GREEN_BED','YELLOW_BED','BLACK_BED','ORANGE_BED','MAGENTA_BED','LIGHT_BLUE_BED','LIME_BED','PINK_BED','GRAY_BED','LIGHT_GRAY_BED','CYAN_BED','PURPLE_BED','BROWN_BED']::text[], 1, 15,
  2, 'chapter_2', 2, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c2_chest', 'campaign'::goal_kind, 'Sklad', 'Vyrob 2 truhlice.', 'CRAFT_ITEM', array['CHEST']::text[], 2, 10,
  2, 'chapter_2', 2, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c2_furnace', 'campaign'::goal_kind, 'Pec', 'Vyrob pec.', 'CRAFT_ITEM', array['FURNACE']::text[], 1, 10,
  2, 'chapter_2', 2, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c2_build', 'campaign'::goal_kind, 'Staviteľ', 'Polož 64 stavebných blokov (akýkoľvek plný blok).', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 64, 20,
  2, 'chapter_2', 2, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c2_doors', 'campaign'::goal_kind, 'Vchod', 'Vyrob dvere.', 'CRAFT_ITEM', array['OAK_DOOR','BIRCH_DOOR','SPRUCE_DOOR','DARK_OAK_DOOR','JUNGLE_DOOR','ACACIA_DOOR','MANGROVE_DOOR','CHERRY_DOOR','IRON_DOOR']::text[], 1, 10,
  2, 'chapter_2', 2, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c3_coal', 'campaign'::goal_kind, 'Uhlík', 'Vyťaž 32 uhlia.', 'BREAK_BLOCK', array['COAL_ORE','DEEPSLATE_COAL_ORE']::text[], 32, 20,
  3, 'chapter_3', 3, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c3_iron', 'campaign'::goal_kind, 'Železná žila', 'Vyťaž 24 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 24, 25,
  3, 'chapter_3', 3, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c3_smelt_iron', 'campaign'::goal_kind, 'Hutník', 'Vyrob 24 železných ingotov.', 'SMELT_ITEM', array['IRON_INGOT']::text[], 24, 20,
  3, 'chapter_3', 3, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c3_iron_pick', 'campaign'::goal_kind, 'Lepší nástroj', 'Vyrob železný krumpáč.', 'CRAFT_ITEM', array['IRON_PICKAXE']::text[], 1, 15,
  3, 'chapter_3', 3, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c3_diamond', 'campaign'::goal_kind, 'Prvý diamant', 'Vyťaž 1 diamantovú rudu.', 'BREAK_BLOCK', array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 1, 40,
  3, 'chapter_3', 3, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c4_zombie', 'campaign'::goal_kind, 'Lov zombie', 'Zabi 15 zombie.', 'KILL_ENTITY', array['ZOMBIE','ZOMBIE_VILLAGER','HUSK','DROWNED']::text[], 15, 25,
  4, 'chapter_4', 4, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c4_skeleton', 'campaign'::goal_kind, 'Lov kostlivcov', 'Zabi 10 kostlivcov.', 'KILL_ENTITY', array['SKELETON','STRAY','BOGGED']::text[], 10, 25,
  4, 'chapter_4', 4, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c4_creeper', 'campaign'::goal_kind, 'Pozor, creeper!', 'Zabi 5 creeperov.', 'KILL_ENTITY', array['CREEPER']::text[], 5, 30,
  4, 'chapter_4', 4, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c4_bow', 'campaign'::goal_kind, 'Strelec', 'Vyrob luk.', 'CRAFT_ITEM', array['BOW']::text[], 1, 15,
  4, 'chapter_4', 4, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c4_shield', 'campaign'::goal_kind, 'Štít', 'Vyrob štít.', 'CRAFT_ITEM', array['SHIELD']::text[], 1, 15,
  4, 'chapter_4', 4, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c5_wheat', 'campaign'::goal_kind, 'Obilie', 'Pozbieraj 32 pšenice.', 'BREAK_BLOCK', array['WHEAT']::text[], 32, 20,
  5, 'chapter_5', 5, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c5_bread', 'campaign'::goal_kind, 'Pekár', 'Vyrob 16 chlebov.', 'CRAFT_ITEM', array['BREAD']::text[], 16, 20,
  5, 'chapter_5', 5, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c5_animals', 'campaign'::goal_kind, 'Pastier', 'Zabi 10 zvierat na mäso (krava, ošípaná, ovca, kura).', 'KILL_ENTITY', array['COW','PIG','SHEEP','CHICKEN']::text[], 10, 15,
  5, 'chapter_5', 5, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c5_wool', 'campaign'::goal_kind, 'Vlna', 'Získaj 16 vlny (položením/ťažbou vlnených blokov alebo craftom nie – break white wool from sheep drops via pickup).', 'PICKUP_ITEM', array['WHITE_WOOL','ORANGE_WOOL','MAGENTA_WOOL','LIGHT_BLUE_WOOL','YELLOW_WOOL','LIME_WOOL','PINK_WOOL','GRAY_WOOL','LIGHT_GRAY_WOOL','CYAN_WOOL','PURPLE_WOOL','BLUE_WOOL','BROWN_WOOL','GREEN_WOOL','RED_WOOL','BLACK_WOOL']::text[], 16, 15,
  5, 'chapter_5', 5, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c5_carrot', 'campaign'::goal_kind, 'Zelenina', 'Pozbieraj 16 mrkiev alebo zemiakov.', 'BREAK_BLOCK', array['CARROTS','POTATOES']::text[], 16, 15,
  5, 'chapter_5', 5, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c6_helmet', 'campaign'::goal_kind, 'Prilba', 'Vyrob železnú prilbu.', 'CRAFT_ITEM', array['IRON_HELMET']::text[], 1, 20,
  6, 'chapter_6', 6, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c6_chest', 'campaign'::goal_kind, 'Hrudák', 'Vyrob železný hrudák.', 'CRAFT_ITEM', array['IRON_CHESTPLATE']::text[], 1, 25,
  6, 'chapter_6', 6, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c6_legs', 'campaign'::goal_kind, 'Nohavice', 'Vyrob železné nohavice.', 'CRAFT_ITEM', array['IRON_LEGGINGS']::text[], 1, 25,
  6, 'chapter_6', 6, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c6_boots', 'campaign'::goal_kind, 'Topánky', 'Vyrob železné topánky.', 'CRAFT_ITEM', array['IRON_BOOTS']::text[], 1, 20,
  6, 'chapter_6', 6, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c6_diamond_pick', 'campaign'::goal_kind, 'Diamantový nástroj', 'Vyrob diamantový krumpáč.', 'CRAFT_ITEM', array['DIAMOND_PICKAXE']::text[], 1, 40,
  6, 'chapter_6', 6, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c7_enter', 'campaign'::goal_kind, 'Portál', 'Vstúp do Netheru.', 'ENTER_WORLD', array['NETHER']::text[], 1, 40,
  7, 'chapter_7', 7, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c7_quartz', 'campaign'::goal_kind, 'Kremeň', 'Vyťaž 24 nether quartz.', 'BREAK_BLOCK', array['NETHER_QUARTZ_ORE']::text[], 24, 30,
  7, 'chapter_7', 7, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c7_gold', 'campaign'::goal_kind, 'Nether gold', 'Vyťaž 16 nether gold ore.', 'BREAK_BLOCK', array['NETHER_GOLD_ORE']::text[], 16, 30,
  7, 'chapter_7', 7, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c7_blaze', 'campaign'::goal_kind, 'Blaze', 'Zabi 8 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 8, 40,
  7, 'chapter_7', 7, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c7_debris', 'campaign'::goal_kind, 'Ancient Debris', 'Vyťaž 1 ancient debris.', 'BREAK_BLOCK', array['ANCIENT_DEBRIS']::text[], 1, 60,
  7, 'chapter_7', 7, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c8_eyes', 'campaign'::goal_kind, 'Oči Endera', 'Vyrob 12 očí Endera.', 'CRAFT_ITEM', array['ENDER_EYE']::text[], 12, 50,
  8, 'chapter_8', 8, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c8_end', 'campaign'::goal_kind, 'Koniec sveta', 'Vstúp do Endu.', 'ENTER_WORLD', array['THE_END']::text[], 1, 60,
  8, 'chapter_8', 8, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c8_dragon', 'campaign'::goal_kind, 'Drak', 'Zabi Ender Dragona (spoločne).', 'KILL_ENTITY', array['ENDER_DRAGON']::text[], 1, 200,
  8, 'chapter_8', 8, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c8_elytra', 'campaign'::goal_kind, 'Elytra', 'Získaj elytru.', 'PICKUP_ITEM', array['ELYTRA']::text[], 1, 80,
  8, 'chapter_8', 8, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'c8_shulker', 'campaign'::goal_kind, 'Shulker shell', 'Získaj 4 shulker shelle.', 'PICKUP_ITEM', array['SHULKER_SHELL']::text[], 4, 60,
  8, 'chapter_8', 8, '[]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_wood', 'daily'::goal_kind, 'Ráno v lese', 'Získaj 24 klád.', 'BREAK_BLOCK', array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 24, 8,
  1, null, null, '[{"material": "APPLE", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_stone', 'daily'::goal_kind, 'Kamenár', 'Vyťaž 48 kameňa.', 'BREAK_BLOCK', array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 48, 8,
  1, null, null, '[{"material": "COAL", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_cook', 'daily'::goal_kind, 'Kuchár dňa', 'Upeč 12 jedál.', 'SMELT_ITEM', array['COOKED_BEEF','COOKED_PORKCHOP','COOKED_CHICKEN','COOKED_MUTTON','BAKED_POTATO','COOKED_SALMON','COOKED_COD']::text[], 12, 8,
  1, null, null, '[{"material": "BREAD", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_build', 'daily'::goal_kind, 'Stavba dňa', 'Polož 48 blokov.', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 48, 8,
  2, null, null, '[{"material": "IRON_NUGGET", "amount": 18}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_coal', 'daily'::goal_kind, 'Uhlíková smena', 'Vyťaž 20 uhlia.', 'BREAK_BLOCK', array['COAL_ORE','DEEPSLATE_COAL_ORE']::text[], 20, 10,
  3, null, null, '[{"material": "TORCH", "amount": 24}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_iron', 'daily'::goal_kind, 'Železná smena', 'Vyťaž 12 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 12, 12,
  3, null, null, '[{"material": "IRON_INGOT", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_zombie', 'daily'::goal_kind, 'Nočná hliadka', 'Zabi 10 zombie.', 'KILL_ENTITY', array['ZOMBIE','HUSK','DROWNED','ZOMBIE_VILLAGER']::text[], 10, 12,
  4, null, null, '[{"material": "IRON_INGOT", "amount": 3}, {"material": "ARROW", "amount": 16}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_skeleton', 'daily'::goal_kind, 'Lukostrelec', 'Zabi 8 kostlivcov.', 'KILL_ENTITY', array['SKELETON','STRAY','BOGGED']::text[], 8, 12,
  4, null, null, '[{"material": "BONE", "amount": 8}, {"material": "EXPERIENCE_BOTTLE", "amount": 2}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_wheat', 'daily'::goal_kind, 'Žatva', 'Pozbieraj 24 pšenice.', 'BREAK_BLOCK', array['WHEAT']::text[], 24, 10,
  5, null, null, '[{"material": "BREAD", "amount": 12}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_diamond', 'daily'::goal_kind, 'Diamantový deň', 'Vyťaž 2 diamantové rudy.', 'BREAK_BLOCK', array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 2, 20,
  6, null, null, '[{"material": "DIAMOND", "amount": 1}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_nether_walk', 'daily'::goal_kind, 'Pekelná prechádzka', 'Vstúp dnes do Netheru.', 'ENTER_WORLD', array['NETHER']::text[], 1, 15,
  7, null, null, '[{"material": "GOLD_INGOT", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'd_blaze', 'daily'::goal_kind, 'Blaze hunt', 'Zabi 4 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 4, 18,
  7, null, null, '[{"material": "BLAZE_POWDER", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_wood', 'weekly'::goal_kind, 'Týždeň drevorubača', 'Získaj 200 klád počas týždňa.', 'BREAK_BLOCK', array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 200, 40,
  1, null, null, '[{"material": "IRON_INGOT", "amount": 12}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_stone', 'weekly'::goal_kind, 'Kameňolom týždňa', 'Vyťaž 300 kameňa.', 'BREAK_BLOCK', array['STONE','COBBLESTONE','DEEPSLATE','COBBLED_DEEPSLATE']::text[], 300, 40,
  1, null, null, '[{"material": "COAL", "amount": 32}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_build', 'weekly'::goal_kind, 'Staviteľský týždeň', 'Polož 250 blokov.', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 250, 45,
  2, null, null, '[{"material": "EMERALD", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_iron', 'weekly'::goal_kind, 'Železný týždeň', 'Vyťaž 64 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 64, 55,
  3, null, null, '[{"material": "IRON_BLOCK", "amount": 2}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_mobs', 'weekly'::goal_kind, 'Hliadka týždňa', 'Zabi 60 nepriateľských mobov.', 'KILL_ENTITY', array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 60, 55,
  4, null, null, '[{"material": "GOLDEN_APPLE", "amount": 2}, {"material": "ARROW", "amount": 32}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_farm', 'weekly'::goal_kind, 'Žatva týždňa', 'Pozbieraj 80 pšenice.', 'BREAK_BLOCK', array['WHEAT']::text[], 80, 45,
  5, null, null, '[{"material": "BREAD", "amount": 24}, {"material": "HAY_BLOCK", "amount": 4}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_diamond', 'weekly'::goal_kind, 'Diamantový týždeň', 'Vyťaž 8 diamantových rúd.', 'BREAK_BLOCK', array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 8, 70,
  6, null, null, '[{"material": "DIAMOND", "amount": 3}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'w_nether', 'weekly'::goal_kind, 'Netherovský týždeň', 'Zabi 15 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 15, 75,
  7, null, null, '[{"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_INGOT", "amount": 12}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_explorer', 'long_term'::goal_kind, 'Prieskumník sezóny', 'Polož 1000 stavebných blokov počas sezóny.', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 1000, 150,
  1, null, null, '[{"material": "DIAMOND", "amount": 4}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_miner', 'long_term'::goal_kind, 'Baník sezóny', 'Vyťaž 400 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 400, 180,
  3, null, null, '[{"material": "IRON_BLOCK", "amount": 8}, {"material": "DIAMOND", "amount": 6}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_hunter', 'long_term'::goal_kind, 'Lovec sezóny', 'Zabi 250 nepriateľských mobov.', 'KILL_ENTITY', array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED','BLAZE']::text[], 250, 180,
  4, null, null, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "GOLDEN_APPLE", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_farmer', 'long_term'::goal_kind, 'Farmár sezóny', 'Pozbieraj 400 pšenice.', 'BREAK_BLOCK', array['WHEAT']::text[], 400, 140,
  5, null, null, '[{"material": "HAY_BLOCK", "amount": 16}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_diamond', 'long_term'::goal_kind, 'Diamantová sezóna', 'Vyťaž 40 diamantových rúd.', 'BREAK_BLOCK', array['DIAMOND_ORE','DEEPSLATE_DIAMOND_ORE']::text[], 40, 220,
  6, null, null, '[{"material": "DIAMOND_BLOCK", "amount": 2}, {"material": "NETHERITE_SCRAP", "amount": 1}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'l_nether', 'long_term'::goal_kind, 'Pekelná sezóna', 'Zabi 80 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 80, 240,
  7, null, null, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 24}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_bridge', 'shared'::goal_kind, 'Postavte spoločne most', 'Spoločne položte 800 blokov – postavte most cez údolie.', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 800, 60,
  1, null, null, '[{"material": "EMERALD", "amount": 8}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_iron', 'shared'::goal_kind, 'Spoločne vyťažte železo', 'Spoločne vyťažte 500 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 500, 70,
  3, null, null, '[{"material": "IRON_BLOCK", "amount": 4}, {"material": "DIAMOND", "amount": 2}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_wood', 'shared'::goal_kind, 'Spoločný sklad dreva', 'Spoločne získajte 1000 klád.', 'BREAK_BLOCK', array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 1000, 50,
  1, null, null, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "COOKED_BEEF", "amount": 32}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_mobs', 'shared'::goal_kind, 'Spoločná nočná hliadka', 'Spoločne zabite 300 nepriateľských mobov.', 'KILL_ENTITY', array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 300, 70,
  4, null, null, '[{"material": "GOLDEN_APPLE", "amount": 4}, {"material": "ARROW", "amount": 64}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_nether', 'shared'::goal_kind, 'Spoločná výprava do Netheru', 'Spoločne zabite 50 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 50, 90,
  7, null, null, '[{"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_INGOT", "amount": 16}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  's_dragon', 'shared'::goal_kind, 'Triedny drak', 'Spoločne zabiť Ender Dragona.', 'KILL_ENTITY', array['ENDER_DRAGON']::text[], 1, 120,
  8, null, null, '[{"material": "DIAMOND_BLOCK", "amount": 1}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_wood', 'party'::goal_kind, 'Triedny les', 'Spoločne získajte 120 klád.', 'BREAK_BLOCK', array['OAK_LOG','BIRCH_LOG','SPRUCE_LOG','DARK_OAK_LOG','JUNGLE_LOG','ACACIA_LOG','MANGROVE_LOG','CHERRY_LOG']::text[], 120, 30,
  1, null, null, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "COOKED_BEEF", "amount": 16}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_mine', 'party'::goal_kind, 'Banícka partia', 'Spoločne vyťažte 80 železnej rudy.', 'BREAK_BLOCK', array['IRON_ORE','DEEPSLATE_IRON_ORE']::text[], 80, 40,
  3, null, null, '[{"material": "DIAMOND", "amount": 2}, {"material": "IRON_BLOCK", "amount": 1}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_mobs', 'party'::goal_kind, 'Nočná hliadka triedy', 'Spoločne zabite 50 nepriateľských mobov.', 'KILL_ENTITY', array['ZOMBIE','SKELETON','CREEPER','SPIDER','ENDERMAN','WITCH','HUSK','STRAY','DROWNED']::text[], 50, 40,
  4, null, null, '[{"material": "GOLDEN_APPLE", "amount": 4}, {"material": "ARROW", "amount": 64}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_build', 'party'::goal_kind, 'Spoločná stavba', 'Spoločne položte 200 blokov.', 'PLACE_BLOCK', array['ANY_SOLID']::text[], 200, 35,
  2, null, null, '[{"material": "EMERALD", "amount": 6}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_nether', 'party'::goal_kind, 'Výprava do Netheru', 'Spoločne zabite 20 blaze.', 'KILL_ENTITY', array['BLAZE']::text[], 20, 50,
  7, null, null, '[{"material": "NETHERITE_SCRAP", "amount": 1}, {"material": "BLAZE_ROD", "amount": 8}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into goals (
  id, kind, name, description, objective_type, targets, amount, points,
  min_chapter, chapter_id, chapter_order, rewards, active
) values (
  'p_dragon', 'party'::goal_kind, 'Triedny drak', 'Spoločne zabiť Ender Dragona.', 'KILL_ENTITY', array['ENDER_DRAGON']::text[], 1, 100,
  8, null, null, '[{"material": "DIAMOND_BLOCK", "amount": 1}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb, true
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  objective_type = excluded.objective_type,
  targets = excluded.targets,
  amount = excluded.amount,
  points = excluded.points,
  min_chapter = excluded.min_chapter,
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  rewards = excluded.rewards,
  active = true;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_1', 'chapter_1', 1, 'Základy', 'Prvý tábor', 'Prvý deň v divočine. Drevo, kameň, jedlo.', 50, '[{"material": "IRON_INGOT", "amount": 8}, {"material": "BREAD", "amount": 16}, {"material": "TORCH", "amount": 32}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_2', 'chapter_2', 2, 'Domov', 'Vlastný dom', 'Postav si bezpečné zázemie.', 75, '[{"material": "IRON_INGOT", "amount": 16}, {"material": "GOLDEN_APPLE", "amount": 2}, {"material": "EXPERIENCE_BOTTLE", "amount": 8}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_3', 'chapter_3', 3, 'Baník', 'Hlbiny', 'Zostúp do jaskýň a prinies ore.', 100, '[{"material": "DIAMOND", "amount": 3}, {"material": "IRON_BLOCK", "amount": 2}, {"material": "GOLDEN_APPLE", "amount": 4}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_4', 'chapter_4', 4, 'Lovec', 'Nočný lovec', 'Nauč sa brániť v noci.', 100, '[{"material": "ENCHANTED_GOLDEN_APPLE", "amount": 1}, {"material": "ARROW", "amount": 64}, {"material": "DIAMOND", "amount": 2}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_5', 'chapter_5', 5, 'Farmár', 'Hospodárstvo', 'Jedlo a zvieratá = dlhodobé prežitie.', 100, '[{"material": "EMERALD", "amount": 8}, {"material": "BONE_MEAL", "amount": 32}, {"material": "GOLDEN_CARROT", "amount": 16}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_6', 'chapter_6', 6, 'Remeselník', 'Majster remesla', 'Plná výbava zo železa a viac.', 125, '[{"material": "DIAMOND", "amount": 5}, {"material": "ANVIL", "amount": 1}, {"material": "EXPERIENCE_BOTTLE", "amount": 16}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_7', 'chapter_7', 7, 'Nether', 'Pekelník', 'Vstup do pekelného rozmeru.', 150, '[{"material": "NETHERITE_SCRAP", "amount": 2}, {"material": "BLAZE_ROD", "amount": 8}, {"material": "GOLD_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 2}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

insert into milestones (
  id, chapter_id, chapter_order, chapter_name, name, description, points, rewards
) values (
  'ms_8', 'chapter_8', 8, 'Legenda triedy', 'Legenda servera', 'Finálna skúška prežitia – End a sláva.', 300, '[{"material": "NETHERITE_INGOT", "amount": 4}, {"material": "BEACON", "amount": 1}, {"material": "DIAMOND_BLOCK", "amount": 4}, {"material": "ENCHANTED_GOLDEN_APPLE", "amount": 4}]'::jsonb
)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  chapter_order = excluded.chapter_order,
  chapter_name = excluded.chapter_name,
  name = excluded.name,
  description = excluded.description,
  points = excluded.points,
  rewards = excluded.rewards;

