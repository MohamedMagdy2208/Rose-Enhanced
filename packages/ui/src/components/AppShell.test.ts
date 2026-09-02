import { describe, expect, it } from "vitest";
import { navigationForSurface, navigationGroupsForSurface } from "./AppShell";

describe("hybrid surface navigation", () => {
  it("keeps match-adjacent pages inside the SummonerKit client tab", () => {
    expect(navigationForSurface("client")).toEqual([
      "dashboard",
      "collection",
      "insights",
      "automation",
      "aram",
      "mobile",
    ]);
  });

  it("keeps administration in the desktop app", () => {
    expect(navigationForSurface("desktop")).toEqual([
      "dashboard",
      "collection",
      "insights",
      "automation",
      "aram",
      "mobile",
      "integrations",
      "doctor",
      "testlab",
      "setup",
      "guide",
      "settings",
    ]);
  });

  it("groups destinations by user intent without showing an empty system group in the client", () => {
    expect(navigationGroupsForSurface("desktop")).toEqual([
      { id: "league", label: "League", pages: ["dashboard", "collection", "insights", "automation", "aram"] },
      { id: "connect", label: "Connect", pages: ["mobile", "integrations"] },
      { id: "system", label: "System", pages: ["doctor", "testlab", "setup", "guide", "settings"] },
    ]);
    expect(navigationGroupsForSurface("client")).toEqual([
      { id: "league", label: "League", pages: ["dashboard", "collection", "insights", "automation", "aram"] },
      { id: "connect", label: "Connect", pages: ["mobile"] },
    ]);
  });
});
