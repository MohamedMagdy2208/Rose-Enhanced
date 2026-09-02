import { Moon, Radio, Wifi } from "lucide-react";
import type { CompanionCommand, PresenceState } from "@summonerkit/contracts";
import { StatusPill } from "./StatusPill";

export function presencePresentation(presence: PresenceState): {
  label: string;
  detail: string;
  tone: "positive" | "warning" | "danger" | "neutral";
} {
  if (presence.status === "loading") return { label: "Updating", detail: "Waiting for League to confirm the new presence.", tone: "neutral" };
  if (presence.status === "error") return { label: "Unavailable", detail: presence.lastError ?? "League presence could not be read.", tone: "danger" };
  if (presence.status !== "ready") return { label: "Unavailable", detail: presence.lastError ?? "Connect to League to manage presence.", tone: "neutral" };
  if (presence.availability === "online") return { label: "Online", detail: "Friends can see that you are online.", tone: "positive" };
  if (presence.availability === "away") return { label: "Away", detail: "League is showing you as away.", tone: "warning" };
  return { label: "League managed", detail: "League is currently using an activity-specific state. You can still choose Online or Away.", tone: "neutral" };
}

export function PresenceControl({
  presence,
  writable,
  onCommand,
}: {
  presence: PresenceState;
  writable: boolean;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const presentation = presencePresentation(presence);
  const busy = presence.status === "loading";
  return (
    <section className="presence-control" aria-labelledby="presence-control-title" aria-busy={busy}>
      <span className="presence-control__icon" aria-hidden="true"><Radio size={19} /></span>
      <div className="presence-control__copy">
        <div className="presence-control__title"><h2 id="presence-control-title">League presence</h2><StatusPill tone={presentation.tone}>{presentation.label}</StatusPill></div>
        <p role={presence.status === "error" ? "alert" : "status"}>{presentation.detail}</p>
      </div>
      <div className="presence-control__choices" role="group" aria-label="Choose League presence">
        <button className="presence-choice" type="button" aria-pressed={presence.availability === "online"} disabled={!writable || busy} onClick={() => void onCommand({ type: "presence.set", availability: "online" })}><Wifi size={15} aria-hidden="true" />Online</button>
        <button className="presence-choice" type="button" aria-pressed={presence.availability === "away"} disabled={!writable || busy} onClick={() => void onCommand({ type: "presence.set", availability: "away" })}><Moon size={15} aria-hidden="true" />Away</button>
      </div>
      <small>True Offline is not simulated by this control; it requires launching League through a presence-filtering proxy.</small>
    </section>
  );
}
