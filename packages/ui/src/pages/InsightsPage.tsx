import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, Swords } from "lucide-react";
import type {
  CompanionCommand,
  CompanionSnapshot,
  RuneRecommendationAudience,
  RuneRecommendationRole,
} from "@rose-enhanced/contracts";
import { ChampionPerformancePanel } from "../components/ChampionPerformancePanel";
import { RuneRecommendationsPanel } from "../components/RuneRecommendationsPanel";

const audiences: Array<{ id: RuneRecommendationAudience | "all"; label: string }> = [
  { id: "all", label: "All samples" },
  { id: "combined", label: "Combined" },
  { id: "high-elo", label: "High elo" },
  { id: "pro", label: "Pro" },
];
const roles: Array<{ id: RuneRecommendationRole; label: string }> = [
  { id: "top", label: "Top" }, { id: "jungle", label: "Jungle" }, { id: "middle", label: "Middle" },
  { id: "bottom", label: "Bottom" }, { id: "utility", label: "Support" }, { id: "aram", label: "ARAM" },
];

export function InsightsPage({ snapshot, onCommand }: { snapshot: CompanionSnapshot; onCommand: (command: CompanionCommand) => Promise<void> }) {
  const { insights, collection, connection, session } = snapshot;
  const championById = useMemo(() => new Map(collection.champions.map((champion) => [champion.id, champion])), [collection.champions]);
  const availableChampionIds = useMemo(() => [...new Set([
    ...collection.champions.map((champion) => champion.id),
    ...insights.performance.champions.map((record) => record.championId),
    ...insights.runes.recommendations.map((recommendation) => recommendation.championId),
    ...(session.championSelect.selectedChampionId ? [session.championSelect.selectedChampionId] : []),
  ])].sort((left, right) => (championById.get(left)?.name ?? String(left)).localeCompare(championById.get(right)?.name ?? String(right))), [championById, collection.champions, insights.performance.champions, insights.runes.recommendations, session.championSelect.selectedChampionId]);
  const preferredChampion = session.championSelect.selectedChampionId ?? insights.performance.champions[0]?.championId ?? availableChampionIds[0] ?? null;
  const liveRole = assignedRole(snapshot);
  const [championId, setChampionId] = useState<number | null>(preferredChampion);
  const [role, setRole] = useState<RuneRecommendationRole>(liveRole ?? "middle");
  const [audience, setAudience] = useState<RuneRecommendationAudience | "all">("all");

  useEffect(() => {
    if (session.championSelect.selectedChampionId) setChampionId(session.championSelect.selectedChampionId);
    else if (championId === null && preferredChampion) setChampionId(preferredChampion);
  }, [championId, preferredChampion, session.championSelect.selectedChampionId]);
  useEffect(() => { if (liveRole) setRole(liveRole); }, [liveRole]);

  const recommendations = insights.runes.recommendations
    .filter((recommendation) => recommendation.championId === championId && recommendation.role === role && (audience === "all" || recommendation.audience === audience))
    .sort((left, right) => right.sampleSize - left.sampleSize);
  const performance = insights.performance.champions.find((record) => record.championId === championId) ?? null;
  const championName = championId ? championById.get(championId)?.name ?? `Champion ${championId}` : null;

  return (
    <div className="page insights-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">Runes and performance</p><h1>Recent evidence. Your actual results.</h1><p className="page-lede">Compare current high-elo and professional rune samples with your own locally calculated champion performance.</p></div>
        <div className="insights-refresh-actions">
          <button className="button button--secondary" type="button" disabled={insights.runes.status === "loading"} onClick={() => onCommand({ type: "insights.refreshRunes" })}><RefreshCw size={16} /> Runes</button>
          <button className="button button--secondary" type="button" disabled={connection.status !== "connected" || insights.performance.status === "loading"} onClick={() => onCommand({ type: "insights.refreshPerformance" })}><RefreshCw size={16} /> Performance</button>
        </div>
      </header>

      <section className="metric-strip" aria-label="Recent performance summary">
        <SummaryMetric icon={Swords} label="Games analyzed" value={insights.performance.summary.games} note={insights.performance.windowLabel} />
        <SummaryMetric icon={BarChart3} label="Win rate" value={`${insights.performance.summary.winRate.toFixed(1)}%`} note={`${insights.performance.summary.championsPlayed} champions played`} />
        <SummaryMetric icon={Swords} label="Overall KDA" value={insights.performance.summary.kda.toFixed(2)} note="Kills plus assists per death" />
        <SummaryMetric icon={BarChart3} label="Farm rate" value={insights.performance.summary.farmPerMinute.toFixed(2)} note={`Overall score ${insights.performance.summary.overallScore}/100`} />
      </section>

      <section className="insights-toolbar" aria-label="Champion and recommendation filters">
        <label><span>Champion</span><select value={championId ?? ""} onChange={(event) => setChampionId(event.target.value ? Number(event.target.value) : null)}><option value="">Choose a champion</option>{availableChampionIds.map((id) => <option key={id} value={id}>{championById.get(id)?.name ?? `Champion ${id}`}</option>)}</select></label>
        <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as RuneRecommendationRole)}>{roles.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <div className="segmented-control insights-audience" aria-label="Player sample">
          {audiences.map((option) => <button key={option.id} className={audience === option.id ? "active" : ""} type="button" aria-pressed={audience === option.id} onClick={() => setAudience(option.id)}>{option.label}</button>)}
        </div>
      </section>

      <div className="insights-grid">
        <RuneRecommendationsPanel runes={insights.runes} recommendations={recommendations} connectionStatus={connection.status} onCommand={onCommand} />
        <ChampionPerformancePanel performance={insights.performance} championName={championName} record={performance} />
      </div>
    </div>
  );
}

function assignedRole(snapshot: CompanionSnapshot): RuneRecommendationRole | null {
  const local = snapshot.session.championSelect.myTeam.find((member) => member.isLocalPlayer)?.assignedPosition?.toUpperCase();
  const rolesByPosition: Record<string, RuneRecommendationRole> = { TOP: "top", JUNGLE: "jungle", MIDDLE: "middle", MID: "middle", BOTTOM: "bottom", ADC: "bottom", UTILITY: "utility", SUPPORT: "utility" };
  return local ? rolesByPosition[local] ?? null : snapshot.session.queue.queueId === 450 ? "aram" : null;
}

function SummaryMetric({ icon: Icon, label, value, note }: { icon: typeof Swords; label: string; value: string | number; note: string }) {
  return <article className="metric"><span className="metric__icon" aria-hidden="true"><Icon size={18} /></span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>;
}
