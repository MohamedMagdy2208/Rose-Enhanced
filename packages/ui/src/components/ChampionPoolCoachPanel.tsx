import { Activity, ArrowUpRight, Crosshair, ShieldCheck } from "lucide-react";
import type { ChampionPerformanceSnapshot, ChampionRecord } from "@summonerkit/contracts";
import { championPoolAdvice } from "@summonerkit/core";
import { EmptyState } from "./EmptyState";

const iconByKind = { comfort: ShieldCheck, momentum: ArrowUpRight, practice: Crosshair } as const;

export function ChampionPoolCoachPanel({ performance, champions }: { performance: ChampionPerformanceSnapshot; champions: ChampionRecord[] }) {
  const advice = championPoolAdvice(performance);
  const championNames = new Map(champions.map((champion) => [champion.id, champion.name]));
  return (
    <section className="panel champion-pool-coach" aria-labelledby="champion-pool-title">
      <div className="panel__header"><div><p className="eyebrow">Champion pool coach</p><h2 id="champion-pool-title">Comfort, momentum, practice</h2></div></div>
      {advice.length === 0 ? <EmptyState icon={Activity} title="More games are needed" description="Complete at least two recent games on a champion to unlock pool coaching." /> : (
        <ol className="pool-advice-list">
          {advice.map((entry) => {
            const Icon = iconByKind[entry.kind];
            return <li key={`${entry.kind}-${entry.championId}`}><span aria-hidden="true"><Icon size={17} /></span><div><small>{entry.title}</small><strong>{championNames.get(entry.championId) ?? `Champion ${entry.championId}`}</strong><p>{entry.detail}</p></div></li>;
          })}
        </ol>
      )}
    </section>
  );
}
