import { useState } from "react";
import { Boxes, Check, Cloud, FlaskConical, Gamepad2, PlugZap, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import type { CompanionCommand, CompanionSnapshot } from "@summonerkit/contracts";
import type { PageId } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import { formatLeaguePatch } from "../utils/assets";

type SetupTone = "positive" | "warning" | "neutral";

export function SetupPage({
  snapshot,
  onCommand,
  onNavigate,
  onComplete,
}: {
  snapshot: CompanionSnapshot;
  onCommand: (command: CompanionCommand) => Promise<void>;
  onNavigate: (page: PageId) => void;
  onComplete: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const tabCurrent = snapshot.clientTab.installed
    && snapshot.clientTab.installedPluginVersion === snapshot.clientTab.expectedPluginVersion
    && snapshot.clientTab.installedProtocolVersion === snapshot.clientTab.protocolVersion
    && !snapshot.clientTab.restartRequired;
  const connected = snapshot.connection.status === "connected";
  const collectionReady = snapshot.collection.status === "ready";
  const guidanceReady = snapshot.insights.runes.status === "ready" && snapshot.insights.coach.status === "ready";
  const patch = formatLeaguePatch(snapshot.connection.patch) ?? "unknown";
  const steps = [
    { id: "engine", icon: ShieldCheck, label: "Desktop engine", detail: "Local bridge and encrypted settings are running.", status: "Ready", tone: "positive" as SetupTone },
    { id: "league", icon: Gamepad2, label: "League connection", detail: connected ? `Connected on patch ${patch}.` : snapshot.connection.lastError ?? "Open League, then run the system test.", status: connected ? "Ready" : "Waiting", tone: connected ? "positive" as SetupTone : "warning" as SetupTone },
    { id: "tab", icon: PlugZap, label: "League client tab", detail: tabCurrent ? "Installed and compatible with this desktop build." : snapshot.clientTab.lastError ?? "Install or repair the Pengu client integration.", status: tabCurrent ? "Ready" : "Action needed", tone: tabCurrent ? "positive" as SetupTone : "warning" as SetupTone },
    { id: "collection", icon: Boxes, label: "Collection data", detail: collectionReady ? `${snapshot.collection.progress.ownedSkins} owned skins loaded.` : "Connect League to synchronize ownership and read-only loot.", status: collectionReady ? "Ready" : "Waiting", tone: collectionReady ? "positive" as SetupTone : "neutral" as SetupTone },
    { id: "runes", icon: Cloud, label: "Online guidance feed", detail: guidanceReady ? `${snapshot.insights.runes.recommendations.length} rune and ${snapshot.insights.coach.builds.length} build samples available.` : snapshot.insights.runes.warnings[0] ?? snapshot.insights.coach.warnings[0] ?? "The first-party publisher has not produced a feed yet.", status: guidanceReady ? "Ready" : "Optional", tone: guidanceReady ? "positive" as SetupTone : "neutral" as SetupTone },
    { id: "mobile", icon: Smartphone, label: "Mobile control", detail: snapshot.remote.relayConfigured ? "Relay is configured and ready for device pairing." : "Optional: configure the encrypted relay before pairing a phone.", status: snapshot.remote.relayConfigured ? "Ready" : "Optional", tone: snapshot.remote.relayConfigured ? "positive" as SetupTone : "neutral" as SetupTone },
  ];
  const readyCount = steps.filter((step) => step.status === "Ready").length;

  const runTest = async () => {
    setTesting(true);
    await onCommand({ type: "doctor.refresh" });
    await onCommand({ type: "insights.refreshRunes" });
    if (connected) {
      await onCommand({ type: "collection.refresh" });
      await onCommand({ type: "insights.refreshPerformance" });
    }
    setTestedAt(new Date().toISOString());
    setTesting(false);
  };

  return (
    <div className="page setup-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">First-run setup</p><h1>One companion. One system check.</h1><p className="page-lede">SummonerKit tests each boundary independently, so optional services never hide a working League connection.</p></div>
        <button className="button button--primary" type="button" disabled={testing} onClick={() => void runTest()}><FlaskConical size={16} />{testing ? "Testing…" : "Test everything"}</button>
      </header>

      <section className="setup-progress" aria-label={`${readyCount} of ${steps.length} setup checks ready`}>
        <div><span>Setup health</span><strong>{readyCount}/{steps.length} ready</strong></div>
        <div className="progress-track"><span style={{ width: `${readyCount / steps.length * 100}%` }} /></div>
        <small>{testedAt ? `Last tested ${new Date(testedAt).toLocaleTimeString()}` : "Run the check after opening League."}</small>
      </section>

      <ol className="setup-checks">
        {steps.map(({ id, icon: Icon, label, detail, status, tone }) => (
          <li key={id}>
            <span className={`setup-checks__icon setup-checks__icon--${tone}`} aria-hidden="true"><Icon size={19} /></span>
            <div><strong>{label}</strong><p>{detail}</p></div>
            <StatusPill tone={tone}>{status}</StatusPill>
            {id === "tab" && !tabCurrent ? <button className="button button--secondary button--compact" type="button" onClick={() => onCommand({ type: "clientTab.repair" })}><Wrench size={14} />Repair</button> : null}
            {id === "mobile" ? <button className="text-button" type="button" onClick={() => onNavigate("mobile")}>Configure</button> : null}
            {id === "runes" && !guidanceReady ? <button className="text-button" type="button" onClick={() => onNavigate("guide")}>Publisher guide</button> : null}
          </li>
        ))}
      </ol>

      <section className="setup-finish">
        <Check size={19} aria-hidden="true" />
        <div><h2>Setup is non-blocking</h2><p>You can finish now and return from the Setup navigation item. League, online guidance, and mobile will reconnect independently when available.</p></div>
        <button className="button button--secondary" type="button" onClick={onComplete}>Finish and open overview</button>
      </section>
    </div>
  );
}
