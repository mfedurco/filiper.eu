import { issueClaimCode } from "@/lib/player-profile";
import { bearerKey } from "@/lib/server-key";
import {
  authorizePlugin,
  loadForPlugin,
  markPluginSeen,
  PluginPayload,
  PluginRejected,
  pushForPlugin,
  rememberLanguage,
} from "@/lib/plugin-sync";
import { errorClass, operationalLog, requestId } from "@/lib/operations";
import { sharedRateLimit } from "@/lib/rate-limit";
import {
  BodyTooLarge,
  clientAddress,
  InvalidBody,
  readLimitedJson,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function rejected(status: number, correlationId?: string) {
  return Response.json(
    { error: "rejected" },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(correlationId ? { "X-Request-Id": correlationId } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  const correlationId = requestId();
  const address = clientAddress(request);
  const rate = await sharedRateLimit("plugin_sync", address, 240, 60_000);
  if (!rate.allowed) {
    operationalLog({
      event: "plugin.rate_limited",
      requestId: correlationId,
      outcome: rate.reason ? "degraded" : "denied",
      reason: rate.reason ?? "budget",
    });
    return Response.json(
      { error: rate.reason ? "unavailable" : "rejected" },
      {
        status: rate.reason ? 503 : 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rate.reason ? 10 : rate.retryAfter),
          "X-Request-Id": correlationId,
        },
      },
    );
  }
  let body: unknown;
  try {
    body = await readLimitedJson(request);
  } catch (error) {
    if (error instanceof BodyTooLarge) return rejected(413, correlationId);
    if (!(error instanceof InvalidBody)) {
      operationalLog({
        event: "plugin.failure",
        requestId: correlationId,
        outcome: "error",
        reason: errorClass(error),
        operation: "read_body",
      });
      return Response.json({ error: "unavailable" }, { status: 503, headers: { "X-Request-Id": correlationId } });
    }
    return rejected(400, correlationId);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return rejected(400, correlationId);
  }
  const record = body as {
    serverId?: unknown;
    op?: unknown;
    uuid?: unknown;
    name?: unknown;
    code?: unknown;
    language?: unknown;
  };
  const serverId = String(record.serverId ?? "").trim();
  const op = String(record.op ?? "");
  const key = bearerKey(request.headers.get("authorization"));
  try {
    await authorizePlugin(serverId, key);
    if (op === "load") {
      const loaded = await loadForPlugin(serverId);
      await markPluginSeen(serverId, false);
      return Response.json(loaded);
    }
    if (op === "push") {
      await pushForPlugin(serverId, body);
      await markPluginSeen(serverId, true);
      return Response.json({ ok: true });
    }
    if (op === "language") {
      try {
        await rememberLanguage(serverId, String(record.uuid ?? ""), String(record.language ?? ""));
      } catch (error) {
        if (error instanceof PluginPayload) return rejected(400, correlationId);
        throw error;
      }
      return Response.json({ ok: true });
    }
    if (op === "claim") {
      try {
        await issueClaimCode(serverId, String(record.uuid ?? ""), String(record.name ?? ""), String(record.code ?? ""));
      } catch (error) {
        if (error instanceof Error && error.message === "payload") return rejected(400, correlationId);
        throw error;
      }
      return Response.json({ ok: true });
    }
    return rejected(400, correlationId);
  } catch (error) {
    if (error instanceof PluginRejected) {
      operationalLog({ event: "plugin.auth_denied", requestId: correlationId, outcome: "denied", reason: "credential" });
      return rejected(401, correlationId);
    }
    if (error instanceof PluginPayload) return rejected(400, correlationId);
    operationalLog({
      event: "plugin.failure",
      requestId: correlationId,
      outcome: "error",
      reason: errorClass(error),
      operation: op || "unknown",
    });
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "X-Request-Id": correlationId } });
  }
}
