import { describe, expect, it } from "vitest";
import type { PerformanceMatchRecord } from "@summonerkit/contracts";
import { filterPerformanceMatches } from "./MatchHistoryPanel";

const match = (overrides: Partial<PerformanceMatchRecord>): PerformanceMatchRecord => ({
  id: crypto.randomUUID(), championId: 103, queueId: 420, role: "middle", won: true,
  kills: 8, deaths: 2, assists: 7, kda: 7.5, farm: 200, farmPerMinute: 7,
  killParticipation: 60, damagePerMinute: 700, visionPerMinute: 0.8,
  overallScore: 75, durationMinutes: 28, playedAt: "2026-08-20T00:00:00.000Z", ...overrides,
  reportCard: { grade: "B", headline: "Strong fight efficiency", strengths: ["Strong fight efficiency"], focus: ["Plan more purposeful vision"] },
});

describe("match history filters", () => {
  const matches = [
    match({ id: "one" }),
    match({ id: "two", championId: 22, queueId: 450, role: "aram", won: false, playedAt: "2026-07-01T00:00:00.000Z" }),
    match({ id: "three", queueId: 440, role: "bottom", won: false }),
  ];

  it("combines champion, queue, role, and result filters", () => {
    expect(filterPerformanceMatches(matches, { championId: 103, queueId: 440, role: "bottom", result: "losses", range: "all" }).map((entry) => entry.id)).toEqual(["three"]);
  });

  it("filters relative date ranges without inventing dates for unknown matches", () => {
    const current = Date.parse("2026-08-24T00:00:00.000Z");
    expect(filterPerformanceMatches(matches, { championId: null, queueId: null, role: null, result: "all", range: "30" }, current).map((entry) => entry.id)).toEqual(["one", "three"]);
  });
});
