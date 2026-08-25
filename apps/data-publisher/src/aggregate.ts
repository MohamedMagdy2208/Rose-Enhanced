import { createHash } from "node:crypto";
import type {
  BuildObservation,
  PublishedBuildRecommendation,
  PublishedDraftSignal,
  PublishedPatchImpact,
  PublishedRecommendation,
  RecommendationAudience,
  RecommendationFeed,
  PlatformRoute,
} from "./models.js";

export interface AggregationOptions {
  providerName: string;
  generatedAt: string;
  minimumSamples: Record<RecommendationAudience, number>;
  maximumBuildsPerGroup: number;
  patchImpacts?: PublishedPatchImpact[];
  publication?: {
    cohortSize: number;
    platforms: PlatformRoute[];
    lookbackDays: number;
  };
}

interface BuildGroup {
  observation: BuildObservation;
  games: number;
  wins: number;
}

interface ChampionPairGroup { games: number; wins: number }

const rounded = (value: number): number => Math.round(value * 10) / 10;
const groupKey = (sample: BuildObservation): string => [sample.championId, sample.role, sample.queueId, sample.patch].join(":");
const buildKey = (sample: BuildObservation): string => [sample.primaryStyleId, sample.subStyleId, ...sample.selectedPerkIds].join(":");
const itemBuildKey = (sample: BuildObservation): string => [...sample.itemIds].sort((left, right) => left - right).concat([...sample.spellIds].sort((left, right) => left - right)).join(":");

function sourceForAudience(observations: BuildObservation[], audience: RecommendationAudience): BuildObservation[] {
  if (audience !== "combined") return observations.filter((sample) => sample.audience === audience);
  const unique = new Map<string, BuildObservation>();
  for (const sample of observations) if (!unique.has(sample.sampleKey)) unique.set(sample.sampleKey, sample);
  return [...unique.values()];
}

function recommendationId(sample: BuildObservation, audience: RecommendationAudience): string {
  const digest = createHash("sha256").update(buildKey(sample)).digest("hex").slice(0, 10);
  return `${sample.championId}-${sample.role}-${audience}-${sample.patch}-${digest}`;
}

function evidenceId(prefix: string, sample: BuildObservation, audience: RecommendationAudience, detail: string): string {
  const digest = createHash("sha256").update(detail).digest("hex").slice(0, 10);
  return `${prefix}-${sample.championId}-${sample.role}-${audience}-${sample.patch}-${digest}`;
}

function pairIds(context: BuildObservation[], side: "allyChampionIds" | "enemyChampionIds", toughest = false): number[] {
  const pairs = new Map<number, ChampionPairGroup>();
  for (const sample of context) {
    for (const championId of new Set(sample[side])) {
      const pair = pairs.get(championId) ?? { games: 0, wins: 0 };
      pair.games += 1;
      pair.wins += sample.won ? 1 : 0;
      pairs.set(championId, pair);
    }
  }
  return [...pairs.entries()]
    .filter(([, pair]) => pair.games >= Math.min(5, Math.max(2, Math.ceil(context.length * 0.08))))
    .sort(([, left], [, right]) => {
      const leftRate = left.wins / left.games;
      const rightRate = right.wins / right.games;
      return toughest ? leftRate - rightRate || right.games - left.games : rightRate - leftRate || right.games - left.games;
    })
    .slice(0, 5)
    .map(([championId]) => championId);
}

function contextGroups(observations: BuildObservation[], audience: RecommendationAudience): BuildObservation[][] {
  const observationsByContext = new Map<string, BuildObservation[]>();
  for (const observation of sourceForAudience(observations, audience)) {
    if (observation.selectedPerkIds.length !== 9) continue;
    const key = groupKey(observation);
    observationsByContext.set(key, [...(observationsByContext.get(key) ?? []), observation]);
  }
  return [...observationsByContext.values()];
}

