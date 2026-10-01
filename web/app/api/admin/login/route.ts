import { NextRequest, NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/data";
import { COOKIE } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatné telo požiadavky." }, { status: 400 });
  }

  const password = body.password?.trim() ?? "";
  if (password !== getAdminPassword()) {
    return NextResponse.json({ error: "Nesprávne heslo." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
