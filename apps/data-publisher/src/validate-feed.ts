import type { RecommendationFeed } from "./models.js";

type JsonRecord = Record<string, unknown>;

const roles = new Set(["top", "jungle", "middle", "bottom", "utility", "aram"]);
const audiences = new Set(["high-elo", "pro", "combined"]);
const impactCategories = new Set(["buff", "nerf", "adjustment", "item", "rune", "system"]);
const forbiddenKeys = new Set(["accountid", "apikey", "accesstoken", "matchid", "puuid", "riotid", "samplekey", "summonerid"]);
export const MAX_RECOMMENDATION_FEED_BYTES = 2 * 1024 * 1024;

const jsonRecord = (candidate: unknown): JsonRecord | null =>
  candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as JsonRecord : null;
const positiveInteger = (candidate: unknown): boolean => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0;
const nonNegativeInteger = (candidate: unknown): boolean => typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0;
const percentage = (candidate: unknown): boolean => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= 100;
const timestamp = (candidate: unknown): boolean => typeof candidate === "string" && Number.isFinite(Date.parse(candidate));
const shortText = (candidate: unknown, maximum: number): boolean => typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= maximum;
const positiveIntegerArray = (candidate: unknown, minimum: number, maximum: number): boolean =>
  Array.isArray(candidate) && candidate.length >= minimum && candidate.length <= maximum && candidate.every(positiveInteger);

