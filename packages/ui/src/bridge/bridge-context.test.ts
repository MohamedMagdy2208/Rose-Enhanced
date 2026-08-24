import { describe, expect, it, vi } from "vitest";
import type { BridgeListener, CompanionBridge, CompanionSnapshot } from "@summonerkit/contracts";
import { emptySnapshot } from "./empty-snapshot";
import { createBridgeStore } from "./bridge-context";

function bridgeFixture() {
  let snapshot: CompanionSnapshot = structuredClone(emptySnapshot);
  const bridgeListeners = new Set<BridgeListener>();
  const bridge: CompanionBridge = {
    getSnapshot: async () => structuredClone(snapshot),
    dispatch: async () => ({ ok: true, message: "Command accepted." }),
    saveProfile: async () => ({ ok: true, message: "Profile saved." }),
    exportDiagnostics: async () => ({
      generatedAt: "2026-08-22T00:00:00.000Z",
      appVersion: "test",
      platform: "test",
      snapshot: structuredClone(snapshot),
      recentLogs: [],
    }),
    createRemotePairing: async () => ({
      roomId: "room-test",
      pairingUrl: "https://example.test/pair",
      qrDataUrl: "data:image/png;base64,test",
      expiresAt: "2026-08-22T00:05:00.000Z",
    }),
    subscribe: (listener) => {
      bridgeListeners.add(listener);
      return () => bridgeListeners.delete(listener);
    },
  };
  return {
    bridge,
    activeSubscriptions: () => bridgeListeners.size,
    publishRevision: (revision: number) => {
      snapshot = { ...snapshot, revision };
      bridgeListeners.forEach((listener) => listener({ type: "snapshot.changed", revision }));
    },
  };
}

describe("createBridgeStore", () => {
  it("resubscribes after a React Strict Mode-style cleanup", async () => {
    const fixture = bridgeFixture();
    const store = createBridgeStore(fixture.bridge, structuredClone(emptySnapshot));
    const firstRender = vi.fn();
    const unsubscribeFirstRender = store.subscribe(firstRender);

    expect(fixture.activeSubscriptions()).toBe(1);
    unsubscribeFirstRender();
    expect(fixture.activeSubscriptions()).toBe(0);

    const secondRender = vi.fn();
    const unsubscribeSecondRender = store.subscribe(secondRender);
    fixture.publishRevision(2);
    await vi.waitFor(() => expect(store.getSnapshot().revision).toBe(2));

    expect(fixture.activeSubscriptions()).toBe(1);
    expect(secondRender).toHaveBeenCalled();
    unsubscribeSecondRender();
  });
});
