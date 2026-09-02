import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  it("preserves startup preferences across reloads", async () => {
    const store = new SettingsStore(logger);
    await store.load();
    await store.update((settings) => {
      settings.startup.launchOnWindowsStartup = true;
      settings.startup.openOnLeagueDetected = true;
      settings.startup.openOnRoseDetected = true;
    });

    const reloaded = new SettingsStore(logger);
    expect((await reloaded.load()).startup).toEqual({
      launchOnWindowsStartup: true,
      openOnLeagueDetected: true,
      openOnRoseDetected: true,
    });
  });

  it("migrates legacy startup choices while enabling Rose detection", async () => {
    await writeFile(path.join(electronState.userData, "settings.json"), JSON.stringify({
      schemaVersion: 3,
      startup: {
        launchOnWindowsStartup: false,
        openOnLeagueDetected: false,
      },
    }), "utf8");

    const settings = await new SettingsStore(logger).load();

    expect(settings.schemaVersion).toBe(4);
    expect(settings.startup).toEqual({
      launchOnWindowsStartup: false,
      openOnLeagueDetected: false,
      openOnRoseDetected: true,
    });
  });

  it("preserves an invalid settings file before creating safe defaults", async () => {
    const invalidSource = '{"automation":';
    await writeFile(path.join(electronState.userData, "settings.json"), invalidSource, "utf8");

    const settings = await new SettingsStore(logger).load();
    const backupName = (await readdir(electronState.userData)).find((name) => name.startsWith("settings.invalid-"));

    expect(backupName).toBeDefined();
    if (!backupName) throw new Error("The invalid settings backup was not created.");
    expect(await readFile(path.join(electronState.userData, backupName), "utf8")).toBe(invalidSource);
    expect(settings.automation.autoAccept).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "Invalid settings were preserved before reset",
      expect.objectContaining({ backupName }),
    );
  });

  it("serializes simultaneous updates so independent preferences are not lost", async () => {
    const store = new SettingsStore(logger);
    await store.load();

    await Promise.all([
      store.update((settings) => { settings.startup.launchOnWindowsStartup = true; }),
      store.update((settings) => { settings.startup.openOnLeagueDetected = true; }),
      store.update((settings) => { settings.startup.openOnRoseDetected = true; }),
    ]);

    expect(store.get().startup).toEqual({
      launchOnWindowsStartup: true,
      openOnLeagueDetected: true,
      openOnRoseDetected: true,
    });
  });
});
