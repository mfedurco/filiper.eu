import { describe, expect, it } from "vitest";
import { enforceArrayLimit, PluginPayload } from "./plugin-sync";

describe("plugin batch integrity", () => {
  it("rejects an oversized batch instead of silently truncating it", () => {
    const batch = ["first", "second", "must-not-be-acknowledged"];
    expect(() => enforceArrayLimit(batch, 2)).toThrow(PluginPayload);
  });

  it("keeps every record when the batch is accepted", () => {
    const batch = ["first", "second"];
    expect(enforceArrayLimit(batch, 2)).toEqual(batch);
  });
});
