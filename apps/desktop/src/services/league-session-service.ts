import type {
  ChampionSelectActionState,
  ChampionSelectParticipant,
  CompanionCommand,
  LeagueSessionState,
  QueueActivity,
  RunePageOption,
  SummonerSpellOption,
} from "@rose-enhanced/contracts";
import type { CompanionStore } from "./companion-store";
import { emptyLeagueSessionState } from "./league-session-state";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";

interface RawReadyCheck { state?: unknown }
interface RawLobby { gameConfig?: { queueId?: unknown } }
interface RawAction {
  id?: unknown;
  actorCellId?: unknown;
  championId?: unknown;
  completed?: unknown;
  isInProgress?: unknown;
  type?: unknown;
}
interface RawParticipant {
  cellId?: unknown;
  championId?: unknown;
  championPickIntent?: unknown;
  assignedPosition?: unknown;
  selectedSkinId?: unknown;
  spell1Id?: unknown;
  spell2Id?: unknown;
}
interface RawChampSelectSession {
  id?: unknown;
  gameId?: unknown;
  localPlayerCellId?: unknown;
  actions?: unknown;
  myTeam?: unknown;
  theirTeam?: unknown;
  bans?: { myTeamBans?: unknown; theirTeamBans?: unknown };
  timer?: { phase?: unknown; adjustedTimeLeftInPhase?: unknown; timeLeftInPhase?: unknown };
}
interface RawSummonerSpell { id?: unknown; name?: unknown }
interface RawRunePage { id?: unknown; name?: unknown; current?: unknown }

const inGamePhases = new Set(["GameStart", "InProgress", "PreEndOfGame", "EndOfGame", "WaitingForStats"]);

function positiveInteger(candidate: unknown): number | null {
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

function nonNegativeInteger(candidate: unknown): number | null {
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
}

function boundedText(candidate: unknown, maximum = 80): string | null {
  return typeof candidate === "string" && candidate.trim() ? candidate.trim().slice(0, maximum) : null;
}

function boundedIdentifier(candidate: unknown): string | null {
  if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return String(candidate);
  return boundedText(candidate, 128);
}

function championIds(candidates: unknown): number[] {
  if (!Array.isArray(candidates)) return [];
  const identifiers = candidates.flatMap((candidate) => {
    const identifier = positiveInteger(candidate);
    return identifier === null ? [] : [identifier];
  });
  return [...new Set(identifiers.slice(0, 500))];
}

function normalizeParticipant(candidate: unknown, localPlayerCellId: number | null): ChampionSelectParticipant | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as RawParticipant;
  const cellId = nonNegativeInteger(raw.cellId);
  if (cellId === null) return null;
  return {
    cellId,
    championId: positiveInteger(raw.championId),
    championPickIntent: positiveInteger(raw.championPickIntent),
    assignedPosition: boundedText(raw.assignedPosition, 24),
    isLocalPlayer: cellId === localPlayerCellId,
  };
}

function normalizeTeam(candidates: unknown, localPlayerCellId: number | null): ChampionSelectParticipant[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => normalizeParticipant(candidate, localPlayerCellId) ?? []).slice(0, 10);
}

function rawActions(session: RawChampSelectSession | null): RawAction[] {
  if (!Array.isArray(session?.actions)) return [];
  return session.actions.flatMap((group) => Array.isArray(group) ? group : [])
    .filter((action): action is RawAction => Boolean(action && typeof action === "object"));
}

function normalizeAction(action: RawAction | undefined): ChampionSelectActionState | null {
  const id = positiveInteger(action?.id);
  const type = action?.type === "pick" || action?.type === "ban" ? action.type : null;
  if (id === null || type === null) return null;
  return {
    id,
    type,
    championId: positiveInteger(action?.championId),
    completed: action?.completed === true,
    inProgress: action?.isInProgress === true,
  };
}

function localRawAction(session: RawChampSelectSession | null): RawAction | undefined {
  const localCellId = nonNegativeInteger(session?.localPlayerCellId);
  if (localCellId === null) return undefined;
  return rawActions(session).find((action) =>
    nonNegativeInteger(action.actorCellId) === localCellId && action.isInProgress === true && action.completed !== true,
  );
}

