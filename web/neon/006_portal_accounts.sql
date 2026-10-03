-- Google accounts for the portal. A hráč has no server scope.
-- A správca either covers every server (all_servers) or the ids in server_ids.
-- Existing player rows gain a remembered in-game language. Null means not chosen yet.

alter table players add column if not exists language text;

create table if not exists portal_accounts (
  google_sub text primary key,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'hrac',
  all_servers boolean not null default false,
  server_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_accounts_role check (role in ('hrac', 'spravca'))
);
