import { Activity, Crosshair, Target } from "lucide-react";
import type { ChampionPerformanceRecord, ChampionPerformanceSnapshot } from "@rose-enhanced/contracts";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";
import { formatRelativeTime } from "../utils/assets";

export function ChampionPerformancePanel({
  performance,
  championName,
  record,
}: {
  performance: ChampionPerformanceSnapshot;
  championName: string | null;
  record: ChampionPerformanceRecord | null;
}) {
  return (
    <section className="panel performance-detail" aria-labelledby="champion-performance-title">
      <div className="panel__header">
        <div><p className="eyebrow">Your recent form</p><h2 id="champion-performance-title">{championName ? `${championName} performance` : "Champion performance"}</h2></div>
        <StatusPill tone={performance.stale ? "warning" : performance.status === "ready" ? "positive" : "neutral"}>{performance.source}</StatusPill>
      </div>
      {!record ? (
        <EmptyState icon={Activity} title="No recent games for this champion" description={performance.warnings[0] ?? "Play a completed match, then refresh performance."} />
      ) : (
        <>
          <div className="performance-score">
            <div className="score-ring" style={{ "--score": `${record.overallScore * 3.6}deg` } as React.CSSProperties}>
              <strong>{record.overallScore}</strong><span>/ 100</span>
            </div>
            <div><span>Overall score</span><p>Role-aware blend of KDA, farm, champion damage, and vision. It compares execution metrics, not rank or matchmaking difficulty.</p></div>
          </div>
          <dl className="performance-metrics">
            <Metric label="Record" value={`${record.wins}W · ${record.losses}L`} detail={`${record.winRate.toFixed(1)}% win rate`} />
            <Metric label="Average K / D / A" value={`${record.averageKills} / ${record.averageDeaths} / ${record.averageAssists}`} detail={`${record.kda.toFixed(2)} KDA`} />
            <Metric label="Farm" value={`${record.farmPerMinute.toFixed(2)} / min`} detail={`${record.totalFarm.toLocaleString()} total CS`} />
            <Metric label="Kill participation" value={`${record.killParticipation.toFixed(1)}%`} detail="Average team involvement" />
            <Metric label="Damage" value={`${record.damagePerMinute.toFixed(0)} / min`} detail="To enemy champions" />
            <Metric label="Vision" value={`${record.visionPerMinute.toFixed(2)} / min`} detail="Vision score rate" />
          </dl>
          <div className="performance-footnote"><Target size={15} /><span>{record.games} games analyzed</span><Crosshair size={15} /><span>Last played {formatRelativeTime(record.lastPlayedAt)}</span></div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>;
}
