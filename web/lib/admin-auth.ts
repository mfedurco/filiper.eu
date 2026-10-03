import { createHash, timingSafeEqual } from "crypto";

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
