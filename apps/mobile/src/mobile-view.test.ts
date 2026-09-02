import type { RemoteCompanionSnapshot } from "@summonerkit/contracts";
import { describe, expect, it } from "vitest";
import { alliedIntentIds, availableChampionIds, timerSeconds } from "./mobile-view";

function snapshot(): RemoteCompanionSnapshot {
  return {
    revision: 1,
    connection: { status: "connected", phase: "ChampSelect", patch: "26.16", lastError: null },
    champions: [],
    ownedSkins: [],
    coach: {
      guidance: { status: "unavailable", source: "none", providerName: null, generatedAt: null, currentPatchCovered: null, coverage: { recommendations: 0, builds: 0, draftSignals: 0, patchImpacts: 0, champions: 0, patches: [] } },
      draftChoices: [], builds: [], items: [], patchImpacts: [],
    },
    aram: { active: false, currentChampionId: null, bench: [], favoriteChampionIds: [], availableFavoriteChampionIds: [], rerollsRemaining: null, rerollPoints: null, updatedAt: null },
    session: {
      queue: { activity: "champ-select", lobbyAvailable: true, queueId: 420, searchState: null, canStart: false, canStop: false },
      readyCheck: { active: false, state: null, canAccept: false, canDecline: false },
      championSelect: {
        active: true,
        sessionId: "one",
        timerPhase: "PLANNING",
        timerRemainingMs: 12_500,
        timerUpdatedAt: new Date(10_000).toISOString(),
        localPlayerCellId: 1,
        localAction: { id: 9, type: "ban", championId: null, completed: false, inProgress: true },
        myTeam: [{ cellId: 1, championId: null, championPickIntent: 103, assignedPosition: "MIDDLE", isLocalPlayer: true }],
        theirTeam: [],
        myTeamBans: [],
        theirTeamBans: [],
        pickableChampionIds: [22],
        bannableChampionIds: [103, 238],
        selectedChampionId: 103,
        selectedSkinId: null,
        spell1Id: 4,
        spell2Id: 14,
      },
      summonerSpells: [],
      runePages: [],
    },
  };
}

describe("mobile champion-select view helpers", () => {
  it("uses the active action availability list", () => {
    expect(availableChampionIds(snapshot())).toEqual([103, 238]);
  });

  it("marks allied champion intents", () => {
    expect(alliedIntentIds(snapshot()).has(103)).toBe(true);
  });

  it("ticks the server timer locally without going below zero", () => {
    expect(timerSeconds(12_500, new Date(10_000).toISOString(), 12_000)).toBe(11);
    expect(timerSeconds(1_000, new Date(10_000).toISOString(), 15_000)).toBe(0);
  });
});
