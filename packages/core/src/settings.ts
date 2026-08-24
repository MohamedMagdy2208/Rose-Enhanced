import type {
  AutomationProfile,
  AutomationSettings,
  RemoteDevice,
} from "@summonerkit/contracts";

export interface PersistedSettings {
  schemaVersion: 2;
  leaguePath: string | null;
  bridgeToken: string;
  automation: AutomationSettings;
  profiles: AutomationProfile[];
  favorites: number[];
  wishlist: number[];
  aramFavoriteChampionIds: number[];
  remoteDevices: RemoteDevice[];
  integrationPaths: {
    rose: string | null;
    deceive: string | null;
  };
}

export function createDefaultProfile(): AutomationProfile {
  return {
    id: "default",
    name: "Default",
    queueIds: [],
    role: "default",
    pickPriority: [],
    banPriority: [],
    spell1Id: null,
    spell2Id: null,
    runePreset: null,
    readyCheckDelayMs: 1_000,
    lockLeadTimeMs: 3_000,
  };
}

export function createDefaultSettings(bridgeToken: string): PersistedSettings {
  return {
    schemaVersion: 2,
    leaguePath: null,
    bridgeToken,
    automation: {
      riskAcknowledged: false,
      executionMode: "dry-run",
      autoAccept: false,
      autoPick: false,
      autoBan: false,
      autoSpells: false,
      autoRunes: false,
    },
    profiles: [createDefaultProfile()],
    favorites: [],
    wishlist: [],
    aramFavoriteChampionIds: [],
    remoteDevices: [],
    integrationPaths: {
      rose: null,
      deceive: null,
    },
  };
}

export function profileFor(
  profiles: AutomationProfile[],
  queueId: number | null,
  role: AutomationProfile["role"] | null,
): AutomationProfile {
  const byRoleAndQueue = profiles.find(
    (profile) =>
      profile.role === role &&
      (profile.queueIds.length === 0 || (queueId !== null && profile.queueIds.includes(queueId))),
  );
  if (byRoleAndQueue) return byRoleAndQueue;

  const byQueue = profiles.find(
    (profile) =>
      profile.role === "default" &&
      queueId !== null &&
      profile.queueIds.includes(queueId),
  );
  return byQueue ?? profiles.find((profile) => profile.id === "default") ?? createDefaultProfile();
}
