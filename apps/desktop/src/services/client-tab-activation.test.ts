import type { LcuConnectionState } from "@summonerkit/contracts";
import { createDefaultSettings } from "@summonerkit/core";
import { describe, expect, it } from "vitest";
import { ClientTabActivationService, clientUxReloadDisposition } from "./client-tab-activation";
import { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import { LcuClient } from "./lcu/lcu-client";

function connection(status: LcuConnectionState["status"], phase: string): LcuConnectionState {
  return {
    status,
    phase,
    region: null,
    locale: null,
    patch: null,
    capabilities: {
      championCatalog: false,
      skinInventory: false,
      lootInventory: false,
      readyCheck: false,
      champSelect: false,
      runes: false,
      summonerSpells: false,
      presence: false,
      clientTab: false,
    },
    connectedAt: null,
    lastError: null,
  };
}

describe("League UX reload policy", () => {
  it.each(["None", "Lobby", " lobby "])("allows a reload from the safe %s phase", (phase) => {
    expect(clientUxReloadDisposition(connection("connected", phase))).toBe("reload");
  });

  it.each(["Matchmaking", "ReadyCheck", "ChampSelect", "GameStart", "InProgress", "Reconnect", "Unknown"])(
    "defers a reload during %s",
    (phase) => {
      expect(clientUxReloadDisposition(connection("connected", phase))).toBe("defer");
    },
  );

  it("waits while an active League connection is still being established", () => {
    expect(clientUxReloadDisposition(connection("connecting", "Connecting"))).toBe("defer");
  });

  it.each(["discovering", "disconnected", "degraded"] as const)(
    "loads naturally on the next League launch while %s",
    (status) => {
      expect(clientUxReloadDisposition(connection(status, "Waiting for League"))).toBe("next-launch");
    },
  );
});

const testLogger = {
  info: () => undefined,
  warn: () => undefined,
} as unknown as AppLogger;

class FakeLeagueUx extends LcuClient {
  reloadRequests = 0;

  constructor() {
    super(() => null, testLogger);
  }

  override async restartLeagueUx(): Promise<void> {
    this.reloadRequests += 1;
  }
}

function activationFixture(phase = "None") {
  const store = new CompanionStore(createDefaultSettings("test-token"));
  store.update((snapshot) => {
    snapshot.connection = connection("connected", phase);
    snapshot.clientTab.installed = true;
    snapshot.clientTab.installedPluginVersion = snapshot.clientTab.expectedPluginVersion;
    snapshot.clientTab.installedProtocolVersion = snapshot.clientTab.protocolVersion;
    snapshot.clientTab.restartRequired = true;
    snapshot.clientTab.lastRepairAt = "2026-08-24T00:00:00.000Z";
  });
  const lcu = new FakeLeagueUx();
  const activation = new ClientTabActivationService(lcu, store, testLogger);
  return { activation, lcu, store };
}

describe("client-tab activation lifecycle", () => {
  it("requests one reload and completes after League accepts it", async () => {
    const { activation, lcu, store } = activationFixture();
    activation.start();

    await expect(activation.activatePending("command")).resolves.toMatchObject({ status: "reloaded" });
    expect(lcu.reloadRequests).toBe(1);
    expect(store.getSnapshot().clientTab.restartRequired).toBe(false);
    expect(store.getSnapshot().doctor.checks.find((check) => check.id === "clientTab")).toMatchObject({
      status: "healthy",
      detail: expect.stringContaining("bridge handshake starts when the tab opens"),
    });
    await expect(activation.activatePending()).resolves.toMatchObject({ status: "not-needed" });
    expect(lcu.reloadRequests).toBe(1);
    activation.stop();
  });

  it("defers during champion select and reloads after returning to Lobby", async () => {
    const { activation, lcu, store } = activationFixture("ChampSelect");
    activation.start();

    await expect(activation.activatePending("command")).resolves.toMatchObject({ status: "deferred" });
    expect(lcu.reloadRequests).toBe(0);

    const lobby = connection("connected", "Lobby");
    store.update((snapshot) => { snapshot.connection = lobby; });
    lcu.emit("state", lobby);
    await new Promise((resolve) => setImmediate(resolve));
    expect(lcu.reloadRequests).toBe(1);
    expect(store.getSnapshot().clientTab.restartRequired).toBe(false);
    activation.stop();
  });

  it("leaves League untouched when the plugin can load on the next launch", async () => {
    const { activation, lcu, store } = activationFixture();
    store.update((snapshot) => {
      snapshot.connection = connection("discovering", "Waiting for League");
      snapshot.connection.lastError = "No active League lockfile was found.";
    });

    await expect(activation.activatePending("command")).resolves.toMatchObject({ status: "next-launch" });
    expect(lcu.reloadRequests).toBe(0);
    expect(store.getSnapshot().clientTab.restartRequired).toBe(false);
  });
});
