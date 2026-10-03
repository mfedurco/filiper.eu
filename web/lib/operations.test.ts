import { afterEach, describe, expect, it, vi } from "vitest";
import { errorClass, operationalLog } from "./operations";

describe("operational logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits only allowlisted, correlation-safe fields", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    operationalLog({
      event: "plugin.auth_denied",
      requestId: "correlation-only",
      outcome: "denied",
      reason: "credential",
      operation: "push",
    });
    const output = String(write.mock.calls[0][0]);
    expect(JSON.parse(output)).toMatchObject({
      event: "plugin.auth_denied",
      requestId: "correlation-only",
      outcome: "denied",
    });
    expect(output).not.toMatch(/authorization|email|uuid|jdbc|server.?key/i);
  });

  it("classifies errors without returning their message", () => {
    const error = Object.assign(new Error("jdbc:postgresql://secret-host/user@example.com"), { code: "08006" });
    expect(errorClass(error)).toBe("db_08");
  });
});
