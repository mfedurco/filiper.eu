-- Security constraints and lookup indexes for portal identities and server credentials.
-- Apply after 004_server_key.sql, 005_player_profile.sql, and 006_portal_accounts.sql.

create unique index if not exists players_live_claim_code
  on players (claim_code_hash)
  where claim_code_hash is not null;

create index if not exists players_google_sub
  on players (google_sub)
  where google_sub is not null;

create index if not exists players_claim_expiry
  on players (claim_expires_at)
  where claim_expires_at is not null;

create index if not exists portal_accounts_role_scope
  on portal_accounts (role, all_servers);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'servers_key_hash_format'
  ) then
    alter table servers
      add constraint servers_key_hash_format
      check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portal_accounts_player_scope'
  ) then
    alter table portal_accounts
      add constraint portal_accounts_player_scope
      check (
        role = 'spravca'
        or (all_servers = false and cardinality(server_ids) = 0)
      );
  end if;
end $$;
