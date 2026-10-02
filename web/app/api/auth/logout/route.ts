import { NextResponse } from "next/server";
import { clearSession, requestOrigin, safeNext } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await clearSession();
  const form = await request.formData().catch(() => null);
  const nextPath = safeNext(String(form?.get("next") ?? ""));
  return NextResponse.redirect(new URL(nextPath, requestOrigin(request)), 303);
}
