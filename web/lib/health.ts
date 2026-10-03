import { dbQuery, hasDatabase } from "@/lib/db";

export type HealthDetail = {
  status: "ready" | "not_ready";
  checks: {
    app: "up";
    database: "ok" | "unavailable";
    schema: "ok" | "missing" | "unknown";
    activeExpedition: "ok" | "missing" | "unknown";
    pluginSync: "ok" | "stale" | "missing" | "unknown";
  };
};

export async function detailedHealth(): Promise<HealthDetail> {
  const checks: HealthDetail["checks"] = {
    app: "up",
    database: "unavailable",
    schema: "unknown",
    activeExpedition: "unknown",
    pluginSync: "unknown",
  };
  if (!hasDatabase()) return { status: "not_ready", checks };

  try {
    const schema = await dbQuery<{
      rate_limits: string | null;
      sync_state: string | null;
      privacy_requests: string | null;
    }>(
      `select to_regclass('public.security_rate_limits')::text as rate_limits,
              to_regclass('public.portal_sync_state')::text as sync_state,
              to_regclass('public.privacy_requests')::text as privacy_requests`,
    );
    checks.database = "ok";
    const row = schema[0];
    if (!row?.rate_limits || !row.sync_state || !row.privacy_requests) {
      checks.schema = "missing";
      return { status: "not_ready", checks };
    }
    checks.schema = "ok";

    const active = await dbQuery<{ count: number }>(
      "select count(*)::int as count from expeditions where status = 'active'",
    );
    checks.activeExpedition = Number(active[0]?.count ?? 0) > 0 ? "ok" : "missing";

    const staleMinutes = pluginStaleMinutes();
    const sync = await dbQuery<{ configured: number; fresh: number; seen: number }>(
      `select count(*)::int as configured,
              count(*) filter (
                where p.last_seen_at >= now() - ($1::int * interval '1 minute')
              )::int as fresh,
              count(p.server_id)::int as seen
       from servers s
       left join portal_sync_state p on p.server_id = s.id
       where s.key_hash is not null`,
      [staleMinutes],
    );
    const state = sync[0];
    const configured = Number(state?.configured ?? 0);
    const fresh = Number(state?.fresh ?? 0);
    const seen = Number(state?.seen ?? 0);
    checks.pluginSync = configured === 0 || seen === 0
      ? "missing"
      : fresh === configured
        ? "ok"
        : "stale";
  } catch {
    checks.database = "unavailable";
    if (checks.schema === "ok") checks.schema = "unknown";
    checks.activeExpedition = "unknown";
    checks.pluginSync = "unknown";
  }

  const ready = checks.database === "ok"
    && checks.schema === "ok"
    && checks.activeExpedition === "ok"
    && checks.pluginSync === "ok";
  return { status: ready ? "ready" : "not_ready", checks };
}

export function pluginStaleMinutes(): number {
  const value = Number(process.env.PLUGIN_SYNC_STALE_MINUTES ?? "5");
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 5;
}
