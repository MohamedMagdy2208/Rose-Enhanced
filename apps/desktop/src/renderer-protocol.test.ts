import path from "node:path";
import { describe, expect, it } from "vitest";
import { rendererFilePath } from "./renderer-protocol";

describe("packaged renderer protocol", () => {
  it("maps only private renderer URLs inside the packaged renderer root", () => {
    const root = path.resolve("C:/SummonerKit/renderer");
    expect(rendererFilePath(root, "summonerkit://app/index.html")).toBe(path.join(root, "index.html"));
    expect(rendererFilePath(root, "summonerkit://app/assets/main.js?v=1")).toBe(path.join(root, "assets", "main.js"));
    expect(rendererFilePath(root, "summonerkit://other/index.html")).toBeNull();
    expect(rendererFilePath(root, "https://app/index.html")).toBeNull();
    expect(rendererFilePath(root, "summonerkit://app/%2e%2e%2fsettings.json")).toBeNull();
  });
});
