import { createHash } from "node:crypto";
import type {
  ChampionPerformanceRecord,
  ChampionPerformanceSnapshot,
  CoachItemRecord,
  CoachSnapshot,
  GuidanceFeedHealth,
  PerformanceMatchRecord,
  RuneRecommendation,
  RuneRecommendationRole,
  RuneRecommendationsSnapshot,
  RunePerkRecord,
} from "@summonerkit/contracts";
import { createPerformanceReportCard } from "@summonerkit/core";
import { z } from "zod";
import type { CompanionStore } from "./companion-store";
import { InsightsCache } from "./insights-cache";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";
import { RunePageService } from "./rune-page-service";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_RECOMMENDATIONS = 5_000;
const MAX_BUILD_RECOMMENDATIONS = 5_000;
const MAX_DRAFT_SIGNALS = 2_000;
const MAX_PATCH_IMPACTS = 500;
const PERFORMANCE_WINDOW = 100;
const PERFORMANCE_PAGE_SIZE = 20;
const DEFAULT_RUNE_FEED_URL = "https://mohamedmagdy2208.github.io/SummonerKit/data/runes-v1.json";

const recommendationSchema = z.object({
  id: z.string().trim().min(1).max(160),
  championId: z.number().int().positive(),
  role: z.enum(["top", "jungle", "middle", "bottom", "utility", "aram"]),
  queueId: z.number().int().nonnegative(),
  audience: z.enum(["high-elo", "pro", "combined"]),
  patch: z.string().trim().min(1).max(24),
  primaryStyleId: z.number().int().positive(),
  subStyleId: z.number().int().positive(),
  selectedPerkIds: z.array(z.number().int().positive()).length(9),
  sampleSize: z.number().int().positive(),
  winRate: z.number().min(0).max(100),
  pickRate: z.number().min(0).max(100),
  generatedAt: z.string().datetime(),
}).strict();

const buildRecommendationSchema = z.object({
  id: z.string().trim().min(1).max(180),
  championId: z.number().int().positive(),
  role: z.enum(["top", "jungle", "middle", "bottom", "utility", "aram"]),
  queueId: z.number().int().nonnegative(),
  audience: z.enum(["high-elo", "pro", "combined"]),
  patch: z.string().trim().min(1).max(24),
  itemIds: z.array(z.number().int().positive()).min(2).max(6),
  spellIds: z.array(z.number().int().positive()).length(2),
  sampleSize: z.number().int().positive(),
  winRate: z.number().min(0).max(100),
  pickRate: z.number().min(0).max(100),
  generatedAt: z.string().datetime(),
}).strict();

const draftSignalSchema = z.object({
  id: z.string().trim().min(1).max(180),
  championId: z.number().int().positive(),
  role: z.enum(["top", "jungle", "middle", "bottom", "utility", "aram"]),
  queueId: z.number().int().nonnegative(),
  audience: z.enum(["high-elo", "pro", "combined"]),
  patch: z.string().trim().min(1).max(24),
  sampleSize: z.number().int().positive(),
  winRate: z.number().min(0).max(100),
  synergyChampionIds: z.array(z.number().int().positive()).max(8),
  toughMatchupChampionIds: z.array(z.number().int().positive()).max(8),
  generatedAt: z.string().datetime(),
}).strict();

const patchImpactSchema = z.object({
  id: z.string().trim().min(1).max(180),
  patch: z.string().trim().min(1).max(24),
  championId: z.number().int().positive().nullable(),
  category: z.enum(["buff", "nerf", "adjustment", "item", "rune", "system"]),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(360),
  sourceUrl: z.string().url().max(2_048).nullable(),
}).strict();

const feedPublicationSchema = z.object({
  generatedAt: z.string().datetime(),
  observationCount: z.number().int().nonnegative(),
  cohortSize: z.number().int().nonnegative(),
  platforms: z.array(z.string().trim().min(2).max(8)).max(32),
  lookbackDays: z.number().int().min(1).max(30),
  patches: z.array(z.string().trim().min(1).max(24)).max(32),
}).strict();

const recommendationFeedSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  providerName: z.string().trim().min(1).max(80),
  publication: feedPublicationSchema.optional(),
  recommendations: z.array(recommendationSchema).max(MAX_RECOMMENDATIONS),
  builds: z.array(buildRecommendationSchema).max(MAX_BUILD_RECOMMENDATIONS).default([]),
  draftSignals: z.array(draftSignalSchema).max(MAX_DRAFT_SIGNALS).default([]),
  patchImpacts: z.array(patchImpactSchema).max(MAX_PATCH_IMPACTS).default([]),
}).strict();

