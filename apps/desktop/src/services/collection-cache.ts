import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { CollectionSnapshot } from "@summonerkit/contracts";
import type { AppLogger } from "./logger";

interface CollectionCacheDocument {
  schemaVersion: 2;
  latestKey: string | null;
  entries: Record<string, CollectionSnapshot>;
}

const emptyDocument = (): CollectionCacheDocument => ({ schemaVersion: 2, latestKey: null, entries: {} });

function snapshotKey(snapshot: CollectionSnapshot): string | null {
  if (!snapshot.patch || !snapshot.accountKey) return null;
  return createHash("sha256").update(`${snapshot.patch}:${snapshot.accountKey}`).digest("hex").slice(0, 24);
}

function cachedSnapshot(snapshot: CollectionSnapshot): CollectionSnapshot {
  return {
    ...snapshot,
    source: "cache",
    stale: true,
    warnings: ["Showing the latest cached collection while live data refreshes.", ...snapshot.warnings],
  };
}

function validDocument(candidate: unknown): candidate is CollectionCacheDocument {
  if (!candidate || typeof candidate !== "object") return false;
  const document = candidate as Partial<CollectionCacheDocument>;
  return document.schemaVersion === 2 && typeof document.entries === "object" && document.entries !== null;
}

function validSnapshot(candidate: unknown): candidate is CollectionSnapshot {
  if (!candidate || typeof candidate !== "object") return false;
  const snapshot = candidate as Partial<CollectionSnapshot>;
  return snapshot.status === "ready"
    && Array.isArray(snapshot.champions)
    && Boolean(snapshot.progress && typeof snapshot.progress === "object")
    && Array.isArray(snapshot.warnings);
}

export class CollectionCache {
  private readonly filePath = path.join(app.getPath("userData"), "cache", "collection-v2.json");

  constructor(private readonly logger: AppLogger) {}

  async loadLatest(): Promise<CollectionSnapshot | null> {
    try {
      const document = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!validDocument(document) || !document.latestKey) return null;
      const snapshot = document.entries[document.latestKey];
      return validSnapshot(snapshot) ? cachedSnapshot(snapshot) : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("Collection cache could not be loaded", { error: String(error) });
      }
      return null;
    }
  }

  async save(snapshot: CollectionSnapshot): Promise<void> {
    const key = snapshotKey(snapshot);
    if (!key || snapshot.status !== "ready") return;
    const document = await this.loadDocument();
    document.entries[key] = { ...snapshot, source: "live", stale: false };
    document.latestKey = key;
    this.trim(document);
    await this.write(document);
  }

  private async loadDocument(): Promise<CollectionCacheDocument> {
    try {
      const candidate = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      return validDocument(candidate) ? candidate : emptyDocument();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("Collection cache will be rebuilt", { error: String(error) });
      }
      return emptyDocument();
    }
  }

  private trim(document: CollectionCacheDocument): void {
    const entries = Object.entries(document.entries)
      .sort(([, left], [, right]) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, 6);
    document.entries = Object.fromEntries(entries);
  }

  private async write(document: CollectionCacheDocument): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
