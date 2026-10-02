import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminConfigured, secretMatches, sessionToken } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "Admin je zamknutý." }, { status: 423 });
  }
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatné telo požiadavky." }, { status: 400 });
  }
  if (!secretMatches(body.password?.trim() ?? "")) {
    return NextResponse.json({ error: "Nesprávne heslo." }, { status: 401 });
  }
  const token = sessionToken();
  const response = NextResponse.json({ ok: true });
  if (token) {
    response.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
