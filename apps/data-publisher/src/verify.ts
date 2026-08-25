import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertFreshRecommendationFeed, assertPublishableRecommendationFeed, assertRecommendationFeedSize } from "./validate-feed.js";

async function readSource(source: string): Promise<string> {
  if (/^https:\/\//u.test(source)) {
    const response = await fetch(source, { headers: { accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Published guidance endpoint returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) throw new Error(`Published guidance endpoint returned ${contentType || "an unknown content type"} instead of JSON.`);
    return response.text();
  }
  return readFile(path.resolve(source), "utf8");
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: verify-feed <file-or-https-url>");
  const text = await readSource(source);
  assertRecommendationFeedSize(text);
  const feed = JSON.parse(text) as unknown;
  assertPublishableRecommendationFeed(feed);
  const maximumAgeHours = Number(process.env.SUMMONERKIT_MAX_FEED_AGE_HOURS ?? 48);
  if (!Number.isFinite(maximumAgeHours) || maximumAgeHours < 1 || maximumAgeHours > 168) throw new Error("SUMMONERKIT_MAX_FEED_AGE_HOURS must be between 1 and 168.");
  assertFreshRecommendationFeed(feed, maximumAgeHours);
  process.stdout.write(`Verified schema v${feed.schemaVersion}: ${feed.recommendations.length} runes, ${feed.builds.length} builds, ${feed.draftSignals.length} draft signals, ${feed.publication.observationCount} observations.\n`);
}

await main();