function normalizeSpells(candidates: unknown): SummonerSpellOption[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as RawSummonerSpell;
    const id = positiveInteger(raw.id);
    const name = boundedText(raw.name);
    return id && name ? [{ id, name }] : [];
  }).slice(0, 100);
}

function normalizeRunePages(candidates: unknown): RunePageOption[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as RawRunePage;
    const id = positiveInteger(raw.id);
    const name = boundedText(raw.name);
    return id && name ? [{ id, name, current: raw.current === true, roseManaged: name.startsWith("Rose Enhanced · ") }] : [];
  }).slice(0, 100);
}

interface QueueActivityContext {
  phase: string;
  lobbyAvailable: boolean;
  searching: boolean;
  readyCheck: boolean;
  championSelect: boolean;
}

function queueActivity(context: QueueActivityContext): QueueActivity {
  if (context.championSelect || context.phase === "ChampSelect") return "champ-select";
  if (context.readyCheck || context.phase === "ReadyCheck") return "ready-check";
  if (context.searching || context.phase === "Matchmaking") return "searching";
  if (inGamePhases.has(context.phase)) return "in-game";
  if (context.lobbyAvailable || context.phase === "Lobby") return "lobby";
  return "unavailable";
}

function searchingFrom(searchState: string | null, phase: string): boolean {
  if (phase === "Matchmaking") return true;
  if (!searchState) return false;
  return !["Invalid", "NotSearching", "None", "Idle"].includes(searchState);
}

