import { EventEmitter } from "node:events";
import {
  CLIENT_TAB_PLUGIN_VERSION,
  CLIENT_TAB_PROTOCOL_VERSION,
  type CompanionSnapshot,
  type ConnectionDoctorCheck,
  type IntegrationState,
} from "@summonerkit/contracts";
import type { PersistedSettings } from "@summonerkit/core";
import { clientUxReloadDisposition } from "./client-tab-activation";
import { emptyLeagueSessionState } from "./league-session-state";

const capabilities = {
  championCatalog: false,
  skinInventory: false,
  lootInventory: false,
  readyCheck: false,
  champSelect: false,
  runes: false,
  summonerSpells: false,
  clientTab: false,
};

const initialIntegrations: IntegrationState[] = [
  { id: "rose", name: "Rose", installed: false, running: false, managedProcess: false, executablePath: null, version: null, lastError: null },
  { id: "deceive", name: "Deceive", installed: false, running: false, managedProcess: false, executablePath: null, version: null, lastError: null },
  { id: "pengu", name: "Client tab", installed: false, running: false, managedProcess: false, executablePath: null, version: "1.1.6", lastError: null },
];

function leagueDoctorCheck(snapshot: CompanionSnapshot): ConnectionDoctorCheck {
  if (snapshot.connection.status === "connected") {
    const version = snapshot.connection.patch ? ` on patch ${snapshot.connection.patch}` : "";
    return { id: "leagueClient", label: "League Client API", status: "healthy", detail: `Connected${version}.`, action: null };
  }
  const detail = snapshot.connection.lastError ?? snapshot.connection.phase;
  return { id: "leagueClient", label: "League Client API", status: "unavailable", detail, action: null };
}

function clientTabDoctorCheck(snapshot: CompanionSnapshot): ConnectionDoctorCheck {
  if (!snapshot.clientTab.installed) {
    return { id: "clientTab", label: "League client tab", status: "unavailable", detail: "The Pengu integration is not installed.", action: "repair-client-tab" };
  }
  if (snapshot.clientTab.lastError) {
    return { id: "clientTab", label: "League client tab", status: "attention", detail: snapshot.clientTab.lastError, action: "repair-client-tab" };
  }
  const installedCurrent = snapshot.clientTab.installedPluginVersion === snapshot.clientTab.expectedPluginVersion
    && snapshot.clientTab.installedProtocolVersion === snapshot.clientTab.protocolVersion;
  const activeSessionReported = snapshot.clientTab.activeProtocolVersion !== null
    && snapshot.clientTab.activePluginVersion !== null;
  const activeSessionCurrent = snapshot.clientTab.activeProtocolVersion === snapshot.clientTab.protocolVersion
    && snapshot.clientTab.activePluginVersion === snapshot.clientTab.expectedPluginVersion;
  if (!installedCurrent || snapshot.clientTab.restartRequired || (activeSessionReported && !activeSessionCurrent)) {
    const detail = snapshot.clientTab.restartRequired
      ? pendingClientTabActivationDetail(snapshot)
      : !installedCurrent
        ? "The installed plugin does not match the current desktop protocol."
        : "League has not loaded the current integration protocol.";
    return { id: "clientTab", label: "League client tab", status: "attention", detail, action: "repair-client-tab" };
  }
  const detail = activeSessionReported
    ? `Plugin ${snapshot.clientTab.activePluginVersion} is active.`
    : `Plugin ${snapshot.clientTab.installedPluginVersion} is installed. Its bridge handshake starts when the tab opens.`;
  return { id: "clientTab", label: "League client tab", status: "healthy", detail, action: null };
}

function pendingClientTabActivationDetail(snapshot: CompanionSnapshot): string {
  const disposition = clientUxReloadDisposition(snapshot.connection);
  if (disposition === "reload") return "The integration was repaired and League's UI is being reloaded automatically.";
  if (disposition === "defer") {
    return `The integration was repaired. Its UI reload is queued until Home or Lobby (current phase: ${snapshot.connection.phase}).`;
  }
  return "The integration was repaired and will activate the next time League starts.";
}

