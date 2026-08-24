import { randomUUID } from "node:crypto";
import type {
  AutomationAuditEvent,
  AutomationProfile,
  PendingAutomationAction,
} from "@summonerkit/contracts";
import {
  AutomationEngine,
  profileFor,
  type AutomationContext,
  type AutomationEffect,
  type ChampSelectAction,
} from "@summonerkit/core";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";
import { RunePageService } from "./rune-page-service";

interface ReadyCheckState {
  state?: string;
}

interface ChampSelectTeamMember {
  cellId: number;
  championId?: number;
  championPickIntent?: number;
  assignedPosition?: string;
}

interface ChampSelectSession {
  id?: string | number;
  gameId?: string | number;
  localPlayerCellId: number;
  actions: ChampSelectAction[][];
  myTeam?: ChampSelectTeamMember[];
  timer?: {
    adjustedTimeLeftInPhase?: number;
    timeLeftInPhase?: number;
  };
}

interface LobbyState {
  gameConfig?: { queueId?: number };
}

type ExecutableAutomationEffect = Exclude<AutomationEffect, { type: "auditOnly" }>;

interface PendingExecution {
  action: PendingAutomationAction;
  effect: ExecutableAutomationEffect;
  profile: AutomationProfile;
}

const roleMap: Record<string, AutomationProfile["role"]> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  MID: "middle",
  BOTTOM: "bottom",
  ADC: "bottom",
  UTILITY: "utility",
  SUPPORT: "utility",
};

