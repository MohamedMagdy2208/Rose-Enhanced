import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  FlaskConical,
  MousePointer2,
  Play,
  RotateCcw,
  ShieldCheck,
  TimerOff,
  Users,
} from "lucide-react";
import { SegmentedTabs } from "../components/SegmentedTabs";
import type {
  AutomationActionType,
  AutomationProfile,
  ChampionRecord,
  CompanionSnapshot,
} from "@summonerkit/contracts";
import {
  AutomationEngine,
  type AutomationContext,
  type AutomationEffect,
} from "@summonerkit/core";
import { StatusPill } from "../components/StatusPill";

export type TestLabScenarioId =
  | "happy-path"
  | "primary-unavailable"
  | "intent-protection"
  | "manual-override"
  | "missing-timer"
  | "no-valid-choice";

type TestLabActionType = "pick" | "ban";

export interface TestLabEvent {
  phase: "ready-check" | "champ-select" | "guardrail";
  action: AutomationActionType | "observe";
  championId: number | null;
  reason: string;
}

export interface TestLabResult {
  scenarioId: TestLabScenarioId;
  profileId: string;
  actionType: TestLabActionType;
  events: TestLabEvent[];
  expectedOutcome: string;
  guardrailPassed: boolean;
  lcuWriteCount: 0;
}

interface TestLabScenario {
  id: TestLabScenarioId;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}

export const testLabDemoProfile: AutomationProfile = {
  id: "test-lab-demo",
  name: "Built-in safe demo",
  queueIds: [420],
  role: "middle",
  pickPriority: [103, 99, 145],
  banPriority: [238, 157, 64],
  spell1Id: 4,
  spell2Id: 14,
  runePreset: null,
  readyCheckDelayMs: 1_000,
  lockLeadTimeMs: 3_000,
};

const fallbackChampionNames = new Map<number, string>([
  [64, "Lee Sin"],
  [99, "Lux"],
  [103, "Ahri"],
  [145, "Kai'Sa"],
  [157, "Yasuo"],
  [238, "Zed"],
]);

const scenarios: TestLabScenario[] = [
  { id: "happy-path", label: "Normal flow", description: "Primary choice is valid and the timer is trustworthy.", icon: CheckCircle2 },
  { id: "primary-unavailable", label: "Fallback choice", description: "The primary choice is unavailable, so the next valid backup is used.", icon: RotateCcw },
  { id: "intent-protection", label: "Protect teammate", description: "A teammate intent blocks the primary pick or ban.", icon: Users },
  { id: "manual-override", label: "Manual override", description: "You change the hover and automation immediately yields.", icon: MousePointer2 },
  { id: "missing-timer", label: "Missing timer", description: "The engine may hover, but it must never lock without a reliable timer.", icon: TimerOff },
  { id: "no-valid-choice", label: "No valid choice", description: "Every configured choice is unavailable, so the engine safely skips.", icon: Ban },
];

const safeSettings = {
  riskAcknowledged: true,
  executionMode: "dry-run" as const,
  autoAccept: true,
  autoPick: true,
  autoBan: true,
  autoSpells: false,
  autoRunes: false,
};

