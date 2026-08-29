import type { CompanionSnapshot } from "@summonerkit/contracts";

function displayDeviceId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export function clientSurfaceSnapshot(snapshot: CompanionSnapshot): CompanionSnapshot {
  const clientSnapshot = structuredClone(snapshot);
  const deviceIds = new Map(
    clientSnapshot.remoteDevices.map((device, index) => [device.id, displayDeviceId(index)]),
  );

  clientSnapshot.collection.accountKey = null;
  clientSnapshot.insights.guidance.endpoint = null;
  clientSnapshot.integrations = clientSnapshot.integrations.map((integration) => ({
    ...integration,
    executablePath: null,
  }));
  clientSnapshot.remote = {
    ...clientSnapshot.remote,
    relayUrl: null,
    mobileUrl: null,
    activeDeviceId: clientSnapshot.remote.activeDeviceId
      ? deviceIds.get(clientSnapshot.remote.activeDeviceId) ?? null
      : null,
  };
  clientSnapshot.remoteDevices = clientSnapshot.remoteDevices.map((device, index) => ({
    ...device,
    id: displayDeviceId(index),
  }));

  return clientSnapshot;
}
