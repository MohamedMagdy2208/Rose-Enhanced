import type { ChampionSelectParticipant, RemoteChampionRecord } from "@summonerkit/contracts";
import { championName, participantChampionId } from "../mobile-view";

interface TeamRosterProps {
  title: string;
  team: ChampionSelectParticipant[];
  champions: RemoteChampionRecord[];
  side: "ally" | "enemy";
}

export function TeamRoster({ title, team, champions, side }: TeamRosterProps) {
  const slots = Array.from({ length: 5 }, (_, index) => team[index] ?? null);
  return (
    <section className={`team-roster team-roster--${side}`} aria-label={title}>
      <h3>{title}</h3>
      <ol>
        {slots.map((participant, index) => {
          const championId = participant ? participantChampionId(participant) : null;
          const name = championName(champions, championId);
          return (
            <li key={participant?.cellId ?? `${side}-${index}`} className={participant?.isLocalPlayer ? "is-local" : undefined}>
              <span className="champion-monogram" aria-hidden="true">{championId ? name.slice(0, 2).toUpperCase() : index + 1}</span>
              <span><strong>{name}</strong><small>{participant?.isLocalPlayer ? "You" : participant?.assignedPosition || (championId ? "Selected" : "Waiting")}</small></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
