import type {
  ChampionSelectParticipant,
  RemoteChampionRecord,
  RemoteCompanionSnapshot,
} from "@summonerkit/contracts";

export function championName(champions: RemoteChampionRecord[], championId: number | null): string {
  if (!championId) return "Waiting";
  return champions.find((champion) => champion.id === championId)?.name ?? `Champion ${championId}`;
}

export function participantChampionId(participant: ChampionSelectParticipant): number | null {
  return participant.championId ?? participant.championPickIntent;
}

export function availableChampionIds(snapshot: RemoteCompanionSnapshot): number[] {
  const action = snapshot.session.championSelect.localAction;
  if (!action) return [];
  return action.type === "ban"
    ? snapshot.session.championSelect.bannableChampionIds
    : snapshot.session.championSelect.pickableChampionIds;
}

export function alliedIntentIds(snapshot: RemoteCompanionSnapshot): Set<number> {
  return new Set(snapshot.session.championSelect.myTeam.flatMap((member) => {
    const championId = participantChampionId(member);
    return championId ? [championId] : [];
  }));
}

export function timerSeconds(
  remainingMs: number | null,
  updatedAt: string | null,
  now = Date.now(),
): number | null {
  if (remainingMs === null) return null;
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const elapsed = Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : 0;
  return Math.max(0, Math.ceil((remainingMs - elapsed) / 1_000));
}

export function queueLabel(activity: RemoteCompanionSnapshot["session"]["queue"]["activity"]): string {
  const labels = {
    unavailable: "No lobby",
    lobby: "Lobby ready",
    searching: "Finding match",
    "ready-check": "Ready check",
    "champ-select": "Champion select",
    "in-game": "In game",
  } as const;
  return labels[activity];
}
