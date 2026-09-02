import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";
import { createDefaultSettings, type PersistedSettings } from "@summonerkit/core";
import { automationProfileSchema } from "@summonerkit/contracts";
import { z } from "zod";
import type { AppLogger } from "./logger";

type SettingsOnDisk = Partial<Omit<PersistedSettings, "bridgeToken" | "remoteConfiguration">> & {
  bridgeToken?: string;
  bridgeTokenEncrypted?: string;
  remoteConfiguration?: Partial<Omit<PersistedSettings["remoteConfiguration"], "adminSecret">>;
  remoteAdminSecret?: string;
  remoteAdminSecretEncrypted?: string;
};

const automationSettingsSchema = z.object({
  riskAcknowledged: z.boolean(),
  executionMode: z.enum(["automatic", "confirm", "dry-run"]),
  autoAccept: z.boolean(),
  autoPick: z.boolean(),
  autoBan: z.boolean(),
  autoSpells: z.boolean(),
  autoRunes: z.boolean(),
});

const startupSettingsSchema = z.object({
  launchOnWindowsStartup: z.boolean(),
  openOnLeagueDetected: z.boolean(),
  openOnRoseDetected: z.boolean(),
});

const remoteDeviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  pairedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable(),
  connected: z.boolean(),
  revoked: z.boolean(),
});

function storedPath(candidate: unknown): string | null {
  return typeof candidate === "string" && candidate.length <= 32_767 && !candidate.includes("\0")
    ? candidate
    : null;
}

function storedIds(candidate: unknown): number[] {
  return Array.isArray(candidate)
    ? [...new Set(candidate.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))]
    : [];
}

function storedProfiles(candidate: unknown, fallback: PersistedSettings): PersistedSettings["profiles"] {
  if (!Array.isArray(candidate)) return fallback.profiles;
  const profiles = candidate.flatMap((profile) => {
    const parsed = automationProfileSchema.safeParse(profile);
    return parsed.success ? [parsed.data] : [];
  });
  return profiles.length > 0 ? profiles : fallback.profiles;
}

function storedRemoteDevices(candidate: unknown): PersistedSettings["remoteDevices"] {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((device) => {
    const storedDevice = device && typeof device === "object" ? device : {};
    const parsed = remoteDeviceSchema.safeParse({ ...storedDevice, connected: false });
    return parsed.success ? [parsed.data] : [];
  });
}

function settingsFromDisk(raw: SettingsOnDisk, fallback: PersistedSettings, bridgeToken: string, remoteAdminSecret: string | null): PersistedSettings {
  const storedAutomation = raw.automation && typeof raw.automation === "object" ? raw.automation : {};
  const automation = automationSettingsSchema.safeParse({ ...fallback.automation, ...storedAutomation });
  const storedStartup = raw.startup && typeof raw.startup === "object" ? raw.startup : {};
  const startup = startupSettingsSchema.safeParse({ ...fallback.startup, ...storedStartup });
  return {
    schemaVersion: 4,
    leaguePath: storedPath(raw.leaguePath),
    bridgeToken,
    automation: automation.success ? automation.data : fallback.automation,
    profiles: storedProfiles(raw.profiles, fallback),
    favorites: storedIds(raw.favorites),
    wishlist: storedIds(raw.wishlist),
    aramFavoriteChampionIds: storedIds(raw.aramFavoriteChampionIds),
    startup: startup.success ? startup.data : fallback.startup,
    remoteDevices: storedRemoteDevices(raw.remoteDevices),
    remoteConfiguration: {
      relayUrl: storedPath(raw.remoteConfiguration?.relayUrl),
      mobileUrl: storedPath(raw.remoteConfiguration?.mobileUrl),
      adminSecret: remoteAdminSecret,
    },
    integrationPaths: {
      rose: storedPath(raw.integrationPaths?.rose),
      deceive: storedPath(raw.integrationPaths?.deceive),
    },
  };
}

