import { ClipboardCheck } from "lucide-react";
import type { ChampionPerformanceSnapshot, ChampionRecord } from "@summonerkit/contracts";
import { EmptyState } from "./EmptyState";
import { formatRelativeTime } from "../utils/assets";

export function MatchReportCardsPanel({ performance, champions, championId }: { performance: ChampionPerformanceSnapshot; champions: ChampionRecord[]; championId: number | null }) {
  const championNames = new Map(champions.map((champion) => [champion.id, champion.name]));
  const matches = performance.matches.filter((match) => championId === null || match.championId === championId).slice(0, 3);
  return (
    <section className="panel match-report-cards" aria-labelledby="match-report-title">
      <div className="panel__header"><div><p className="eyebrow">Post-game report cards</p><h2 id="match-report-title">One strength. One next step.</h2></div></div>
      {matches.length === 0 ? <EmptyState icon={ClipboardCheck} title="No report cards yet" description="Refresh performance after a completed game." /> : (
        <ol className="report-card-list">
          {matches.map((match) => <li key={match.id}>
            <span className={`report-grade report-grade--${match.reportCard.grade.toLowerCase()}`}>{match.reportCard.grade}</span>
            <div><div><strong>{championNames.get(match.championId) ?? `Champion ${match.championId}`}</strong><small>{match.won ? "Victory" : "Defeat"} · {formatRelativeTime(match.playedAt)}</small></div><p>{match.reportCard.headline}</p><dl><div><dt>Keep</dt><dd>{match.reportCard.strengths[0]}</dd></div><div><dt>Focus</dt><dd>{match.reportCard.focus[0]}</dd></div></dl></div>
          </li>)}
        </ol>
      )}
    </section>
  );
}