interface RuneFeedConfiguration {
  url: string;
  token: string | null;
}

type InsightsCachePort = Pick<InsightsCache, "loadRunes" | "saveRunes" | "loadCoach" | "saveCoach" | "loadPerformance" | "savePerformance">;

interface RawCurrentSummoner {
  puuid?: unknown;
  summonerId?: unknown;
}

interface RawPerk {
  id?: unknown;
  name?: unknown;
  iconPath?: unknown;
}

interface RawItem {
  id?: unknown;
  name?: unknown;
  iconPath?: unknown;
}

interface RawParticipantIdentity {
  participantId?: unknown;
  player?: { puuid?: unknown; summonerId?: unknown };
}

interface RawParticipant {
  participantId?: unknown;
  puuid?: unknown;
  summonerId?: unknown;
  championId?: unknown;
  teamId?: unknown;
  teamPosition?: unknown;
  individualPosition?: unknown;
  timeline?: { lane?: unknown; role?: unknown };
  stats?: Record<string, unknown>;
}

interface RawGame {
  gameId?: unknown;
  gameCreation?: unknown;
  gameDuration?: unknown;
  queueId?: unknown;
  participants?: unknown;
  participantIdentities?: unknown;
}

interface PerformanceObservation {
  championId: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  farm: number;
  minutes: number;
  killParticipation: number;
  damagePerMinute: number;
  visionPerMinute: number;
  score: number;
  queueId: number | null;
  role: RuneRecommendationRole;
  playedAt: string | null;
}

interface PerformanceAccumulator {
  championId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  farm: number;
  minutes: number;
  killParticipation: number;
  damagePerMinute: number;
  visionPerMinute: number;
  score: number;
  lastPlayedAt: string | null;
}

interface PerformanceTotals {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  farm: number;
  minutes: number;
  score: number;
}

type LocalIdentity = { puuid: string | null; summonerId: string | null };

function asText(candidate: unknown): string | null {
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return String(candidate);
  return null;
}

function nonNegative(candidate: unknown): number {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
}

function positiveInteger(candidate: unknown): number | null {
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function runePerks(candidate: unknown): RunePerkRecord[] {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as RawPerk;
    const id = positiveInteger(raw.id);
    const name = asText(raw.name);
    const iconPath = asText(raw.iconPath);
    return id && name ? [{ id, name: name.slice(0, 80), iconPath: iconPath?.slice(0, 1_024) ?? null }] : [];
  }).slice(0, 1_000);
}

function coachItems(candidate: unknown): CoachItemRecord[] {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as RawItem;
    const id = positiveInteger(raw.id);
    const name = asText(raw.name);
    const iconPath = asText(raw.iconPath);
    return id && name ? [{ id, name: name.slice(0, 100), iconPath: iconPath?.slice(0, 1_024) ?? null }] : [];
  }).slice(0, 5_000);
}