export function runTestLabScenario(
  profile: AutomationProfile,
  scenarioId: TestLabScenarioId,
  actionType: TestLabActionType,
  championNames: ReadonlyMap<number, string> = fallbackChampionNames,
): TestLabResult {
  const engine = new AutomationEngine();
  const events: TestLabEvent[] = [];
  const sessionId = `test-lab:${scenarioId}:${actionType}`;

  engine.evaluateReadyCheck({
    sessionId,
    state: "InProgress",
    nowMs: 0,
    profile,
    settings: safeSettings,
  });
  events.push(...effectsToEvents(engine.evaluateReadyCheck({
    sessionId,
    state: "InProgress",
    nowMs: profile.readyCheckDelayMs,
    profile,
    settings: safeSettings,
  }), "ready-check"));

  const priority = actionType === "pick" ? profile.pickPriority : profile.banPriority;
  const validChampionIds = new Set(priority);
  const alliedIntentChampionIds = new Set<number>();
  const teammateIntentChampionIds = new Set<number>();
  const primaryChampionId = priority[0] ?? null;

  if (scenarioId === "primary-unavailable" && primaryChampionId !== null) {
    validChampionIds.delete(primaryChampionId);
  }
  if (scenarioId === "intent-protection" && primaryChampionId !== null) {
    if (actionType === "ban") alliedIntentChampionIds.add(primaryChampionId);
    else teammateIntentChampionIds.add(primaryChampionId);
  }
  if (scenarioId === "no-valid-choice") validChampionIds.clear();

  const baseContext: AutomationContext = {
    sessionId,
    localPlayerCellId: 1,
    timerRemainingMs: 10_000,
    actions: [{
      id: 101,
      actorCellId: 1,
      championId: 0,
      completed: false,
      isInProgress: true,
      type: actionType,
    }],
    pickableChampionIds: validChampionIds,
    bannableChampionIds: validChampionIds,
    alliedIntentChampionIds,
    teammateIntentChampionIds,
    championNames,
    profile,
    settings: safeSettings,
  };

  const openingEffects = engine.evaluateChampSelect(baseContext);
  events.push(...effectsToEvents(openingEffects, "champ-select"));
  const hover = openingEffects.find((effect): effect is Extract<AutomationEffect, { type: "hoverAction" }> => effect.type === "hoverAction");

  if (hover && scenarioId === "manual-override") {
    const manualChampionId = priority.find((championId) => championId !== hover.championId) ?? hover.championId + 1;
    events.push(...effectsToEvents(engine.evaluateChampSelect(withActionChampion(baseContext, manualChampionId)), "guardrail"));
  } else if (hover && scenarioId === "missing-timer") {
    const effects = engine.evaluateChampSelect({
      ...withActionChampion(baseContext, hover.championId),
      timerRemainingMs: null,
    });
    events.push(...effectsToEvents(effects, "guardrail"));
    if (!effects.some((effect) => effect.type === "completeAction")) {
      events.push({
        phase: "guardrail",
        action: "observe",
        championId: hover.championId,
        reason: "Timer data is missing; the safe result is hover only with no lock command.",
      });
    }
  } else if (hover) {
    events.push(...effectsToEvents(engine.evaluateChampSelect({
      ...withActionChampion(baseContext, hover.championId),
      timerRemainingMs: profile.lockLeadTimeMs,
    }), "champ-select"));
  }

  return {
    scenarioId,
    profileId: profile.id,
    actionType,
    events,
    expectedOutcome: expectedOutcome(scenarioId),
    guardrailPassed: scenarioPassed(scenarioId, events),
    lcuWriteCount: 0,
  };
}

function withActionChampion(context: AutomationContext, championId: number): AutomationContext {
  return {
    ...context,
    actions: context.actions.map((action) => action.id === 101 ? { ...action, championId } : action),
  };
}

function effectsToEvents(effects: AutomationEffect[], phase: TestLabEvent["phase"]): TestLabEvent[] {
  return effects.map((effect) => ({
    phase,
    action: effect.decision.action,
    championId: effect.decision.championId,
    reason: effect.decision.reason,
  }));
}

function expectedOutcome(scenarioId: TestLabScenarioId): string {
  if (scenarioId === "manual-override") return "Automation cancels the local action and yields to you.";
  if (scenarioId === "missing-timer") return "Automation may hover but never issues a lock.";
  if (scenarioId === "no-valid-choice") return "Automation records a safe skip without choosing a champion.";
  if (scenarioId === "primary-unavailable") return "Automation explains why it skipped the primary and uses a backup.";
  if (scenarioId === "intent-protection") return "Automation protects the teammate intent and uses a backup.";
  return "Automation accepts, hovers the primary, then locks at the configured deadline.";
}

function scenarioPassed(scenarioId: TestLabScenarioId, events: TestLabEvent[]): boolean {
  const actions = new Set(events.map((event) => event.action));
  if (scenarioId === "manual-override") return actions.has("cancel");
  if (scenarioId === "missing-timer") return actions.has("hover") && !actions.has("lock");
  if (scenarioId === "no-valid-choice") return actions.has("skip") && !actions.has("hover") && !actions.has("lock");
  return actions.has("hover") && actions.has("lock");
}

function championName(championId: number | null, names: ReadonlyMap<number, string>): string | null {
  if (championId === null) return null;
  return names.get(championId) ?? fallbackChampionNames.get(championId) ?? `Champion ${championId}`;
}

function championNameMap(champions: ChampionRecord[]): Map<number, string> {
  return new Map([...fallbackChampionNames, ...champions.map((champion) => [champion.id, champion.name] as const)]);
}

