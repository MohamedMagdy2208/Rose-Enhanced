import { createHash } from "node:crypto";
import {
  buildCollectionSnapshot,
  type RawChampion,
  type RawInventoryItem,
  type RawLootItem,
} from "@rose-enhanced/core";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";
import { CollectionCache } from "./collection-cache";

interface ChampionSummary {
  id: number;
}

// Five-digit records are virtual game-mode variants, not distinct collection champions.
const MAX_STANDARD_CHAMPION_ID = 9_999;

export function standardChampionIds(summary: ChampionSummary[]): number[] {
  return summary
    .map((champion) => champion.id)
    .filter((championId) => championId > 0 && championId <= MAX_STANDARD_CHAMPION_ID);
}

interface CurrentSummoner {
  puuid?: string;
}

const refreshUris = new Set([
  "/lol-inventory/v2/inventory/CHAMPION_SKIN",
  "/lol-loot/v1/player-loot",
  "/lol-collections/v1/inventories/champion-skins",
]);

export class CollectionService {
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private readonly cache: CollectionCache;

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly logger: AppLogger,
  ) {
    this.cache = new CollectionCache(logger);
  }

  start(): void {
    void this.restoreCache();
    this.lcu.on("connected", () => void this.refresh());
    this.lcu.on("disconnected", () => {
      this.store.update((snapshot) => {
        snapshot.collection = snapshot.collection.champions.length > 0
          ? { ...snapshot.collection, status: "ready", source: "cache", stale: true, warnings: ["League client is disconnected. Showing cached data."] }
          : { ...snapshot.collection, status: "unavailable", source: "none", stale: false, warnings: ["League client is disconnected."] };
      });
    });
    this.lcu.on("event", (event: LcuEvent) => {
      if (refreshUris.has(event.uri)) this.scheduleRefresh();
    });
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 500);
  }

  private async performRefresh(): Promise<void> {
    if (!this.lcu.isConnected()) {
      throw new Error("Connect to League before refreshing the collection.");
    }
    this.store.update((snapshot) => {
      snapshot.collection.status = "loading";
      snapshot.collection.warnings = [];
    });

    try {
      const summary = await this.lcu.get<ChampionSummary[]>("/lol-game-data/assets/v1/champion-summary.json");
      const championIds = standardChampionIds(summary);
      const champions = await this.loadChampions(championIds);
      const warnings: string[] = [];
      const inventory = await this.requiredCollectionEndpoint<RawInventoryItem[]>(
        "/lol-inventory/v2/inventory/CHAMPION_SKIN",
        "skinInventory",
        "Skin ownership",
      );
      const loot = await this.requiredCollectionEndpoint<RawLootItem[]>(
        "/lol-loot/v1/player-loot",
        "lootInventory",
        "Loot",
      );
      const summoner: CurrentSummoner = await this.lcu
        .get<CurrentSummoner>("/lol-summoner/v1/current-summoner")
        .catch((): CurrentSummoner => ({}));
      const state = this.lcu.getState();
      const collection = buildCollectionSnapshot({
        champions,
        inventory,
        loot,
        favorites: new Set(this.settings.get().favorites),
        wishlist: new Set(this.settings.get().wishlist),
        patch: state.patch,
        accountKey: summoner.puuid
          ? createHash("sha256").update(summoner.puuid).digest("hex").slice(0, 16)
          : null,
        warnings,
      });
      this.store.update((snapshot) => {
        snapshot.collection = collection;
        snapshot.connection.capabilities.championCatalog = true;
        snapshot.connection.capabilities.skinInventory = true;
        snapshot.connection.capabilities.lootInventory = true;
      });
      await this.cache.save(collection);
      this.logger.info("Collection refreshed", collection.progress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.update((snapshot) => {
        if (snapshot.collection.champions.length > 0) {
          snapshot.collection = { ...snapshot.collection, status: "ready", source: "cache", stale: true, warnings: [message] };
        } else {
          snapshot.collection.status = "error";
          snapshot.collection.warnings = [message];
        }
      });
      this.logger.error("Collection refresh failed", { error: message });
      throw error;
    }
  }

  private async restoreCache(): Promise<void> {
    const cached = await this.cache.loadLatest();
    if (!cached) return;
    this.store.update((snapshot) => {
      if (snapshot.collection.status === "idle") snapshot.collection = cached;
    });
  }

  private async loadChampions(ids: number[]): Promise<RawChampion[]> {
    const result: RawChampion[] = [];
    const queue = [...ids];
    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) continue;
        try {
          result.push(await this.lcu.get<RawChampion>(`/lol-game-data/assets/v1/champions/${id}.json`));
        } catch (error) {
          this.logger.warn("Champion detail unavailable", { championId: id, error: String(error) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, ids.length) }, () => worker()));
    return result;
  }

  private async requiredCollectionEndpoint<T>(
    endpoint: string,
    capability: "skinInventory" | "lootInventory",
    label: string,
  ): Promise<T> {
    try {
      return await this.lcu.get<T>(endpoint);
    } catch (error) {
      this.store.update((snapshot) => { snapshot.connection.capabilities[capability] = false; });
      this.logger.warn(`${label} endpoint unavailable`, { error: String(error) });
      throw new Error(`${label} data is unavailable on this League patch. Cached data is preserved instead of showing false zero totals.`);
    }
  }
}
