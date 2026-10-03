import { createHash, timingSafeEqual } from "crypto";
import { detailedHealth } from "@/lib/health";
import { operationalLog, requestId } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = requestId();
  const headers = {
    "Cache-Control": "no-store",
    "X-Request-Id": correlationId,
  };
  if (!hasDetailAccess(request)) {
    return Response.json({ status: "up" }, { headers });
  }

  const result = await detailedHealth();
  if (result.status !== "ready") {
    operationalLog({
      event: "health.failure",
      requestId: correlationId,
      outcome: "degraded",
      reason: firstFailure(result.checks),
    });
  }
  return Response.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers,
  });
}

function hasDetailAccess(request: Request): boolean {
  const secret = process.env.HEALTH_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret || secret.length < 32 || !candidate) return false;
  return timingSafeEqual(digest(secret), digest(candidate));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function firstFailure(checks: Awaited<ReturnType<typeof detailedHealth>>["checks"]): string {
  if (checks.database !== "ok") return "database";
  if (checks.schema !== "ok") return "schema";
  if (checks.activeExpedition !== "ok") return "active_expedition";
  if (checks.pluginSync !== "ok") return "plugin_sync";
  return "unknown";
}