function forbiddenPath(candidate: unknown, path = "feed"): string | null {
  if (Array.isArray(candidate)) {
    for (let index = 0; index < candidate.length; index += 1) {
      const found = forbiddenPath(candidate[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  const object = jsonRecord(candidate);
  if (!object) return null;
  for (const [key, nested] of Object.entries(object)) {
    if (forbiddenKeys.has(key.toLowerCase())) return `${path}.${key}`;
    const found = forbiddenPath(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function publicationErrors(candidate: unknown): string[] {
  const publication = jsonRecord(candidate);
  if (!publication) return ["publication metadata is required."];
  const errors: string[] = [];
  if (!timestamp(publication.generatedAt)) errors.push("publication.generatedAt must be an ISO timestamp.");
  if (!positiveInteger(publication.observationCount)) errors.push("publication.observationCount must be positive.");
  if (!positiveInteger(publication.cohortSize)) errors.push("publication.cohortSize must be positive.");
  if (!lookbackDaysValid(publication.lookbackDays)) errors.push("publication.lookbackDays must be between 1 and 30.");
  if (!textArrayValid(publication.platforms, 8)) errors.push("publication.platforms must contain at least one platform route.");
  if (!textArrayValid(publication.patches, 24)) errors.push("publication.patches must contain at least one patch.");
  return errors;
}

function lookbackDaysValid(candidate: unknown): boolean {
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 1 && candidate <= 30;
}

function textArrayValid(candidate: unknown, maximumTextLength: number): boolean {
  return Array.isArray(candidate) && candidate.length > 0 && candidate.every((entry) => shortText(entry, maximumTextLength));
}

function commonEvidenceErrors(candidate: JsonRecord, path: string): string[] {
  const errors: string[] = [];
  if (!shortText(candidate.id, 180)) errors.push(`${path}.id is invalid.`);
  if (!positiveInteger(candidate.championId)) errors.push(`${path}.championId must be positive.`);
  if (!roles.has(String(candidate.role))) errors.push(`${path}.role is unsupported.`);
  if (!nonNegativeInteger(candidate.queueId)) errors.push(`${path}.queueId must be non-negative.`);
  if (!audiences.has(String(candidate.audience))) errors.push(`${path}.audience is unsupported.`);
  if (!shortText(candidate.patch, 24)) errors.push(`${path}.patch is invalid.`);
  if (!positiveInteger(candidate.sampleSize)) errors.push(`${path}.sampleSize must be positive.`);
  if (!percentage(candidate.winRate)) errors.push(`${path}.winRate must be between 0 and 100.`);
  if (!timestamp(candidate.generatedAt)) errors.push(`${path}.generatedAt must be an ISO timestamp.`);
  return errors;
}

function recommendationErrors(candidate: unknown, index: number): string[] {
  const recommendation = jsonRecord(candidate);
  const path = `recommendations[${index}]`;
  if (!recommendation) return [`${path} must be an object.`];
  const errors = commonEvidenceErrors(recommendation, path);
  if (!positiveInteger(recommendation.primaryStyleId) || !positiveInteger(recommendation.subStyleId)) errors.push(`${path} rune styles must be positive.`);
  if (!positiveIntegerArray(recommendation.selectedPerkIds, 9, 9)) errors.push(`${path}.selectedPerkIds must contain exactly nine positive IDs.`);
  if (!percentage(recommendation.pickRate)) errors.push(`${path}.pickRate must be between 0 and 100.`);
  return errors;
}

function buildErrors(candidate: unknown, index: number): string[] {
  const build = jsonRecord(candidate);
  const path = `builds[${index}]`;
  if (!build) return [`${path} must be an object.`];
  const errors = commonEvidenceErrors(build, path);
  if (!positiveIntegerArray(build.itemIds, 2, 6)) errors.push(`${path}.itemIds must contain two to six positive IDs.`);
  if (!positiveIntegerArray(build.spellIds, 2, 2)) errors.push(`${path}.spellIds must contain exactly two positive IDs.`);
  if (!percentage(build.pickRate)) errors.push(`${path}.pickRate must be between 0 and 100.`);
  return errors;
}

function draftSignalErrors(candidate: unknown, index: number): string[] {
  const signal = jsonRecord(candidate);
  const path = `draftSignals[${index}]`;
  if (!signal) return [`${path} must be an object.`];
  const errors = commonEvidenceErrors(signal, path);
  if (!positiveIntegerArray(signal.synergyChampionIds, 0, 8)) errors.push(`${path}.synergyChampionIds is invalid.`);
  if (!positiveIntegerArray(signal.toughMatchupChampionIds, 0, 8)) errors.push(`${path}.toughMatchupChampionIds is invalid.`);
  return errors;
}

function patchImpactErrors(candidate: unknown, index: number): string[] {
  const impact = jsonRecord(candidate);
  const path = `patchImpacts[${index}]`;
  if (!impact) return [`${path} must be an object.`];
  const errors: string[] = [];
  if (!shortText(impact.id, 180) || !shortText(impact.patch, 24) || !shortText(impact.title, 120) || !shortText(impact.summary, 360)) errors.push(`${path} contains invalid text.`);
  if (impact.championId !== null && !positiveInteger(impact.championId)) errors.push(`${path}.championId is invalid.`);
  if (!impactCategories.has(String(impact.category))) errors.push(`${path}.category is unsupported.`);
  if (impact.sourceUrl !== null && (typeof impact.sourceUrl !== "string" || !impact.sourceUrl.startsWith("https://"))) errors.push(`${path}.sourceUrl must use HTTPS or be null.`);
  return errors;
}

function collectionSizeErrors(entries: unknown, path: string, minimum: number, maximum: number): string[] {
  if (!Array.isArray(entries) || entries.length < minimum || entries.length > maximum) {
    return [`${path} must contain ${minimum} to ${maximum.toLocaleString()} entries.`];
  }
  return [];
}

function duplicateIdErrors(entries: unknown[], path: string): string[] {
  const ids = entries.map((entry) => jsonRecord(entry)?.id).filter((id): id is string => typeof id === "string");
  return new Set(ids).size === ids.length ? [] : [`${path} contains duplicate IDs.`];
}

function collectionErrors(feed: JsonRecord): string[] {
  const recommendations = Array.isArray(feed.recommendations) ? feed.recommendations : [];
  const builds = Array.isArray(feed.builds) ? feed.builds : [];
  const draftSignals = Array.isArray(feed.draftSignals) ? feed.draftSignals : [];
  const patchImpacts = Array.isArray(feed.patchImpacts) ? feed.patchImpacts : [];
  return [
    ...collectionSizeErrors(feed.recommendations, "recommendations", 1, 5_000),
    ...collectionSizeErrors(feed.builds, "builds", 1, 5_000),
    ...collectionSizeErrors(feed.draftSignals, "draftSignals", 1, 2_000),
    ...collectionSizeErrors(feed.patchImpacts, "patchImpacts", 0, 500),
    ...duplicateIdErrors(recommendations, "recommendations"),
    ...duplicateIdErrors(builds, "builds"),
    ...duplicateIdErrors(draftSignals, "draftSignals"),
    ...duplicateIdErrors(patchImpacts, "patchImpacts"),
    ...recommendations.flatMap(recommendationErrors),
    ...builds.flatMap(buildErrors),
    ...draftSignals.flatMap(draftSignalErrors),
    ...patchImpacts.flatMap(patchImpactErrors),
  ];
}

export function recommendationFeedErrors(candidate: unknown): string[] {
  const feed = jsonRecord(candidate);
  if (!feed) return ["Feed must be a JSON object."];
  const errors: string[] = [];
  const sensitivePath = forbiddenPath(feed);
  if (sensitivePath) errors.push(`Feed contains forbidden identity or credential field ${sensitivePath}.`);
  if (feed.schemaVersion !== 2) errors.push("schemaVersion must be 2 for first-party publishing.");
  if (!shortText(feed.providerName, 80)) errors.push("providerName is invalid.");
  return [...errors, ...publicationErrors(feed.publication), ...collectionErrors(feed)];
}

export function assertPublishableRecommendationFeed(candidate: unknown): asserts candidate is RecommendationFeed {
  const errors = recommendationFeedErrors(candidate);
  if (errors.length > 0) throw new Error(`Guidance feed validation failed:\n- ${errors.slice(0, 20).join("\n- ")}`);
}

export function assertRecommendationFeedSize(serializedFeed: string): void {
  if (new TextEncoder().encode(serializedFeed).byteLength > MAX_RECOMMENDATION_FEED_BYTES) {
    throw new Error("Guidance feed exceeds the 2 MiB client safety limit.");
  }
}

export function assertFreshRecommendationFeed(feed: RecommendationFeed, maximumAgeHours: number, now = Date.now()): void {
  const generatedAt = Date.parse(feed.publication.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 5 * 60_000) throw new Error("Guidance feed publication time is invalid or in the future.");
  if (now - generatedAt > maximumAgeHours * 3_600_000) throw new Error(`Guidance feed is older than ${maximumAgeHours} hours.`);
}
