import type { CompanionCommand } from "@summonerkit/contracts";
import { describe, expect, it } from "vitest";
import { isClientSurfaceCommandAllowed } from "./client-surface-policy";

describe("client surface command policy", () => {
  const matchTimeCommands: CompanionCommand[] = [
    { type: "desktop.open" },
    { type: "presence.set", availability: "away" },
    { type: "automation.setEnabled", feature: "autoAccept", enabled: true },
    { type: "profile.setChampionPriorities", profileId: "default", pickPriority: [103, 7], banPriority: [238, 157] },
    { type: "automation.confirm", pendingId: "e95f0048-7437-47c4-aa20-e630507dfe55" },
    { type: "collection.toggleFavorite", skinId: 103001 },
    { type: "aram.benchSwap", championId: 103 },
    { type: "champSelect.setRunePage", pageId: 7 },
    { type: "runes.applyRecommendation", recommendationId: "ahri-mid-combined-26.16" },
  ];
  const desktopAdministrationCommands: CompanionCommand[] = [
    { type: "automation.acknowledgeRisk" },
    { type: "automation.setMode", mode: "automatic" },
    { type: "profile.delete", profileId: "ranked" },
    { type: "integration.launch", integrationId: "rose" },
    { type: "clientTab.repair" },
    { type: "doctor.refresh" },
    { type: "remote.configure", relayUrl: "https://relay.example", mobileUrl: "https://mobile.example", adminSecret: "x".repeat(32) },
  ];

  it.each(matchTimeCommands)("allows $type in the League client", (command) => {
    expect(isClientSurfaceCommandAllowed(command)).toBe(true);
  });

  it.each(desktopAdministrationCommands)("rejects desktop-only command $type", (command) => {
    expect(isClientSurfaceCommandAllowed(command)).toBe(false);
  });
});
