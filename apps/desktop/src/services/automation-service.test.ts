import { EventEmitter } from "node:events";
import { createDefaultSettings, type PersistedSettings } from "@summonerkit/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationService } from "./automation-service";
import { CompanionStore } from "./companion-store";
import type { LcuClient } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";

class FakeLcu extends EventEmitter {
  patch = vi.fn(async () => undefined);
  post = vi.fn(async () => undefined);
  put = vi.fn(async () => undefined);
  delete = vi.fn(async () => undefined);
  get = vi.fn(async (endpoint: string) => {
    if (endpoint.includes("pickable")) return [103];
    if (endpoint.includes("bannable")) return [238];
    if (endpoint === "/lol-lobby/v2/lobby") return { gameConfig: { queueId: 420 } };
    if (endpoint === "/lol-matchmaking/v1/ready-check") return null;
    if (endpoint === "/lol-champ-select/v1/session") return null;
    return null;
  });
}

const services: AutomationService[] = [];
afterEach(() => services.splice(0).forEach((service) => service.stop()));

function fixture(mode: PersistedSettings["automation"]["executionMode"]) {
  let settings = createDefaultSettings("test-token");
  settings.automation = { ...settings.automation, riskAcknowledged: true, executionMode: mode, autoPick: true };
  settings.profiles[0]!.pickPriority = [103];
  const store = new CompanionStore(settings);
  const settingsStore = {
    get: () => structuredClone(settings),
    update: async (mutator: (draft: PersistedSettings) => void) => {
      const next = structuredClone(settings);
      mutator(next);
      settings = next;
      return structuredClone(settings);
    },
  } as unknown as SettingsStore;
  const lcu = new FakeLcu();
  const logger = { warn: vi.fn() } as unknown as AppLogger;
  const service = new AutomationService(lcu as unknown as LcuClient, store, settingsStore, logger, vi.fn());
  services.push(service);
  service.start();
  lcu.emit("event", {
    uri: "/lol-champ-select/v1/session",
    eventType: "Create",
    data: {
      id: "session-1",
      localPlayerCellId: 4,
      actions: [[{ id: 10, actorCellId: 4, championId: 0, completed: false, isInProgress: true, type: "pick" }]],
      myTeam: [{ cellId: 4, assignedPosition: "MIDDLE" }],
      timer: { adjustedTimeLeftInPhase: 20_000 },
    },
  });
  return { lcu, service, store };
}

describe("AutomationService execution modes", () => {
  it("queues a validated effect in confirmation mode and writes only after approval", async () => {
    const { lcu, service, store } = fixture("confirm");
    await vi.waitFor(() => expect(store.getSnapshot().pendingAutomation).toHaveLength(1));
    expect(lcu.patch).not.toHaveBeenCalled();

    await service.confirmPending(store.getSnapshot().pendingAutomation[0]!.id);
    expect(lcu.patch).toHaveBeenCalledWith(
      "/lol-champ-select/v1/session/actions/10",
      { championId: 103, completed: false },
    );
  });

  it("records a dry-run plan without writing to League", async () => {
    const { lcu, store } = fixture("dry-run");
    await vi.waitFor(() => expect(store.getSnapshot().audit[0]?.result).toBe("planned"));
    expect(store.getSnapshot().audit[0]?.reason).toContain("Dry run:");
    expect(lcu.patch).not.toHaveBeenCalled();
  });
});