export function TestLabPage({ snapshot }: { snapshot: CompanionSnapshot }) {
  const profiles = useMemo(() => [testLabDemoProfile, ...snapshot.profiles.filter((profile) => profile.id !== testLabDemoProfile.id)], [snapshot.profiles]);
  const names = useMemo(() => championNameMap(snapshot.collection.champions), [snapshot.collection.champions]);
  const [profileId, setProfileId] = useState(testLabDemoProfile.id);
  const [scenarioId, setScenarioId] = useState<TestLabScenarioId>("happy-path");
  const [actionType, setActionType] = useState<TestLabActionType>("pick");
  const [result, setResult] = useState<TestLabResult | null>(null);
  const profile = profiles.find((candidate) => candidate.id === profileId) ?? testLabDemoProfile;

  const runScenario = () => setResult(runTestLabScenario(profile, scenarioId, actionType, names));
  const reset = () => setResult(null);

  return (
    <div className="page test-lab-page">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">Safe simulation</p>
          <h1>Test Lab</h1>
          <p className="page-lede">Exercise SummonerKit’s real decision engine with sanitized fixtures. The lab never connects to League, starts a queue, or sends an LCU command.</p>
        </div>
        <StatusPill tone="positive">0 live writes</StatusPill>
      </header>

      <section className="connection-banner test-lab-safety" aria-label="Test Lab safety boundary">
        <span className="connection-banner__icon"><ShieldCheck size={20} aria-hidden="true" /></span>
        <div><strong>Isolated from your live client</strong><p>Profiles are copied into memory for the simulation. Changes and results are not saved.</p></div>
        <StatusPill tone="neutral">Local only</StatusPill>
      </section>

      <div className="test-lab-layout">
        <section className="panel" aria-labelledby="test-lab-controls-title">
          <div className="panel__header">
            <div><p className="eyebrow">Scenario builder</p><h2 id="test-lab-controls-title">Choose what to verify</h2></div>
            <FlaskConical size={21} aria-hidden="true" />
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Profile</span>
              <select value={profileId} onChange={(event) => { setProfileId(event.target.value); reset(); }}>
                {profiles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.id === testLabDemoProfile.id ? " · not saved" : ""}</option>)}
              </select>
            </label>
            <fieldset className="field test-lab-action-field">
              <legend>Local action</legend>
              <SegmentedTabs
                value={actionType}
                options={[{ value: "pick", label: "Pick" }, { value: "ban", label: "Ban" }]}
                onChange={(action) => { setActionType(action); reset(); }}
                label="Local champion-select action"
              />
            </fieldset>
          </div>

          <fieldset className="test-lab-scenarios">
            <legend>Guardrail scenario</legend>
            <div>
              {scenarios.map(({ id, label, description, icon: Icon }) => (
                <button key={id} type="button" className={scenarioId === id ? "test-lab-scenario test-lab-scenario--active" : "test-lab-scenario"} aria-pressed={scenarioId === id} onClick={() => { setScenarioId(id); reset(); }}>
                  <Icon size={17} aria-hidden="true" />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="form-actions">
            <button className="button button--ghost" type="button" disabled={!result} onClick={reset}><RotateCcw size={16} aria-hidden="true" />Reset</button>
            <button className="button button--primary" type="button" onClick={runScenario}><Play size={16} aria-hidden="true" />Run scenario</button>
          </div>
        </section>

        <section className="panel test-lab-results" aria-labelledby="test-lab-results-title" aria-live="polite">
          <div className="panel__header">
            <div><p className="eyebrow">Dry-run timeline</p><h2 id="test-lab-results-title">What the engine would do</h2></div>
            {result ? <StatusPill tone={result.guardrailPassed ? "positive" : "warning"}>{result.guardrailPassed ? "Passed" : "Review"}</StatusPill> : <StatusPill tone="neutral">Not run</StatusPill>}
          </div>

          {!result ? (
            <div className="empty-state">
              <span className="empty-state__icon"><FlaskConical size={22} aria-hidden="true" /></span>
              <h3>Ready for a safe rehearsal</h3>
              <p>Select a scenario and run it. No running League client is required.</p>
            </div>
          ) : (
            <>
              <dl className="test-lab-metrics">
                <div><dt>LCU writes</dt><dd>{result.lcuWriteCount}</dd></div>
                <div><dt>Events</dt><dd>{result.events.length}</dd></div>
                <div><dt>Result</dt><dd>{result.guardrailPassed ? "Safe" : "Needs profile review"}</dd></div>
              </dl>
              <p className="test-lab-expected"><strong>Expected:</strong> {result.expectedOutcome}</p>
              <ol className="test-lab-timeline">
                {result.events.map((event, index) => {
                  const selectedChampion = championName(event.championId, names);
                  return (
                    <li key={`${event.phase}:${event.action}:${index}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{event.action === "observe" ? "Safety check" : event.action}{selectedChampion ? ` · ${selectedChampion}` : ""}</strong>
                        <small>{event.phase.replace("-", " ")}</small>
                        <p>{event.reason}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