function rounded(candidate: number, digits = 1): number {
  if (!Number.isFinite(candidate)) return 0;
  const scale = 10 ** digits;
  return Math.round(candidate * scale) / scale;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roleFor(participant: RawParticipant): RuneRecommendationRole {
  const position = asText(participant.teamPosition)?.toUpperCase()
    ?? asText(participant.individualPosition)?.toUpperCase()
    ?? asText(participant.timeline?.lane)?.toUpperCase()
    ?? "";
  const legacyRole = asText(participant.timeline?.role)?.toUpperCase() ?? "";
  if (position === "JUNGLE") return "jungle";
  if (position === "MIDDLE" || position === "MID") return "middle";
  if (position === "BOTTOM" && legacyRole === "DUO_SUPPORT") return "utility";
  if (position === "UTILITY" || position === "SUPPORT") return "utility";
  if (position === "BOTTOM" || position === "ADC") return "bottom";
  return "top";
}

export function performanceScore(input: {
  role: RuneRecommendationRole;
  kda: number;
  farmPerMinute: number;
  damagePerMinute: number;
  visionPerMinute: number;
}): number {
  const targets = input.role === "utility"
    ? { farm: 1.8, damage: 450, vision: 2.0 }
    : input.role === "jungle"
      ? { farm: 6.5, damage: 650, vision: 1.1 }
      : { farm: 8, damage: 750, vision: 0.85 };
  const capped = (value: number, target: number) => Math.min(1, Math.max(0, ratio(value, target)));
  return Math.round(
    capped(input.kda, 5) * 40
    + capped(input.farmPerMinute, targets.farm) * 25
    + capped(input.damagePerMinute, targets.damage) * 20
    + capped(input.visionPerMinute, targets.vision) * 15,
  );
}

function historyGames(candidate: unknown): RawGame[] {
  if (!candidate || typeof candidate !== "object") return [];
  const root = candidate as { games?: unknown };
  const nested = root.games && typeof root.games === "object" && !Array.isArray(root.games)
    ? (root.games as { games?: unknown }).games
    : root.games;
  return Array.isArray(nested)
    ? nested.filter((game): game is RawGame => Boolean(game && typeof game === "object"))
    : [];
}

function rawParticipants(candidate: unknown): RawParticipant[] {
  return Array.isArray(candidate)
    ? candidate.filter((entry): entry is RawParticipant => Boolean(entry && typeof entry === "object"))
    : [];
}

function localParticipant(game: RawGame, identity: LocalIdentity): RawParticipant | null {
  const participants = rawParticipants(game.participants);
  const direct = participants.find((participant) =>
    (identity.puuid && asText(participant.puuid) === identity.puuid)
    || (identity.summonerId && asText(participant.summonerId) === identity.summonerId),
  );
  if (direct) return direct;
  if (!Array.isArray(game.participantIdentities)) return null;
  const participantIdentity = game.participantIdentities
    .filter((entry): entry is RawParticipantIdentity => Boolean(entry && typeof entry === "object"))
    .find((entry) =>
      (identity.puuid && asText(entry.player?.puuid) === identity.puuid)
      || (identity.summonerId && asText(entry.player?.summonerId) === identity.summonerId),
    );
  const participantId = positiveInteger(participantIdentity?.participantId);
  return participantId ? participants.find((participant) => positiveInteger(participant.participantId) === participantId) ?? null : null;
}

function matchMinutes(game: RawGame): number {
  const duration = nonNegative(game.gameDuration);
  return (duration > 100_000 ? duration / 1_000 : duration) / 60;
}

function matchPlayedAt(game: RawGame): string | null {
  const creation = nonNegative(game.gameCreation);
  const timestamp = creation > 0 && creation < 10_000_000_000 ? creation * 1_000 : creation;
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function teamKillCount(game: RawGame, participant: RawParticipant): number {
  const teamId = positiveInteger(participant.teamId);
  return teamId
    ? rawParticipants(game.participants)
      .filter((member) => positiveInteger(member.teamId) === teamId)
      .reduce((total, member) => total + nonNegative(member.stats?.kills), 0)
    : 0;
}

function observation(game: RawGame, identity: LocalIdentity): PerformanceObservation | null {
  const participant = localParticipant(game, identity);
  const stats = participant?.stats;
  const championId = positiveInteger(participant?.championId);
  const minutes = matchMinutes(game);
  if (!participant || !stats || !championId || minutes < 5) return null;
  const kills = nonNegative(stats.kills);
  const deaths = nonNegative(stats.deaths);
  const assists = nonNegative(stats.assists);
  const farm = nonNegative(stats.totalMinionsKilled) + nonNegative(stats.neutralMinionsKilled);
  const damagePerMinute = ratio(nonNegative(stats.totalDamageDealtToChampions), minutes);
  const visionPerMinute = ratio(nonNegative(stats.visionScore), minutes);
  const kda = ratio(kills + assists, Math.max(1, deaths));
  const role = roleFor(participant);
  return {
    championId,
    won: stats.win === true || stats.win === "Win" || stats.win === 1,
    kills,
    deaths,
    assists,
    farm,
    minutes,
    killParticipation: ratio(kills + assists, teamKillCount(game, participant)) * 100,
    damagePerMinute,
    visionPerMinute,
    score: performanceScore({ role, kda, farmPerMinute: ratio(farm, minutes), damagePerMinute, visionPerMinute }),
    queueId: positiveInteger(game.queueId),
    role,
    playedAt: matchPlayedAt(game),
  };
}

function performanceMatch(
  game: RawGame,
  result: PerformanceObservation,
  index: number,
): PerformanceMatchRecord {
  const fingerprint = [asText(game.gameId), result.playedAt, result.championId, index].join(":");
  const kda = rounded(ratio(result.kills + result.assists, Math.max(1, result.deaths)), 2);
  const farmPerMinute = rounded(ratio(result.farm, result.minutes), 2);
  const killParticipation = rounded(result.killParticipation);
  const damagePerMinute = rounded(result.damagePerMinute);
  const visionPerMinute = rounded(result.visionPerMinute, 2);
  return {
    id: createHash("sha256").update(fingerprint).digest("hex").slice(0, 20),
    championId: result.championId,
    queueId: result.queueId,
    role: result.role,
    won: result.won,
    kills: result.kills,
    deaths: result.deaths,
    assists: result.assists,
    kda,
    farm: Math.round(result.farm),
    farmPerMinute,
    killParticipation,
    damagePerMinute,
    visionPerMinute,
    overallScore: result.score,
    reportCard: createPerformanceReportCard({ role: result.role, kda, farmPerMinute, killParticipation, damagePerMinute, visionPerMinute, overallScore: result.score }),
    durationMinutes: rounded(result.minutes, 1),
    playedAt: result.playedAt,
  };
}

function emptyAccumulator(championId: number): PerformanceAccumulator {
  return { championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, farm: 0, minutes: 0, killParticipation: 0, damagePerMinute: 0, visionPerMinute: 0, score: 0, lastPlayedAt: null };
}

function addObservation(accumulator: PerformanceAccumulator, game: PerformanceObservation): void {
  accumulator.games += 1;
  accumulator.wins += game.won ? 1 : 0;
  accumulator.kills += game.kills;
  accumulator.deaths += game.deaths;
  accumulator.assists += game.assists;
  accumulator.farm += game.farm;
  accumulator.minutes += game.minutes;
  accumulator.killParticipation += game.killParticipation;
  accumulator.damagePerMinute += game.damagePerMinute;
  accumulator.visionPerMinute += game.visionPerMinute;
  accumulator.score += game.score;
  if (!accumulator.lastPlayedAt || (game.playedAt && game.playedAt > accumulator.lastPlayedAt)) accumulator.lastPlayedAt = game.playedAt;
}

function performanceRecord(entry: PerformanceAccumulator): ChampionPerformanceRecord {
  return {
    championId: entry.championId,
    games: entry.games,
    wins: entry.wins,
    losses: entry.games - entry.wins,
    winRate: rounded(ratio(entry.wins, entry.games) * 100),
    kills: entry.kills,
    deaths: entry.deaths,
    assists: entry.assists,
    averageKills: rounded(ratio(entry.kills, entry.games)),
    averageDeaths: rounded(ratio(entry.deaths, entry.games)),
    averageAssists: rounded(ratio(entry.assists, entry.games)),
    kda: rounded(ratio(entry.kills + entry.assists, Math.max(1, entry.deaths)), 2),
    totalFarm: Math.round(entry.farm),
    farmPerMinute: rounded(ratio(entry.farm, entry.minutes), 2),
    killParticipation: rounded(ratio(entry.killParticipation, entry.games)),
    damagePerMinute: rounded(ratio(entry.damagePerMinute, entry.games)),
    visionPerMinute: rounded(ratio(entry.visionPerMinute, entry.games), 2),
    overallScore: Math.round(ratio(entry.score, entry.games)),
    lastPlayedAt: entry.lastPlayedAt,
  };
}

function performanceTotals(entries: PerformanceAccumulator[]): PerformanceTotals {
  return entries.reduce((summary, entry) => ({
    games: summary.games + entry.games,
    wins: summary.wins + entry.wins,
    kills: summary.kills + entry.kills,
    deaths: summary.deaths + entry.deaths,
    assists: summary.assists + entry.assists,
    farm: summary.farm + entry.farm,
    minutes: summary.minutes + entry.minutes,
    score: summary.score + entry.score,
  }), { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, farm: 0, minutes: 0, score: 0 });
}

function summarizedPerformance(totals: PerformanceTotals, championsPlayed: number) {
  return {
    games: totals.games,
    championsPlayed,
    winRate: rounded(ratio(totals.wins, totals.games) * 100),
    kda: rounded(ratio(totals.kills + totals.assists, Math.max(1, totals.deaths)), 2),
    farmPerMinute: rounded(ratio(totals.farm, totals.minutes), 2),
    overallScore: Math.round(ratio(totals.score, totals.games)),
  };
}

export function aggregatePerformance(
  history: unknown,
  identity: LocalIdentity,
  updatedAt = new Date().toISOString(),
): ChampionPerformanceSnapshot {
  const observations = historyGames(history).flatMap((game, index) => {
    const result = observation(game, identity);
    return result ? [{ game, index, result }] : [];
  });
  const aggregate = new Map<number, PerformanceAccumulator>();
  for (const { result } of observations) {
    const accumulator = aggregate.get(result.championId) ?? emptyAccumulator(result.championId);
    addObservation(accumulator, result);
    aggregate.set(result.championId, accumulator);
  }
  const entries = [...aggregate.values()];
  const champions = entries.map(performanceRecord)
    .sort((left, right) => right.games - left.games || right.overallScore - left.overallScore);
  return {
    status: "ready",
    source: "live",
    stale: false,
    matchesAnalyzed: observations.length,
    windowLabel: `Most recent ${PERFORMANCE_WINDOW} matches available in this client`,
    updatedAt,
    summary: summarizedPerformance(performanceTotals(entries), champions.length),
    champions,
    matches: observations
      .map(({ game, index, result }) => performanceMatch(game, result, index))
      .sort((left, right) => (Date.parse(right.playedAt ?? "") || 0) - (Date.parse(left.playedAt ?? "") || 0)),
    warnings: observations.length === 0 ? ["No eligible completed matches were found in the local history window."] : [],
  };
}

export function runeFeedConfiguration(environment: NodeJS.ProcessEnv): RuneFeedConfiguration {
  const candidate = environment.SUMMONERKIT_BUILD_DATA_URL?.trim() || DEFAULT_RUNE_FEED_URL;
  const url = new URL(candidate);
  const localDevelopment = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localDevelopment)) {
    throw new Error("The rune data feed must use HTTPS, except for local development.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The rune data feed URL contains unsupported credentials, query parameters, or fragments.");
  }
  return { url: url.toString(), token: environment.SUMMONERKIT_BUILD_DATA_TOKEN?.trim() || null };
}

