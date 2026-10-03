import { NextResponse } from "next/server";
import {
  exchangeCode,
  requestOrigin,
  safeNext,
  statesMatch,
  takeState,
  writeSession,
  type GoogleSession,
} from "@/lib/google-auth";
import { rememberSignedIn } from "@/lib/portal-accounts";
import { errorClass, operationalLog, requestId } from "@/lib/operations";
import { sharedRateLimit } from "@/lib/rate-limit";
import { clientAddress } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestId();
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const failed = NextResponse.redirect(new URL("/rebricek?google=zlyhalo", origin));
  failed.headers.set("Cache-Control", "no-store");
  failed.headers.set("X-Request-Id", correlationId);
  const rate = await sharedRateLimit("oauth_callback", clientAddress(request), 60, 15 * 60_000);
  if (!rate.allowed) {
    operationalLog({
      event: "oauth.rate_limited",
      requestId: correlationId,
      outcome: rate.reason ? "degraded" : "denied",
      reason: rate.reason ?? "budget",
      operation: "callback",
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
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const [nonce, encodedNext] = state.split(":");
  const saved = await takeState();
  if (!code || !nonce || !saved || !statesMatch(saved, nonce)) {
    operationalLog({ event: "oauth.failure", requestId: correlationId, outcome: "denied", reason: "invalid_state" });
    return failed;
  }
  let session: GoogleSession | null;
  try {
    session = await exchangeCode(origin, code);
  } catch (error) {
    operationalLog({
      event: "oauth.failure",
      requestId: correlationId,
      outcome: "error",
      reason: errorClass(error),
      operation: "exchange",
    });
    return failed;
  }
  if (!session) {
    operationalLog({ event: "oauth.failure", requestId: correlationId, outcome: "denied", reason: "provider_rejected" });
    return failed;
  }
  await writeSession(session);
  try {
    await rememberSignedIn(session);
  } catch (error) {
    operationalLog({
      event: "database.failure",
      requestId: correlationId,
      outcome: "error",
      reason: errorClass(error),
      operation: "remember_sign_in",
    });
    // The Google session is already stored. Admin retries the account row on the next visit.
  }
  const nextPath = safeNext(encodedNext ? decodeURIComponent(encodedNext) : null);
  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", correlationId);
  return response;
}
