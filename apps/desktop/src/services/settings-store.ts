import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";
import { createDefaultSettings, type PersistedSettings } from "@summonerkit/core";
import { automationProfileSchema } from "@summonerkit/contracts";
import { z } from "zod";
import type { AppLogger } from "./logger";

type SettingsOnDisk = Partial<Omit<PersistedSettings, "bridgeToken">> & {
  bridgeToken?: string;
  bridgeTokenEncrypted?: string;
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

function settingsFromDisk(raw: SettingsOnDisk, fallback: PersistedSettings, bridgeToken: string): PersistedSettings {
  const storedAutomation = raw.automation && typeof raw.automation === "object" ? raw.automation : {};
  const automation = automationSettingsSchema.safeParse({ ...fallback.automation, ...storedAutomation });
  return {
    schemaVersion: 2,
    leaguePath: storedPath(raw.leaguePath),
    bridgeToken,
    automation: automation.success ? automation.data : fallback.automation,
    profiles: storedProfiles(raw.profiles, fallback),
    favorites: storedIds(raw.favorites),
    wishlist: storedIds(raw.wishlist),
    aramFavoriteChampionIds: storedIds(raw.aramFavoriteChampionIds),
    remoteDevices: storedRemoteDevices(raw.remoteDevices),
    integrationPaths: {
      rose: storedPath(raw.integrationPaths?.rose),
      deceive: storedPath(raw.integrationPaths?.deceive),
    },
  };
}

export class SettingsStore {
  private readonly filePath: string;
  private current!: PersistedSettings;

  constructor(private readonly logger: AppLogger) {
    this.filePath = path.join(app.getPath("userData"), "settings.json");
  }

  async load(): Promise<PersistedSettings> {
    const fallback = createDefaultSettings(randomBytes(32).toString("base64url"));
    try {
      const candidate = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Settings file is invalid.");
      const raw = candidate as SettingsOnDisk;
      const bridgeToken = this.readToken(raw) ?? fallback.bridgeToken;
      this.current = settingsFromDisk(raw, fallback, bridgeToken);
    } catch (error) {
      this.logger.info("Creating new settings store", { reason: String(error) });
      this.current = fallback;
    }
    await this.save(this.current);
    return this.get();
  }

  get(): PersistedSettings {
    return structuredClone(this.current);
  }

  async update(mutator: (settings: PersistedSettings) => void): Promise<PersistedSettings> {
    const next = this.get();
    mutator(next);
    await this.save(next);
    return this.get();
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

  private async save(settings: PersistedSettings): Promise<void> {
    const { bridgeToken, ...rest } = settings;
    if (!safeStorage.isEncryptionAvailable() && app.isPackaged) {
      throw new Error("Windows credential encryption is unavailable; refusing to store the bridge secret in plaintext.");
    }
    const disk: SettingsOnDisk = safeStorage.isEncryptionAvailable()
      ? { ...rest, bridgeTokenEncrypted: safeStorage.encryptString(bridgeToken).toString("base64") }
      : { ...rest, bridgeToken };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(disk, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.filePath);
    this.current = settings;
  }
}
