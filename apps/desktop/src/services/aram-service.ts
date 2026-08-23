import type { CompanionStore } from "./companion-store";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";
import type { SettingsStore } from "./settings-store";

interface AramTeamMember {
  cellId: number;
  championId?: number;
  rerollsRemaining?: number;
}

interface AramSession {
  localPlayerCellId: number;
  benchEnabled?: boolean;
  benchChampions?: Array<{ championId?: number }>;
  myTeam?: AramTeamMember[];
  rerollsRemaining?: number;
  rerollPoints?: number;
}

export class AramService {
  private seenAvailableFavorites = new Set<number>();

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly notify: (title: string, body: string) => void,
  ) {}

  start(): void {
    this.lcu.on("connected", () => void this.hydrate());
    this.lcu.on("disconnected", () => this.clear());
    this.lcu.on("event", (event: LcuEvent) => this.handleEvent(event));
  }

  async toggleFavorite(championId: number): Promise<void> {
    const settings = await this.settings.update((draft) => {
      const favorites = new Set(draft.aramFavoriteChampionIds);
      if (favorites.has(championId)) favorites.delete(championId);
      else favorites.add(championId);
      draft.aramFavoriteChampionIds = [...favorites];
    });
    this.store.update((snapshot) => {
      snapshot.aram.favoriteChampionIds = settings.aramFavoriteChampionIds;
      snapshot.aram.bench = snapshot.aram.bench.map((champion) => ({
        ...champion,
        isFavorite: settings.aramFavoriteChampionIds.includes(champion.championId),
      }));
      snapshot.aram.availableFavoriteChampionIds = snapshot.aram.bench
        .filter((champion) => champion.isFavorite)
        .map((champion) => champion.championId);
    });
  }

  async swap(championId: number): Promise<void> {
    if (!this.store.getSnapshot().aram.bench.some((entry) => entry.championId === championId)) {
      throw new Error("That champion is no longer on the ARAM bench.");
    }
    await this.lcu.post(`/lol-champ-select/v1/session/bench/swap/${championId}`);
  }

  private async hydrate(): Promise<void> {
    const session = await this.lcu.get<AramSession>("/lol-champ-select/v1/session").catch(() => null);
    if (session) this.update(session);
  }

  private handleEvent(event: LcuEvent): void {
    if (event.uri !== "/lol-champ-select/v1/session") return;
    if (event.eventType === "Delete") this.clear();
    else this.update(event.data as AramSession);
  }

  private update(session: AramSession): void {
    const favoriteIds = new Set(this.settings.get().aramFavoriteChampionIds);
    const benchIds = (session.benchChampions ?? [])
      .flatMap((champion) => champion.championId && champion.championId > 0 ? [champion.championId] : []);
    const availableFavorites = benchIds.filter((championId) => favoriteIds.has(championId));
    this.notifyNewFavorites(availableFavorites);
    const localMember = session.myTeam?.find((member) => member.cellId === session.localPlayerCellId);
    this.store.update((snapshot) => {
      snapshot.aram = {
        active: session.benchEnabled === true,
        currentChampionId: localMember?.championId ?? null,
        bench: benchIds.map((championId) => ({ championId, isFavorite: favoriteIds.has(championId) })),
        favoriteChampionIds: [...favoriteIds],
        availableFavoriteChampionIds: availableFavorites,
        rerollsRemaining: session.rerollsRemaining ?? localMember?.rerollsRemaining ?? null,
        rerollPoints: session.rerollPoints ?? null,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  private notifyNewFavorites(availableFavorites: number[]): void {
    for (const championId of availableFavorites) {
      if (!this.seenAvailableFavorites.has(championId)) {
        this.notify("ARAM favorite available", `Champion ${championId} is available on the bench.`);
      }
    }
    this.seenAvailableFavorites = new Set(availableFavorites);
  }

  private clear(): void {
    this.seenAvailableFavorites.clear();
    this.store.update((snapshot) => {
      snapshot.aram = {
        ...snapshot.aram,
        active: false,
        currentChampionId: null,
        bench: [],
        availableFavoriteChampionIds: [],
        rerollsRemaining: null,
        rerollPoints: null,
        updatedAt: new Date().toISOString(),
      };
    });
  }
}
