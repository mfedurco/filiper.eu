import { randomBytes } from "crypto";

export type OperationalEvent =
  | "oauth.failure"
  | "oauth.rate_limited"
  | "plugin.auth_denied"
  | "plugin.failure"
  | "plugin.rate_limited"
  | "database.failure"
  | "role.denied"
  | "cleanup.failure"
  | "health.failure";

type SafeLog = {
  event: OperationalEvent;
  requestId: string;
  outcome: "denied" | "error" | "degraded";
  reason?: string;
  operation?: string;
};

export function requestId(): string {
  return randomBytes(12).toString("hex");
}

export function operationalLog(entry: SafeLog): void {
  const value = {
    timestamp: new Date().toISOString(),
    level: entry.outcome === "error" ? "error" : "warn",
    event: entry.event,
    requestId: entry.requestId,
    outcome: entry.outcome,
    ...(entry.reason ? { reason: safeToken(entry.reason) } : {}),
    ...(entry.operation ? { operation: safeToken(entry.operation) } : {}),
  };
  console.error(JSON.stringify(value));
}

export function errorClass(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const code = "code" in error ? String(error.code) : "";
  if (/^[0-9A-Z]{5}$/.test(code)) return `db_${code.slice(0, 2).toLowerCase()}`;
  return error instanceof Error ? safeToken(error.name) : "unknown";
}

function safeToken(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]/g, "_").slice(0, 48);
  return normalized || "unknown";
}
