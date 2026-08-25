import { Download, FileWarning, LockKeyhole, RefreshCw, ServerCog } from "lucide-react";
import type { CompanionSnapshot } from "@summonerkit/contracts";
import { useCompanionBridge } from "../bridge/bridge-context";
import { GuidanceHealthPanel } from "../components/GuidanceHealthPanel";
import { StatusPill } from "../components/StatusPill";

export function DiagnosticsPage({ snapshot }: { snapshot: CompanionSnapshot }) {
  const bridge = useCompanionBridge();
  const capabilityEntries = Object.entries(snapshot.connection.capabilities);

  const exportReport = async () => {
    const report = await bridge.exportDiagnostics();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `summonerkit-diagnostics-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page diagnostics-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">Diagnostics</p><h1>Understand what the client supports.</h1><p className="page-lede">Unsupported endpoints fail as visible capabilities, never as silent or repeated writes.</p></div>
        <button className="button button--secondary" type="button" onClick={exportReport}><Download size={16} /> Export redacted report</button>
      </header>

      <div className="diagnostics-grid">
        <GuidanceHealthPanel health={snapshot.insights.guidance} />
        <section className="panel">
          <div className="panel__header"><div><p className="eyebrow">Connection</p><h2>League Client API</h2></div><StatusPill tone={snapshot.connection.status === "connected" ? "positive" : "neutral"}>{snapshot.connection.status}</StatusPill></div>
          <dl className="definition-list">
            <div><dt>Phase</dt><dd>{snapshot.connection.phase}</dd></div>
            <div><dt>Region</dt><dd>{snapshot.connection.region ?? "Unknown"}</dd></div>
            <div><dt>Locale</dt><dd>{snapshot.connection.locale ?? "Unknown"}</dd></div>
            <div><dt>Patch</dt><dd>{snapshot.connection.patch ?? "Unknown"}</dd></div>
          </dl>
          {snapshot.connection.lastError ? <div className="inline-notice inline-notice--warning"><FileWarning size={17} /><span>{snapshot.connection.lastError}</span></div> : null}
        </section>

        <section className="panel">
          <div className="panel__header"><div><p className="eyebrow">Capability map</p><h2>Endpoint health</h2></div><RefreshCw size={17} /></div>
          <ul className="capability-list">
            {capabilityEntries.map(([name, available]) => <li key={name}><span>{name.replace(/([A-Z])/g, " $1")}</span><StatusPill tone={available ? "positive" : "neutral"}>{available ? "Available" : "Unavailable"}</StatusPill></li>)}
          </ul>
        </section>

        <section className="panel panel--wide security-summary">
          <LockKeyhole size={22} aria-hidden="true" />
          <div><h2>Local secrets stay in the main process</h2><p>The renderer receives normalized collection and session data through validated commands. Lockfile credentials, filesystem access, and process control are never exposed to this page.</p></div>
          <ServerCog size={34} aria-hidden="true" />
        </section>
      </div>
    </div>
  );
}
