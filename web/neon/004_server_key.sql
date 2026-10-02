-- One key per Minecraft server. Only the sha256 hex of the raw key is stored.
-- Existing rows stay; a null hash means the portal rejects plugin calls until an admin generates a key.

alter table servers add column if not exists key_hash text;