export class SettingsStore {
  private readonly filePath: string;
  private current!: PersistedSettings;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly logger: AppLogger) {
    this.filePath = path.join(app.getPath("userData"), "settings.json");
  }

  async load(): Promise<PersistedSettings> {
    const fallback = createDefaultSettings(randomBytes(32).toString("base64url"));
    let source: string | null = null;
    try {
      source = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (source === null) {
      this.logger.info("Creating new settings store", { reason: "Settings file does not exist." });
      this.current = fallback;
    } else {
      try {
        const candidate = JSON.parse(source) as unknown;
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Settings file is invalid.");
        const raw = candidate as SettingsOnDisk;
        const bridgeToken = this.readToken(raw) ?? fallback.bridgeToken;
        const remoteAdminSecret = this.readRemoteAdminSecret(raw);
        this.current = settingsFromDisk(raw, fallback, bridgeToken, remoteAdminSecret);
      } catch (error) {
        const backupName = await this.preserveInvalidSettings(source);
        this.logger.warn("Invalid settings were preserved before reset", { backupName, reason: String(error) });
        this.current = fallback;
      }
    }
    await this.save(this.current);
    return this.get();
  }

  get(): PersistedSettings {
    return structuredClone(this.current);
  }

  async update(mutator: (settings: PersistedSettings) => void): Promise<PersistedSettings> {
    const operation = this.updateQueue.then(async () => {
      const next = this.get();
      mutator(next);
      await this.save(next);
      return this.get();
    });
    this.updateQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async rotateBridgeToken(): Promise<PersistedSettings> {
    return this.update((settings) => {
      settings.bridgeToken = randomBytes(32).toString("base64url");
    });
  }

  private readToken(raw: SettingsOnDisk): string | null {
    if (typeof raw.bridgeTokenEncrypted === "string" && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(raw.bridgeTokenEncrypted, "base64"));
        return decrypted.length >= 32 ? decrypted : null;
      } catch (error) {
        this.logger.warn("Could not decrypt the bridge token; rotating it", { error: String(error) });
      }
    }
    return typeof raw.bridgeToken === "string" && raw.bridgeToken.length >= 32
      ? raw.bridgeToken
      : null;
  }

  private readRemoteAdminSecret(raw: SettingsOnDisk): string | null {
    if (typeof raw.remoteAdminSecretEncrypted === "string" && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(raw.remoteAdminSecretEncrypted, "base64"));
        return decrypted.length >= 32 ? decrypted : null;
      } catch (error) {
        this.logger.warn("Could not decrypt the mobile relay secret", { error: String(error) });
      }
    }
    return typeof raw.remoteAdminSecret === "string" && raw.remoteAdminSecret.length >= 32
      ? raw.remoteAdminSecret
      : null;
  }

  private async preserveInvalidSettings(source: string): Promise<string> {
    const backupName = `settings.invalid-${Date.now()}-${randomBytes(4).toString("hex")}.json`;
    await writeFile(path.join(path.dirname(this.filePath), backupName), source, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return backupName;
  }

  private async save(settings: PersistedSettings): Promise<void> {
    const { bridgeToken, remoteConfiguration, ...rest } = settings;
    if (!safeStorage.isEncryptionAvailable() && app.isPackaged) {
      throw new Error("Windows credential encryption is unavailable; refusing to store the bridge secret in plaintext.");
    }
    const remoteUrls = { relayUrl: remoteConfiguration.relayUrl, mobileUrl: remoteConfiguration.mobileUrl };
    const disk: SettingsOnDisk = safeStorage.isEncryptionAvailable()
      ? {
          ...rest,
          remoteConfiguration: remoteUrls,
          bridgeTokenEncrypted: safeStorage.encryptString(bridgeToken).toString("base64"),
          ...(remoteConfiguration.adminSecret ? { remoteAdminSecretEncrypted: safeStorage.encryptString(remoteConfiguration.adminSecret).toString("base64") } : {}),
        }
      : { ...rest, remoteConfiguration: remoteUrls, bridgeToken, ...(remoteConfiguration.adminSecret ? { remoteAdminSecret: remoteConfiguration.adminSecret } : {}) };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(disk, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.filePath);
    this.current = settings;
  }
}
