import type {
  BuildObservation,
  CohortPlayer,
  PlatformRoute,
  ProRosterEntry,
  RecommendationRole,
} from "./models.js";
import { regionalRouteFor, RiotApiClient } from "./riot-client.js";

interface LeagueList { entries?: Array<{ puuid?: unknown; summonerId?: unknown }> }
interface SummonerRecord { puuid?: unknown }
interface MatchDocument {
  metadata?: { matchId?: unknown };
  info?: {
    queueId?: unknown;
    gameVersion?: unknown;
    participants?: Array<{
      puuid?: unknown;
      championId?: unknown;
      teamPosition?: unknown;
      individualPosition?: unknown;
      win?: unknown;
      summoner1Id?: unknown;
      summoner2Id?: unknown;
      item0?: unknown;
      item1?: unknown;
      item2?: unknown;
      item3?: unknown;
      item4?: unknown;
      item5?: unknown;
      item6?: unknown;
      teamId?: unknown;
      perks?: {
        styles?: Array<{ style?: unknown; selections?: Array<{ perk?: unknown }> }>;
        statPerks?: { offense?: unknown; flex?: unknown; defense?: unknown };
      };
    }>;
  };
}

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

function roleFor(value: unknown, queueId: number): RecommendationRole | null {
  if (queueId === 450) return "aram";
  const position = text(value)?.toUpperCase();
  if (position === "TOP") return "top";
  if (position === "JUNGLE") return "jungle";
  if (position === "MIDDLE" || position === "MID") return "middle";
  if (position === "BOTTOM" || position === "ADC") return "bottom";
  if (position === "UTILITY" || position === "SUPPORT") return "utility";
  return null;
}

function patchFor(version: unknown): string | null {
  const match = text(version)?.match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : null;
}

function toObservation(match: MatchDocument, player: CohortPlayer): BuildObservation | null {
  const queueId = integer(match.info?.queueId);
  const matchId = text(match.metadata?.matchId);
  const patch = patchFor(match.info?.gameVersion);
  const participant = match.info?.participants?.find((entry) => text(entry.puuid) === player.puuid);
  const championId = integer(participant?.championId);
  const role = roleFor(participant?.teamPosition ?? participant?.individualPosition, queueId ?? 0);
  const styles = participant?.perks?.styles ?? [];
  const primaryStyleId = integer(styles[0]?.style);
  const subStyleId = integer(styles[1]?.style);
  const statPerks = participant?.perks?.statPerks;
  const selectedPerkIds = [
    ...styles.flatMap((style) => style.selections?.flatMap((selection) => integer(selection.perk) ?? []) ?? []),
    integer(statPerks?.offense), integer(statPerks?.flex), integer(statPerks?.defense),
  ].filter((id): id is number => id !== null);
  const itemIds = [participant?.item0, participant?.item1, participant?.item2, participant?.item3, participant?.item4, participant?.item5, participant?.item6]
    .flatMap((id) => integer(id) ?? [])
    .filter((id) => id !== 3340)
    .slice(0, 6);
  const spellIds = [integer(participant?.summoner1Id), integer(participant?.summoner2Id)].filter((id): id is number => id !== null);
  const teamId = integer(participant?.teamId);
  const allyChampionIds = match.info?.participants
    ?.filter((entry) => integer(entry.teamId) === teamId && text(entry.puuid) !== player.puuid)
    .flatMap((entry) => integer(entry.championId) ?? []) ?? [];
  const enemyChampionIds = match.info?.participants
    ?.filter((entry) => teamId !== null && integer(entry.teamId) !== teamId)
    .flatMap((entry) => integer(entry.championId) ?? []) ?? [];
  if (!participant || !matchId || !queueId || !patch || !championId || !role || !primaryStyleId || !subStyleId || selectedPerkIds.length !== 9) return null;
  return {
    sampleKey: `${matchId}:${player.puuid}`,
    championId, role, queueId, patch, audience: player.audience,
    primaryStyleId, subStyleId, selectedPerkIds, itemIds, spellIds,
    allyChampionIds, enemyChampionIds, won: participant.win === true,
  };
}

export async function highEloCohort(
  client: RiotApiClient,
  platforms: PlatformRoute[],
  maximumPlayersPerPlatform: number,
): Promise<CohortPlayer[]> {
  const players: CohortPlayer[] = [];
  for (const platform of platforms) {
    // Keep discovery sequential so a conservative personal-key interval can be
    // honored without a separate distributed rate limiter.
    const lists: LeagueList[] = [];
    for (const tier of ["challenger", "grandmaster", "master"]) {
      lists.push(await client.platform<LeagueList>(platform, `/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`));
    }
    const entries = lists.flatMap((list) => list.entries ?? []);
    const unique = new Map<string, CohortPlayer>();
    for (const entry of entries) {
      if (unique.size >= maximumPlayersPerPlatform) break;
      let puuid = text(entry.puuid);
      const summonerId = text(entry.summonerId);
      if (!puuid && summonerId) {
        const summoner = await client.platform<SummonerRecord>(platform, `/lol/summoner/v4/summoners/${encodeURIComponent(summonerId)}`);
        puuid = text(summoner.puuid);
      }
      if (puuid) unique.set(puuid, { puuid, regionalRoute: regionalRouteFor(platform), audience: "high-elo" });
    }
    players.push(...unique.values());
  }
  return players;
}

export function proCohort(roster: ProRosterEntry[]): CohortPlayer[] {
  return roster.map((player) => ({ ...player, audience: "pro" }));
}

export async function collectBuildObservations(
  client: RiotApiClient,
  cohort: CohortPlayer[],
  matchesPerPlayer: number,
  earliestEpochSeconds: number,
): Promise<BuildObservation[]> {
  const playersByMatch = new Map<string, CohortPlayer[]>();
  for (const player of cohort) {
    const query = new URLSearchParams({ queue: "420", startTime: String(earliestEpochSeconds), start: "0", count: String(matchesPerPlayer) });
    const ids = await client.regional<string[]>(player.regionalRoute, `/lol/match/v5/matches/by-puuid/${encodeURIComponent(player.puuid)}/ids?${query}`);
    for (const id of ids) playersByMatch.set(id, [...(playersByMatch.get(id) ?? []), player]);
  }
  const observations: BuildObservation[] = [];
  for (const [matchId, players] of playersByMatch) {
    const match = await client.regional<MatchDocument>(players[0]!.regionalRoute, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
    for (const player of players) {
      const sample = toObservation(match, player);
      if (sample) observations.push(sample);
    }
  }
  return observations;
}
