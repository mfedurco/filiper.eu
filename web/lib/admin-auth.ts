import { NextRequest, NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/data";

const COOKIE = "vyprava_admin";

export function isAdminAuthed(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE)?.value;
  return cookie === getAdminPassword();
}

export function requireAdmin(request: NextRequest): NextResponse | null {
  if (!isAdminAuthed(request)) {
    return NextResponse.json({ error: "Neautorizovaný prístup." }, { status: 401 });
  }
  return null;
}

export { COOKIE };
