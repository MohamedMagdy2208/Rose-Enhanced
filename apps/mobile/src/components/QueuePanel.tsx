import { Check, Play, Square, Unplug } from "lucide-react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@rose-enhanced/contracts";
import { queueLabel } from "../mobile-view";

interface QueuePanelProps {
  snapshot: RemoteCompanionSnapshot;
  pending: boolean;
  send: (command: CompanionCommand) => void;
}

export function QueuePanel({ snapshot, pending, send }: QueuePanelProps) {
  const { queue, readyCheck } = snapshot.session;
  return (
    <section className="queue-panel" aria-labelledby="queue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MATCHMAKING</p>
          <h2 id="queue-title">{queueLabel(queue.activity)}</h2>
        </div>
        <span className={`phase-badge phase-badge--${queue.activity}`}>{queue.queueId ? `Queue ${queue.queueId}` : snapshot.connection.phase}</span>
      </div>

      {readyCheck.active ? (
        <div className="ready-check" role="alert" aria-live="assertive">
          <div><strong>Match found</strong><span>Answer the ready check from your phone.</span></div>
          <div>
            <button type="button" disabled={pending || !readyCheck.canDecline} className="button-secondary" onClick={() => send({ type: "readyCheck.decline" })}><Unplug size={18} />Decline</button>
            <button type="button" disabled={pending || !readyCheck.canAccept} className="button-primary" onClick={() => send({ type: "readyCheck.accept" })}><Check size={18} />Accept</button>
          </div>
        </div>
      ) : queue.activity === "champ-select" || queue.activity === "in-game" ? (
        <div className="queue-action">
          <div>
            <strong>{queue.activity === "champ-select" ? "Draft is underway" : "Game is in progress"}</strong>
            <span>{queue.activity === "champ-select" ? "Live champion-select controls are available below." : "Queue controls return when you are back in a lobby."}</span>
          </div>
        </div>
      ) : (
        <div className="queue-action">
          <div>
            <strong>{queue.lobbyAvailable ? "Current lobby is available" : "Open or join a lobby on PC"}</strong>
            <span>{queue.canStop ? "Matchmaking is running." : "Rose Enhanced starts the existing lobby queue only."}</span>
          </div>
          {queue.canStop ? (
            <button type="button" disabled={pending} className="button-danger" onClick={() => send({ type: "queue.stop" })}><Square size={18} />Stop queue</button>
          ) : (
            <button type="button" disabled={pending || !queue.canStart} className="button-primary" onClick={() => send({ type: "queue.start" })}><Play size={18} />Start queue</button>
          )}
        </div>
      )}
    </section>
  );
}
