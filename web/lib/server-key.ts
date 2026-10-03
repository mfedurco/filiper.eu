import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";

let columnReady: Promise<void> | null = null;

export function ensureServerKeyColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = dbQuery("select key_hash from servers limit 0")
      .then(() => undefined)
      .catch((error: unknown) => {
        columnReady = null;
        throw error;
      });
  }
  return columnReady;
}

export function hashServerKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function generateServerKey(): string {
  return randomBytes(32).toString("base64url");
}

export function bearerKey(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const key = match[1].trim();
  if (!key || key.length > 256) return null;
  return key;
}

/**
 * True only when sha256(rawKey) equals servers.key_hash on this exact row.
 * A key minted for another server id does not pass.
 */
export async function serverKeyMatches(serverId: string, rawKey: string): Promise<boolean> {
  const computed = createHash("sha256").update(rawKey, "utf8").digest();
  const rows = await dbQuery<{ key_hash: string | null }>(
    "select key_hash from servers where id = $1",
    [serverId],
  );
  const storedHex = rows[0]?.key_hash ?? "";
  const stored =
    /^[0-9a-f]{64}$/i.test(storedHex) ? Buffer.from(storedHex, "hex") : Buffer.alloc(32);
  const equal = timingSafeEqual(computed, stored);
  return equal && rows.length === 1 && storedHex.length > 0;
}