function publicFeedEndpoint(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

async function fetchRuneFeed(configuration: RuneFeedConfiguration): Promise<z.infer<typeof recommendationFeedSchema>> {
  const response = await fetch(configuration.url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(configuration.token ? { Authorization: `Bearer ${configuration.token}` } : {}),
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Rune data provider returned HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FEED_BYTES) throw new Error("Rune data feed exceeded the safety limit.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_FEED_BYTES) throw new Error("Rune data feed exceeded the safety limit.");
  const parsed = recommendationFeedSchema.safeParse(JSON.parse(text) as unknown);
  if (!parsed.success) throw new Error("Rune data provider returned an unsupported schema.");
  return parsed.data;
}

function distinctRecommendations(recommendations: RuneRecommendation[]): RuneRecommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    if (seen.has(recommendation.id)) return false;
    seen.add(recommendation.id);
    return true;
  });
}

function recommendationWarnings(recommendations: RuneRecommendation[], patch: string | null): string[] {
  const currentPatch = patch?.match(/^\d+\.\d+/u)?.[0] ?? null;
  const hasCurrentPatch = !currentPatch || recommendations.some((recommendation) => recommendation.patch.startsWith(currentPatch));
  const newest = recommendations.reduce((latest, recommendation) => Math.max(latest, Date.parse(recommendation.generatedAt)), 0);
  const warnings: string[] = [];
  if (!hasCurrentPatch) warnings.push(`The provider has no recommendation sample for client patch ${currentPatch}.`);
  if (newest > 0 && Date.now() - newest > 21 * 86_400_000) warnings.push("The newest online recommendation is more than 21 days old.");
  return warnings;
}

