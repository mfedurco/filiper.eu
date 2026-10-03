import { createHmac } from "crypto";
import { dbQuery } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
  reason?: "unconfigured" | "unavailable";
};

type RateRow = { request_count: number };

export function rateLimitKey(value: string): string | null {
  const secret = process.env.RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update(value || "unknown", "utf8").digest("hex");
}

export function fixedWindow(now: number, windowMs: number): {
  bucketStart: Date;
  expiresAt: Date;
  retryAfter: number;
} {
  const start = Math.floor(now / windowMs) * windowMs;
  return {
    bucketStart: new Date(start),
    expiresAt: new Date(start + windowMs * 2),
    retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
  };
}

export async function sharedRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const hash = rateLimitKey(`${scope}\0${identity}`);
  const window = fixedWindow(now, windowMs);
  if (!hash) {
    return { allowed: false, retryAfter: window.retryAfter, reason: "unconfigured" };
  }
  try {
    const rows = await dbQuery<RateRow>(
      `insert into security_rate_limits (
         scope, key_hash, bucket_start, request_count, expires_at
       ) values ($1, $2, $3, 1, $4)
       on conflict (scope, key_hash, bucket_start) do update
       set request_count = security_rate_limits.request_count + 1,
           expires_at = greatest(security_rate_limits.expires_at, excluded.expires_at)
       where security_rate_limits.request_count < $5
       returning request_count`,
      [scope, hash, window.bucketStart, window.expiresAt, limit],
    );
    return { allowed: rows.length === 1, retryAfter: window.retryAfter };
  } catch {
    return { allowed: false, retryAfter: window.retryAfter, reason: "unavailable" };
  }
}
