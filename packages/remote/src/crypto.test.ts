import { describe, expect, it } from "vitest";
import {
  createPairingProof,
  deriveSessionKeys,
  EncryptedChannel,
  generateDeviceKeys,
  parseEncryptedEnvelope,
  publicKeyFingerprint,
  verifyPairingProof,
} from "./crypto";

describe("encrypted remote channel", () => {
  it("derives directional keys and exchanges authenticated messages", async () => {
    const desktopKeys = await generateDeviceKeys();
    const mobileKeys = await generateDeviceKeys();
    const desktop = new EncryptedChannel("room-1", await deriveSessionKeys("desktop", "room-1", desktopKeys.privateKey, mobileKeys.publicKey));
    const mobile = new EncryptedChannel("room-1", await deriveSessionKeys("mobile", "room-1", mobileKeys.privateKey, desktopKeys.publicKey));

    const envelope = await mobile.seal({ type: "readyCheck.accept" });
    await expect(desktop.open(envelope)).resolves.toEqual({ type: "readyCheck.accept" });
  });

  it("rejects replayed messages", async () => {
    const desktopKeys = await generateDeviceKeys();
    const mobileKeys = await generateDeviceKeys();
    const desktop = new EncryptedChannel("room-2", await deriveSessionKeys("desktop", "room-2", desktopKeys.privateKey, mobileKeys.publicKey));
    const mobile = new EncryptedChannel("room-2", await deriveSessionKeys("mobile", "room-2", mobileKeys.privateKey, desktopKeys.publicKey));
    const envelope = await mobile.seal({ type: "queue.start" });

    await desktop.open(envelope);
    await expect(desktop.open(envelope)).rejects.toThrow(/replayed|out of order/u);
  });

  it("rejects tampered ciphertext", async () => {
    const desktopKeys = await generateDeviceKeys();
    const mobileKeys = await generateDeviceKeys();
    const desktop = new EncryptedChannel("room-3", await deriveSessionKeys("desktop", "room-3", desktopKeys.privateKey, mobileKeys.publicKey));
    const mobile = new EncryptedChannel("room-3", await deriveSessionKeys("mobile", "room-3", mobileKeys.privateKey, desktopKeys.publicKey));

    const envelope = await mobile.seal({ type: "queue.stop" });
    const changedFirstByte = envelope.ciphertext.startsWith("A") ? "B" : "A";
    await expect(desktop.open({ ...envelope, ciphertext: `${changedFirstByte}${envelope.ciphertext.slice(1)}` })).rejects.toThrow();
  });

  it("pins pairing identity to the exact desktop public key", async () => {
    const first = await generateDeviceKeys();
    const second = await generateDeviceKeys();

    await expect(publicKeyFingerprint(first.publicKey)).resolves.toBe(await publicKeyFingerprint(first.publicKey));
    await expect(publicKeyFingerprint(second.publicKey)).resolves.not.toBe(await publicKeyFingerprint(first.publicKey));
  });

  it("authenticates the mobile public key without revealing the pairing secret to the relay", async () => {
    const mobileKeys = await generateDeviceKeys();
    const substitutedKeys = await generateDeviceKeys();
    const oneTimeSecret = "QmFzZTY0dXJsLXBhaXJpbmctc2VjcmV0LTEyMzQ1Ng";
    const proof = await createPairingProof(oneTimeSecret, "room-proof", mobileKeys.publicKey);

    await expect(verifyPairingProof(proof, oneTimeSecret, "room-proof", mobileKeys.publicKey)).resolves.toBe(true);
    await expect(verifyPairingProof(proof, oneTimeSecret, "room-proof", substitutedKeys.publicKey)).resolves.toBe(false);
  });

  it("allows both authenticated peers to reset sequence state after a relay reconnect", async () => {
    const desktopKeys = await generateDeviceKeys();
    const mobileKeys = await generateDeviceKeys();
    const desktopSession = await deriveSessionKeys("desktop", "room-reconnect", desktopKeys.privateKey, mobileKeys.publicKey);
    const mobileSession = await deriveSessionKeys("mobile", "room-reconnect", mobileKeys.privateKey, desktopKeys.publicKey);
    const firstDesktop = new EncryptedChannel("room-reconnect", desktopSession);
    const firstMobile = new EncryptedChannel("room-reconnect", mobileSession);
    await firstDesktop.open(await firstMobile.seal({ generation: 1 }));

    const reconnectedDesktop = new EncryptedChannel("room-reconnect", desktopSession);
    const reconnectedMobile = new EncryptedChannel("room-reconnect", mobileSession);
    await expect(reconnectedDesktop.open(await reconnectedMobile.seal({ generation: 2 }))).resolves.toEqual({ generation: 2 });
  });

  it.each([
    { sequence: 0 },
    { nonce: "not-a-nonce" },
    { ciphertext: "A".repeat(128 * 1024 + 1) },
  ])("rejects malformed encrypted envelope fields", (change) => {
    const envelope = {
      version: 1 as const,
      roomId: "room-envelope",
      direction: "desktop-to-mobile" as const,
      sequence: 1,
      nonce: "A".repeat(16),
      ciphertext: "A",
    };
    expect(() => parseEncryptedEnvelope({ ...envelope, ...change })).toThrow();
  });
});
