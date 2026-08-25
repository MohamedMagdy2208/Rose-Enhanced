import { describe, expect, it } from "vitest";
import { navigationForSurface } from "./AppShell";

describe("hybrid surface navigation", () => {
  it("keeps match-adjacent pages inside Rose", () => {
    expect(navigationForSurface("client")).toEqual([
      "dashboard",
      "collection",
      "insights",
      "automation",
      "aram",
    ]);
  });

  it("keeps administration in the desktop app", () => {
    expect(navigationForSurface("desktop")).toEqual([
      "setup",
      "dashboard",
      "collection",
      "insights",
      "automation",
      "aram",
      "integrations",
      "mobile",
      "doctor",
      "guide",
      "settings",
    ]);
  });
});
