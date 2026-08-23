import { EventEmitter } from "node:events";
import { createDefaultSettings, type PersistedSettings } from "@rose-enhanced/core";
import { describe, expect, it, vi } from "vitest";
import { AramService } from "./aram-service";
import { CompanionStore } from "./companion-store";
import type { LcuClient } from "./lcu/lcu-client";
import type { SettingsStore } from "./settings-store";

class FakeLcu extends EventEmitter {
  get = vi.fn(async () => null);
}

function settingsFixture(initial: PersistedSettings): SettingsStore {
  let settings = structuredClone(initial);
  return {
    get: () => structuredClone(settings),
    update: async (mutator: (draft: PersistedSettings) => void) => {
      const next = structuredClone(settings);
      mutator(next);
      settings = next;
      return structuredClone(settings);
    },
  } as unknown as SettingsStore;
}

describe("AramService", () => {
  it("normalizes the live bench and notifies only when a favorite becomes available", () => {
    const settings = createDefaultSettings("test-token");
    settings.aramFavoriteChampionIds = [103];
    const store = new CompanionStore(settings);
    const lcu = new FakeLcu();
    const notify = vi.fn();
    const service = new AramService(lcu as unknown as LcuClient, store, settingsFixture(settings), notify);
    service.start();

    const session = {
      localPlayerCellId: 2,
      benchEnabled: true,
      benchChampions: [{ championId: 103 }, { championId: 22 }],
      myTeam: [{ cellId: 2, championId: 1, rerollsRemaining: 1 }],
      rerollPoints: 180,
    };
    lcu.emit("event", { uri: "/lol-champ-select/v1/session", eventType: "Update", data: session });
    lcu.emit("event", { uri: "/lol-champ-select/v1/session", eventType: "Update", data: session });

    expect(store.getSnapshot().aram).toMatchObject({
      active: true,
      currentChampionId: 1,
      availableFavoriteChampionIds: [103],
      rerollsRemaining: 1,
      rerollPoints: 180,
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
