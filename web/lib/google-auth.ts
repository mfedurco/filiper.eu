import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { appOrigin } from "./security";

export const GOOGLE_COOKIE = "vyprava_google";
const STATE_COOKIE = "vyprava_google_state";

export type GoogleSession = {
  sub: string;
  email: string;
  name: string;
};

export function googleClientId(): string | null {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  return value ? value : null;
}

export function googleClientSecret(): string | null {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return value ? value : null;
}

export function googleConfigured(): boolean {
  return googleClientId() !== null && googleClientSecret() !== null;
}

export function requestOrigin(request: Request): string {
  return appOrigin(request.url);
}

export function safeNext(value: string | null): string {
  if (!value || value.startsWith("//") || value.includes("\\") || value.includes("?")) return "/rebricek";
  if (value === "/admin" || value.startsWith("/admin/")) return value;
  if (value.startsWith("/hrac/")) return value;
  return "/rebricek";
}

export function googleStartUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: googleClientId() ?? "",
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function newState(): string {
  return randomBytes(16).toString("base64url");
}

export async function rememberState(state: string) {
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function takeState(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(STATE_COOKIE)?.value ?? "";
  jar.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
  return value || null;
}

export function statesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeCode(origin: string, code: string): Promise<GoogleSession | null> {
  const secret = googleClientSecret();
  const clientId = googleClientId();
  if (!secret || !clientId) return null;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: secret,
    redirect_uri: `${origin}/api/auth/google/callback`,
    grant_type: "authorization_code",
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) return null;
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) return null;
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true) return null;
  return {
    sub: profile.sub,
    email: profile.email ?? "",
    name: profile.name ?? "",
  };
}

export async function writeSession(session: GoogleSession) {
  const jar = await cookies();
  jar.set(GOOGLE_COOKIE, sign(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(GOOGLE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0 });
}

export async function readSession(): Promise<GoogleSession | null> {
  if (!googleConfigured()) return null;
  const jar = await cookies();
  return verify(jar.get(GOOGLE_COOKIE)?.value ?? "");
}

function sign(session: GoogleSession): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + 14 * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const mac = createHmac("sha256", googleClientSecret() ?? "").update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verify(value: string): GoogleSession | null {
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", googleClientSecret() ?? "").update(payload).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleSession & { exp?: number };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) return null;
    return { sub: parsed.sub, email: parsed.email ?? "", name: parsed.name ?? "" };
  } catch {
    return null;
  }
}