function collectionDoctorCheck(snapshot: CompanionSnapshot): ConnectionDoctorCheck {
  if (snapshot.collection.status === "ready" && !snapshot.collection.stale) {
    return { id: "collection", label: "Collection data", status: "healthy", detail: "Live ownership and loot data are synchronized.", action: null };
  }
  if (snapshot.collection.source === "cache") {
    return { id: "collection", label: "Collection data", status: "attention", detail: "Showing a cached snapshot while live data refreshes.", action: "refresh-collection" };
  }
  return { id: "collection", label: "Collection data", status: "attention", detail: snapshot.collection.warnings[0] ?? "Collection data has not loaded yet.", action: "refresh-collection" };
}

function refreshDoctor(snapshot: CompanionSnapshot): void {
  const checks: ConnectionDoctorCheck[] = [
    { id: "desktopBridge", label: "Desktop bridge", status: "healthy", detail: "The local authenticated bridge is responding.", action: null },
    leagueDoctorCheck(snapshot),
    clientTabDoctorCheck(snapshot),
    collectionDoctorCheck(snapshot),
  ];
  const overall = checks[1]?.status === "unavailable"
    ? "unavailable"
    : checks.some((check) => check.status !== "healthy") ? "attention" : "healthy";
  snapshot.doctor = { overall, checkedAt: new Date().toISOString(), checks };
}

export class CompanionStore extends EventEmitter {
  private snapshot: CompanionSnapshot;

  constructor(settings: PersistedSettings) {
    super();
    this.snapshot = {
      revision: 0,
      connection: { status: "discovering", phase: "Waiting for League", region: null, locale: null, patch: null, capabilities: { ...capabilities }, connectedAt: null, lastError: null },
      collection: { status: "idle", source: "none", stale: false, patch: null, accountKey: null, updatedAt: null, progress: { totalSkins: 0, ownedSkins: 0, lootSkins: 0, favoriteSkins: 0, wishlistSkins: 0, completionPercent: 0 }, champions: [], warnings: [] },
      automation: settings.automation,
      pendingAutomation: [],
      profiles: settings.profiles,
      audit: [],
      integrations: initialIntegrations,
      clientTab: {
        installed: false,
        expectedPluginVersion: CLIENT_TAB_PLUGIN_VERSION,
        installedPluginVersion: null,
        installedProtocolVersion: null,
        activePluginVersion: null,
        protocolVersion: CLIENT_TAB_PROTOCOL_VERSION,
        activeProtocolVersion: null,
        restartRequired: false,
        lastRepairAt: null,
        lastError: null,
      },
      doctor: { overall: "unavailable", checkedAt: new Date().toISOString(), checks: [] },
      aram: {
        active: false,
        currentChampionId: null,
        bench: [],
        favoriteChampionIds: settings.aramFavoriteChampionIds,
        availableFavoriteChampionIds: [],
        rerollsRemaining: null,
        rerollPoints: null,
        updatedAt: null,
      },
      session: emptyLeagueSessionState(),
      insights: {
        runes: {
          status: "idle",
          source: "none",
          stale: false,
          providerName: null,
          updatedAt: null,
          recommendations: [],
          perks: [],
          warnings: [],
        },
        performance: {
          status: "idle",
          source: "none",
          stale: false,
          matchesAnalyzed: 0,
          windowLabel: "Recent 100 matches available in this client",
          updatedAt: null,
          summary: { games: 0, championsPlayed: 0, winRate: 0, kda: 0, farmPerMinute: 0, overallScore: 0 },
          champions: [],
          warnings: [],
        },
      },
      remote: {
        status: "unavailable",
        relayConfigured: false,
        activeDeviceId: null,
        lastError: null,
      },
      remoteDevices: settings.remoteDevices,
    };
    refreshDoctor(this.snapshot);
  }

  getSnapshot(): CompanionSnapshot {
    return structuredClone(this.snapshot);
  }

  update(mutator: (snapshot: CompanionSnapshot) => void): void {
    const next = this.getSnapshot();
    mutator(next);
    refreshDoctor(next);
    next.revision = this.snapshot.revision + 1;
    this.snapshot = next;
    this.emit("changed", next.revision);
  }
}
