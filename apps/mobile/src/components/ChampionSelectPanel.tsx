import { Dices, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@summonerkit/contracts";
import { championName, timerSeconds } from "../mobile-view";
import { ChampionPicker } from "./ChampionPicker";
import { LoadoutPanel } from "./LoadoutPanel";
import { MobileCoachPanel } from "./MobileCoachPanel";
import { TeamRoster } from "./TeamRoster";

interface ChampionSelectPanelProps {
  snapshot: RemoteCompanionSnapshot;
  pending: boolean;
  send: (command: CompanionCommand) => void;
}

export function ChampionSelectPanel({ snapshot, pending, send }: ChampionSelectPanelProps) {
  const [now, setNow] = useState(Date.now());
  const { championSelect } = snapshot.session;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = timerSeconds(championSelect.timerRemainingMs, championSelect.timerUpdatedAt, now);

  if (!championSelect.active) return null;
  return (
    <section className="champ-select-panel" aria-labelledby="champ-select-title">
      <header className="champ-select-header">
        <div><p className="eyebrow">LIVE CHAMPION SELECT</p><h2 id="champ-select-title">{championSelect.localAction ? `Your ${championSelect.localAction.type}` : "Draft in progress"}</h2></div>
        <div className="phase-timer" aria-label={seconds === null ? "Timer unavailable" : `${seconds} seconds remaining`}><Timer size={18} /><strong>{seconds ?? "—"}</strong><span>{championSelect.timerPhase ?? "Phase"}</span></div>
      </header>
      <div className="draft-board">
        <TeamRoster title="Your team" team={championSelect.myTeam} champions={snapshot.champions} side="ally" />
        <TeamRoster title="Enemy team" team={championSelect.theirTeam} champions={snapshot.champions} side="enemy" />
      </div>
      <div className="ban-strip" aria-label="Banned champions">
        <strong>Bans</strong>
        {[...championSelect.myTeamBans, ...championSelect.theirTeamBans].map((championId, index) => <span key={`${championId}-${index}`}>{championName(snapshot.champions, championId)}</span>)}
        {championSelect.myTeamBans.length + championSelect.theirTeamBans.length === 0 ? <small>No bans locked yet</small> : null}
      </div>
      <MobileCoachPanel snapshot={snapshot} pending={pending} send={send} />
      <ChampionPicker snapshot={snapshot} pending={pending} send={send} />
      <LoadoutPanel snapshot={snapshot} pending={pending} send={send} />
      {snapshot.aram.active ? (
        <section className="aram-panel" aria-labelledby="aram-title">
          <div className="section-heading"><div><p className="eyebrow">ARAM</p><h2 id="aram-title">Bench</h2></div><Dices size={21} /></div>
          <div className="skin-list">{snapshot.aram.bench.map((entry) => <button type="button" disabled={pending} key={entry.championId} onClick={() => send({ type: "aram.benchSwap", championId: entry.championId })}>{championName(snapshot.champions, entry.championId)}{entry.isFavorite ? " ♥" : ""}</button>)}</div>
        </section>
      ) : null}
    </section>
  );
}
