import { describe, expect, it } from "vitest";
import { aggregateRecommendations } from "./aggregate.js";
import type { BuildObservation } from "./models.js";
import { assertFreshRecommendationFeed, recommendationFeedErrors } from "./validate-feed.js";

const observation: BuildObservation = {
  sampleKey: "server-only-sample", championId: 103, role: "middle", queueId: 420, patch: "26.16", audience: "high-elo",
  primaryStyleId: 8000, subStyleId: 8100, selectedPerkIds: [8005, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001],
  itemIds: [6655, 3089, 3135], spellIds: [4, 14], allyChampionIds: [64], enemyChampionIds: [238], won: true,
};

function feed() {
  return aggregateRecommendations([observation], {
    providerName: "Test provider",
    generatedAt: "2026-08-25T00:00:00.000Z",
    minimumSamples: { "high-elo": 1, pro: 1, combined: 1 },
    maximumBuildsPerGroup: 3,
    publication: { cohortSize: 1, platforms: ["EUW1"], lookbackDays: 14 },
  });
}

describe("published guidance validation", () => {
  it("accepts a non-empty anonymous aggregate feed", () => {
    expect(recommendationFeedErrors(feed())).toEqual([]);
  });

  it("rejects identity fields", () => {
    expect(recommendationFeedErrors({ ...feed(), puuid: "must-never-publish" }).join(" ")).toContain("forbidden identity");
  });

  it("rejects empty production evidence", () => {
    expect(recommendationFeedErrors({ ...feed(), recommendations: [] }).join(" ")).toContain("recommendations must contain");
  });

  it("rejects stale publications", () => {
    expect(() => assertFreshRecommendationFeed(feed(), 24, Date.parse("2026-08-27T00:00:00.000Z"))).toThrow("older than 24 hours");
  });
});
