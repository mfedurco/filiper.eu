import { NextResponse } from "next/server";
import { googleConfigured, googleStartUrl, newState, rememberState, requestOrigin, safeNext } from "@/lib/google-auth";
import { operationalLog, requestId } from "@/lib/operations";
import { sharedRateLimit } from "@/lib/rate-limit";
import { clientAddress } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestId();
  const rate = await sharedRateLimit("oauth_start", clientAddress(request), 30, 15 * 60_000);
  if (!rate.allowed) {
    operationalLog({
      event: "oauth.rate_limited",
      requestId: correlationId,
      outcome: rate.reason ? "degraded" : "denied",
      reason: rate.reason ?? "budget",
      operation: "start",
    });
    return new NextResponse("Too many requests", {
      status: rate.reason ? 503 : 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(rate.retryAfter),
        "X-Request-Id": correlationId,
      },
    });
  }
  const nextPath = safeNext(new URL(request.url).searchParams.get("next"));
  if (!googleConfigured()) {
    const response = NextResponse.redirect(new URL(`${nextPath}?google=off`, requestOrigin(request)));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-Id", correlationId);
    return response;
  }
  const state = newState();
  await rememberState(state);
  const response = NextResponse.redirect(
    googleStartUrl(requestOrigin(request), `${state}:${encodeURIComponent(nextPath)}`),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", correlationId);
  return response;
}
