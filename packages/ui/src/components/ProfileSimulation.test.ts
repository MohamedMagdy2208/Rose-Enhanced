import { describe, expect, it } from "vitest";
import type { AutomationProfile } from "@summonerkit/contracts";
import { profileIssues } from "./ProfileSimulation";

const profile: AutomationProfile = { id: "test", name: "Test", queueIds: [420], role: "middle", pickPriority: [103], banPriority: [238], spell1Id: 4, spell2Id: 14, runePreset: null, readyCheckDelayMs: 1_000, lockLeadTimeMs: 3_000 };

describe("automation profile preview", () => {
  it("accepts a complete profile", () => expect(profileIssues(profile)).toEqual([]));
  it("explains unsafe and incomplete choices", () => {
    expect(profileIssues({ ...profile, pickPriority: [], banPriority: [238, 103], spell2Id: 4 })).toEqual([
      "Auto-pick has no champion priority.",
      "Summoner spells must be different.",
    ]);
  });
});
