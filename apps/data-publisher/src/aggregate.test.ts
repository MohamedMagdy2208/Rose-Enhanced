import { describe, expect, it } from "vitest";
import { aggregateRecommendations } from "./aggregate.js";
import type { BuildObservation } from "./models.js";

const sample = (overrides: Partial<BuildObservation>): BuildObservation => ({
  sampleKey: crypto.randomUUID(), championId: 103, role: "middle", queueId: 420, patch: "26.16",
  audience: "high-elo", primaryStyleId: 8000, subStyleId: 8100,
  selectedPerkIds: [8005, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001], won: true,
  itemIds: [6655, 3089, 3135], spellIds: [4, 14], allyChampionIds: [22, 64], enemyChampionIds: [7, 238],
  ...overrides,
});

describe("rune feed aggregation", () => {
  it("publishes anonymous high-elo and combined rates", () => {
    const feed = aggregateRecommendations([
      sample({ sampleKey: "match-1:player-a" }),
      sample({ sampleKey: "match-2:player-b", won: false }),
      sample({ sampleKey: "match-3:player-c", selectedPerkIds: [8021, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001] }),
    ], { providerName: "Test", generatedAt: "2026-08-24T00:00:00.000Z", minimumSamples: { "high-elo": 1, pro: 1, combined: 1 }, maximumBuildsPerGroup: 3 });
    const common = feed.recommendations.find((entry) => entry.audience === "high-elo" && entry.selectedPerkIds[0] === 8005);
    expect(common).toMatchObject({ sampleSize: 2, winRate: 50, pickRate: 66.7 });
    expect(feed.recommendations.some((entry) => entry.audience === "combined")).toBe(true);
    expect(feed.builds.find((entry) => entry.audience === "high-elo")).toMatchObject({ itemIds: [3089, 3135, 6655], spellIds: [4, 14], sampleSize: 3 });
    expect(feed.draftSignals.find((entry) => entry.audience === "high-elo")).toMatchObject({ synergyChampionIds: [22, 64], toughMatchupChampionIds: [7, 238] });
    expect(JSON.stringify(feed)).not.toContain("player-a");
  });

  it("deduplicates the same player and match in combined samples", () => {
    const base = sample({ sampleKey: "same-match:same-player" });
    const feed = aggregateRecommendations([base, { ...base, audience: "pro" }], { providerName: "Test", generatedAt: "2026-08-24T00:00:00.000Z", minimumSamples: { "high-elo": 1, pro: 1, combined: 1 }, maximumBuildsPerGroup: 3 });
    expect(feed.recommendations.find((entry) => entry.audience === "combined")?.sampleSize).toBe(1);
  });
});
