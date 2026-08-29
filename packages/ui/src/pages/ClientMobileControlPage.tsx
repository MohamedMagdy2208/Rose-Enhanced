import { ExternalLink, Gamepad2, LockKeyhole, MonitorUp, Radio, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import type { CompanionCommand, CompanionSnapshot } from "@summonerkit/contracts";
import { StatusPill } from "../components/StatusPill";
import { formatRelativeTime } from "../utils/assets";

function mobileStatus(snapshot: CompanionSnapshot) {
  if (snapshot.remote.status === "connected") {
    return {
      label: "Connected",
      detail: "Your phone can control this League session.",
      tone: "positive" as const,
    };
  }
  if (snapshot.remote.status === "pairing") {
    return {
      label: "Pairing open",
      detail: "Finish scanning the short-lived code in the desktop app.",
      tone: "accent" as const,
    };
  }
  if (snapshot.remote.status === "error") {
    return {
      label: "Needs attention",
      detail: "Open the desktop app to inspect the relay connection.",
      tone: "danger" as const,
    };
  }
  if (snapshot.remote.relayConfigured) {
    return {
      label: "Ready to pair",
      detail: "Create a QR code from the desktop app when you are ready.",
      tone: "accent" as const,
    };
  }
  return {
    label: "Desktop setup required",
    detail: "Pairing and relay setup are kept in SummonerKit for Windows.",
    tone: "neutral" as const,
  };
}

function activityLabel(activity: CompanionSnapshot["session"]["queue"]["activity"]) {
  if (activity === "ready-check") return "Ready check";
  if (activity === "champ-select") return "Champion select";
  if (activity === "in-game") return "In game";
  if (activity === "searching") return "Searching";
  if (activity === "lobby") return "Lobby";
  return "Idle";
}

function actionLabel(snapshot: CompanionSnapshot) {
  const action = snapshot.session.championSelect.localAction;
  if (!snapshot.session.championSelect.active) return "Not in champion select";
  if (!action) return "Waiting for your turn";
  if (action.completed) return `${action.type === "pick" ? "Pick" : "Ban"} complete`;
  if (action.inProgress) return `${action.type === "pick" ? "Pick" : "Ban"} in progress`;
  return `Next ${action.type}`;
}

export function ClientMobileControlPage({
  snapshot,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const status = mobileStatus(snapshot);
  const trustedDevices = snapshot.remoteDevices.filter((device) => !device.revoked);
  const queue = snapshot.session.queue;
  const championSelect = snapshot.session.championSelect;

  return (
    <div className="page client-mobile-page">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">Mobile control</p>
          <h1>Your phone, alongside the League client.</h1>
          <p className="page-lede">Check the secure phone bridge and live session from this tab. Pairing codes and relay secrets never appear inside the League client.</p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </header>

      <section className="client-mobile-hero panel" aria-labelledby="client-mobile-hero-title">
        <div className="client-mobile-hero__icon" aria-hidden="true"><Smartphone size={28} /></div>
        <div className="client-mobile-hero__copy">
          <p className="eyebrow">Desktop-backed pairing</p>
          <h2 id="client-mobile-hero-title">Finish setup in SummonerKit for Windows.</h2>
          <p>{status.detail} The desktop process keeps LCU credentials local, creates the one-time QR code, and validates every phone command before it reaches League.</p>
          <button className="button button--secondary" type="button" onClick={() => void onCommand({ type: "desktop.open" })}>
            <MonitorUp size={15} aria-hidden="true" />
            Open desktop app
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="client-mobile-hero__badge">
          <Radio size={17} aria-hidden="true" />
          <span>Local engine</span>
          <strong>{snapshot.connection.status === "connected" ? "Online" : "Waiting"}</strong>
        </div>
      </section>

      <div className="client-mobile-grid">
        <section className="panel" aria-labelledby="mobile-bridge-title">
          <div className="panel__header">
            <div><p className="eyebrow">Secure bridge</p><h2 id="mobile-bridge-title">Connection status</h2></div>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <ul className="feature-status-list" role="list">
            <li><Wifi size={16} aria-hidden="true" /><span>League client</span><StatusPill tone={snapshot.connection.status === "connected" ? "positive" : "neutral"}>{snapshot.connection.status}</StatusPill></li>
            <li><Radio size={16} aria-hidden="true" /><span>Encrypted relay</span><StatusPill tone={snapshot.remote.relayConfigured ? "positive" : "neutral"}>{snapshot.remote.relayConfigured ? "configured" : "not configured"}</StatusPill></li>
            <li><Smartphone size={16} aria-hidden="true" /><span>Trusted phones</span><StatusPill tone={trustedDevices.length > 0 ? "positive" : "neutral"}>{trustedDevices.length}</StatusPill></li>
          </ul>
          <p className="client-mobile-caption"><LockKeyhole size={13} aria-hidden="true" /> Secrets, QR codes, and device management stay on the desktop surface.</p>
        </section>

        <section className="panel" aria-labelledby="mobile-session-title">
          <div className="panel__header">
            <div><p className="eyebrow">Live session</p><h2 id="mobile-session-title">What your phone can see</h2></div>
            <Gamepad2 size={20} aria-hidden="true" />
          </div>
          <div className="client-mobile-session-grid">
            <div><span>Queue</span><strong>{activityLabel(queue.activity)}</strong><small>{queue.queueId ? `Queue ${queue.queueId}` : "No active queue"}</small></div>
            <div><span>Draft</span><strong>{actionLabel(snapshot)}</strong><small>{championSelect.timerRemainingMs !== null ? `${Math.ceil(championSelect.timerRemainingMs / 1_000)}s remaining` : "Timer not available"}</small></div>
            <div><span>Ready check</span><strong>{snapshot.session.readyCheck.active ? "Waiting" : "Inactive"}</strong><small>{snapshot.session.readyCheck.active ? "Accept or decline from your phone" : "No ready check"}</small></div>
            <div><span>Controls</span><strong>{snapshot.remote.status === "connected" ? "Available" : "Preview only"}</strong><small>Queue, picks, bans, spells, runes, and ARAM</small></div>
          </div>
        </section>
      </div>

      <section className="panel client-mobile-devices" aria-labelledby="client-mobile-devices-title">
        <div className="panel__header">
          <div><p className="eyebrow">Trust list</p><h2 id="client-mobile-devices-title">Paired phones</h2></div>
          <StatusPill tone={trustedDevices.length > 0 ? "positive" : "neutral"}>{trustedDevices.length} active</StatusPill>
        </div>
        {trustedDevices.length === 0 ? (
          <div className="client-mobile-empty"><Smartphone size={20} aria-hidden="true" /><span>No phone is paired yet. Open the desktop app to create a QR code.</span></div>
        ) : (
          <ul className="client-mobile-device-list" role="list">
            {trustedDevices.map((device) => (
              <li key={device.id}>
                <span className="client-mobile-device-list__icon"><Smartphone size={17} aria-hidden="true" /></span>
                <div><strong>{device.name}</strong><small>{device.connected ? "Connected now" : device.lastSeenAt ? `Last seen ${formatRelativeTime(device.lastSeenAt)}` : "Not connected"}</small></div>
                <StatusPill tone={device.connected ? "positive" : "neutral"}>{device.connected ? "connected" : "offline"}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
