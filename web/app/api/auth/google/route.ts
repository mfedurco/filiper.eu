import { NextResponse } from "next/server";
import { googleConfigured, googleStartUrl, newState, rememberState, requestOrigin, safeNext } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const nextPath = safeNext(new URL(request.url).searchParams.get("next"));
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`${nextPath}?google=off`, requestOrigin(request)));
  }
  const state = newState();
  await rememberState(state);
  return NextResponse.redirect(googleStartUrl(requestOrigin(request), `${state}:${encodeURIComponent(nextPath)}`));
}
