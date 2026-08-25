import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLogger } from "./logger";

const electronState = vi.hoisted(() => ({
  userData: "",
  encryptionAvailable: true,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronState.userData,
    isPackaged: true,
  },
  safeStorage: {
    isEncryptionAvailable: () => electronState.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`protected:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^protected:/, ""),
  },
}));

import { SettingsStore } from "./settings-store";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
} as unknown as AppLogger;

describe("settings secret storage", () => {
  beforeEach(async () => {
    electronState.userData = await mkdtemp(path.join(os.tmpdir(), "summonerkit-settings-"));
    electronState.encryptionAvailable = true;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(electronState.userData, { recursive: true, force: true });
  });

  it("persists the relay administrator secret only through safeStorage", async () => {
    const secret = "mobile-relay-secret-that-is-long-enough";
    const store = new SettingsStore(logger);
    await store.load();
    await store.update((settings) => {
      settings.remoteConfiguration = {
        relayUrl: "https://relay.example",
        mobileUrl: "https://mobile.example",
        adminSecret: secret,
      };
    });

    const diskText = await readFile(path.join(electronState.userData, "settings.json"), "utf8");
    const disk = JSON.parse(diskText) as Record<string, unknown>;
    expect(diskText).not.toContain(secret);
    expect(disk).toHaveProperty("remoteAdminSecretEncrypted");
    expect(disk.remoteConfiguration).not.toHaveProperty("adminSecret");

    const reloaded = new SettingsStore(logger);
    expect((await reloaded.load()).remoteConfiguration.adminSecret).toBe(secret);
  });

  it("refuses plaintext secret storage in packaged builds", async () => {
    electronState.encryptionAvailable = false;
    await expect(new SettingsStore(logger).load()).rejects.toThrow("Windows credential encryption is unavailable");
  });
});
