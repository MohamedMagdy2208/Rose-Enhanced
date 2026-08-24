import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from "lucide-react";
import type { CompanionSnapshot, CompanionCommand } from "@summonerkit/contracts";
import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { formatRelativeTime } from "../utils/assets";

export function DashboardPage({
  snapshot,
  onNavigate,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  onNavigate: (page: "collection" | "automation") => void;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const { connection, collection, automation, audit } = snapshot;
  const activeAutomations = (["autoAccept", "autoPick", "autoBan", "autoSpells", "autoRunes"] as const)
    .filter((feature) => automation[feature]).length;

  return (
    <div className="page dashboard-page">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">Companion status</p>
          <h1>Your League session, at a glance.</h1>
          <p className="page-lede">
            Collection data stays local. Automation remains opt-in and yields the moment you intervene.
          </p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => onCommand({ type: "collection.refresh" })}
          disabled={connection.status !== "connected"}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Sync collection
        </button>
      </header>

      {connection.status !== "connected" ? (
        <section className="connection-banner" aria-live="polite">
          <span className="connection-banner__icon" aria-hidden="true"><WifiOff size={20} /></span>
          <div>
            <strong>Waiting for the League client</strong>
            <p>{connection.lastError ?? "Open League of Legends and sign in. SummonerKit reconnects automatically."}</p>
          </div>
          <StatusPill tone={connection.status === "degraded" ? "warning" : "neutral"}>
            {connection.status}
          </StatusPill>
        </section>
      ) : null}

      <section className="metric-strip" aria-label="Collection summary">
        <Metric icon={Boxes} label="Owned skins" value={collection.progress.ownedSkins} note={`${collection.progress.completionPercent}% complete`} />
        <Metric icon={Sparkles} label="In loot" value={collection.progress.lootSkins} note="Shards and permanents" />
        <Metric icon={Bot} label="Automation" value={activeAutomations} note={automation.riskAcknowledged ? "Enabled features" : "Acknowledgement required"} />
        <Metric icon={Clock3} label="Last sync" value={collection.updatedAt ? formatRelativeTime(collection.updatedAt) : "—"} note={connection.patch ? `Patch ${connection.patch}` : "No patch detected"} />
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--collection">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Collection</p>
              <h2>Skin vault</h2>
            </div>
            <button className="text-button" type="button" onClick={() => onNavigate("collection")}>
              Browse all <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="collection-progress" aria-label={`${collection.progress.completionPercent}% of skins owned`}>
            <div className="collection-progress__labels">
              <strong>{collection.progress.ownedSkins} owned</strong>
              <span>{collection.progress.totalSkins} total</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${collection.progress.completionPercent}%` }} />
            </div>
          </div>
          <div className="mini-stat-grid">
            <div><span>Loot holdings</span><strong>{collection.progress.lootSkins}</strong></div>
            <div><span>Favorites</span><strong>{collection.progress.favoriteSkins}</strong></div>
            <div><span>Champions indexed</span><strong>{collection.champions.length}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Automation</p>
              <h2>Guardrails active</h2>
            </div>
            <button className="text-button" type="button" onClick={() => onNavigate("automation")}>
              Configure <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          {!automation.riskAcknowledged ? (
            <div className="inline-notice inline-notice--warning">
              <ShieldAlert size={18} aria-hidden="true" />
              <div><strong>Automation is locked</strong><span>Review the Riot policy warning before enabling any action.</span></div>
            </div>
          ) : (
            <ul className="feature-status-list" role="list">
              {(["autoAccept", "autoPick", "autoBan", "autoSpells", "autoRunes"] as const).map((feature) => (
                <li key={feature}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{feature.replace(/^auto/, "Auto ")}</span>
                  <StatusPill tone={automation[feature] ? "positive" : "neutral"}>{automation[feature] ? "On" : "Off"}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel--wide">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Decision log</p>
              <h2>Recent automation activity</h2>
            </div>
          </div>
          {audit.length === 0 ? (
            <EmptyState icon={Bot} title="No automated decisions yet" description="When an opted-in feature evaluates a ready check or champion-select action, its reasoning appears here." />
          ) : (
            <ol className="audit-list">
              {audit.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <span className={`audit-list__marker audit-list__marker--${event.result}`} aria-hidden="true" />
                  <div><strong>{event.action}</strong><p>{event.reason}</p></div>
                  <time dateTime={event.createdAt}>{formatRelativeTime(event.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Boxes;
  label: string;
  value: number | string;
  note: string;
}) {
  return (
    <article className="metric">
      <span className="metric__icon" aria-hidden="true"><Icon size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}