export class AutomationService {
  private readonly engine = new AutomationEngine();
  private readonly runePages: RunePageService;
  private evaluationTimer: NodeJS.Timeout | null = null;
  private evaluationDueAt: number | null = null;
  private evaluating = false;
  private deferredEvaluationDueAt: number | null = null;
  private readyCheck: ReadyCheckState | null = null;
  private readySessionId: string | null = null;
  private readyStartedAt: number | null = null;
  private readyEvaluationComplete = false;
  private champSession: ChampSelectSession | null = null;
  private champSessionId: string | null = null;
  private queueId: number | null = null;
  private pickable = new Set<number>();
  private bannable = new Set<number>();
  private champCapabilitiesReady = false;
  private readonly pending = new Map<string, PendingExecution>();

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly logger: AppLogger,
    private readonly notify: (title: string, body: string) => void,
  ) {
    this.runePages = new RunePageService(lcu);
  }

  start(): void {
    this.lcu.on("event", (event: LcuEvent) => this.handleEvent(event));
    this.lcu.on("connected", () => void this.hydrate());
    this.lcu.on("disconnected", () => this.clearSessions());
  }

  stop(): void {
    if (this.evaluationTimer) clearTimeout(this.evaluationTimer);
    this.evaluationTimer = null;
    this.evaluationDueAt = null;
  }

  async confirmPending(pendingId: string): Promise<void> {
    const execution = this.pending.get(pendingId);
    if (!execution) throw new Error("That automation confirmation is no longer active.");
    this.removePending(pendingId);
    await this.executeEffect(execution.effect, execution.profile);
  }

  dismissPending(pendingId: string): void {
    const execution = this.pending.get(pendingId);
    if (!execution) throw new Error("That automation confirmation is no longer active.");
    this.removePending(pendingId);
    this.recordAudit({ ...execution.action, action: "cancel", reason: "User dismissed the pending automation action." }, "cancelled");
  }

  clearPending(): void {
    this.pending.clear();
    this.store.update((snapshot) => { snapshot.pendingAutomation = []; });
  }

  private handleEvent(event: LcuEvent): void {
    if (event.uri === "/lol-matchmaking/v1/ready-check") {
      const priorState = this.readyCheck?.state;
      this.readyCheck = event.eventType === "Delete" ? null : (event.data as ReadyCheckState);
      if (this.readyCheck?.state === "InProgress" && priorState !== "InProgress") {
        this.readySessionId = `ready-${Date.now()}`;
        this.readyStartedAt = Date.now();
        this.readyEvaluationComplete = false;
      }
      if (!this.readyCheck || this.readyCheck.state !== "InProgress") {
        this.readySessionId = null;
        this.readyStartedAt = null;
        this.readyEvaluationComplete = false;
      }
    }

    if (event.uri === "/lol-champ-select/v1/session") {
      if (event.eventType === "Delete") {
        if (this.champSessionId) this.engine.resetSession(this.champSessionId);
        this.champSession = null;
        this.champSessionId = null;
        this.champCapabilitiesReady = false;
        this.pickable.clear();
        this.bannable.clear();
        this.clearPending();
        this.scheduleEvaluate();
        return;
      }
      this.champSession = event.data as ChampSelectSession;
      this.champSessionId ??= this.sessionIdentifier(this.champSession);
      if (event.eventType === "Create") {
        this.champCapabilitiesReady = false;
        void this.hydrateChampSelectCapabilities();
        return;
      }
    }
    this.scheduleEvaluate();
  }

  private async hydrate(): Promise<void> {
    const [ready, session, lobby] = await Promise.all([
      this.lcu.get<ReadyCheckState>("/lol-matchmaking/v1/ready-check").catch(() => null),
      this.lcu.get<ChampSelectSession>("/lol-champ-select/v1/session").catch(() => null),
      this.lcu.get<LobbyState>("/lol-lobby/v2/lobby").catch(() => null),
    ]);
    this.readyCheck = ready;
    if (ready?.state === "InProgress") {
      this.readySessionId = `ready-${Date.now()}`;
      this.readyStartedAt = Date.now();
      this.readyEvaluationComplete = false;
    }
    this.champSession = session;
    if (session) this.champSessionId = this.sessionIdentifier(session);
    this.queueId = lobby?.gameConfig?.queueId ?? null;
    if (session) await this.hydrateChampSelectCapabilities();
    this.scheduleEvaluate();
  }

  private async hydrateChampSelectCapabilities(): Promise<void> {
    const [pickable, bannable, lobby] = await Promise.all([
      this.lcu.get<number[]>("/lol-champ-select/v1/pickable-champion-ids").catch(() => []),
      this.lcu.get<number[]>("/lol-champ-select/v1/bannable-champion-ids").catch(() => []),
      this.lcu.get<LobbyState>("/lol-lobby/v2/lobby").catch(() => null),
    ]);
    this.pickable = new Set(pickable);
    this.bannable = new Set(bannable);
    this.champCapabilitiesReady = true;
    this.queueId = lobby?.gameConfig?.queueId ?? this.queueId;
    this.scheduleEvaluate();
  }

  private async evaluate(): Promise<void> {
    this.expirePending();
    const persisted = this.settings.get();
    const role = this.currentRole();
    const profile = profileFor(persisted.profiles, this.queueId, role);

    if (this.readyCheck?.state && this.readySessionId && !this.readyEvaluationComplete) {
      const effects = this.engine.evaluateReadyCheck({
        sessionId: this.readySessionId,
        state: this.readyCheck.state,
        nowMs: Date.now(),
        profile,
        settings: persisted.automation,
      });
      await this.applyEffects(effects, profile);
      if (effects.length > 0) this.readyEvaluationComplete = true;
      if (!this.readyEvaluationComplete && this.readyStartedAt !== null) {
        const remaining = profile.readyCheckDelayMs - (Date.now() - this.readyStartedAt);
        this.scheduleEvaluate(Math.max(25, remaining + 25));
      }
    }

    if (this.champSession && this.champSessionId && this.champCapabilitiesReady) {
      const context: AutomationContext = {
        sessionId: this.champSessionId,
        localPlayerCellId: this.champSession.localPlayerCellId,
        timerRemainingMs: this.timerRemaining(this.champSession),
        actions: this.champSession.actions.flat(),
        pickableChampionIds: this.pickable,
        bannableChampionIds: this.bannable,
        alliedIntentChampionIds: this.alliedIntentIds(),
        profile,
        settings: persisted.automation,
      };
      await this.applyEffects(this.engine.evaluateChampSelect(context), profile);
      const action = this.localAction();
      const timerRemaining = this.timerRemaining(this.champSession);
      if (action?.championId && timerRemaining !== null && timerRemaining > profile.lockLeadTimeMs) {
        this.scheduleEvaluate(timerRemaining - profile.lockLeadTimeMs + 25);
      }
    }
    const nextExpiry = [...this.pending.values()]
      .map((execution) => Date.parse(execution.action.expiresAt))
      .sort((left, right) => left - right)[0];
    if (nextExpiry) this.scheduleEvaluate(Math.max(25, nextExpiry - Date.now() + 25));
  }

  private async applyEffects(effects: AutomationEffect[], profile: AutomationProfile): Promise<void> {
    const mode = this.settings.get().automation.executionMode;
    for (const effect of effects) {
      if (effect.type === "auditOnly") {
        if (effect.decision.action === "cancel") this.cancelPendingForDecision(effect.decision);
        this.recordAudit(effect.decision, effect.decision.action === "cancel" ? "cancelled" : "skipped");
        continue;
      }
      if (mode === "dry-run") {
        this.recordAudit({ ...effect.decision, reason: `Dry run: ${effect.decision.reason}` }, "planned");
      } else if (mode === "confirm") {
        this.queueConfirmation(effect, profile);
      } else {
        try {
          await this.executeEffect(effect, profile);
        } catch {
          // executeEffect already audits and notifies; the evaluation loop must remain active.
        }
      }
    }
  }

  private async executeEffect(effect: ExecutableAutomationEffect, profile: AutomationProfile): Promise<void> {
    try {
      this.assertEffectStillValid(effect);
      if (effect.type === "acceptReadyCheck") {
        await this.lcu.post("/lol-matchmaking/v1/ready-check/accept");
      } else {
        await this.lcu.patch(`/lol-champ-select/v1/session/actions/${effect.actionId}`, {
          championId: effect.championId,
          completed: effect.type === "completeAction",
        });
        if (effect.type === "completeAction") await this.applyLoadout(profile);
      }
      this.recordAudit(effect.decision, "success");
    } catch (error) {
      this.logger.warn("Automation effect failed", { effect: effect.type, error: String(error) });
      this.recordAudit(effect.decision, "failed");
      this.notify("SummonerKit automation", `${effect.decision.action} failed: ${String(error)}`);
      throw error;
    }
  }

  private assertEffectStillValid(effect: ExecutableAutomationEffect): void {
    if (effect.type === "acceptReadyCheck") {
      if (this.readyCheck?.state !== "InProgress") throw new Error("The ready check is no longer active.");
      return;
    }
    const action = this.localAction();
    if (!action || action.id !== effect.actionId) throw new Error("The champion-select action is no longer active.");
    const available = action.type === "ban" ? this.bannable : this.pickable;
    if (!available.has(effect.championId)) throw new Error("The selected champion is no longer available.");
    if (action.type === "ban" && this.alliedIntentIds().has(effect.championId)) {
      throw new Error("The ban now conflicts with an allied intent.");
    }
  }

  private queueConfirmation(effect: ExecutableAutomationEffect, profile: AutomationProfile): void {
    const duplicate = [...this.pending.values()].some((pending) =>
      pending.action.sessionId === effect.decision.sessionId &&
      pending.action.actionId === effect.decision.actionId &&
      pending.action.action === effect.decision.action,
    );
    if (duplicate) return;
    const now = Date.now();
    const action: PendingAutomationAction = {
      ...effect.decision,
      id: randomUUID(),
      effect: effect.type,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 20_000).toISOString(),
    };
    this.pending.set(action.id, { action, effect, profile });
    this.publishPending();
    this.scheduleEvaluate(20_025);
    this.notify("SummonerKit confirmation", `${action.action}: ${action.reason}`);
  }

  private expirePending(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, execution] of this.pending) {
      if (Date.parse(execution.action.expiresAt) > now) continue;
      this.pending.delete(id);
      changed = true;
      this.recordAudit({ ...execution.action, action: "skip", reason: "Confirmation expired before approval." }, "skipped");
    }
    if (changed) this.publishPending();
  }

  private removePending(pendingId: string): void {
    this.pending.delete(pendingId);
    this.publishPending();
  }

  private cancelPendingForDecision(decision: AutomationEffect["decision"]): void {
    let changed = false;
    for (const [id, execution] of this.pending) {
      if (execution.action.sessionId !== decision.sessionId || execution.action.actionId !== decision.actionId) continue;
      this.pending.delete(id);
      changed = true;
    }
    if (changed) this.publishPending();
  }

  private publishPending(): void {
    const actions = [...this.pending.values()].map((execution) => execution.action);
    this.store.update((snapshot) => { snapshot.pendingAutomation = actions; });
  }

  private alliedIntentIds(): Set<number> {
    return new Set(
      (this.champSession?.myTeam ?? [])
        .map((member) => member.championPickIntent ?? member.championId ?? 0)
        .filter((championId) => championId > 0),
    );
  }

  private async applyLoadout(profile: AutomationProfile): Promise<void> {
    const automation = this.settings.get().automation;
    if (automation.autoSpells && profile.spell1Id && profile.spell2Id) {
      await this.lcu.patch("/lol-champ-select/v1/session/my-selection", {
        spell1Id: profile.spell1Id,
        spell2Id: profile.spell2Id,
      });
    }
    if (automation.autoRunes && profile.runePreset) await this.applyRunePage(profile);
  }

  private async applyRunePage(profile: AutomationProfile): Promise<void> {
    const preset = profile.runePreset;
    if (!preset) return;
    await this.runePages.apply(profile.name, preset);
  }

  private recordAudit(
    decision: AutomationEffect["decision"],
    result: AutomationAuditEvent["result"],
  ): void {
    const event: AutomationAuditEvent = {
      ...decision,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      result,
    };
    this.store.update((snapshot) => {
      snapshot.audit = [event, ...snapshot.audit].slice(0, 100);
    });
  }

  private localAction(): ChampSelectAction | null {
    if (!this.champSession) return null;
    return this.champSession.actions
      .flat()
      .find(
        (action) =>
          action.actorCellId === this.champSession?.localPlayerCellId &&
          action.isInProgress &&
          !action.completed,
      ) ?? null;
  }

  private currentRole(): AutomationProfile["role"] | null {
    if (!this.champSession) return null;
    const member = this.champSession.myTeam?.find(
      (candidate) => candidate.cellId === this.champSession?.localPlayerCellId,
    );
    const position = member?.assignedPosition?.toUpperCase();
    return position ? roleMap[position] ?? null : this.queueId === 450 ? "aram" : null;
  }

  private timerRemaining(session: ChampSelectSession): number | null {
    const value = session.timer?.adjustedTimeLeftInPhase ?? session.timer?.timeLeftInPhase;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }

  private sessionIdentifier(session: ChampSelectSession): string {
    return String(session.id ?? session.gameId ?? `champ-${Date.now()}`);
  }

  private scheduleEvaluate(delayMs = 0): void {
    const dueAt = Date.now() + Math.max(0, delayMs);
    if (this.evaluating) {
      this.deferredEvaluationDueAt = this.deferredEvaluationDueAt === null
        ? dueAt
        : Math.min(this.deferredEvaluationDueAt, dueAt);
      return;
    }
    if (this.evaluationTimer && this.evaluationDueAt !== null && this.evaluationDueAt <= dueAt) return;
    if (this.evaluationTimer) clearTimeout(this.evaluationTimer);
    this.evaluationDueAt = dueAt;
    this.evaluationTimer = setTimeout(() => {
      this.evaluationTimer = null;
      this.evaluationDueAt = null;
      void this.runEvaluation();
    }, Math.max(0, delayMs));
  }

  private async runEvaluation(): Promise<void> {
    if (this.evaluating) {
      this.deferredEvaluationDueAt = Date.now();
      return;
    }
    this.evaluating = true;
    try {
      await this.evaluate();
    } catch (error) {
      this.logger.warn("Automation evaluation failed", { error: String(error) });
    } finally {
      this.evaluating = false;
      if (this.deferredEvaluationDueAt !== null) {
        const delay = Math.max(0, this.deferredEvaluationDueAt - Date.now());
        this.deferredEvaluationDueAt = null;
        this.scheduleEvaluate(delay);
      }
    }
  }

  private clearSessions(): void {
    if (this.champSessionId) this.engine.resetSession(this.champSessionId);
    this.readyCheck = null;
    this.readySessionId = null;
    this.readyStartedAt = null;
    this.readyEvaluationComplete = false;
    this.champSession = null;
    this.champSessionId = null;
    this.queueId = null;
    this.pickable.clear();
    this.bannable.clear();
    this.champCapabilitiesReady = false;
    this.clearPending();
  }
}
