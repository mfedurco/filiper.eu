import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  hasDatabase: vi.fn(),
}));
vi.mock("@/lib/db", () => mocks);

import { detailedHealth } from "./health";

describe("detailed readiness", () => {
  beforeEach(() => {
    mocks.dbQuery.mockReset();
    mocks.hasDatabase.mockReset();
    mocks.hasDatabase.mockReturnValue(true);
  });

  it("distinguishes an unavailable database", async () => {
    mocks.dbQuery.mockRejectedValue(new Error("private connection details"));
    await expect(detailedHealth()).resolves.toMatchObject({
      status: "not_ready",
      checks: { database: "unavailable", schema: "unknown" },
    });
  });

  it("distinguishes a missing operations schema", async () => {
    mocks.dbQuery.mockResolvedValue([{
      rate_limits: null,
      sync_state: null,
      privacy_requests: null,
    }]);
    await expect(detailedHealth()).resolves.toMatchObject({
      status: "not_ready",
      checks: { database: "ok", schema: "missing" },
    });
  });

  it("reports active-expedition and stale-plugin readiness separately", async () => {
    mocks.dbQuery
      .mockResolvedValueOnce([{
        rate_limits: "security_rate_limits",
        sync_state: "portal_sync_state",
        privacy_requests: "privacy_requests",
      }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ configured: 2, seen: 2, fresh: 1 }]);
    await expect(detailedHealth()).resolves.toMatchObject({
      status: "not_ready",
      checks: {
        database: "ok",
        schema: "ok",
        activeExpedition: "ok",
        pluginSync: "stale",
      },
    });
  });

  it("reports missing sync until a configured server sends its first heartbeat", async () => {
    mocks.dbQuery
      .mockResolvedValueOnce([{
        rate_limits: "security_rate_limits",
        sync_state: "portal_sync_state",
        privacy_requests: "privacy_requests",
      }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ configured: 1, seen: 0, fresh: 0 }]);
    await expect(detailedHealth()).resolves.toMatchObject({
      status: "not_ready",
      checks: {
        activeExpedition: "ok",
        pluginSync: "missing",
      },
    });
  });
});
