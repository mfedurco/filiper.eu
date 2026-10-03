import { issueClaimCode } from "@/lib/player-profile";
import { bearerKey } from "@/lib/server-key";
import {
  authorizePlugin,
  loadForPlugin,
  PluginPayload,
  PluginRejected,
  pushForPlugin,
  rememberLanguage,
} from "@/lib/plugin-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function rejected(status: number) {
  return Response.json({ error: "rejected" }, { status });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 2_000_000) {
    return rejected(413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rejected(400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return rejected(400);
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
      return Response.json(await loadForPlugin(serverId));
    }
    if (op === "push") {
      await pushForPlugin(serverId, body);
      return Response.json({ ok: true });
    }
    if (op === "language") {
      try {
        await rememberLanguage(serverId, String(record.uuid ?? ""), String(record.language ?? ""));
      } catch (error) {
        if (error instanceof PluginPayload) return rejected(400);
        throw error;
      }
      return Response.json({ ok: true });
    }
    if (op === "claim") {
      try {
        await issueClaimCode(serverId, String(record.uuid ?? ""), String(record.name ?? ""), String(record.code ?? ""));
      } catch (error) {
        if (error instanceof Error && error.message === "payload") return rejected(400);
        throw error;
      }
      return Response.json({ ok: true });
    }
    return rejected(400);
  } catch (error) {
    if (error instanceof PluginRejected) return rejected(401);
    if (error instanceof PluginPayload) return rejected(400);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
