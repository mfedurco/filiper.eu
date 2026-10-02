import { createHash, timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import { mergeNameNote, previousNames } from "@/lib/name-note";
import { isServerId } from "@/lib/portal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ready: Promise<void> | null = null;

export function ensurePlayerProfileColumns(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const statements = [
        "alter table players add column if not exists name_note text not null default ''",
        "alter table players add column if not exists about text not null default ''",
        "alter table players add column if not exists google_sub text",
        "alter table players add column if not exists claim_code_hash text",
        "alter table players add column if not exists claim_expires_at timestamptz",
      ];
      for (const statement of statements) {
        await dbQuery(statement);
      }
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export type PublicProfile = {
  serverId: string;
  uuid: string;
  name: string;
  previous: string[];
  points: number;
  weeklyPoints: number;
  about: string;
  googleSub: string | null;
};

export function isPlayerUuid(value: string): boolean {
  return UUID.test(value);
}

export function hashClaimCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

export async function loadPublicProfile(serverId: string, uuid: string): Promise<PublicProfile | null> {
  if (!isServerId(serverId) || !isPlayerUuid(uuid)) return null;
  await ensurePlayerProfileColumns();
  const rows = await dbQuery<{
    name: string;
    name_note: string | null;
    about: string | null;
    total_points: number;
    weekly_points: number;
    google_sub: string | null;
  }>(
    `select name, name_note, about, total_points, weekly_points, google_sub
     from players
     where server_id = $1 and mc_uuid = $2`,
    [serverId, uuid],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    serverId,
    uuid,
    name: row.name,
    previous: previousNames(row.name_note, row.name),
    points: row.total_points,
    weeklyPoints: row.weekly_points,
    about: row.about ?? "",
    googleSub: row.google_sub,
  };
}

export async function issueClaimCode(serverId: string, uuid: string, name: string, code: string): Promise<void> {
  if (!isServerId(serverId) || !isPlayerUuid(uuid)) throw new Error("payload");
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(normalized)) throw new Error("payload");
  await ensurePlayerProfileColumns();
  const existing = await dbQuery<{ name: string; name_note: string | null }>(
    "select name, name_note from players where server_id = $1 and mc_uuid = $2",
    [serverId, uuid],
  );
  const prior = existing[0];
  const nextName = name.trim().slice(0, 16) || "Unknown";
  const note = mergeNameNote(prior?.name_note, "", prior?.name, nextName);
  await dbQuery(
    `insert into players (
       mc_uuid, name, server_id, name_note, claim_code_hash, claim_expires_at, updated_at
     ) values ($1, $2, $3, $4, $5, now() + interval '15 minutes', now())
     on conflict (server_id, mc_uuid) do update set
       name = excluded.name,
       name_note = excluded.name_note,
       claim_code_hash = excluded.claim_code_hash,
       claim_expires_at = excluded.claim_expires_at,
       updated_at = now()`,
    [uuid, nextName, serverId, note, hashClaimCode(normalized)],
  );
}

export async function claimProfile(googleSub: string, code: string): Promise<{ serverId: string; uuid: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!googleSub || !/^[A-Z2-9]{8}$/.test(normalized)) return null;
  await ensurePlayerProfileColumns();
  const hash = hashClaimCode(normalized);
  const rows = await dbQuery<{ server_id: string; mc_uuid: string; claim_code_hash: string }>(
    `select server_id, mc_uuid, claim_code_hash
     from players
     where claim_code_hash = $1 and claim_expires_at > now()`,
    [hash],
  );
  const row = rows[0];
  if (!row || !sameHash(row.claim_code_hash, hash)) return null;
  await dbQuery(
    `update players
     set google_sub = $3, claim_code_hash = null, claim_expires_at = null, updated_at = now()
     where server_id = $1 and mc_uuid = $2 and claim_code_hash = $4`,
    [row.server_id, row.mc_uuid, googleSub, hash],
  );
  return { serverId: row.server_id, uuid: row.mc_uuid };
}

export async function saveProfileAbout(googleSub: string, serverId: string, uuid: string, about: string): Promise<boolean> {
  if (!googleSub || !isServerId(serverId) || !isPlayerUuid(uuid)) return false;
  await ensurePlayerProfileColumns();
  const text = about.replace(/\s+/g, " ").trim().slice(0, 280);
  const rows = await dbQuery<{ id: string }>(
    `update players
     set about = $4, updated_at = now()
     where server_id = $1 and mc_uuid = $2 and google_sub = $3
     returning id::text as id`,
    [serverId, uuid, googleSub, text],
  );
  return rows.length === 1;
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
