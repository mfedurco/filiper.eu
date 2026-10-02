import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForPg = globalThis as unknown as { vypravaPool?: Pool };

export function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

export function hasDatabase(): boolean {
  return databaseUrl() !== null;
}

export function getPool(): Pool | null {
  const url = databaseUrl();
  if (!url) return null;
  if (!globalForPg.vypravaPool) {
    globalForPg.vypravaPool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return globalForPg.vypravaPool;
}

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPool();
  if (!pool) {
    throw new Error("Databáza nie je pripojená.");
  }
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) {
    throw new Error("Databáza nie je pripojená.");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await fn(client);
    await client.query("commit");
    return value;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* the original error is the one to surface */
    }
    throw error;
  } finally {
    client.release();
  }
}

export function publicDbError(): string {
  return "Databáza sa neozvala. Skús to znova o chvíľu.";
}
