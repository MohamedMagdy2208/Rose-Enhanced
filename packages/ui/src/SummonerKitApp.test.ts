import { describe, expect, it } from "vitest";
import { resolveInitialPage } from "./SummonerKitApp";

describe("remembered navigation", () => {
  it("keeps first-time desktop users in setup", () => {
    expect(resolveInitialPage("desktop", false, "collection")).toBe("setup");
  });

  it("restores a valid page for each surface", () => {
    expect(resolveInitialPage("desktop", true, "doctor")).toBe("doctor");
    expect(resolveInitialPage("client", true, "collection")).toBe("collection");
  });

  it("falls back safely when a page is unavailable on that surface", () => {
    expect(resolveInitialPage("client", true, "settings")).toBe("dashboard");
    expect(resolveInitialPage("desktop", true, "not-a-page")).toBe("dashboard");
  });
});
