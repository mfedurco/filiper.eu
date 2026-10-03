import { NextResponse } from "next/server";
import { googleConfigured, googleStartUrl, newState, rememberState, requestOrigin, safeNext } from "@/lib/google-auth";
import { allowRequest, clientAddress } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`oauth-start:${clientAddress(request)}`, 30, 15 * 60_000)) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "900" },
    });
  }
  const nextPath = safeNext(new URL(request.url).searchParams.get("next"));
  if (!googleConfigured()) {
    const response = NextResponse.redirect(new URL(`${nextPath}?google=off`, requestOrigin(request)));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const state = newState();
  await rememberState(state);
  const response = NextResponse.redirect(
    googleStartUrl(requestOrigin(request), `${state}:${encodeURIComponent(nextPath)}`),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