function groupedBuilds(
  context: BuildObservation[],
  keyFor: (observation: BuildObservation) => string,
  include: (observation: BuildObservation) => boolean,
): BuildGroup[] {
  const groups = new Map<string, BuildGroup>();
  for (const observation of context) {
    if (!include(observation)) continue;
    const key = keyFor(observation);
    const group = groups.get(key) ?? { observation, games: 0, wins: 0 };
    group.games += 1;
    group.wins += observation.won ? 1 : 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function eligibleBuilds(groups: BuildGroup[], minimumSamples: number, maximumBuilds: number): BuildGroup[] {
  return groups.filter((group) => group.games >= minimumSamples)
    .sort((left, right) => right.games - left.games || right.wins - left.wins)
    .slice(0, maximumBuilds);
}

function publishRunes(group: BuildGroup, contextSize: number, audience: RecommendationAudience, generatedAt: string): PublishedRecommendation {
  const observation = group.observation;
  return {
    id: recommendationId(observation, audience), championId: observation.championId, role: observation.role,
    queueId: observation.queueId, audience, patch: observation.patch, primaryStyleId: observation.primaryStyleId,
    subStyleId: observation.subStyleId, selectedPerkIds: observation.selectedPerkIds, sampleSize: group.games,
    winRate: rounded(group.wins / group.games * 100), pickRate: rounded(group.games / contextSize * 100), generatedAt,
  };
}

function publishItems(group: BuildGroup, contextSize: number, audience: RecommendationAudience, generatedAt: string): PublishedBuildRecommendation {
  const observation = group.observation;
  return {
    id: evidenceId("build", observation, audience, itemBuildKey(observation)), championId: observation.championId,
    role: observation.role, queueId: observation.queueId, audience, patch: observation.patch,
    itemIds: [...observation.itemIds].sort((left, right) => left - right), spellIds: [...observation.spellIds].sort((left, right) => left - right),
    sampleSize: group.games, winRate: rounded(group.wins / group.games * 100),
    pickRate: rounded(group.games / contextSize * 100), generatedAt,
  };
}

function publishDraftSignal(context: BuildObservation[], audience: RecommendationAudience, generatedAt: string): PublishedDraftSignal {
  const observation = context[0]!;
  const wins = context.filter((entry) => entry.won).length;
  return {
    id: evidenceId("draft", observation, audience, groupKey(observation)), championId: observation.championId,
    role: observation.role, queueId: observation.queueId, audience, patch: observation.patch,
    sampleSize: context.length, winRate: rounded(wins / context.length * 100),
    synergyChampionIds: pairIds(context, "allyChampionIds"), toughMatchupChampionIds: pairIds(context, "enemyChampionIds", true),
    generatedAt,
  };
}

export function aggregateRecommendations(
  observations: BuildObservation[],
  options: AggregationOptions,
): RecommendationFeed {
  const recommendations: PublishedRecommendation[] = [];
  const itemBuilds: PublishedBuildRecommendation[] = [];
  const draftSignals: PublishedDraftSignal[] = [];
  for (const audience of ["high-elo", "pro", "combined"] as const) {
    for (const context of contextGroups(observations, audience)) {
      const minimumSamples = options.minimumSamples[audience];
      const runeGroups = groupedBuilds(context, buildKey, () => true);
      const itemGroups = groupedBuilds(context, itemBuildKey, (observation) => observation.itemIds.length >= 2 && observation.spellIds.length === 2);
      recommendations.push(...eligibleBuilds(runeGroups, minimumSamples, options.maximumBuildsPerGroup)
        .map((group) => publishRunes(group, context.length, audience, options.generatedAt)));
      itemBuilds.push(...eligibleBuilds(itemGroups, minimumSamples, options.maximumBuildsPerGroup)
        .map((group) => publishItems(group, context.length, audience, options.generatedAt)));
      if (context.length >= minimumSamples) draftSignals.push(publishDraftSignal(context, audience, options.generatedAt));
    }
  }
  recommendations.sort((left, right) => left.championId - right.championId || left.role.localeCompare(right.role) || right.sampleSize - left.sampleSize);
  itemBuilds.sort((left, right) => left.championId - right.championId || left.role.localeCompare(right.role) || right.sampleSize - left.sampleSize);
  draftSignals.sort((left, right) => left.championId - right.championId || left.role.localeCompare(right.role) || right.sampleSize - left.sampleSize);
  return {
    schemaVersion: 2,
    providerName: options.providerName,
    publication: {
      generatedAt: options.generatedAt,
      observationCount: observations.length,
      cohortSize: options.publication?.cohortSize ?? 0,
      platforms: options.publication?.platforms ?? [],
      lookbackDays: options.publication?.lookbackDays ?? 14,
      patches: [...new Set(observations.map((entry) => entry.patch))]
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true })),
    },
    recommendations,
    builds: itemBuilds,
    draftSignals,
    patchImpacts: options.patchImpacts?.slice(0, 500) ?? [],
  };
}
