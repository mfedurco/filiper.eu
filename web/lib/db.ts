import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type Sql = NeonQueryFunction<false, false>;

/**
 * True when a Neon pooled connection string is configured.
 * Pages and `next build` must keep working when this is false.
 */
export function hasDatabaseEnv(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let cachedUrl: string | null = null;
let cachedSql: Sql | null = null;

/**
 * Server-only HTTP client. Returns null when DATABASE_URL is unset so
 * callers can fall back to demo JSON. Do not import this from client
 * components — the connection string is a secret.
 */
export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (cachedSql && cachedUrl === url) return cachedSql;
  cachedUrl = url;
  cachedSql = neon(url);
  return cachedSql;
}
