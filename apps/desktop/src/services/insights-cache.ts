import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type {
  ChampionPerformanceSnapshot,
  RuneRecommendationsSnapshot,
} from "@summonerkit/contracts";
import type { AppLogger } from "./logger";

interface InsightsCacheDocument {
  schemaVersion: 1;
  runes: RuneRecommendationsSnapshot | null;
  performance: Record<string, ChampionPerformanceSnapshot>;
}

const emptyDocument = (): InsightsCacheDocument => ({ schemaVersion: 1, runes: null, performance: {} });

function validDocument(candidate: unknown): candidate is InsightsCacheDocument {
  if (!candidate || typeof candidate !== "object") return false;
  const document = candidate as Partial<InsightsCacheDocument>;
  return document.schemaVersion === 1
    && (document.runes === null || typeof document.runes === "object")
    && Boolean(document.performance && typeof document.performance === "object");
}

function asCachedRunes(snapshot: RuneRecommendationsSnapshot): RuneRecommendationsSnapshot {
  return {
    ...snapshot,
    status: "ready",
    source: "cache",
    stale: true,
    warnings: ["Showing cached rune recommendations while online data refreshes.", ...snapshot.warnings],
  };
}

function asCachedPerformance(snapshot: ChampionPerformanceSnapshot): ChampionPerformanceSnapshot {
  return {
    ...snapshot,
    status: "ready",
    source: "cache",
    stale: true,
    warnings: ["Showing cached performance until League match history is available.", ...snapshot.warnings],
  };
}

export class InsightsCache {
  private readonly filePath = path.join(app.getPath("userData"), "cache", "insights-v1.json");

  constructor(private readonly logger: AppLogger) {}

  async loadRunes(): Promise<RuneRecommendationsSnapshot | null> {
    const snapshot = (await this.loadDocument()).runes;
    return snapshot?.status === "ready" ? asCachedRunes(snapshot) : null;
  }

  async saveRunes(snapshot: RuneRecommendationsSnapshot): Promise<void> {
    if (snapshot.status !== "ready") return;
    const document = await this.loadDocument();
    document.runes = { ...snapshot, source: "online", stale: false };
    await this.write(document);
  }

  async loadPerformance(accountKey: string): Promise<ChampionPerformanceSnapshot | null> {
    const snapshot = (await this.loadDocument()).performance[accountKey];
    return snapshot?.status === "ready" ? asCachedPerformance(snapshot) : null;
  }

  async savePerformance(accountKey: string, snapshot: ChampionPerformanceSnapshot): Promise<void> {
    if (snapshot.status !== "ready") return;
    const document = await this.loadDocument();
    document.performance[accountKey] = { ...snapshot, source: "live", stale: false };
    document.performance = Object.fromEntries(Object.entries(document.performance).slice(-6));
    await this.write(document);
  }

  private async loadDocument(): Promise<InsightsCacheDocument> {
    try {
      const candidate = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      return validDocument(candidate) ? candidate : emptyDocument();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn("Insights cache will be rebuilt", { error: String(error) });
      }
      return emptyDocument();
    }
  }

  private async write(document: InsightsCacheDocument): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
