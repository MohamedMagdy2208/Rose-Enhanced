import { emptySnapshot } from "@summonerkit/ui";
import { describe, expect, it } from "vitest";
import { clientSurfaceSnapshot } from "./client-surface-snapshot";

describe("client surface snapshot", () => {
  it("removes desktop-only paths, endpoints, and account identifiers", () => {
    const snapshot = structuredClone(emptySnapshot);
    const deviceId = "713ecb27-94ef-4504-ab7f-dfd0dd7a7654";
    snapshot.collection.accountKey = "private-account-cache-key";
    snapshot.insights.guidance.endpoint = "https://guidance.example/private-feed.json";
    snapshot.integrations[0]!.executablePath = "C:\\Users\\Mohamed\\Apps\\Rose.exe";
    snapshot.remote.relayUrl = "https://relay.example";
    snapshot.remote.mobileUrl = "https://mobile.example";
    snapshot.remote.activeDeviceId = deviceId;
    snapshot.remoteDevices = [{
      id: deviceId,
      name: "Mohamed's phone",
      pairedAt: "2026-08-29T00:00:00.000Z",
      lastSeenAt: "2026-08-29T00:05:00.000Z",
      connected: true,
      revoked: false,
    }];

    const clientSnapshot = clientSurfaceSnapshot(snapshot);

    expect(clientSnapshot.collection.accountKey).toBeNull();
    expect(clientSnapshot.insights.guidance.endpoint).toBeNull();
    expect(clientSnapshot.integrations[0]!.executablePath).toBeNull();
    expect(clientSnapshot.remote).toMatchObject({ relayUrl: null, mobileUrl: null });
    expect(clientSnapshot.remoteDevices[0]!.id).not.toBe(deviceId);
    expect(clientSnapshot.remote.activeDeviceId).toBe(clientSnapshot.remoteDevices[0]!.id);
    expect(clientSnapshot.remoteDevices[0]!.name).toBe("Mohamed's phone");
    expect(snapshot.collection.accountKey).toBe("private-account-cache-key");
  });
});
