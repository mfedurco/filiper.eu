import { headers } from "next/headers";

const PRODUCTION_ORIGIN = "https://vyprava.filiper.eu";
const DEFAULT_BODY_LIMIT = 2_000_000;

type Bucket = { count: number; resetAt: number };
const globalSecurity = globalThis as unknown as {
  vypravaRateBuckets?: Map<string, Bucket>;
};

function configuredOrigin(): string | null {
  const raw = process.env.APP_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if ((parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") ||
        parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function appOrigin(requestUrl?: string): string {
  const configured = configuredOrigin();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return PRODUCTION_ORIGIN;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://127.0.0.1:43141";
}

export function isTrustedOrigin(origin: string | null, expected: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === expected && new URL(origin).pathname === "/";
  } catch {
    return false;
  }
}

export async function requireTrustedMutation(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!isTrustedOrigin(origin, appOrigin())) {
    throw new Error("Nedôveryhodný pôvod požiadavky.");
  }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const buckets = globalSecurity.vypravaRateBuckets ??= new Map<string, Bucket>();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  return true;
}

export async function readLimitedJson(
  request: Request,
  maxBytes = DEFAULT_BODY_LIMIT,
): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) throw new BodyTooLarge();
  if (!request.body) throw new InvalidBody();

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidBody();
  }
}

export class BodyTooLarge extends Error {}
export class InvalidBody extends Error {}
