-- Each expedition belongs to one server. Quest definitions, progress, contributions,
-- shared goals, parties, and leaderboard rows under that expedition belong to the same server.
-- Copies of an expedition on other servers are separate rows.
-- The servers table is the list a later license check can count. Nothing here enforces a limit.
-- Existing expedition and quest rows are kept. Demo progress that is not the db-test leftover
-- is stamped server id "legacy" so it is not mixed into a real server.

create table if not exists servers (
  id text primary key,
  label text not null,
  first_seen_at timestamptz not null default now(),
  constraint servers_id_not_blank check (length(btrim(id)) > 0)
);

insert into servers (id, label, first_seen_at) values
  ('test', 'test', now()),
  ('legacy', 'legacy', now())
on conflict (id) do nothing;

alter table expeditions add column if not exists server_id text;

update expeditions
set server_id = 'test'
where id = '22222222-2222-2222-2222-222222222201'
  and server_id is null;

update expeditions
set server_id = 'legacy'
where server_id is null;

insert into servers (id, label, first_seen_at)
select distinct server_id, server_id, now()
from expeditions
where server_id is not null
on conflict (id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'expeditions'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attnum)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['slug']::text[]
  loop
    execute format('alter table expeditions drop constraint %I', r.conname);
  end loop;
end $$;

with ranked as (
  select id,
         row_number() over (
           partition by server_id
           order by (id = '22222222-2222-2222-2222-222222222201') desc,
                    starts_at desc nulls last,
                    created_at desc
         ) as n
  from expeditions
  where status = 'active'
    and server_id is not null
)
update expeditions e
set status = 'ended'
from ranked r
where e.id = r.id
  and r.n > 1;

alter table expeditions alter column server_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expeditions_server_id_fkey'
  ) then
    alter table expeditions
      add constraint expeditions_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
end $$;

drop index if exists expeditions_one_active;

create unique index if not exists expeditions_server_slug
  on expeditions (server_id, slug);

create unique index if not exists expeditions_one_active_per_server
  on expeditions (server_id)
  where status = 'active';

create index if not exists idx_expeditions_server_status
  on expeditions (server_id, status);

alter table quest_definitions add column if not exists server_id text;

update quest_definitions q
set server_id = e.server_id
from expeditions e
where q.expedition_id = e.id
  and q.server_id is null;

alter table quest_definitions alter column server_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quest_definitions_server_id_fkey'
  ) then
    alter table quest_definitions
      add constraint quest_definitions_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
end $$;

create index if not exists idx_quest_definitions_server
  on quest_definitions (server_id, expedition_id, sort_order);

create or replace function quest_definitions_inherit_server()
returns trigger
language plpgsql
as $$
declare
  parent text;
begin
  select server_id into parent from expeditions where id = new.expedition_id;
  if parent is null then
    raise exception 'expedition % has no server', new.expedition_id;
  end if;
  new.server_id := parent;
  return new;
end;
$$;

drop trigger if exists quest_definitions_inherit_server on quest_definitions;
create trigger quest_definitions_inherit_server
  before insert or update of expedition_id, server_id
  on quest_definitions
  for each row
  execute function quest_definitions_inherit_server();

alter table players add column if not exists server_id text;

update players
set server_id = 'test'
where server_id is null
  and (
    mc_uuid = '00000000-0000-0000-0000-0000000000db'
    or name = 'db-test'
  );

update players
set server_id = 'legacy'
where server_id is null;

alter table players alter column server_id set not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'players'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attnum)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['mc_uuid']::text[]
  loop
    execute format('alter table players drop constraint %I', r.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_server_id_fkey'
  ) then
    alter table players
      add constraint players_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
end $$;

create unique index if not exists players_server_mc_uuid
  on players (server_id, mc_uuid);

alter table player_progress add column if not exists server_id text;
alter table contributions add column if not exists server_id text;
alter table shared_goal_state add column if not exists server_id text;
alter table leaderboard_snapshot add column if not exists server_id text;

update player_progress pp
set server_id = p.server_id
from players p
where pp.player_id = p.id
  and pp.server_id is null;

update contributions c
set server_id = p.server_id
from players p
where c.player_id = p.id
  and c.server_id is null;

update leaderboard_snapshot lb
set server_id = p.server_id
from players p
where lb.player_id = p.id
  and lb.server_id is null;

update shared_goal_state s
set server_id = 'test'
where s.server_id is null
  and exists (
    select 1
    from contributions c
    join players p on p.id = c.player_id
    where c.goal_id = s.goal_id
      and p.server_id = 'test'
      and (s.expedition_id is null or c.expedition_id is not distinct from s.expedition_id)
  )
  and not exists (
    select 1
    from contributions c
    join players p on p.id = c.player_id
    where c.goal_id = s.goal_id
      and p.server_id is distinct from 'test'
      and (s.expedition_id is null or c.expedition_id is not distinct from s.expedition_id)
  );

