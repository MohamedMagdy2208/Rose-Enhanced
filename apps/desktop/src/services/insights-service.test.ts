import { createDefaultSettings } from "@summonerkit/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionStore } from "./companion-store";
import type { InsightsCache } from "./insights-cache";
import {
  aggregatePerformance,
  InsightsService,
  performanceScore,
  runeFeedConfiguration,
} from "./insights-service";
import type { LcuClient } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";

const noCache: Pick<InsightsCache, "loadRunes" | "saveRunes" | "loadCoach" | "saveCoach" | "loadPerformance" | "savePerformance"> = {
  loadRunes: vi.fn(async () => null),
  saveRunes: vi.fn(async () => undefined),
  loadCoach: vi.fn(async () => null),
  saveCoach: vi.fn(async () => undefined),
  loadPerformance: vi.fn(async () => null),
  savePerformance: vi.fn(async () => undefined),
};

const logger = {
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as AppLogger;

function match(won: boolean, creation: number, championId = 103, queueId = 420) {
  return {
    gameId: `${creation}-${championId}`,
    gameCreation: creation,
    gameDuration: 1_800,
    queueId,
    participantIdentities: [{ participantId: 1, player: { puuid: "local-player" } }],
    participants: [
      {
        participantId: 1,
        championId,
        teamId: 100,
        teamPosition: "MIDDLE",
        stats: {
          win: won,
          kills: 10,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 200,
          neutralMinionsKilled: 20,
          totalDamageDealtToChampions: 18_000,
          visionScore: 30,
        },
      },
      { participantId: 2, teamId: 100, stats: { kills: 10 } },
      { participantId: 3, teamId: 200, stats: { kills: 99 } },
    ],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("champion performance aggregation", () => {
  it("aggregates only the local participant and keeps identifiers out of the result", () => {
    const snapshot = aggregatePerformance(
      { games: { games: [match(true, 1_780_000_000_000), match(false, 1_779_000_000_000)] } },
      { puuid: "local-player", summonerId: null },
      "2026-08-23T00:00:00.000Z",
    );
    expect(snapshot.matchesAnalyzed).toBe(2);
    expect(snapshot.summary).toMatchObject({ games: 2, championsPlayed: 1, winRate: 50, kda: 9 });
    expect(snapshot.champions[0]).toMatchObject({
      championId: 103,
      games: 2,
      kills: 20,
      deaths: 4,
      assists: 16,
      farmPerMinute: 7.33,
      killParticipation: 90,
    });
    expect(snapshot.matches).toHaveLength(2);
    expect(snapshot.matches[0]).toMatchObject({
      championId: 103,
      queueId: 420,
      role: "middle",
      won: true,
      kills: 10,
      deaths: 2,
      assists: 8,
      farm: 220,
      farmPerMinute: 7.33,
      durationMinutes: 30,
      reportCard: expect.objectContaining({ grade: expect.any(String), strengths: expect.any(Array), focus: expect.any(Array) }),
    });
    expect(JSON.stringify(snapshot)).not.toContain("local-player");
  });

  it("keeps recent matches in newest-first order for overall and champion-specific history", () => {
    const snapshot = aggregatePerformance(
      { games: { games: [
        match(true, 1_779_000_000_000, 22, 450),
        match(false, 1_781_000_000_000, 103, 420),
        match(true, 1_780_000_000_000, 103, 440),
      ] } },
      { puuid: "local-player", summonerId: null },
    );
    expect(snapshot.matches.map((entry) => entry.championId)).toEqual([103, 103, 22]);
    expect(snapshot.matches.filter((entry) => entry.championId === 103)).toHaveLength(2);
    expect(snapshot.summary).toMatchObject({ games: 3, championsPlayed: 2 });
  });

  it("uses role-aware farm and vision targets", () => {
    const support = performanceScore({ role: "utility", kda: 4, farmPerMinute: 1.8, damagePerMinute: 450, visionPerMinute: 2 });
    const carry = performanceScore({ role: "middle", kda: 4, farmPerMinute: 1.8, damagePerMinute: 450, visionPerMinute: 2 });
    expect(support).toBeGreaterThan(carry);
    expect(support).toBeLessThanOrEqual(100);
  });
});

describe("online rune feed boundary", () => {
  it("uses the first-party published feed when no override is configured", () => {
    expect(runeFeedConfiguration({}).url).toBe("https://mohamedmagdy2208.github.io/SummonerKit/data/runes-v1.json");
  });

  it("requires HTTPS outside local development", () => {
    expect(() => runeFeedConfiguration({ SUMMONERKIT_BUILD_DATA_URL: "http://data.example/runes.json" })).toThrow("HTTPS");
    expect(runeFeedConfiguration({ SUMMONERKIT_BUILD_DATA_URL: "http://127.0.0.1:8788/runes.json" }).url).toContain("127.0.0.1");
    expect(() => runeFeedConfiguration({ SUMMONERKIT_BUILD_DATA_URL: "https://data.example/runes.json?token=secret" })).toThrow("query parameters");
  });

  it.each([
    { schemaVersion: 1, extras: {}, expectedBuilds: 0, expectedHealth: "degraded" },
    { schemaVersion: 2, extras: {
      publication: { generatedAt: new Date().toISOString(), observationCount: 400, cohortSize: 48, platforms: ["EUW1", "KR"], lookbackDays: 14, patches: ["26.16"] },
      builds: [{
        id: "ahri-middle-build-26.16", championId: 103, role: "middle", queueId: 420, audience: "combined", patch: "26.16",
        itemIds: [3089, 3135, 6655], spellIds: [4, 14], sampleSize: 200, winRate: 53.1, pickRate: 31.4, generatedAt: new Date().toISOString(),
      }],
      draftSignals: [{
        id: "ahri-middle-draft-26.16", championId: 103, role: "middle", queueId: 420, audience: "combined", patch: "26.16",
        sampleSize: 200, winRate: 53.1, synergyChampionIds: [64], toughMatchupChampionIds: [238], generatedAt: new Date().toISOString(),
      }],
      patchImpacts: [{ id: "26.16-ahri", patch: "26.16", championId: 103, category: "buff", title: "Ahri", summary: "A curated test summary.", sourceUrl: "https://example.com/patch" }],
    }, expectedBuilds: 1, expectedHealth: "healthy" },
  ])("accepts schema v$schemaVersion and publishes its provenance", async ({ schemaVersion, extras, expectedBuilds, expectedHealth }) => {
    vi.stubEnv("SUMMONERKIT_BUILD_DATA_URL", "https://data.example/runes.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion,
      providerName: "SummonerKit approved Riot aggregation",
      recommendations: [{
        id: "ahri-middle-combined-26.16",
        championId: 103,
        role: "middle",
        queueId: 420,
        audience: "combined",
        patch: "26.16",
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8005, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001],
        sampleSize: 250,
        winRate: 52.4,
        pickRate: 38.2,
        generatedAt: new Date().toISOString(),
      }],
      ...extras,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const lcu = { getState: () => ({ patch: "26.16.1" }), isConnected: () => false } as unknown as LcuClient;
    const store = new CompanionStore(createDefaultSettings("test-token"));
    const service = new InsightsService(lcu, store, logger, noCache);
    await service.refreshRunes();
    expect(store.getSnapshot().insights.runes).toMatchObject({ status: "ready", source: "online", providerName: "SummonerKit approved Riot aggregation" });
    expect(store.getSnapshot().insights.runes.recommendations).toHaveLength(1);
    expect(store.getSnapshot().insights.coach).toMatchObject({ status: "ready", source: "online", providerName: "SummonerKit approved Riot aggregation" });
    expect(store.getSnapshot().insights.coach.builds).toHaveLength(expectedBuilds);
    expect(store.getSnapshot().insights.guidance).toMatchObject({ status: expectedHealth, source: "online", schemaVersion, currentPatchCovered: true });
    if (schemaVersion === 2) expect(store.getSnapshot().insights.guidance).toMatchObject({ observationCount: 400, cohortSize: 48, lookbackDays: 14 });
  });

  it("reports an unavailable endpoint truthfully without discarding local performance", async () => {
    vi.stubEnv("SUMMONERKIT_BUILD_DATA_URL", "https://data.example/runes.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    const lcu = { getState: () => ({ patch: "26.16.1" }), isConnected: () => false } as unknown as LcuClient;
    const store = new CompanionStore(createDefaultSettings("test-token"));
    const service = new InsightsService(lcu, store, logger, noCache);
    await service.refreshRunes();
    expect(store.getSnapshot().insights.guidance).toMatchObject({
      status: "unavailable",
      source: "none",
      endpoint: "https://data.example/runes.json",
      currentPatch: "26.16",
      lastError: "Rune data provider returned HTTP 404.",
    });
    expect(store.getSnapshot().insights.performance.status).toBe("idle");
  });
});

describe("recommended rune page application", () => {
  it("updates only the matching SummonerKit page and never deletes another page", async () => {
    const put = vi.fn(async (endpoint: string) => endpoint.includes("/pages/7") ? { id: 7, name: "SummonerKit · Ahri middle" } : undefined);
    const lcu = {
      isConnected: () => true,
      get: vi.fn(async () => [{ id: 7, name: "SummonerKit · Ahri middle" }, { id: 8, name: "My page" }]),
      put,
      post: vi.fn(),
      delete: vi.fn(),
    } as unknown as LcuClient;
    const store = new CompanionStore(createDefaultSettings("test-token"));
    store.update((snapshot) => {
      snapshot.collection.champions = [{ id: 103, alias: "Ahri", name: "Ahri", iconPath: null, owned: true, skins: [] }];
      snapshot.insights.runes.recommendations = [{
        id: "ahri-middle-combined-26.16",
        championId: 103,
        role: "middle",
        queueId: 420,
        audience: "combined",
        patch: "26.16",
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8005, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001],
        sampleSize: 250,
        winRate: 52.4,
        pickRate: 38.2,
        generatedAt: new Date().toISOString(),
      }];
    });
    const service = new InsightsService(lcu, store, logger, noCache);
    await service.applyRecommendation("ahri-middle-combined-26.16");
    expect(put).toHaveBeenCalledWith("/lol-perks/v1/pages/7", expect.objectContaining({ id: 7, name: "SummonerKit · Ahri middle" }));
    expect(put).toHaveBeenCalledWith("/lol-perks/v1/currentpage", 7);
    expect(lcu.delete).not.toHaveBeenCalled();
  });
});
