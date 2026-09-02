import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  Clock3,
  Power,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  WifiOff,
} from "lucide-react";
import type { CompanionSnapshot, CompanionCommand } from "@summonerkit/contracts";
import { EmptyState } from "../components/EmptyState";
import { PresenceControl } from "../components/PresenceControl";
import { StartupControl } from "../components/StartupControl";
import { StatusPill } from "../components/StatusPill";
import { formatLeaguePatch, formatRelativeTime } from "../utils/assets";

const automationFeatures = [
  { key: "autoAccept", label: "Auto Accept" },
  { key: "autoPick", label: "Auto Pick" },
  { key: "autoBan", label: "Auto Ban" },
  { key: "autoSpells", label: "Auto Spells" },
  { key: "autoRunes", label: "Auto Runes" },
] as const;

export function DashboardPage({
  snapshot,
  onNavigate,
  onCommand,
  canConfigureMobile = true,
}: {
  snapshot: CompanionSnapshot;
  onNavigate: (page: "collection" | "automation" | "mobile") => void;
  onCommand: (command: CompanionCommand) => Promise<void>;
  canConfigureMobile?: boolean;
}) {
  const { connection, collection, automation, audit } = snapshot;
  const activeAutomations = automationFeatures
    .map((feature) => feature.key)
    .filter((feature) => automation[feature]).length;
  const patch = formatLeaguePatch(connection.patch);
  const mobileDevices = snapshot.remoteDevices.filter((device) => !device.revoked);
  const mobileStatus = snapshot.remote.status === "connected"
    ? { title: "Phone connected", detail: `${mobileDevices.length} trusted device${mobileDevices.length === 1 ? "" : "s"} · encrypted session active`, tone: "positive" as const }
    : snapshot.remote.status === "pairing"
      ? { title: "Waiting for phone", detail: "The QR code is active for a short time", tone: "accent" as const }
      : snapshot.remote.relayConfigured
        ? { title: "Ready to pair", detail: "Create a short-lived QR code from Mobile Control", tone: "accent" as const }
        : { title: "Mobile is not configured", detail: "Configure the encrypted relay once to connect a phone", tone: "neutral" as const };
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

      <PresenceControl
        presence={snapshot.presence}
        writable={connection.status === "connected" && connection.capabilities.presence}
        onCommand={onCommand}
      />

      <section className="metric-strip" aria-label="Collection summary">
        <Metric icon={Boxes} label="Owned skins" value={collection.progress.ownedSkins} note={`${collection.progress.completionPercent}% complete`} />
        <Metric icon={Sparkles} label="In loot" value={collection.progress.lootSkins} note="Shards and permanents" />
        <Metric icon={Bot} label="Automation" value={activeAutomations} note={automation.riskAcknowledged ? "Enabled features" : "Acknowledgement required"} />
        <Metric icon={Clock3} label="Last sync" value={collection.updatedAt ? formatRelativeTime(collection.updatedAt) : "—"} note={patch ? `Patch ${patch}` : "No patch detected"} {...(connection.patch ? { noteTitle: `Full client build: ${connection.patch}` } : {})} />
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

        <section className="panel panel--mobile">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Mobile control</p>
              <h2>Use your phone as a companion</h2>
            </div>
            <Smartphone size={20} aria-hidden="true" />
          </div>
          <div className="mobile-summary">
            <StatusPill tone={mobileStatus.tone}>{mobileStatus.title}</StatusPill>
            <p>{mobileStatus.detail}</p>
          </div>
          <p className="panel__description">Start a lobby queue, answer ready checks, and follow champion select remotely. League access stays on this PC.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              if (canConfigureMobile) onNavigate("mobile");
              else void onCommand({ type: "desktop.open" });
            }}
          >
            <Smartphone size={15} aria-hidden="true" />
            {canConfigureMobile ? (snapshot.remote.relayConfigured ? "Show pairing QR" : "Set up mobile") : "Open desktop setup"}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Automation</p>
              <h2>Guardrails active</h2>
            </div>
            <div className="panel__header-actions">
              {activeAutomations > 0 ? <button className="button button--danger button--compact" type="button" onClick={() => onCommand({ type: "automation.disableAll" })}><Power size={14} aria-hidden="true" /> Stop all</button> : null}
              <button className="text-button" type="button" onClick={() => onNavigate("automation")}>
                Configure <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          {!automation.riskAcknowledged ? (
            <div className="inline-notice inline-notice--warning">
              <ShieldAlert size={18} aria-hidden="true" />
              <div><strong>Automation is locked</strong><span>Review the Riot policy warning before enabling any action.</span></div>
            </div>
          ) : (
            <ul className="feature-status-list" role="list">
              {automationFeatures.map((feature) => (
                <li key={feature.key}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{feature.label}</span>
                  <button
                    className="overview-toggle"
                    type="button"
                    aria-pressed={automation[feature.key]}
                    aria-label={`Turn ${feature.label} ${automation[feature.key] ? "off" : "on"}`}
                    onClick={() => onCommand({
                      type: "automation.setEnabled",
                      feature: feature.key,
                      enabled: !automation[feature.key],
                    })}
                  >
                    {automation[feature.key] ? "On" : "Off"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <StartupControl startup={snapshot.startup} onCommand={onCommand} />

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
  noteTitle,
}: {
  icon: typeof Boxes;
  label: string;
  value: number | string;
  note: string;
  noteTitle?: string;
}) {
  return (
    <article className="metric">
      <span className="metric__icon" aria-hidden="true"><Icon size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong><small title={noteTitle} aria-label={noteTitle ? `${note}. ${noteTitle}` : undefined}>{note}</small></div>
    </article>
  );
}
