import type { CompanionCommand } from "@summonerkit/contracts";
import { createDefaultSettings } from "@summonerkit/core";
import { describe, expect, it, vi } from "vitest";
import { CompanionStore } from "./companion-store";
import { isRemoteCommandAllowed, probeRemoteDeployment, remoteSnapshot, validatedRelaySocketUrl } from "./remote-service";

describe("remote command allowlist", () => {
  it("verifies the deployed relay protocol, allowed origin, and mobile shell", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith("/health")
      ? Response.json({ status: "ok", service: "summonerkit-relay", protocolVersion: 1, mobileOrigin: "https://mobile.example", checkedAt: "2026-08-25T00:00:00.000Z" })
      : new Response("<!doctype html><title>SummonerKit</title>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    await expect(probeRemoteDeployment("https://relay.example", "https://mobile.example/app/", fetcher as typeof fetch)).resolves.toBeUndefined();
  });

  it("rejects a relay deployed for a different mobile origin", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "ok", service: "summonerkit-relay", protocolVersion: 1, mobileOrigin: "https://wrong.example", checkedAt: "2026-08-25T00:00:00.000Z" }));
    await expect(probeRemoteDeployment("https://relay.example", "https://mobile.example/app/", fetcher as typeof fetch)).rejects.toThrow("relay allows https://wrong.example");
  });

  it.each([
    "https://attacker.example/rooms/room-12345678/socket",
    "wss://relay.example/rooms/room-12345678/socket?token=leak",
    "wss://relay.example/rooms/room-12345678/other",
  ])("rejects an unexpected relay WebSocket endpoint %s", (candidate) => {
    expect(() => validatedRelaySocketUrl(candidate, "https://relay.example", "room-12345678")).toThrow(/unexpected WebSocket endpoint/u);
  });

  it("pins a relay WebSocket endpoint to the configured origin and room", () => {
    expect(validatedRelaySocketUrl(
      "wss://relay.example/rooms/room-12345678/socket",
      "https://relay.example/",
      "room-12345678",
    ).toString()).toBe("wss://relay.example/rooms/room-12345678/socket");
  });

  it("allows only the narrow mobile control surface", () => {
    const allowed: CompanionCommand[] = [
      { type: "automation.disableAll" },
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
      { type: "presence.set", availability: "away" },
      { type: "profile.setChampionPriorities", profileId: "default", pickPriority: [103, 7], banPriority: [238] },
      { type: "automation.acknowledgeRisk" },
      { type: "automation.setEnabled", feature: "autoAccept", enabled: true },
      { type: "integration.launch", integrationId: "rose" },
      { type: "clientTab.repair" },
      { type: "remote.configure", relayUrl: "https://relay.example", mobileUrl: "https://mobile.example", adminSecret: "x".repeat(32) },
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
      snapshot.session.championSelect.localAction = { id: 8, type: "ban", championId: null, completed: false, inProgress: true };
      snapshot.session.championSelect.bannableChampionIds = [103, 238, 7];
      snapshot.session.championSelect.myTeam = [{ cellId: 1, championId: null, championPickIntent: 103, assignedPosition: "MIDDLE", isLocalPlayer: true }];
      snapshot.profiles[0]!.banPriority = [103, 238, 7];
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
      snapshot.insights.coach.builds = [{ id: "build-103", championId: 103, role: "middle", queueId: 420, audience: "combined", patch: "26.16", itemIds: [3089, 3135], spellIds: [4, 14], sampleSize: 120, winRate: 52.5, pickRate: 30, generatedAt: "2026-08-24T00:00:00.000Z" }];
      snapshot.insights.coach.items = [{ id: 3089, name: "Rabadon's Deathcap", iconPath: "/items/3089.png" }, { id: 3135, name: "Void Staff", iconPath: "/items/3135.png" }];
    });
    const mobile = remoteSnapshot(store.getSnapshot());
    const serialized = JSON.stringify(mobile);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(44 * 1024);
    expect(serialized).not.toContain("private-account-key");
    expect(serialized).not.toContain("executablePath");
    expect(serialized).not.toContain("/private/tile.png");
    expect(mobile.ownedSkins).toEqual([{ id: 103001, championId: 103, name: "Owned skin" }]);
    expect(mobile.coach.builds).toHaveLength(1);
    expect(mobile.coach.items.map((item) => item.name)).toEqual(["Rabadon's Deathcap", "Void Staff"]);
    expect(mobile.coach.draftChoices.map((choice) => choice.championId)).toEqual([238, 7]);
  });
});
