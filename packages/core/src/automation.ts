import type {
  AutomationDecision,
  AutomationProfile,
  AutomationSettings,
} from "@summonerkit/contracts";

export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress: boolean;
  type: "pick" | "ban" | string;
}

export interface AutomationContext {
  sessionId: string;
  localPlayerCellId: number;
  timerRemainingMs: number | null;
  actions: ChampSelectAction[];
  pickableChampionIds: ReadonlySet<number>;
  bannableChampionIds: ReadonlySet<number>;
  alliedIntentChampionIds: ReadonlySet<number>;
  profile: AutomationProfile;
  settings: AutomationSettings;
}

export type AutomationEffect =
  | { type: "acceptReadyCheck"; decision: AutomationDecision }
  | { type: "hoverAction"; actionId: number; championId: number; decision: AutomationDecision }
  | { type: "completeAction"; actionId: number; championId: number; decision: AutomationDecision }
  | { type: "auditOnly"; decision: AutomationDecision };

function decision(
  action: AutomationDecision["action"],
  context: Pick<AutomationContext, "sessionId" | "profile">,
  reason: string,
  actionId: number | null = null,
  championId: number | null = null,
): AutomationDecision {
  return {
    action,
    sessionId: context.sessionId,
    actionId,
    championId,
    profileId: context.profile.id,
    reason,
  };
}

export class AutomationEngine {
  private readonly readyCheckFirstSeen = new Map<string, number>();
  private readonly acceptedReadyChecks = new Set<string>();
  private readonly autoHovered = new Map<string, number>();
  private readonly cancelledActions = new Set<string>();
  private readonly completedActions = new Set<string>();

  evaluateReadyCheck(input: {
    sessionId: string;
    state: string;
    nowMs: number;
    profile: AutomationProfile;
    settings: AutomationSettings;
  }): AutomationEffect[] {
    if (!input.settings.riskAcknowledged || !input.settings.autoAccept) return [];
    if (input.state !== "InProgress") {
      this.readyCheckFirstSeen.delete(input.sessionId);
      return [];
    }
    if (this.acceptedReadyChecks.has(input.sessionId)) return [];

    const firstSeen = this.readyCheckFirstSeen.get(input.sessionId) ?? input.nowMs;
    this.readyCheckFirstSeen.set(input.sessionId, firstSeen);
    if (input.nowMs - firstSeen < input.profile.readyCheckDelayMs) return [];

    this.acceptedReadyChecks.add(input.sessionId);
    return [
      {
        type: "acceptReadyCheck",
        decision: {
          action: "accept",
          sessionId: input.sessionId,
          actionId: null,
          championId: null,
          profileId: input.profile.id,
          reason: `Ready check remained active for ${input.profile.readyCheckDelayMs} ms.`,
        },
      },
    ];
  }

  evaluateChampSelect(context: AutomationContext): AutomationEffect[] {
    if (!context.settings.riskAcknowledged) return [];
    const action = context.actions.find(
      (candidate) =>
        candidate.actorCellId === context.localPlayerCellId &&
        candidate.isInProgress &&
        !candidate.completed &&
        (candidate.type === "pick" || candidate.type === "ban"),
    );
    if (!action) return [];

    const actionKey = `${context.sessionId}:${action.id}`;
    if (this.completedActions.has(actionKey) || this.cancelledActions.has(actionKey)) return [];

    const enabled = action.type === "pick" ? context.settings.autoPick : context.settings.autoBan;
    if (!enabled) return [];

    const priority =
      action.type === "pick" ? context.profile.pickPriority : context.profile.banPriority;
    const validIds =
      action.type === "pick" ? context.pickableChampionIds : context.bannableChampionIds;
    const championId = priority.find(
      (candidate) =>
        validIds.has(candidate) &&
        (action.type !== "ban" || !context.alliedIntentChampionIds.has(candidate)),
    );

    if (!championId) {
      this.cancelledActions.add(actionKey);
      return [
        {
          type: "auditOnly",
          decision: decision(
            "skip",
            context,
            `No valid ${action.type} remained in the configured priority list.`,
            action.id,
          ),
        },
      ];
    }

    const priorAutomatedHover = this.autoHovered.get(actionKey);
    if (priorAutomatedHover && action.championId > 0 && action.championId !== priorAutomatedHover) {
      this.cancelledActions.add(actionKey);
      return [
        {
          type: "auditOnly",
          decision: decision(
            "cancel",
            context,
            "Manual champion selection detected; automation yielded for this action.",
            action.id,
            action.championId,
          ),
        },
      ];
    }

    if (!priorAutomatedHover) {
      if (action.championId > 0 && action.championId !== championId) {
        this.cancelledActions.add(actionKey);
        return [
          {
            type: "auditOnly",
            decision: decision(
              "cancel",
              context,
              "A manual hover was already active when automation evaluated the action.",
              action.id,
              action.championId,
            ),
          },
        ];
      }

      this.autoHovered.set(actionKey, championId);
      return [
        {
          type: "hoverAction",
          actionId: action.id,
          championId,
          decision: decision(
            "hover",
            context,
            `Selected the first valid ${action.type} from profile ${context.profile.name}.`,
            action.id,
            championId,
          ),
        },
      ];
    }

    if (context.timerRemainingMs === null) return [];
    if (context.timerRemainingMs > context.profile.lockLeadTimeMs) return [];
    if (action.championId !== priorAutomatedHover) return [];

    this.completedActions.add(actionKey);
    return [
      {
        type: "completeAction",
        actionId: action.id,
        championId: priorAutomatedHover,
        decision: decision(
          "lock",
          context,
          `Locked with ${Math.max(0, context.timerRemainingMs)} ms remaining.`,
          action.id,
          priorAutomatedHover,
        ),
      },
    ];
  }

  resetSession(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of this.autoHovered.keys()) if (key.startsWith(prefix)) this.autoHovered.delete(key);
    for (const key of this.cancelledActions) if (key.startsWith(prefix)) this.cancelledActions.delete(key);
    for (const key of this.completedActions) if (key.startsWith(prefix)) this.completedActions.delete(key);
    this.readyCheckFirstSeen.delete(sessionId);
    this.acceptedReadyChecks.delete(sessionId);
  }
}