export class LeagueSessionService {
  private readyCheck: RawReadyCheck | null = null;
  private lobby: RawLobby | null = null;
  private searchState: string | null = null;
  private champSelect: RawChampSelectSession | null = null;
  private pickableChampionIds: number[] = [];
  private bannableChampionIds: number[] = [];
  private summonerSpells: SummonerSpellOption[] = [];
  private runePages: RunePageOption[] = [];

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
  ) {}

  start(): void {
    this.lcu.on("connected", this.onLcuConnected);
    this.lcu.on("disconnected", this.onLcuDisconnected);
    this.lcu.on("state", this.publishOnLcuState);
    this.lcu.on("event", this.routeLcuEvent);
  }

  stop(): void {
    this.lcu.off("connected", this.onLcuConnected);
    this.lcu.off("disconnected", this.onLcuDisconnected);
    this.lcu.off("state", this.publishOnLcuState);
    this.lcu.off("event", this.routeLcuEvent);
  }

  async executeManual(command: CompanionCommand): Promise<void> {
    const state = this.store.getSnapshot().session;
    switch (command.type) {
      case "readyCheck.accept":
      case "readyCheck.decline":
        if (!state.readyCheck.active) throw new Error("No ready check is active.");
        await this.lcu.post(`/lol-matchmaking/v1/ready-check/${command.type === "readyCheck.accept" ? "accept" : "decline"}`);
        return;
      case "queue.start":
        if (!state.queue.canStart) throw new Error("Create or join an available lobby before starting queue.");
        await this.lcu.post("/lol-lobby/v2/lobby/matchmaking/search");
        return;
      case "queue.stop":
        if (!state.queue.canStop) throw new Error("Matchmaking is not currently searching.");
        await this.lcu.delete("/lol-lobby/v2/lobby/matchmaking/search");
        return;
      case "champSelect.hover":
      case "champSelect.lock":
        await this.selectChampion(command.championId, command.type === "champSelect.lock");
        return;
      case "champSelect.setSpells":
        await this.setSpells(command.spell1Id, command.spell2Id);
        return;
      case "champSelect.setRunePage":
        await this.setRunePage(command.pageId);
        return;
      case "champSelect.selectOwnedSkin":
        await this.selectOwnedSkin(command.skinId);
        return;
      default:
        throw new Error("Command is not a live League session action.");
    }
  }

  private readonly onLcuConnected = (): void => { void this.hydrate(); };
  private readonly onLcuDisconnected = (): void => {
    this.readyCheck = null;
    this.lobby = null;
    this.searchState = null;
    this.champSelect = null;
    this.pickableChampionIds = [];
    this.bannableChampionIds = [];
    this.summonerSpells = [];
    this.runePages = [];
    this.publish();
  };
  private readonly publishOnLcuState = (): void => this.publish();
  private readonly routeLcuEvent = (event: LcuEvent): void => {
    if (event.uri === "/lol-matchmaking/v1/ready-check") {
      this.readyCheck = event.eventType === "Delete" ? null : event.data as RawReadyCheck;
    } else if (event.uri === "/lol-lobby/v2/lobby") {
      this.lobby = event.eventType === "Delete" ? null : event.data as RawLobby;
    } else if (event.uri === "/lol-lobby/v2/lobby/matchmaking/search-state") {
      this.searchState = event.eventType === "Delete" ? null : boundedText(event.data, 40);
    } else if (event.uri === "/lol-champ-select/v1/session") {
      this.champSelect = event.eventType === "Delete" ? null : event.data as RawChampSelectSession;
      if (this.champSelect) void this.refreshChampionAvailability();
      else {
        this.pickableChampionIds = [];
        this.bannableChampionIds = [];
      }
    } else if (event.uri.startsWith("/lol-perks/v1/pages") || event.uri === "/lol-perks/v1/currentpage") {
      void this.refreshRunePages();
    }
    this.publish();
  };

  private async hydrate(): Promise<void> {
    const [readyCheck, lobby, searchState, champSelect, spells, runePages] = await Promise.all([
      this.lcu.get<RawReadyCheck>("/lol-matchmaking/v1/ready-check").catch(() => null),
      this.lcu.get<RawLobby>("/lol-lobby/v2/lobby").catch(() => null),
      this.lcu.get<unknown>("/lol-lobby/v2/lobby/matchmaking/search-state").catch(() => null),
      this.lcu.get<RawChampSelectSession>("/lol-champ-select/v1/session").catch(() => null),
      this.lcu.get<unknown>("/lol-game-data/assets/v1/summoner-spells.json").catch(() => []),
      this.lcu.get<unknown>("/lol-perks/v1/pages").catch(() => []),
    ]);
    if (!this.lcu.isConnected()) return;
    this.readyCheck = readyCheck;
    this.lobby = lobby;
    this.searchState = boundedText(searchState, 40);
    this.champSelect = champSelect;
    this.summonerSpells = normalizeSpells(spells);
    this.runePages = normalizeRunePages(runePages);
    if (champSelect) await this.refreshChampionAvailability();
    this.publish();
  }

  private async refreshChampionAvailability(): Promise<void> {
    const [pickable, bannable] = await Promise.all([
      this.lcu.get<unknown>("/lol-champ-select/v1/pickable-champion-ids").catch(() => []),
      this.lcu.get<unknown>("/lol-champ-select/v1/bannable-champion-ids").catch(() => []),
    ]);
    if (!this.champSelect) return;
    this.pickableChampionIds = championIds(pickable);
    this.bannableChampionIds = championIds(bannable);
    this.publish();
  }

  private async refreshRunePages(): Promise<void> {
    const pages = await this.lcu.get<unknown>("/lol-perks/v1/pages").catch(() => []);
    this.runePages = normalizeRunePages(pages);
    this.publish();
  }

  private publish(): void {
    const phase = this.lcu.getState().phase;
    const readyState = boundedText(this.readyCheck?.state, 40);
    const readyActive = readyState === "InProgress";
    const championSelectActive = this.champSelect !== null;
    const searching = searchingFrom(this.searchState, phase);
    const activity = queueActivity({
      phase,
      lobbyAvailable: this.lobby !== null,
      searching,
      readyCheck: readyActive,
      championSelect: championSelectActive,
    });
    const championSelect = this.normalizedChampionSelect();
    const queueId = positiveInteger(this.lobby?.gameConfig?.queueId);
    this.store.update((snapshot) => {
      snapshot.session = {
        queue: {
          activity,
          lobbyAvailable: this.lobby !== null,
          queueId,
          searchState: this.searchState,
          canStart: this.lcu.isConnected() && this.lobby !== null && activity === "lobby",
          canStop: this.lcu.isConnected() && activity === "searching",
        },
        readyCheck: { active: readyActive, state: readyState, canAccept: readyActive, canDecline: readyActive },
        championSelect,
        summonerSpells: this.summonerSpells,
        runePages: this.runePages,
      };
    });
  }

  private normalizedChampionSelect(): LeagueSessionState["championSelect"] {
    const session = this.champSelect;
    if (!session) return emptyLeagueSessionState().championSelect;
    const localPlayerCellId = nonNegativeInteger(session.localPlayerCellId);
    const myTeam = normalizeTeam(session.myTeam, localPlayerCellId);
    const theirTeam = normalizeTeam(session.theirTeam, localPlayerCellId);
    const localMember = Array.isArray(session.myTeam)
      ? session.myTeam.find((candidate) => candidate && typeof candidate === "object" && nonNegativeInteger((candidate as RawParticipant).cellId) === localPlayerCellId) as RawParticipant | undefined
      : undefined;
    const localAction = normalizeAction(localRawAction(session));
    const timerRemaining = session.timer?.adjustedTimeLeftInPhase ?? session.timer?.timeLeftInPhase;
    return {
      active: true,
      sessionId: boundedIdentifier(session.id) ?? boundedIdentifier(session.gameId),
      timerPhase: boundedText(session.timer?.phase, 40),
      timerRemainingMs: typeof timerRemaining === "number" && Number.isFinite(timerRemaining) && timerRemaining >= 0 ? Math.round(timerRemaining) : null,
      timerUpdatedAt: new Date().toISOString(),
      localPlayerCellId,
      localAction,
      myTeam,
      theirTeam,
      myTeamBans: championIds(session.bans?.myTeamBans).slice(0, 10),
      theirTeamBans: championIds(session.bans?.theirTeamBans).slice(0, 10),
      pickableChampionIds: this.pickableChampionIds,
      bannableChampionIds: this.bannableChampionIds,
      selectedChampionId: localAction?.championId ?? positiveInteger(localMember?.championId) ?? positiveInteger(localMember?.championPickIntent),
      selectedSkinId: positiveInteger(localMember?.selectedSkinId),
      spell1Id: positiveInteger(localMember?.spell1Id),
      spell2Id: positiveInteger(localMember?.spell2Id),
    };
  }

  private async selectChampion(championId: number, completed: boolean): Promise<void> {
    const state = this.store.getSnapshot().session.championSelect;
    const action = state.localAction;
    if (!state.active || !action?.inProgress || action.completed) throw new Error("No active local pick or ban action exists.");
    const available = action.type === "ban" ? state.bannableChampionIds : state.pickableChampionIds;
    if (!available.includes(championId)) throw new Error("That champion is no longer available for this action.");
    if (action.type === "ban" && state.myTeam.some((member) => member.championPickIntent === championId || member.championId === championId)) {
      throw new Error("That ban conflicts with an allied champion intent.");
    }
    await this.lcu.patch(`/lol-champ-select/v1/session/actions/${action.id}`, { championId, completed });
  }

  private async setSpells(spell1Id: number, spell2Id: number): Promise<void> {
    const state = this.store.getSnapshot().session;
    if (!state.championSelect.active) throw new Error("Summoner spells can only be changed during champion select.");
    if (spell1Id === spell2Id) throw new Error("Choose two different summoner spells.");
    const available = new Set(state.summonerSpells.map((spell) => spell.id));
    if (!available.has(spell1Id) || !available.has(spell2Id)) throw new Error("A selected summoner spell is unavailable on this client patch.");
    await this.lcu.patch("/lol-champ-select/v1/session/my-selection", { spell1Id, spell2Id });
  }

  private async setRunePage(pageId: number): Promise<void> {
    const state = this.store.getSnapshot().session;
    if (!state.championSelect.active) throw new Error("Rune pages can only be changed during champion select.");
    if (!state.runePages.some((page) => page.id === pageId)) throw new Error("That rune page is no longer available.");
    await this.lcu.put("/lol-perks/v1/currentpage", pageId);
    this.runePages = this.runePages.map((page) => ({ ...page, current: page.id === pageId }));
    this.publish();
  }

  private async selectOwnedSkin(skinId: number): Promise<void> {
    const snapshot = this.store.getSnapshot();
    const selectedChampionId = snapshot.session.championSelect.selectedChampionId;
    if (!snapshot.session.championSelect.active || !selectedChampionId) throw new Error("Choose a champion before selecting a skin.");
    const skin = snapshot.collection.champions
      .find((champion) => champion.id === selectedChampionId)
      ?.skins.find((candidate) => candidate.id === skinId);
    if (!skin?.owned) throw new Error("Only an owned skin for the selected champion can be used.");
    await this.lcu.patch("/lol-champ-select/v1/session/my-selection", { selectedSkinId: skinId });
  }
}
