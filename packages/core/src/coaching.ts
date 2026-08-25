import type {
  AutomationProfile,
  ChampionPerformanceRecord,
  ChampionPerformanceSnapshot,
  CompanionSnapshot,
  DraftCoachChoice,
  DraftSignal,
  PerformanceGrade,
  PerformanceReportCard,
  RuneRecommendationRole,
} from "@summonerkit/contracts";

interface ReportCardInput {
  role: RuneRecommendationRole;
  kda: number;
  farmPerMinute: number;
  killParticipation: number;
  damagePerMinute: number;
  visionPerMinute: number;
  overallScore: number;
}

const roleTargets = (role: RuneRecommendationRole) => role === "utility"
  ? { farm: 1.8, damage: 450, vision: 2, participation: 55 }
  : role === "jungle"
    ? { farm: 6.5, damage: 650, vision: 1.1, participation: 55 }
    : { farm: 8, damage: 750, vision: 0.85, participation: 50 };

function performanceGrade(score: number): PerformanceGrade {
  return score >= 90 ? "S"
    : score >= 80 ? "A"
      : score >= 70 ? "B"
        : score >= 55 ? "C" : "D";
}

function reportStrengths(input: ReportCardInput, targets: ReturnType<typeof roleTargets>): string[] {
  return [
    input.kda >= 4 ? "Strong fight efficiency" : null,
    input.farmPerMinute >= targets.farm ? "Reliable resource income" : null,
    input.killParticipation >= targets.participation ? "Consistent team involvement" : null,
    input.damagePerMinute >= targets.damage ? "High champion damage" : null,
    input.visionPerMinute >= targets.vision ? "Strong vision contribution" : null,
  ].filter((entry): entry is string => entry !== null).slice(0, 2);
}

function reportFocus(input: ReportCardInput, targets: ReturnType<typeof roleTargets>): string[] {
  return [
    input.kda < 2.5 ? "Reduce avoidable deaths" : null,
    input.farmPerMinute < targets.farm * 0.8 ? "Protect farm through the mid game" : null,
    input.killParticipation < targets.participation * 0.8 ? "Join decisive team plays earlier" : null,
    input.damagePerMinute < targets.damage * 0.75 ? "Convert safe windows into champion damage" : null,
    input.visionPerMinute < targets.vision * 0.75 ? "Plan more purposeful vision" : null,
  ].filter((entry): entry is string => entry !== null).slice(0, 2);
}

export function createPerformanceReportCard(input: ReportCardInput): PerformanceReportCard {
  const grade = performanceGrade(input.overallScore);
  const targets = roleTargets(input.role);
  const strengths = reportStrengths(input, targets);
  const focus = reportFocus(input, targets);
  return {
    grade,
    headline: strengths[0] ?? (grade === "D" ? "A difficult game with one clear next step" : "A steady game with room to sharpen execution"),
    strengths: strengths.length > 0 ? strengths : ["Completed match available for review"],
    focus: focus.length > 0 ? focus : ["Repeat the strongest habit next game"],
  };
}

function selectedRole(snapshot: CompanionSnapshot): RuneRecommendationRole {
  const position = snapshot.session.championSelect.myTeam
    .find((member) => member.isLocalPlayer)?.assignedPosition?.toUpperCase();
  if (position === "JUNGLE") return "jungle";
  if (position === "MIDDLE" || position === "MID") return "middle";
  if (position === "BOTTOM" || position === "ADC") return "bottom";
  if (position === "UTILITY" || position === "SUPPORT") return "utility";
  if (snapshot.session.queue.queueId === 450) return "aram";
  return "top";
}

function activeProfile(snapshot: CompanionSnapshot, role: RuneRecommendationRole) {
  const queueId = snapshot.session.queue.queueId;
  return snapshot.profiles.find((profile) => profile.role === role && (profile.queueIds.length === 0 || (queueId !== null && profile.queueIds.includes(queueId))))
    ?? snapshot.profiles.find((profile) => profile.role === "default")
    ?? null;
}

function confidence(sampleSize: number, personalGames: number): DraftCoachChoice["confidence"] {
  if (sampleSize >= 100 || personalGames >= 10) return "high";
  if (sampleSize >= 25 || personalGames >= 3) return "medium";
  return "low";
}

interface DraftCoachContext {
  action: "pick" | "ban";
  profile: AutomationProfile | null;
  priority: number[];
  allyChampionIds: Set<number>;
  enemyChampionIds: Set<number>;
  performanceByChampion: Map<number, ChampionPerformanceRecord>;
  signals: DraftSignal[];
  currentPatch: string | null;
  plannedPickId: number | null;
}

interface CandidateEvidence {
  score: number;
  reasons: string[];
}

