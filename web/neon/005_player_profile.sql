-- Nickname history and a Google claim live on the same player row as the UUID.
-- name_note is older nicknames only. about is the short text the linked person writes.
-- claim_code_hash is sha256 of a one-time in-game code. Existing rows stay.

alter table players add column if not exists name_note text not null default '';
alter table players add column if not exists about text not null default '';
alter table players add column if not exists google_sub text;
alter table players add column if not exists claim_code_hash text;
alter table players add column if not exists claim_expires_at timestamptz;
