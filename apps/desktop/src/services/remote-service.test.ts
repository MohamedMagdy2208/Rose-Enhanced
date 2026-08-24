import type { CompanionCommand } from "@summonerkit/contracts";
import { createDefaultSettings } from "@summonerkit/core";
import { describe, expect, it } from "vitest";
import { CompanionStore } from "./companion-store";
import { isRemoteCommandAllowed, remoteSnapshot } from "./remote-service";

describe("remote command allowlist", () => {
  it("allows only the narrow mobile control surface", () => {
    const allowed: CompanionCommand[] = [
      { type: "readyCheck.accept" },
      { type: "queue.start" },
      { type: "champSelect.lock", championId: 103 },
      { type: "champSelect.setSpells", spell1Id: 4, spell2Id: 14 },
      { type: "champSelect.setRunePage", pageId: 7 },
      { type: "champSelect.selectOwnedSkin", skinId: 103001 },
      { type: "aram.benchSwap", championId: 22 },
    ];
    const rejected: CompanionCommand[] = [
      { type: "collection.refresh" },
      { type: "automation.acknowledgeRisk" },
      { type: "integration.launch", integrationId: "rose" },
      { type: "clientTab.repair" },
    ];
    expect(allowed.every(isRemoteCommandAllowed)).toBe(true);
    expect(rejected.some(isRemoteCommandAllowed)).toBe(false);
  });

  it("creates a small identity-free snapshot for the encrypted relay", () => {
    const store = new CompanionStore(createDefaultSettings("test-token"));
    store.update((snapshot) => {
      snapshot.collection.accountKey = "private-account-key";
      snapshot.session.championSelect.active = true;
      snapshot.session.championSelect.selectedChampionId = 103;
      snapshot.collection.champions = Array.from({ length: 250 }, (_, index) => ({
        id: index + 1,
        alias: `Champion${index + 1}`,
        name: `Champion with a realistic long name ${index + 1}`,
        iconPath: `/local/${index + 1}.png`,
        owned: true,
        skins: index + 1 === 103 ? [{
          id: 103001,
          championId: 103,
          name: "Owned skin",
          rarity: null,
          contentId: null,
          tilePath: "/private/tile.png",
          splashPath: null,
          owned: true,
          available: true,
          favorite: false,
          wishlisted: false,
          loot: { shardCount: 0, permanentCount: 0, essenceValue: 0, rarity: null, expiresAt: null },
          chromas: [],
        }] : [],
      }));
    });
    const mobile = remoteSnapshot(store.getSnapshot());
    const serialized = JSON.stringify(mobile);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(44 * 1024);
    expect(serialized).not.toContain("private-account-key");
    expect(serialized).not.toContain("executablePath");
    expect(serialized).not.toContain("/private/tile.png");
    expect(mobile.ownedSkins).toEqual([{ id: 103001, championId: 103, name: "Owned skin" }]);
  });
});
