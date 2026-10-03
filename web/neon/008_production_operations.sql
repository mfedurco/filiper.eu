-- Shared abuse controls, plugin liveness, and privacy-request workflow.
-- Apply manually after 007_security_hardening.sql. The application never runs migrations.

create table if not exists security_rate_limits (
  scope text not null,
  key_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (scope, key_hash, bucket_start),
  constraint security_rate_limits_scope check (scope ~ '^[a-z][a-z0-9_-]{0,39}$'),
  constraint security_rate_limits_key_hash check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint security_rate_limits_count check (request_count between 1 and 100000)
);

create index if not exists security_rate_limits_expiry
  on security_rate_limits (expires_at);

create table if not exists portal_sync_state (
  server_id text primary key references servers(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_push_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists portal_sync_state_last_seen
  on portal_sync_state (last_seen_at);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null references portal_accounts(google_sub) on delete cascade,
  request_type text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint privacy_requests_type check (request_type in ('export', 'unlink', 'delete')),
  constraint privacy_requests_status check (status in ('pending', 'completed', 'rejected'))
);

create unique index if not exists privacy_requests_one_pending
  on privacy_requests (google_sub, request_type)
  where status = 'pending';

create index if not exists privacy_requests_retention
  on privacy_requests (resolved_at)
  where resolved_at is not null;
