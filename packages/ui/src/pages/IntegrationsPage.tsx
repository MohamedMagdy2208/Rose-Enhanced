import { ExternalLink, FolderOpen, Play, PlugZap, Power, Puzzle, ShieldCheck } from "lucide-react";
import type { CompanionCommand, IntegrationState } from "@summonerkit/contracts";
import { StatusPill } from "../components/StatusPill";

const descriptions: Record<IntegrationState["id"], string> = {
  rose: "Open the separately installed Rose skin tool. SummonerKit never bundles its injector or skin files.",
  deceive: "Launch the separately installed Deceive application for its independent presence controls.",
  pengu: "Add SummonerKit inside Rose's existing RE panel and as a separate branded League navigation icon. Both access points reuse the same secured client surface.",
};

export function IntegrationsPage({
  integrations,
  onCommand,
}: {
  integrations: IntegrationState[];
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  return (
    <div className="page integrations-page">
      <header className="page-header">
        <p className="eyebrow">Optional integrations</p>
        <h1>Connected, never combined.</h1>
        <p className="page-lede">Third-party applications remain user-installed, independently licensed processes. SummonerKit only detects and launches them.</p>
      </header>

      <section className="integration-grid">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} onCommand={onCommand} />
        ))}
      </section>

      <section className="panel integration-policy">
        <ShieldCheck size={20} aria-hidden="true" />
        <div><h2>Process ownership matters</h2><p>SummonerKit only stops a process it started itself, and requests a graceful close before using any fallback. Existing Rose and Pengu sessions are reused to prevent conflicting loader instances.</p></div>
      </section>
    </div>
  );
}

function IntegrationCard({ integration, onCommand }: { integration: IntegrationState; onCommand: (command: CompanionCommand) => Promise<void> }) {
  const isPengu = integration.id === "pengu";
  return (
    <article className="integration-card">
      <div className="integration-card__top">
        <span className={`integration-card__icon integration-card__icon--${integration.id}`} aria-hidden="true">{isPengu ? <Puzzle size={22} /> : <PlugZap size={22} />}</span>
        <StatusPill tone={integration.running ? "positive" : integration.installed ? "accent" : "neutral"}>{integration.running ? "Running" : integration.installed ? "Installed" : "Not found"}</StatusPill>
      </div>
      <div><h2>{integration.name}</h2><p>{descriptions[integration.id]}</p></div>
      <dl className="integration-meta"><div><dt>Path</dt><dd title={integration.executablePath ?? "Not configured"}>{integration.executablePath ?? "Not configured"}</dd></div>{integration.version ? <div><dt>Version</dt><dd>{integration.version}</dd></div> : null}</dl>
      {integration.lastError ? <p className="field-error" role="alert">{integration.lastError}</p> : null}
      <div className="integration-card__actions">
        {isPengu ? (
          <button className="button button--primary" type="button" onClick={() => onCommand({ type: integration.installed ? "clientTab.uninstall" : "clientTab.install" })}>
            {integration.installed ? <Power size={16} /> : <Puzzle size={16} />}{integration.installed ? "Remove from client" : "Install in client"}
          </button>
        ) : (
          <>
            <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "integration.chooseExecutable", integrationId: integration.id as "rose" | "deceive" })}><FolderOpen size={16} /> Choose file</button>
            {integration.running && integration.managedProcess ? <button className="button button--danger" type="button" onClick={() => onCommand({ type: "integration.stop", integrationId: integration.id as "rose" | "deceive" })}><Power size={16} /> Stop</button> : <button className="button button--primary" type="button" disabled={!integration.installed} onClick={() => onCommand({ type: "integration.launch", integrationId: integration.id as "rose" | "deceive" })}><Play size={16} /> Launch</button>}
          </>
        )}
      </div>
      {!isPengu ? <a className="integration-link" href={integration.id === "rose" ? "https://github.com/Alban1911/Rose" : "https://github.com/molenzwiebel/deceive"} target="_blank" rel="noreferrer">Official project page <ExternalLink size={13} /></a> : null}
    </article>
  );
}
