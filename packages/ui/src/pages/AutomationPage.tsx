import { Bot, Check, Eye, ExternalLink, MonitorUp, MousePointerClick, Power, ShieldAlert, X, Zap } from "lucide-react";
import type { AutomationSettings, CompanionCommand, CompanionSnapshot } from "@summonerkit/contracts";
import type { AppSurface } from "../components/AppShell";
import { ChampionPlanEditor } from "../components/ChampionPlanEditor";
import { ProfileEditor } from "../components/ProfileEditor";
import { StatusPill } from "../components/StatusPill";
import { Toggle } from "../components/Toggle";
import { formatRelativeTime } from "../utils/assets";

const featureCopy: Array<{
  key: Exclude<keyof AutomationSettings, "riskAcknowledged" | "executionMode">;
  label: string;
  description: string;
}> = [
  { key: "autoAccept", label: "Auto-accept", description: "Accept after the active profile's delay." },
  { key: "autoPick", label: "Timed auto-pick", description: "Try the primary pick, fall back in order, then lock near the deadline." },
  { key: "autoBan", label: "Timed auto-ban", description: "Protect allied intents and use the first valid configured ban." },
  { key: "autoSpells", label: "Summoner spells", description: "Apply the selected profile's spell pair." },
  { key: "autoRunes", label: "Rune preset", description: "Update only the SummonerKit-owned rune page." },
];