function newestTimestamp(values: Array<{ generatedAt: string }>): string | null {
  const newest = values.reduce((latest, value) => Math.max(latest, Date.parse(value.generatedAt) || 0), 0);
  return newest > 0 ? new Date(newest).toISOString() : null;
}

interface GuidanceHealthInput {
  configuration: RuneFeedConfiguration;
  feed: z.infer<typeof recommendationFeedSchema>;
  recommendations: RuneRecommendation[];
  patch: string | null;
  warnings: string[];
}

function onlineGuidanceHealth(input: GuidanceHealthInput): GuidanceFeedHealth {
  const { configuration, feed, recommendations, patch, warnings } = input;
  const currentPatch = patch?.match(/^\d+\.\d+/u)?.[0] ?? null;
  const patches = [...new Set([
    ...(feed.publication?.patches ?? []),
    ...recommendations.map((entry) => entry.patch),
    ...feed.builds.map((entry) => entry.patch),
    ...feed.draftSignals.map((entry) => entry.patch),
  ])].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  const currentPatchCovered = currentPatch
    ? patches.some((entry) => entry.startsWith(currentPatch))
    : null;
  const championIds = new Set([
    ...recommendations.map((entry) => entry.championId),
    ...feed.builds.map((entry) => entry.championId),
    ...feed.draftSignals.map((entry) => entry.championId),
  ]);
  return {
    status: warnings.length > 0 || recommendations.length === 0 || feed.builds.length === 0 || feed.draftSignals.length === 0
      ? "degraded"
      : "healthy",
    source: "online",
    endpoint: publicFeedEndpoint(configuration.url),
    schemaVersion: feed.schemaVersion,
    providerName: feed.providerName,
    checkedAt: new Date().toISOString(),
    generatedAt: feed.publication?.generatedAt
      ?? newestTimestamp([...recommendations, ...feed.builds, ...feed.draftSignals]),
    currentPatch,
    currentPatchCovered,
    observationCount: feed.publication?.observationCount ?? null,
    cohortSize: feed.publication?.cohortSize ?? null,
    lookbackDays: feed.publication?.lookbackDays ?? null,
    coverage: {
      recommendations: recommendations.length,
      builds: feed.builds.length,
      draftSignals: feed.draftSignals.length,
      patchImpacts: feed.patchImpacts.length,
      champions: championIds.size,
      patches,
    },
    lastError: null,
  };
}

