import type { LeagueSessionState } from "@rose-enhanced/contracts";

export function emptyLeagueSessionState(): LeagueSessionState {
  return {
    queue: { activity: "unavailable", lobbyAvailable: false, queueId: null, searchState: null, canStart: false, canStop: false },
    readyCheck: { active: false, state: null, canAccept: false, canDecline: false },
    championSelect: {
      active: false,
      sessionId: null,
      timerPhase: null,
      timerRemainingMs: null,
      timerUpdatedAt: null,
      localPlayerCellId: null,
      localAction: null,
      myTeam: [],
      theirTeam: [],
      myTeamBans: [],
      theirTeamBans: [],
      pickableChampionIds: [],
      bannableChampionIds: [],
      selectedChampionId: null,
      selectedSkinId: null,
      spell1Id: null,
      spell2Id: null,
    },
    summonerSpells: [],
    runePages: [],
  };
}