function allyChampionIds(snapshot: CompanionSnapshot): Set<number> {
  return new Set(snapshot.session.championSelect.myTeam.flatMap((member) =>
    [member.championId, member.championPickIntent].filter((championId): championId is number => Boolean(championId))));
}

function enemyChampionIds(snapshot: CompanionSnapshot): Set<number> {
  return new Set(snapshot.session.championSelect.theirTeam.flatMap((member) => member.championId ? [member.championId] : []));
}

function lockedChampionIds(snapshot: CompanionSnapshot): Set<number> {
  return new Set([
    ...snapshot.session.championSelect.myTeamBans,
    ...snapshot.session.championSelect.theirTeamBans,
    ...snapshot.session.championSelect.myTeam.flatMap((member) => member.championId ? [member.championId] : []),
    ...snapshot.session.championSelect.theirTeam.flatMap((member) => member.championId ? [member.championId] : []),
  ]);
}

function draftContext(snapshot: CompanionSnapshot, action: "pick" | "ban"): DraftCoachContext {
  const role = selectedRole(snapshot);
  const profile = activeProfile(snapshot, role);
  return {
    action,
    profile,
    priority: action === "ban" ? profile?.banPriority ?? [] : profile?.pickPriority ?? [],
    allyChampionIds: allyChampionIds(snapshot),
    enemyChampionIds: enemyChampionIds(snapshot),
    performanceByChampion: new Map(snapshot.insights.performance.champions.map((record) => [record.championId, record])),
    signals: snapshot.insights.coach.draftSignals.filter((signal) => signal.role === role),
    currentPatch: snapshot.connection.patch?.match(/^\d+\.\d+/u)?.[0] ?? null,
    plannedPickId: profile?.pickPriority[0] ?? snapshot.session.championSelect.selectedChampionId,
  };
}

function bestDraftSignal(championId: number, context: DraftCoachContext): DraftSignal | undefined {
  return context.signals.filter((signal) => signal.championId === championId).sort((left, right) => {
    const leftCurrent = context.currentPatch && left.patch.startsWith(context.currentPatch) ? 1 : 0;
    const rightCurrent = context.currentPatch && right.patch.startsWith(context.currentPatch) ? 1 : 0;
    return rightCurrent - leftCurrent || right.sampleSize - left.sampleSize;
  })[0];
}

function signalEvidence(signal: DraftSignal | undefined, context: DraftCoachContext): CandidateEvidence {
  if (!signal) return { score: 0, reasons: [] };
  let score = Math.max(-15, Math.min(25, (signal.winRate - 45) * 2.5));
  const reasons = [`${signal.winRate.toFixed(1)}% across ${signal.sampleSize.toLocaleString()} ${signal.audience} games`];
  if (signal.synergyChampionIds.some((championId) => context.allyChampionIds.has(championId))) {
    score += 10;
    reasons.push("Matches a sampled ally synergy");
  }
  if (signal.toughMatchupChampionIds.some((championId) => context.enemyChampionIds.has(championId))) {
    score -= 10;
    reasons.push("A visible enemy is a difficult sampled matchup");
  }
  return { score, reasons };
}

function personalEvidence(championId: number, context: DraftCoachContext): CandidateEvidence {
  const performance = context.performanceByChampion.get(championId);
  if (!performance) return { score: 0, reasons: [] };
  return {
    score: Math.min(25, performance.overallScore * 0.25),
    reasons: [`Your recent score is ${performance.overallScore}/100 over ${performance.games} game${performance.games === 1 ? "" : "s"}`],
  };
}

function planEvidence(championId: number, context: DraftCoachContext): CandidateEvidence {
  const priorityIndex = context.priority.indexOf(championId);
  if (priorityIndex < 0) return { score: 0, reasons: [] };
  return { score: Math.max(4, 18 - priorityIndex * 3), reasons: [`#${priorityIndex + 1} in ${context.profile?.name ?? "your"} ${context.action} plan`] };
}

function protectiveBanEvidence(championId: number, context: DraftCoachContext): CandidateEvidence {
  if (context.action !== "ban" || !context.plannedPickId) return { score: 0, reasons: [] };
  const plannedSignal = context.signals.find((signal) => signal.championId === context.plannedPickId);
  return plannedSignal?.toughMatchupChampionIds.includes(championId)
    ? { score: 18, reasons: ["Protects your primary pick from a difficult matchup"] }
    : { score: 0, reasons: [] };
}

