import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "vyprava_admin";

export function adminSecret(): string | null {
  const value = process.env.ADMIN_SECRET?.trim();
  return value ? value : null;
}

export function adminConfigured(): boolean {
  return adminSecret() !== null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function secretMatches(input: string): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const left = digest(input);
  const right = digest(secret);
  return timingSafeEqual(left, right);
}

export function sessionToken(): string | null {
  const secret = adminSecret();
  if (!secret) return null;
  return createHash("sha256").update(`vyprava-admin-session:${secret}`).digest("hex");
}

export async function isAdminAuthed(): Promise<boolean> {
  const expected = sessionToken();
  if (!expected) return false;
  const jar = await cookies();
  const got = jar.get(ADMIN_COOKIE)?.value ?? "";
  const left = digest(got);
  const right = digest(expected);
  return timingSafeEqual(left, right);
}

export async function requireAdminSession(): Promise<string | null> {
  if (!adminConfigured()) return "Admin je zamknutý. Chýba ADMIN_SECRET.";
  if (!(await isAdminAuthed())) return "Najprv zadaj heslo admina.";
  return null;
}
