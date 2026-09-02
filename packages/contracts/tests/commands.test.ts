import { describe, expect, it } from "vitest";
import { companionCommandSchema } from "../src/commands";

const validProfile = {
  id: "default-bottom",
  name: "Bottom lane",
  queueIds: [420],
  role: "bottom" as const,
  pickPriority: [145, 81],
  banPriority: [238, 122],
  spell1Id: 4,
  spell2Id: 7,
  runePreset: {
    primaryStyleId: 8000,
    subStyleId: 8300,
    selectedPerkIds: [8005, 8009, 9103, 3031, 8304, 8347, 5005, 5008, 5002],
  },
  readyCheckDelayMs: 1_000,
  lockLeadTimeMs: 3_000,
};

describe("companion command validation", () => {
  it("accepts a fully specified known command", () => {
    expect(companionCommandSchema.parse({ type: "profile.save", profile: validProfile })).toEqual({
      type: "profile.save",
      profile: validProfile,
    });
  });

  it.each([
    ["top-level", { type: "automation.disableAll", unexpected: true }],
    ["profile", { type: "profile.save", profile: { ...validProfile, unexpected: true } }],
    ["rune preset", {
      type: "profile.save",
      profile: { ...validProfile, runePreset: { ...validProfile.runePreset, unexpected: true } },
    }],
  ])("rejects unknown %s fields", (_location, command) => {
    expect(companionCommandSchema.safeParse(command).success).toBe(false);
  });
});
