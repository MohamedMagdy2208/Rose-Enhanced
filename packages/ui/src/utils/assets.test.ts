import { describe, expect, it } from "vitest";
import { formatLeaguePatch } from "./assets";

describe("formatLeaguePatch", () => {
  it("keeps the 2026-08-25 dashboard regression from exposing Riot's raw build branch", () => {
    expect(formatLeaguePatch("16.16.8049184+branch.releases-16-16.code.public.content.release.anticheat.vanguard")).toBe("16.16");
  });
});