async function onlineRecommendations(configuration: RuneFeedConfiguration, patch: string | null): Promise<{ guidance: GuidanceFeedHealth; runes: RuneRecommendationsSnapshot; coach: CoachSnapshot }> {
  const feed = await fetchRuneFeed(configuration);
  const recommendations = distinctRecommendations(feed.recommendations);
  const warnings = recommendationWarnings(recommendations, patch);
  const updatedAt = new Date().toISOString();
  const coachWarnings = [
    ...(feed.builds.length === 0 ? ["The provider has no build samples yet."] : []),
    ...(feed.draftSignals.length === 0 ? ["The provider has no draft evidence yet."] : []),
  ];
  return {
    guidance: onlineGuidanceHealth({ configuration, feed, recommendations, patch, warnings: [...warnings, ...coachWarnings] }),
    runes: {
      status: "ready",
      source: "online",
      stale: warnings.length > 0,
      providerName: feed.providerName,
      updatedAt,
      recommendations,
      perks: [],
      warnings,
    },
    coach: {
      status: "ready",
      source: "online",
      stale: warnings.length > 0,
      providerName: feed.providerName,
      updatedAt,
      builds: feed.builds,
      draftSignals: feed.draftSignals,
      patchImpacts: feed.patchImpacts,
      items: [],
      warnings: [...warnings, ...coachWarnings],
    },
  };
}

