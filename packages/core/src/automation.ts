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
  teammateIntentChampionIds: ReadonlySet<number>;
  championNames: ReadonlyMap<number, string>;
  profile: AutomationProfile;
  settings: AutomationSettings;
}

export type ChampionPriorityCandidateStatus =
  | "selected"
  | "unavailable"
  | "allied-intent"
  | "teammate-intent";

export interface ChampionPriorityCandidateEvaluation {
  championId: number;
  priority: number;
  status: ChampionPriorityCandidateStatus;
}

export interface ChampionPriorityEvaluation {
  championId: number | null;
  priority: number | null;
  candidates: ChampionPriorityCandidateEvaluation[];
}

export function evaluateChampionPriority(input: {
  actionType: "pick" | "ban";
  priority: readonly number[];
  validChampionIds: ReadonlySet<number>;
  alliedIntentChampionIds: ReadonlySet<number>;
  teammateIntentChampionIds: ReadonlySet<number>;
}): ChampionPriorityEvaluation {
  const candidates: ChampionPriorityCandidateEvaluation[] = [];
  for (const [index, championId] of input.priority.entries()) {
    let status: ChampionPriorityCandidateStatus = "selected";
    if (!input.validChampionIds.has(championId)) status = "unavailable";
    else if (input.actionType === "ban" && input.alliedIntentChampionIds.has(championId)) status = "allied-intent";
    else if (input.actionType === "pick" && input.teammateIntentChampionIds.has(championId)) status = "teammate-intent";
    candidates.push({ championId, priority: index + 1, status });
    if (status === "selected") return { championId, priority: index + 1, candidates };
  }
  return { championId: null, priority: null, candidates };
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
  private readonly transitionalHovered = new Map<string, Set<number>>();
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

    const actionType: "pick" | "ban" = action.type === "pick" ? "pick" : "ban";
    const enabled = actionType === "pick" ? context.settings.autoPick : context.settings.autoBan;
    if (!enabled) return [];

    const priority = actionType === "pick" ? context.profile.pickPriority : context.profile.banPriority;
    const validIds =
      actionType === "pick" ? context.pickableChampionIds : context.bannableChampionIds;
    const priorAutomatedHover = this.autoHovered.get(actionKey);
    const transitionalHovered = this.transitionalHovered.get(actionKey);
    if (priorAutomatedHover && action.championId === priorAutomatedHover) {
      this.transitionalHovered.delete(actionKey);
    } else if (
      priorAutomatedHover &&
      action.championId > 0 &&
      !transitionalHovered?.has(action.championId)
    ) {
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

    const evaluation = evaluateChampionPriority({
      actionType,
      priority,
      validChampionIds: validIds,
      alliedIntentChampionIds: context.alliedIntentChampionIds,
      teammateIntentChampionIds: context.teammateIntentChampionIds,
    });
    const championId = evaluation.championId;

    if (!championId) {
      this.cancelledActions.add(actionKey);
      return [
        {
          type: "auditOnly",
          decision: decision(
            "skip",
            context,
            noValidChoiceReason(actionType, evaluation, context.championNames),
            action.id,
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
            selectedChoiceReason(actionType, context.profile.name, evaluation, context.championNames),
            action.id,
            championId,
          ),
        },
      ];
    }

    if (priorAutomatedHover !== championId) {
      this.autoHovered.set(actionKey, championId);
      this.transitionalHovered.set(actionKey, new Set([priorAutomatedHover, championId]));
      return [
        {
          type: "hoverAction",
          actionId: action.id,
          championId,
          decision: decision(
            "hover",
            context,
            `The previous automated hover became invalid. ${selectedChoiceReason(actionType, context.profile.name, evaluation, context.championNames)}`,
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
    for (const key of this.transitionalHovered.keys()) if (key.startsWith(prefix)) this.transitionalHovered.delete(key);
    for (const key of this.cancelledActions) if (key.startsWith(prefix)) this.cancelledActions.delete(key);
    for (const key of this.completedActions) if (key.startsWith(prefix)) this.completedActions.delete(key);
    this.readyCheckFirstSeen.delete(sessionId);
    this.acceptedReadyChecks.delete(sessionId);
  }
}

function selectedChoiceReason(
  actionType: "pick" | "ban",
  profileName: string,
  evaluation: ChampionPriorityEvaluation,
  championNames: ReadonlyMap<number, string>,
): string {
  const priority = evaluation.priority ?? 1;
  if (priority === 1) return `Selected the primary ${actionType} from profile ${profileName}.`;
  const skipped = evaluation.candidates.slice(0, -1).map((candidate) => candidateSummary(candidate, championNames)).join(", ");
  return `Skipped ${priority - 1} earlier ${actionType} choice${priority === 2 ? "" : "s"} (${skipped}); selected backup #${priority} from profile ${profileName}.`;
}

function noValidChoiceReason(
  actionType: "pick" | "ban",
  evaluation: ChampionPriorityEvaluation,
  championNames: ReadonlyMap<number, string>,
): string {
  if (evaluation.candidates.length === 0) return `No ${actionType} priorities are configured.`;
  return `No valid ${actionType} remained after checking ${evaluation.candidates.length} configured choice${evaluation.candidates.length === 1 ? "" : "s"}: ${evaluation.candidates.map((candidate) => candidateSummary(candidate, championNames)).join(", ")}.`;
}

function candidateSummary(candidate: ChampionPriorityCandidateEvaluation, championNames: ReadonlyMap<number, string>): string {
  const status = candidate.status === "allied-intent"
    ? "protected by an allied intent"
    : candidate.status === "teammate-intent"
      ? "reserved by a teammate"
      : candidate.status;
  const champion = championNames.get(candidate.championId) ?? `Champion ${candidate.championId}`;
  return `#${candidate.priority} ${champion} ${status}`;
}
