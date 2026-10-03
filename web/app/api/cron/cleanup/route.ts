import { createHash, timingSafeEqual } from "crypto";
import { runCleanup } from "@/lib/cleanup";
import { errorClass, operationalLog, requestId } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = requestId();
  if (!authorized(request)) {
    return Response.json(
      { error: "rejected" },
      { status: 401, headers: { "Cache-Control": "no-store", "X-Request-Id": correlationId } },
    );
  }
  try {
    const removed = await runCleanup();
    return Response.json(
      { ok: true, removed },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": correlationId } },
    );
  } catch (error) {
    operationalLog({
      event: "cleanup.failure",
      requestId: correlationId,
      outcome: "error",
      reason: errorClass(error),
    });
    return Response.json(
      { error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": correlationId } },
    );
  }
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret || secret.length < 32 || !candidate) return false;
  return timingSafeEqual(digest(secret), digest(candidate));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