function scoreDraftCandidate(championId: number, context: DraftCoachContext): DraftCoachChoice {
  const signal = bestDraftSignal(championId, context);
  const evidence = [signalEvidence(signal, context), personalEvidence(championId, context), planEvidence(championId, context), protectiveBanEvidence(championId, context)];
  const reasons = evidence.flatMap((entry) => entry.reasons).slice(0, 3);
  const score = 35 + evidence.reduce((total, entry) => total + entry.score, 0);
  const personalGames = context.performanceByChampion.get(championId)?.games ?? 0;
  return {
    championId,
    action: context.action,
    score: Math.round(Math.max(0, Math.min(100, score))),
    confidence: confidence(signal?.sampleSize ?? 0, personalGames),
    reasons: reasons.length > 0 ? reasons : ["Available in the current draft", "No strong data preference—keep your own judgment"],
  };
}

function priorityRank(championId: number, priority: number[]): number {
  const rank = priority.indexOf(championId);
  return rank < 0 ? Number.MAX_SAFE_INTEGER : rank;
}

export function draftCoachChoices(snapshot: CompanionSnapshot, limit = 3): DraftCoachChoice[] {
  const action = snapshot.session.championSelect.localAction?.type ?? "pick";
  const available = action === "ban" ? snapshot.session.championSelect.bannableChampionIds : snapshot.session.championSelect.pickableChampionIds;
  if (!snapshot.session.championSelect.active || available.length === 0) return [];
  const context = draftContext(snapshot, action);
  const unavailable = lockedChampionIds(snapshot);
  const candidates = available.filter((championId) => !unavailable.has(championId) && (action !== "ban" || !context.allyChampionIds.has(championId)));

  return candidates.map((championId) => scoreDraftCandidate(championId, context))
    .sort((left, right) => right.score - left.score || priorityRank(left.championId, context.priority) - priorityRank(right.championId, context.priority))
    .slice(0, Math.max(1, limit));
}

export interface ChampionPoolAdvice {
  championId: number;
  kind: "comfort" | "momentum" | "practice";
  title: string;
  detail: string;
  score: number;
}

export function championPoolAdvice(performance: ChampionPerformanceSnapshot): ChampionPoolAdvice[] {
  const advice: ChampionPoolAdvice[] = [];
  const eligible = performance.champions.filter((record) => record.games >= 2);
  const comfort = [...eligible].sort((left, right) => right.overallScore - left.overallScore || right.games - left.games)[0];
  if (comfort) advice.push({ championId: comfort.championId, kind: "comfort", title: "Most reliable", detail: `${comfort.overallScore}/100 over ${comfort.games} recent games`, score: comfort.overallScore });
  const latestScores = new Map<number, number[]>();
  performance.matches.forEach((match) => latestScores.set(match.championId, [...(latestScores.get(match.championId) ?? []), match.overallScore]));
  const momentum = [...latestScores.entries()].flatMap(([championId, scores]) => scores.length >= 3
    ? [{ championId, gain: scores.slice(0, 2).reduce((sum, value) => sum + value, 0) / 2 - scores.slice(2).reduce((sum, value) => sum + value, 0) / (scores.length - 2) }]
    : []).sort((left, right) => right.gain - left.gain)[0];
  if (momentum && momentum.gain > 2 && momentum.championId !== comfort?.championId) advice.push({ championId: momentum.championId, kind: "momentum", title: "Positive momentum", detail: `Recent execution improved by ${Math.round(momentum.gain)} points`, score: Math.round(momentum.gain) });
  const practice = [...eligible].sort((left, right) => left.overallScore - right.overallScore || right.games - left.games)[0];
  if (practice && practice.championId !== comfort?.championId) advice.push({ championId: practice.championId, kind: "practice", title: "Practice focus", detail: `The clearest improvement opportunity across ${practice.games} games`, score: practice.overallScore });
  return advice.slice(0, 3);
}

export interface PatchReadiness {
  championId: number;
  status: "current" | "stale" | "missing";
  dataPatch: string | null;
}

export function personalizedPatchReadiness(snapshot: CompanionSnapshot, limit = 6): PatchReadiness[] {
  const currentPatch = snapshot.connection.patch?.match(/^\d+\.\d+/u)?.[0] ?? null;
  const championIds = [...new Set([
    ...snapshot.insights.performance.champions.map((record) => record.championId),
    ...snapshot.profiles.flatMap((profile) => profile.pickPriority),
    ...snapshot.collection.champions.flatMap((champion) => champion.skins.some((skin) => skin.favorite) ? [champion.id] : []),
  ])].slice(0, limit);
  return championIds.map((championId) => {
    const patches = [
      ...snapshot.insights.runes.recommendations.filter((entry) => entry.championId === championId).map((entry) => entry.patch),
      ...snapshot.insights.coach.builds.filter((entry) => entry.championId === championId).map((entry) => entry.patch),
    ];
    const dataPatch = patches.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0] ?? null;
    return { championId, dataPatch, status: !dataPatch ? "missing" : !currentPatch || dataPatch.startsWith(currentPatch) ? "current" : "stale" };
  });
}
