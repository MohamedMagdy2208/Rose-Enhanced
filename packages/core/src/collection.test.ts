import { describe, expect, it } from "vitest";
import { buildCollectionSnapshot } from "./collection";

describe("buildCollectionSnapshot", () => {
  it("preserves ownership and duplicate loot as independent states", () => {
    const snapshot = buildCollectionSnapshot({
      champions: [
        {
          id: 1,
          alias: "Annie",
          name: "Annie",
          ownership: { owned: true },
          skins: [
            { id: 1000, name: "Annie" },
            { id: 1001, name: "Goth Annie" },
            { id: 1002, name: "Red Riding Annie", chromas: [{ id: 10021, name: "Ruby" }] },
          ],
        },
      ],
      inventory: [
        { itemId: 1001, owned: true },
        { itemId: 10021, owned: true },
      ],
      loot: [
        { lootName: "CHAMPION_SKIN_1001", refId: "1001", count: 2, disenchantValue: 520 },
        { lootName: "CHAMPION_SKIN_1002_PERMANENT", refId: "1002", count: 1 },
      ],
      favorites: new Set([1002]),
      wishlist: new Set([1001]),
      patch: "26.16",
      accountKey: "account",
      now: new Date("2026-08-22T00:00:00.000Z"),
    });

    const goth = snapshot.champions[0]?.skins[1];
    const red = snapshot.champions[0]?.skins[2];
    expect(goth).toMatchObject({ owned: true, loot: { shardCount: 2, permanentCount: 0 } });
    expect(red).toMatchObject({ favorite: true, loot: { permanentCount: 1 } });
    expect(goth?.wishlisted).toBe(true);
    expect(red?.chromas[0]?.owned).toBe(true);
    expect(snapshot.progress).toMatchObject({ totalSkins: 2, ownedSkins: 1, lootSkins: 2 });
  });

  it("ignores expired and unknown loot without failing the collection", () => {
    const snapshot = buildCollectionSnapshot({
      champions: [{ id: 2, alias: "Olaf", name: "Olaf", skins: [{ id: 2000, name: "Olaf" }] }],
      inventory: [],
      loot: [
        { lootName: "CHAMPION_SKIN_999999", refId: "999999", count: 1 },
        { lootName: "CHAMPION_SKIN_2000", refId: "2000", count: 1, expiryTime: 1 },
      ],
      favorites: new Set(),
      wishlist: new Set(),
      patch: null,
      accountKey: null,
      now: new Date("2026-08-22T00:00:00.000Z"),
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.champions[0]?.skins[0]?.loot.shardCount).toBe(0);
  });
});
