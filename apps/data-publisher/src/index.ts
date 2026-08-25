import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aggregateRecommendations } from "./aggregate.js";
import { collectBuildObservations, highEloCohort, proCohort } from "./collector.js";
import type { PlatformRoute, ProRosterEntry, PublishedPatchImpact, RegionalRoute } from "./models.js";
import { RiotApiClient } from "./riot-client.js";
import { assertPublishableRecommendationFeed, assertRecommendationFeedSize } from "./validate-feed.js";

const platformRoutes = new Set<PlatformRoute>(["BR1", "EUN1", "EUW1", "JP1", "KR", "LA1", "LA2", "NA1", "OC1", "PH2", "RU", "SG2", "TH2", "TR1", "TW2", "VN2"]);
const regionalRoutes = new Set<RegionalRoute>(["AMERICAS", "ASIA", "EUROPE", "SEA"]);
const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

function platformsFromEnvironment(): PlatformRoute[] {
  const requested = (process.env.RIOT_PLATFORMS ?? "EUW1,KR").split(",").map((item) => item.trim().toUpperCase());
  const valid = requested.filter((item): item is PlatformRoute => platformRoutes.has(item as PlatformRoute));
  if (valid.length === 0) throw new Error("RIOT_PLATFORMS does not contain a supported platform route.");
  return [...new Set(valid)];
}

function proRosterFromEnvironment(): ProRosterEntry[] {
  if (!process.env.SUMMONERKIT_PRO_ROSTER_JSON) return [];
  const candidate = JSON.parse(process.env.SUMMONERKIT_PRO_ROSTER_JSON) as unknown;
  if (!Array.isArray(candidate)) throw new Error("SUMMONERKIT_PRO_ROSTER_JSON must be a JSON array.");
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as { puuid?: unknown; regionalRoute?: unknown };
    const puuid = typeof raw.puuid === "string" ? raw.puuid.trim() : "";
    const route = typeof raw.regionalRoute === "string" ? raw.regionalRoute.toUpperCase() : "";
    return puuid && regionalRoutes.has(route as RegionalRoute) ? [{ puuid, regionalRoute: route as RegionalRoute }] : [];
  });
}

function patchImpactsFromEnvironment(): PublishedPatchImpact[] {
  if (!process.env.SUMMONERKIT_PATCH_IMPACTS_JSON) return [];
  const candidate = JSON.parse(process.env.SUMMONERKIT_PATCH_IMPACTS_JSON) as unknown;
  if (!Array.isArray(candidate)) throw new Error("SUMMONERKIT_PATCH_IMPACTS_JSON must be a JSON array.");
  const categories = new Set<PublishedPatchImpact["category"]>(["buff", "nerf", "adjustment", "item", "rune", "system"]);
  return candidate.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const patch = typeof raw.patch === "string" ? raw.patch.trim().slice(0, 24) : "";
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 360) : "";
    const category = typeof raw.category === "string" && categories.has(raw.category as PublishedPatchImpact["category"])
      ? raw.category as PublishedPatchImpact["category"] : null;
    const championId = typeof raw.championId === "number" && Number.isSafeInteger(raw.championId) && raw.championId > 0 ? raw.championId : null;
    const sourceUrl = typeof raw.sourceUrl === "string" && raw.sourceUrl.startsWith("https://") ? raw.sourceUrl.slice(0, 2_048) : null;
    return patch && title && summary && category ? [{ id: `${patch}-${championId ?? "system"}-${index}`, patch, championId, category, title, summary, sourceUrl }] : [];
  }).slice(0, 500);
}

async function main(): Promise<void> {
  const apiKey = process.env.RIOT_API_KEY?.trim();
  if (!apiKey) throw new Error("RIOT_API_KEY is required. Keep it in a secret store; never commit it.");
  const output = path.resolve(process.env.SUMMONERKIT_FEED_OUTPUT ?? "apps/mobile/dist/data/runes-v1.json");
  const interval = positiveInteger(process.env.RIOT_REQUEST_INTERVAL_MS, 1_300);
  const maximumPlayers = positiveInteger(process.env.RIOT_MAX_PLAYERS_PER_PLATFORM, 24);
  const matchesPerPlayer = Math.min(20, positiveInteger(process.env.RIOT_MATCHES_PER_PLAYER, 6));
  const lookbackDays = Math.min(30, positiveInteger(process.env.RIOT_LOOKBACK_DAYS, 14));
  const generatedAt = new Date().toISOString();
  const client = new RiotApiClient(apiKey, interval);
  const platforms = platformsFromEnvironment();
  const highElo = await highEloCohort(client, platforms, maximumPlayers);
  const cohort = [...highElo, ...proCohort(proRosterFromEnvironment())];
  if (cohort.length === 0) throw new Error("The configured high-elo and pro cohorts are empty.");
  const observations = await collectBuildObservations(client, cohort, matchesPerPlayer, Math.floor(Date.now() / 1_000) - lookbackDays * 86_400);
  const feed = aggregateRecommendations(observations, {
    providerName: process.env.SUMMONERKIT_FEED_PROVIDER_NAME?.trim() || "SummonerKit approved Riot aggregation",
    generatedAt,
    minimumSamples: {
      "high-elo": positiveInteger(process.env.RIOT_MIN_HIGH_ELO_SAMPLES, 25),
      pro: positiveInteger(process.env.RIOT_MIN_PRO_SAMPLES, 5),
      combined: positiveInteger(process.env.RIOT_MIN_COMBINED_SAMPLES, 25),
    },
    maximumBuildsPerGroup: 3,
    patchImpacts: patchImpactsFromEnvironment(),
    publication: { cohortSize: cohort.length, platforms, lookbackDays },
  });
  assertPublishableRecommendationFeed(feed);
  const serializedFeed = `${JSON.stringify(feed)}\n`;
  assertRecommendationFeedSize(serializedFeed);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, serializedFeed, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`Published ${feed.recommendations.length} aggregate recommendations from ${observations.length} anonymous observations.\n`);
}

await main();
