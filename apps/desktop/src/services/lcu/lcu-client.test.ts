import { describe, expect, it } from "vitest";
import { allowedLcuAssetEndpoint, serializeLcuRequestBody } from "./lcu-client";

describe("LCU asset boundary", () => {
  it.each([
    "/lol-game-data/assets/v1/champion-summary.json",
    "/lol-game-data/assets/ASSETS/Characters/Ahri/Skins/Skin01.jpg",
  ])("allows a local game-data asset %s", (endpoint) => {
    expect(allowedLcuAssetEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "/lol-summoner/v1/current-summoner",
    "/lol-game-data/assets/../private",
    "/lol-game-data/assets/%2e%2e/private",
    "/lol-game-data/assets/file?redirect=/private",
    "/lol-game-data/assets\\..\\private",
  ])("rejects an asset escape %s", (endpoint) => {
    expect(allowedLcuAssetEndpoint(endpoint)).toBe(false);
  });

  it("bounds and validates request bodies before opening an LCU socket", () => {
    expect(serializeLcuRequestBody(undefined)).toBeNull();
    expect(serializeLcuRequestBody({ championId: 103 })?.toString("utf8")).toBe('{"championId":103}');
    expect(() => serializeLcuRequestBody("x".repeat(2 * 1024 * 1024))).toThrow(/safety limit/u);
    expect(() => serializeLcuRequestBody(BigInt(1))).toThrow(/JSON serializable/u);
  });
});
