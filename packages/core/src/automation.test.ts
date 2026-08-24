import { beforeEach, describe, expect, it } from "vitest";
import type { AutomationProfile, AutomationSettings } from "@summonerkit/contracts";
import { AutomationEngine, type AutomationContext } from "./automation";

const AhriFallback = 7;

const profile: AutomationProfile = {
  id: "mid",
  name: "Mid",
  queueIds: [420],
  role: "middle",
  pickPriority: [103, AhriFallback],
  banPriority: [238, 157],
  spell1Id: 4,
  spell2Id: 14,
  runePreset: null,
  readyCheckDelayMs: 1_000,
  lockLeadTimeMs: 3_000,
};

const settings: AutomationSettings = {
  riskAcknowledged: true,
  executionMode: "automatic",
  autoAccept: true,
  autoPick: true,
  autoBan: true,
  autoSpells: false,
  autoRunes: false,
};

function context(overrides: Partial<AutomationContext> = {}): AutomationContext {
  return {
    sessionId: "session-1",
    localPlayerCellId: 4,
    timerRemainingMs: 20_000,
    actions: [
      {
        id: 10,
        actorCellId: 4,
        championId: 0,
        completed: false,
        isInProgress: true,
        type: "pick",
      },
    ],
    pickableChampionIds: new Set([103, AhriFallback]),
    bannableChampionIds: new Set([238, 157]),
    alliedIntentChampionIds: new Set(),
    profile,
    settings,
    ...overrides,
  };
}

describe("AutomationEngine", () => {
  let engine: AutomationEngine;

  beforeEach(() => {
    engine = new AutomationEngine();
  });

  it("hovers first and locks only near the deadline", () => {
    expect(engine.evaluateChampSelect(context())[0]).toMatchObject({
      type: "hoverAction",
      championId: 103,
    });
    expect(
      engine.evaluateChampSelect(
        context({
          timerRemainingMs: 2_500,
          actions: [{ ...context().actions[0]!, championId: 103 }],
        }),
      )[0],
    ).toMatchObject({ type: "completeAction", championId: 103 });
  });

  it("yields when the user changes the automated hover", () => {
    engine.evaluateChampSelect(context());
    const effects = engine.evaluateChampSelect(
      context({ actions: [{ ...context().actions[0]!, championId: AhriFallback }] }),
    );
    expect(effects[0]).toMatchObject({
      type: "auditOnly",
      decision: { action: "cancel" },
    });
  });

  it("skips allied intended bans and falls back", () => {
    const effects = engine.evaluateChampSelect(
      context({
        actions: [{ ...context().actions[0]!, type: "ban" }],
        alliedIntentChampionIds: new Set([238]),
      }),
    );
    expect(effects[0]).toMatchObject({ type: "hoverAction", championId: 157 });
  });

  it("waits for the configured ready-check delay and deduplicates acceptance", () => {
    const first = engine.evaluateReadyCheck({
      sessionId: "ready-1",
      state: "InProgress",
      nowMs: 100,
      profile,
      settings,
    });
    const accepted = engine.evaluateReadyCheck({
      sessionId: "ready-1",
      state: "InProgress",
      nowMs: 1_100,
      profile,
      settings,
    });
    const duplicate = engine.evaluateReadyCheck({
      sessionId: "ready-1",
      state: "InProgress",
      nowMs: 2_100,
      profile,
      settings,
    });
    expect(first).toEqual([]);
    expect(accepted[0]?.type).toBe("acceptReadyCheck");
    expect(duplicate).toEqual([]);
  });

  it("does nothing until risk is acknowledged", () => {
    expect(
      engine.evaluateChampSelect(
        context({ settings: { ...settings, riskAcknowledged: false } }),
      ),
    ).toEqual([]);
  });

  it("hovers but never locks when the timer is unavailable", () => {
    expect(engine.evaluateChampSelect(context({ timerRemainingMs: null }))[0]).toMatchObject({
      type: "hoverAction",
      championId: 103,
    });
    expect(
      engine.evaluateChampSelect(
        context({
          timerRemainingMs: null,
          actions: [{ ...context().actions[0]!, championId: 103 }],
        }),
      ),
    ).toEqual([]);
  });

  it("does not replay a completed action", () => {
    engine.evaluateChampSelect(context());
    const lockContext = context({
      timerRemainingMs: 2_500,
      actions: [{ ...context().actions[0]!, championId: 103 }],
    });
    expect(engine.evaluateChampSelect(lockContext)[0]?.type).toBe("completeAction");
    expect(engine.evaluateChampSelect(lockContext)).toEqual([]);
  });
});
