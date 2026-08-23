import {
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  Stethoscope,
  Wrench,
  XCircle,
} from "lucide-react";
import type { CompanionCommand, CompanionSnapshot, ConnectionDoctorCheck } from "@rose-enhanced/contracts";
import { StatusPill } from "../components/StatusPill";
import { formatRelativeTime } from "../utils/assets";

const checkIcon = {
  healthy: CheckCircle2,
  attention: CircleAlert,
  unavailable: XCircle,
};

export function ConnectionDoctorPage({
  snapshot,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  return (
    <div className="page doctor-page">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">Connection doctor</p>
          <h1>Every link, reported truthfully.</h1>
          <p className="page-lede">Desktop, League, Pengu, and collection health are diagnosed independently.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "doctor.refresh" })}>
          <RefreshCw size={16} /> Run checks
        </button>
      </header>

      <section className="doctor-summary" aria-labelledby="doctor-summary-title">
        <Stethoscope size={24} aria-hidden="true" />
        <div>
          <p className="eyebrow">Current assessment</p>
          <h2 id="doctor-summary-title">{summaryTitle(snapshot.doctor.overall)}</h2>
          <p>Checked {formatRelativeTime(snapshot.doctor.checkedAt)}</p>
        </div>
        <StatusPill tone={snapshot.doctor.overall === "healthy" ? "positive" : snapshot.doctor.overall === "attention" ? "warning" : "danger"}>
          {snapshot.doctor.overall}
        </StatusPill>
      </section>

      <section className="doctor-checks" aria-label="Connection checks">
        {snapshot.doctor.checks.map((check) => (
          <DoctorCheckRow key={check.id} check={check} onCommand={onCommand} />
        ))}
      </section>
    </div>
  );
}

function DoctorCheckRow({
  check,
  onCommand,
}: {
  check: ConnectionDoctorCheck;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const Icon = checkIcon[check.status];
  const action = check.action;
  return (
    <article className={`doctor-check doctor-check--${check.status}`}>
      <Icon size={21} aria-hidden="true" />
      <div><h2>{check.label}</h2><p>{check.detail}</p></div>
      {action ? (
        <button className="button button--secondary" type="button" onClick={() => onCommand(commandFor(action))}>
          <Wrench size={15} /> {action === "repair-client-tab" ? "Repair & reload" : "Refresh"}
        </button>
      ) : null}
    </article>
  );
}

function commandFor(action: NonNullable<ConnectionDoctorCheck["action"]>): CompanionCommand {
  return action === "repair-client-tab" ? { type: "clientTab.repair" } : { type: "collection.refresh" };
}

function summaryTitle(overall: CompanionSnapshot["doctor"]["overall"]): string {
  if (overall === "healthy") return "All local connections are healthy";
  if (overall === "attention") return "One or more connections need attention";
  return "League connectivity is unavailable";
}
