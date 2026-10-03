import { NextResponse } from "next/server";
import {
  exchangeCode,
  requestOrigin,
  safeNext,
  statesMatch,
  takeState,
  writeSession,
} from "@/lib/google-auth";
import { rememberSignedIn } from "@/lib/portal-accounts";
import { allowRequest, clientAddress } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const failed = NextResponse.redirect(new URL("/rebricek?google=zlyhalo", origin));
  failed.headers.set("Cache-Control", "no-store");
  if (!allowRequest(`oauth-callback:${clientAddress(request)}`, 60, 15 * 60_000)) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "900" },
    });
  }
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const [nonce, encodedNext] = state.split(":");
  const saved = await takeState();
  if (!code || !nonce || !saved || !statesMatch(saved, nonce)) return failed;
  const session = await exchangeCode(origin, code);
  if (!session) return failed;
  await writeSession(session);
  try {
    await rememberSignedIn(session);
  } catch {
    // The Google session is already stored. Admin retries the account row on the next visit.
  }
  const nextPath = safeNext(encodedNext ? decodeURIComponent(encodedNext) : null);
  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
