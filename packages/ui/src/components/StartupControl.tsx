import type {
  CompanionCommand,
  StartupSettings,
} from "@summonerkit/contracts";
import { StatusPill } from "./StatusPill";

export function StartupControl({
  startup,
  onCommand,
}: {
  startup: StartupSettings;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const status = startup.launchOnWindowsStartup
    ? startup.openOnLeagueDetected && startup.openOnRoseDetected
      ? { label: "Fully automatic", tone: "positive" as const }
      : { label: "Partly automatic", tone: "accent" as const }
    : { label: "Manual start", tone: "neutral" as const };

  return (
    <section className="panel panel--startup">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Hands-free startup</p>
          <h2>Ready when League or Rose opens</h2>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="panel__description">
        The engine starts hidden in the Windows tray, detects League or Rose, and reconnects the client tab automatically.
      </p>
      <ul className="startup-status-list" role="list">
        <StartupSetting
          label="Start with Windows"
          description="Keep the local engine ready in the system tray."
          checked={startup.launchOnWindowsStartup}
          onChange={(enabled) => onCommand({
            type: "startup.setEnabled",
            setting: "launchOnWindowsStartup",
            enabled,
          })}
        />
        <StartupSetting
          label="Show when League connects"
          description="Bring the desktop dashboard forward after sign-in."
          checked={startup.openOnLeagueDetected}
          onChange={(enabled) => onCommand({
            type: "startup.setEnabled",
            setting: "openOnLeagueDetected",
            enabled,
          })}
        />
        <StartupSetting
          label="Show when Rose starts"
          description="Bring the desktop dashboard forward when Rose is detected."
          checked={startup.openOnRoseDetected}
          onChange={(enabled) => onCommand({
            type: "startup.setEnabled",
            setting: "openOnRoseDetected",
            enabled,
          })}
        />
      </ul>
    </section>
  );
}

function StartupSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  return (
    <li>
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <button
        className="overview-toggle"
        type="button"
        aria-pressed={checked}
        aria-label={`Turn ${label} ${checked ? "off" : "on"}`}
        onClick={() => void onChange(!checked)}
      >
        {checked ? "On" : "Off"}
      </button>
    </li>
  );
}
