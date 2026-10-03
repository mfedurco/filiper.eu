import { describe, expect, it } from "vitest";
import { safeNext, statesMatch } from "./google-auth";

describe("OAuth redirect binding", () => {
  it("allows only known local destinations", () => {
    expect(safeNext("/admin/server/test")).toBe("/admin/server/test");
    expect(safeNext("/hrac/test/00000000-0000-0000-0000-000000000000")).toContain("/hrac/");
    expect(safeNext("https://attacker.example")).toBe("/rebricek");
    expect(safeNext("//attacker.example")).toBe("/rebricek");
    expect(safeNext("/admin\\@attacker.example")).toBe("/rebricek");
  });

  it("requires an exact non-empty state match", () => {
    expect(statesMatch("one-time-state", "one-time-state")).toBe(true);
    expect(statesMatch("one-time-state", "other-state")).toBe(false);
    expect(statesMatch("", "")).toBe(false);
  });
});