update player_progress set server_id = 'legacy' where server_id is null;
update contributions set server_id = 'legacy' where server_id is null;
update shared_goal_state set server_id = 'legacy' where server_id is null;
update leaderboard_snapshot set server_id = 'legacy' where server_id is null;

alter table player_progress alter column server_id set not null;
alter table contributions alter column server_id set not null;
alter table shared_goal_state alter column server_id set not null;
alter table leaderboard_snapshot alter column server_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_progress_server_id_fkey') then
    alter table player_progress
      add constraint player_progress_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contributions_server_id_fkey') then
    alter table contributions
      add constraint contributions_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shared_goal_state_server_id_fkey') then
    alter table shared_goal_state
      add constraint shared_goal_state_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leaderboard_snapshot_server_id_fkey') then
    alter table leaderboard_snapshot
      add constraint leaderboard_snapshot_server_id_fkey
      foreign key (server_id) references servers(id);
  end if;
end $$;

drop index if exists player_progress_expedition_goal;
drop index if exists contributions_expedition_goal;
drop index if exists shared_goal_state_expedition_goal;
drop index if exists leaderboard_snapshot_expedition_player;

create unique index if not exists player_progress_server_expedition_goal
  on player_progress (server_id, expedition_id, player_id, goal_id)
  where expedition_id is not null;

create unique index if not exists contributions_server_expedition_goal
  on contributions (server_id, expedition_id, goal_id, player_id)
  where expedition_id is not null;

create unique index if not exists shared_goal_state_server_expedition_goal
  on shared_goal_state (server_id, expedition_id, goal_id)
  where expedition_id is not null;

create unique index if not exists leaderboard_snapshot_server_expedition_player
  on leaderboard_snapshot (server_id, expedition_id, player_id)
  where expedition_id is not null;

create index if not exists idx_player_progress_server
  on player_progress (server_id, expedition_id);
create index if not exists idx_contributions_server
  on contributions (server_id, expedition_id);
create index if not exists idx_shared_goal_state_server
  on shared_goal_state (server_id, expedition_id);
create index if not exists idx_leaderboard_server
  on leaderboard_snapshot (server_id, expedition_id, total_points desc);

create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  server_id text not null references servers(id),
  expedition_id uuid references expeditions(id) on delete cascade,
  party_key text not null,
  name text not null default '',
  leader_mc_uuid text,
  quest_key text,
  quest_progress int not null default 0,
  quest_completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists parties_server_expedition_key
  on parties (server_id, expedition_id, party_key)
  where expedition_id is not null;

create index if not exists idx_parties_server
  on parties (server_id, expedition_id);

drop function if exists apply_expedition_schedule(timestamptz);
drop function if exists end_active_expedition();

create or replace function apply_expedition_schedule(as_of timestamptz, p_server text)
returns table (changed boolean, active_id uuid, active_slug text, ended_slug text)
language plpgsql
as $$
declare
  winner uuid;
  did boolean := false;
  ended_list text := '';
  rec record;
begin
  if p_server is null or btrim(p_server) = '' then
    raise exception 'server id is required';
  end if;
  perform pg_advisory_xact_lock(48271001, hashtext(p_server));

  select e.id into winner
  from expeditions e
  where e.server_id = p_server
    and e.status in ('draft', 'active')
    and e.starts_at is not null
    and e.starts_at <= as_of
    and (e.ends_at is null or e.ends_at > as_of)
  order by e.starts_at desc, e.created_at desc
  limit 1;

  if winner is not null then
    for rec in
      select id, slug from expeditions
      where server_id = p_server and status = 'active' and id <> winner
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
      where server_id = p_server
        and status = 'active'
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
  where e.server_id = p_server and e.status = 'active'
  limit 1;

  changed := did;
  ended_slug := nullif(ended_list, '');
  return next;
end;
$$;

create or replace function end_active_expedition(p_server text)
returns void
language plpgsql
as $$
begin
  if p_server is null or btrim(p_server) = '' then
    raise exception 'server id is required';
  end if;
  perform pg_advisory_xact_lock(48271001, hashtext(p_server));
  update expeditions set status = 'ended' where status = 'active' and server_id = p_server;
end;
$$;

create or replace function activate_expedition(target uuid)
returns void
language plpgsql
as $$
declare
  srv text;
begin
  select server_id into srv from expeditions where id = target and status = 'draft';
  if srv is null then
    raise exception 'expedition % is not a draft', target;
  end if;
  perform pg_advisory_xact_lock(48271001, hashtext(srv));
  update expeditions set status = 'ended' where status = 'active' and server_id = srv and id <> target;
  update expeditions set status = 'active' where id = target;
end;
$$;

alter table servers enable row level security;
alter table parties enable row level security;

drop policy if exists "Public read servers" on servers;
create policy "Public read servers" on servers for select using (true);

drop policy if exists "Public read parties" on parties;
create policy "Public read parties" on parties for select using (true);
