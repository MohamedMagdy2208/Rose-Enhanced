import { describe, expect, it } from "vitest";
import type { CollectionSnapshot, SkinRecord } from "@summonerkit/contracts";
import { collectionInsights } from "./CollectionPage";

const skin = (overrides: Partial<SkinRecord>): SkinRecord => ({ id: 1001, championId: 1, name: "Skin", rarity: null, contentId: null, tilePath: null, splashPath: null, owned: false, available: true, favorite: false, wishlisted: false, loot: { shardCount: 0, permanentCount: 0, essenceValue: 0, rarity: null, expiresAt: null }, chromas: [], ...overrides });
const collection = (skins: SkinRecord[]): CollectionSnapshot => ({ status: "ready", source: "live", stale: false, patch: "26.16", accountKey: null, updatedAt: null, progress: { totalSkins: skins.length, ownedSkins: 0, lootSkins: 0, favoriteSkins: 0, wishlistSkins: 0, completionPercent: 0 }, champions: [{ id: 1, alias: "A", name: "A", iconPath: null, owned: true, skins }], warnings: [] });

describe("collection intelligence", () => {
  it("preserves overlaps and calculates only future 30-day expiries", () => {
    const now = Date.parse("2026-08-24T00:00:00.000Z");
    const result = collectionInsights(collection([
      skin({ owned: true, wishlisted: true, loot: { shardCount: 2, permanentCount: 0, essenceValue: 675, rarity: null, expiresAt: "2026-09-01T00:00:00.000Z" } }),
      skin({ id: 1002, loot: { shardCount: 1, permanentCount: 0, essenceValue: 300, rarity: null, expiresAt: "2026-10-10T00:00:00.000Z" } }),
    ]), now);
    expect(result).toEqual({ duplicateLoot: 1, wishlistInLoot: 1, expiringSoon: 1, listedEssence: 1_650 });
  });
});