export function AutomationPage({
  snapshot,
  surface,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  surface: AppSurface;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const { automation, audit, profiles } = snapshot;
  const hasEnabledFeature = featureCopy.some((feature) => automation[feature.key]);
  const championNames = new Map(snapshot.collection.champions.map((champion) => [champion.id, champion.name]));
  const championName = (championId: number | null) => championId ? championNames.get(championId) ?? `Champion ${championId}` : null;

  return (
    <div className="page automation-page">
      <header className="page-header">
        <p className="eyebrow">Automation profiles</p>
        <h1>Helpful by default. Never hidden.</h1>
        <p className="page-lede">Choose a primary champion and ordered backups. Every decision is visible, validated against live state, and cancelled when you take control.</p>
      </header>

      {surface === "desktop" ? <section className="automation-mode" aria-labelledby="automation-mode-title">
        <div>
          <p className="eyebrow">Execution mode</p>
          <h2 id="automation-mode-title">Choose how decisions leave SummonerKit</h2>
        </div>
        <div className="mode-options">
          <ModeButton mode="dry-run" active={automation.executionMode} icon={Eye} label="Dry run" description="Audit only; never write." onCommand={onCommand} />
          <ModeButton mode="confirm" active={automation.executionMode} icon={MousePointerClick} label="Confirm" description="Ask before every write." onCommand={onCommand} />
          <ModeButton mode="automatic" active={automation.executionMode} icon={Zap} label="Automatic" description="Execute validated actions." onCommand={onCommand} />
        </div>
      </section> : <ClientAutomationBoundary mode={automation.executionMode} onCommand={onCommand} />}

      {snapshot.pendingAutomation.length > 0 ? (
        <section className="pending-automation" aria-labelledby="pending-automation-title">
          <div className="panel__header"><div><p className="eyebrow">Waiting for you</p><h2 id="pending-automation-title">Confirm automation actions</h2></div><StatusPill tone="warning">{snapshot.pendingAutomation.length} pending</StatusPill></div>
          <ul>
            {snapshot.pendingAutomation.map((pending) => (
              <li key={pending.id}>
                <div><strong>{pending.action}{championName(pending.championId) ? ` · ${championName(pending.championId)}` : ""}</strong><p>{pending.reason}</p></div>
                <div className="pending-automation__actions">
                  <button className="button button--primary" type="button" onClick={() => onCommand({ type: "automation.confirm", pendingId: pending.id })}><Check size={15} /> Confirm</button>
                  <button className="button button--ghost" type="button" onClick={() => onCommand({ type: "automation.dismiss", pendingId: pending.id })}><X size={15} /> Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!automation.riskAcknowledged ? (
        <section className="policy-gate" aria-labelledby="policy-title">
          <span className="policy-gate__icon" aria-hidden="true"><ShieldAlert size={24} /></span>
          <div>
            <p className="eyebrow">Required acknowledgement</p>
            <h2 id="policy-title">Automation can put your account at risk.</h2>
            <p>Riot's Terms restrict unauthorized automation, and the local client API is unsupported. SummonerKit cannot promise that these features are safe or approved.</p>
            <a href="https://www.riotgames.com/en/terms-of-service" target="_blank" rel="noreferrer">Read Riot's Terms of Service <ExternalLink size={14} /></a>
          </div>
          {surface === "desktop" ? <button className="button button--warning" type="button" onClick={() => onCommand({ type: "automation.acknowledgeRisk" })}>I understand the risk</button> : <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "desktop.open" })}><MonitorUp size={16} /> Review on desktop</button>}
        </section>
      ) : (
        <section className="acknowledged-banner"><Check size={17} aria-hidden="true" /><span>Risk acknowledged on this device. Features still remain off until enabled individually.</span></section>
      )}

      <div className="automation-layout">
        <section className="panel feature-toggles">
          <div className="panel__header">
            <div><p className="eyebrow">Global controls</p><h2>Automation features</h2></div>
            <div className="panel__header-actions">
              {hasEnabledFeature ? <button className="button button--danger button--compact" type="button" onClick={() => onCommand({ type: "automation.disableAll" })}><Power size={14} aria-hidden="true" /> Disable all</button> : null}
              <StatusPill tone={automation.riskAcknowledged ? "accent" : "neutral"}>{automation.riskAcknowledged ? "Opt-in" : "Locked"}</StatusPill>
            </div>
          </div>
          {featureCopy.map((feature) => (
            <Toggle
              key={feature.key}
              checked={automation[feature.key]}
              disabled={!automation.riskAcknowledged}
              label={feature.label}
              description={feature.description}
              onChange={(enabled) => onCommand({ type: "automation.setEnabled", feature: feature.key, enabled })}
            />
          ))}
        </section>

        <section className="panel audit-panel">
          <div className="panel__header"><div><p className="eyebrow">Audit trail</p><h2>Latest decisions</h2></div></div>
          {audit.length === 0 ? <div className="compact-empty"><Bot size={20} /><span>No decisions recorded</span></div> : (
            <ol className="audit-list audit-list--compact">
              {audit.slice(0, 8).map((event) => <li key={event.id}><span className={`audit-list__marker audit-list__marker--${event.result}`} /><div><strong>{event.action} · {event.result}{championName(event.championId) ? ` · ${championName(event.championId)}` : ""}</strong><p>{event.reason}</p></div><time>{formatRelativeTime(event.createdAt)}</time></li>)}
            </ol>
          )}
        </section>
      </div>

      {surface === "desktop" ? <ProfileEditor profiles={profiles} champions={snapshot.collection.champions} onCommand={onCommand} /> : <>
        <ChampionPlanEditor profiles={profiles} champions={snapshot.collection.champions} onCommand={onCommand} />
        <section className="desktop-handoff">
          <MonitorUp size={21} aria-hidden="true" />
          <div><p className="eyebrow">Advanced configuration</p><h2>Queue, role, runes, and timing stay on desktop</h2><p>You can edit champion priorities here in the SummonerKit client tab. Use the desktop app for less frequent profile details and execution-mode acknowledgement.</p></div>
          <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "desktop.open" })}>Open full profile editor</button>
        </section>
      </>}
    </div>
  );
}

function ClientAutomationBoundary({
  mode,
  onCommand,
}: {
  mode: AutomationSettings["executionMode"];
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  return (
    <section className="client-automation-boundary" aria-label="Automation execution mode">
      <Eye size={19} aria-hidden="true" />
      <div><span>Current execution mode</span><strong>{mode}</strong><small>Mode changes and risk acknowledgement are desktop-only.</small></div>
      <button className="button button--ghost button--compact" type="button" onClick={() => onCommand({ type: "desktop.open" })}><MonitorUp size={14} /> Change on desktop</button>
    </section>
  );
}

function ModeButton({
  mode,
  active,
  icon: Icon,
  label,
  description,
  onCommand,
}: {
  mode: AutomationSettings["executionMode"];
  active: AutomationSettings["executionMode"];
  icon: typeof Eye;
  label: string;
  description: string;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  return (
    <button type="button" className={active === mode ? "active" : ""} aria-pressed={active === mode} onClick={() => onCommand({ type: "automation.setMode", mode })}>
      <Icon size={18} aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span>
    </button>
  );
}