export class InsightsService {
  private readonly cache: InsightsCachePort;
  private readonly runePages: RunePageService;
  private endOfGameTimer: NodeJS.Timeout | null = null;
  private refreshingRunes = false;
  private refreshingPerformance = false;

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly logger: AppLogger,
    cache?: InsightsCachePort,
  ) {
    this.cache = cache ?? new InsightsCache(logger);
    this.runePages = new RunePageService(lcu);
  }

  async start(): Promise<void> {
    this.lcu.on("connected", this.onConnected);
    this.lcu.on("event", this.onEvent);
    const [cachedRunes, cachedCoach] = await Promise.all([this.cache.loadRunes(), this.cache.loadCoach()]);
    if (cachedRunes || cachedCoach) {
      this.store.update((snapshot) => {
        if (cachedRunes) snapshot.insights.runes = cachedRunes;
        if (cachedCoach) snapshot.insights.coach = cachedCoach;
        const runes = cachedRunes?.recommendations ?? [];
        const builds = cachedCoach?.builds ?? [];
        const draftSignals = cachedCoach?.draftSignals ?? [];
        const patches = [...new Set([
          ...runes.map((entry) => entry.patch),
          ...builds.map((entry) => entry.patch),
          ...draftSignals.map((entry) => entry.patch),
        ])].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
        snapshot.insights.guidance = {
          ...snapshot.insights.guidance,
          status: "degraded",
          source: "cache",
          providerName: cachedRunes?.providerName ?? cachedCoach?.providerName ?? null,
          generatedAt: newestTimestamp([...runes, ...builds, ...draftSignals]),
          coverage: {
            recommendations: runes.length,
            builds: builds.length,
            draftSignals: draftSignals.length,
            patchImpacts: cachedCoach?.patchImpacts.length ?? 0,
            champions: new Set([
              ...runes.map((entry) => entry.championId),
              ...builds.map((entry) => entry.championId),
              ...draftSignals.map((entry) => entry.championId),
            ]).size,
            patches,
          },
        };
      });
    }
    void this.refreshRunes();
  }

  stop(): void {
    this.lcu.off("connected", this.onConnected);
    this.lcu.off("event", this.onEvent);
    if (this.endOfGameTimer) clearTimeout(this.endOfGameTimer);
    this.endOfGameTimer = null;
  }

  async refreshRunes(): Promise<void> {
    if (this.refreshingRunes) return;
    let configuration: RuneFeedConfiguration;
    try {
      configuration = runeFeedConfiguration(process.env);
    } catch (error) {
      this.publishRuneFailure(error, null);
      return;
    }
    await this.refreshOnlineRunes(configuration);
  }

  private async refreshOnlineRunes(configuration: RuneFeedConfiguration): Promise<void> {
    this.refreshingRunes = true;
    this.store.update((snapshot) => {
      snapshot.insights.runes.status = "loading";
      snapshot.insights.guidance = {
        ...snapshot.insights.guidance,
        status: "checking",
        endpoint: publicFeedEndpoint(configuration.url),
        checkedAt: new Date().toISOString(),
        currentPatch: this.lcu.getState().patch?.match(/^\d+\.\d+/u)?.[0] ?? null,
        lastError: null,
      };
    });
    try {
      const online = await onlineRecommendations(configuration, this.lcu.getState().patch);
      const current = this.store.getSnapshot().insights;
      online.runes.perks = current.runes.perks;
      online.coach.items = current.coach.items;
      this.store.update((snapshot) => {
        snapshot.insights.guidance = online.guidance;
        snapshot.insights.runes = online.runes;
        snapshot.insights.coach = online.coach;
      });
      await this.cache.saveRunes(online.runes);
      await this.cache.saveCoach(online.coach);
    } catch (error) {
      this.publishRuneFailure(error, configuration);
    } finally {
      this.refreshingRunes = false;
    }
  }

  async refreshPerformance(): Promise<void> {
    if (this.refreshingPerformance) return;
    if (!this.lcu.isConnected()) {
      this.publishDisconnectedPerformance();
      return;
    }
    this.refreshingPerformance = true;
    this.store.update((snapshot) => { snapshot.insights.performance.status = "loading"; });
    try {
      await this.updatePerformance();
    } catch (error) {
      this.publishPerformanceFailure(error);
    } finally {
      this.refreshingPerformance = false;
    }
  }

  async applyRecommendation(recommendationId: string): Promise<void> {
    if (!this.lcu.isConnected()) throw new Error("Connect to League before applying a rune recommendation.");
    const snapshot = this.store.getSnapshot();
    const recommendation = snapshot.insights.runes.recommendations.find((entry) => entry.id === recommendationId);
    if (!recommendation) throw new Error("That rune recommendation is no longer available.");
    const championName = snapshot.collection.champions.find((champion) => champion.id === recommendation.championId)?.name
      ?? `Champion ${recommendation.championId}`;
    await this.runePages.apply(`${championName} ${recommendation.role}`, recommendation);
  }

  private readonly onConnected = (): void => {
    void this.refreshPerformance();
    void this.refreshRuneCatalog();
  };
  private readonly onEvent = (event: LcuEvent): void => {
    if (event.uri !== "/lol-gameflow/v1/gameflow-phase" || (event.data !== "EndOfGame" && event.data !== "WaitingForStats")) return;
    if (this.endOfGameTimer) clearTimeout(this.endOfGameTimer);
    this.endOfGameTimer = setTimeout(() => void this.refreshPerformance(), 8_000);
  };

  private publishRuneFailure(error: unknown, configuration: RuneFeedConfiguration | null): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn("Rune recommendation refresh failed", { error: message });
    this.store.update((snapshot) => {
      const current = snapshot.insights.runes;
      snapshot.insights.runes = current.recommendations.length > 0
        ? { ...current, status: "ready", stale: true, warnings: [...new Set([...current.warnings, message])] }
        : { ...current, status: "error", source: "none", stale: false, warnings: [message] };
      const coach = snapshot.insights.coach;
      snapshot.insights.coach = coach.builds.length > 0 || coach.draftSignals.length > 0
        ? { ...coach, status: "ready", stale: true, warnings: [...new Set([...coach.warnings, message])] }
        : { ...coach, status: "error", source: "none", stale: false, warnings: [message] };
      const hasCachedGuidance = current.recommendations.length > 0 || coach.builds.length > 0 || coach.draftSignals.length > 0;
      snapshot.insights.guidance = {
        ...snapshot.insights.guidance,
        status: hasCachedGuidance ? "degraded" : "unavailable",
        source: hasCachedGuidance ? "cache" : "none",
        endpoint: configuration ? publicFeedEndpoint(configuration.url) : snapshot.insights.guidance.endpoint,
        checkedAt: new Date().toISOString(),
        currentPatch: this.lcu.getState().patch?.match(/^\d+\.\d+/u)?.[0] ?? null,
        lastError: message,
      };
    });
  }

  private publishDisconnectedPerformance(): void {
    this.store.update((snapshot) => {
      const current = snapshot.insights.performance;
      if (current.champions.length === 0) {
        snapshot.insights.performance = { ...current, status: "unavailable", warnings: ["Connect to League to read your recent match history."] };
      }
    });
  }

  private async currentAccount(): Promise<{ identity: LocalIdentity; accountKey: string }> {
    const summoner = await this.lcu.get<RawCurrentSummoner>("/lol-summoner/v1/current-summoner");
    const identity = { puuid: asText(summoner.puuid), summonerId: asText(summoner.summonerId) };
    const identityValue = identity.puuid ?? identity.summonerId;
    if (!identityValue) throw new Error("The League client did not provide a local account identifier.");
    return { identity, accountKey: createHash("sha256").update(identityValue).digest("hex").slice(0, 24) };
  }

  private async updatePerformance(): Promise<void> {
    const { identity, accountKey } = await this.currentAccount();
    const cached = await this.cache.loadPerformance(accountKey);
    if (cached && this.store.getSnapshot().insights.performance.champions.length === 0) {
      this.store.update((snapshot) => { snapshot.insights.performance = cached; });
    }
    const { history, partial } = await this.recentHistory();
    const performance = aggregatePerformance(history, identity);
    if (partial) performance.warnings.push("League returned only part of the recent history window. Refresh to try the remaining matches again.");
    this.store.update((snapshot) => { snapshot.insights.performance = performance; });
    await this.cache.savePerformance(accountKey, performance);
  }

  private async recentHistory(): Promise<{ history: { games: { games: RawGame[] } }; partial: boolean }> {
    const games = new Map<string, RawGame>();
    let partial = false;
    for (let begin = 0; begin < PERFORMANCE_WINDOW; begin += PERFORMANCE_PAGE_SIZE) {
      let page: RawGame[];
      try {
        const response = await this.lcu.get<unknown>(
          `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${begin}&endIndex=${Math.min(begin + PERFORMANCE_PAGE_SIZE, PERFORMANCE_WINDOW)}`,
        );
        page = historyGames(response);
      } catch (error) {
        if (games.size === 0) throw error;
        partial = true;
        break;
      }
      page.forEach((game, index) => {
        const creation = asText(game.gameCreation);
        const duration = asText(game.gameDuration);
        const stableKey = asText(game.gameId)
          ?? (creation || duration ? `${creation ?? "unknown"}:${duration ?? "unknown"}` : `page-${begin + index}`);
        if (!games.has(stableKey)) games.set(stableKey, game);
      });
      if (page.length < PERFORMANCE_PAGE_SIZE) break;
    }
    return { history: { games: { games: [...games.values()].slice(0, PERFORMANCE_WINDOW) } }, partial };
  }

  private publishPerformanceFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn("Champion performance refresh failed", { error: message });
    this.store.update((snapshot) => {
      const current = snapshot.insights.performance;
      snapshot.insights.performance = current.champions.length > 0
        ? { ...current, status: "ready", stale: true, warnings: [...new Set([...current.warnings, message])] }
        : { ...current, status: "error", source: "none", stale: false, warnings: [message] };
    });
  }

  private async refreshRuneCatalog(): Promise<void> {
    try {
      const perks = runePerks(await this.lcu.get<unknown>("/lol-game-data/assets/v1/perks.json"));
      if (perks.length > 0 && this.lcu.isConnected()) this.store.update((snapshot) => { snapshot.insights.runes.perks = perks; });
    } catch (error) {
      this.logger.debug("Rune perk catalog is unavailable on this client patch", { error: String(error) });
    }
    try {
      const items = coachItems(await this.lcu.get<unknown>("/lol-game-data/assets/v1/items.json"));
      if (items.length > 0 && this.lcu.isConnected()) this.store.update((snapshot) => { snapshot.insights.coach.items = items; });
    } catch (error) {
      this.logger.debug("Item catalog is unavailable on this client patch", { error: String(error) });
    }
  }
}
