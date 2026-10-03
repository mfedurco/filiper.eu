import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowRequest,
  appOrigin,
  BodyTooLarge,
  isTrustedOrigin,
  readLimitedJson,
} from "./security";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonical origin", () => {
  it("uses the configured origin instead of request host headers", () => {
    vi.stubEnv("APP_ORIGIN", "https://vyprava.filiper.eu");
    expect(appOrigin("https://attacker.example/path")).toBe("https://vyprava.filiper.eu");
    expect(isTrustedOrigin("https://vyprava.filiper.eu", appOrigin())).toBe(true);
    expect(isTrustedOrigin("https://attacker.example", appOrigin())).toBe(false);
  });

  it("rejects malformed origin configuration in production", () => {
    vi.stubEnv("APP_ORIGIN", "https://vyprava.filiper.eu/redirect");
    vi.stubEnv("NODE_ENV", "production");
    expect(appOrigin("https://attacker.example")).toBe("https://vyprava.filiper.eu");
  });
});

describe("request limits", () => {
  it("rejects a streamed body larger than the limit", async () => {
    const request = new Request("https://vyprava.filiper.eu/api/plugin/sync", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(100) }),
    });
    await expect(readLimitedJson(request, 20)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("enforces a fixed-window request budget", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(allowRequest(key, 2, 1_000, 10)).toBe(true);
    expect(allowRequest(key, 2, 1_000, 11)).toBe(true);
    expect(allowRequest(key, 2, 1_000, 12)).toBe(false);
    expect(allowRequest(key, 2, 1_000, 1_011)).toBe(true);
  });
});
