import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.fn();
vi.mock("@/lib/db", () => ({ dbQuery }));

import { fixedWindow, rateLimitKey, sharedRateLimit } from "./rate-limit";

describe("distributed rate limiter", () => {
  beforeEach(() => {
    vi.stubEnv("RATE_LIMIT_SECRET", "a-secure-test-secret-with-at-least-32-characters");
    dbQuery.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("HMACs identities and never sends a raw address to Postgres", async () => {
    dbQuery.mockResolvedValue([{ request_count: 1 }]);
    const result = await sharedRateLimit("oauth_start", "203.0.113.8", 30, 60_000, 65_000);
    expect(result.allowed).toBe(true);
    const parameters = dbQuery.mock.calls[0][1] as unknown[];
    expect(parameters).not.toContain("203.0.113.8");
    expect(parameters[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when shared storage is unavailable or unconfigured", async () => {
    dbQuery.mockRejectedValue(new Error("offline"));
    await expect(sharedRateLimit("profile_claim", "account", 10, 60_000)).resolves.toMatchObject({
      allowed: false,
      reason: "unavailable",
    });
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    await expect(sharedRateLimit("profile_claim", "account", 10, 60_000)).resolves.toMatchObject({
      allowed: false,
      reason: "unconfigured",
    });
  });

  it("uses a deterministic bounded fixed window", () => {
    expect(fixedWindow(65_000, 60_000)).toEqual({
      bucketStart: new Date(60_000),
      expiresAt: new Date(180_000),
      retryAfter: 55,
    });
    expect(rateLimitKey("same")).toBe(rateLimitKey("same"));
    expect(rateLimitKey("same")).not.toBe(rateLimitKey("different"));
  });
});
