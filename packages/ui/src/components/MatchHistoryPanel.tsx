import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Eye, History, Target, TrendingUp } from "lucide-react";
import type {
  ChampionPerformanceSnapshot,
  ChampionRecord,
  PerformanceMatchRecord,
  RuneRecommendationRole,
} from "@summonerkit/contracts";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";
import { formatRelativeTime, lcuAssetUrl } from "../utils/assets";

const initialVisibleMatches = 12;
type MatchResultFilter = "all" | "wins" | "losses";
type MatchRangeFilter = "all" | "7" | "30" | "90";

export interface MatchHistoryFilters {
  championId: number | null;
  queueId: number | null;
  role: RuneRecommendationRole | null;
  result: MatchResultFilter;
  range: MatchRangeFilter;
}

export function filterPerformanceMatches(
  matches: PerformanceMatchRecord[],
  filters: MatchHistoryFilters,
  now = Date.now(),
): PerformanceMatchRecord[] {
  const cutoff = filters.range === "all" ? null : now - Number(filters.range) * 24 * 60 * 60 * 1_000;
  return matches.filter((match) => {
    if (filters.championId !== null && match.championId !== filters.championId) return false;
    if (filters.queueId !== null && match.queueId !== filters.queueId) return false;
    if (filters.role !== null && match.role !== filters.role) return false;
    if (filters.result === "wins" && !match.won) return false;
    if (filters.result === "losses" && match.won) return false;
    if (cutoff !== null && (!match.playedAt || Date.parse(match.playedAt) < cutoff)) return false;
    return true;
  });
}

export function MatchHistoryPanel({
  performance,
  champions,
  selectedChampionId,
}: {
  performance: ChampionPerformanceSnapshot;
  champions: ChampionRecord[];
  selectedChampionId: number | null;
}) {
  const [scope, setScope] = useState<"overall" | "champion">("overall");
  const [visibleMatches, setVisibleMatches] = useState(initialVisibleMatches);
  const [queueId, setQueueId] = useState<number | null>(null);
  const [role, setRole] = useState<RuneRecommendationRole | null>(null);
  const [result, setResult] = useState<MatchResultFilter>("all");
  const [range, setRange] = useState<MatchRangeFilter>("all");
  const championById = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);
  const selectedChampion = selectedChampionId ? championById.get(selectedChampionId) ?? null : null;
  const queueIds = useMemo(
    () => [...new Set(performance.matches.flatMap((match) => match.queueId ?? []))].sort((left, right) => left - right),
    [performance.matches],
  );
  const filters = useMemo<MatchHistoryFilters>(() => ({
    championId: scope === "champion" ? selectedChampionId : null,
    queueId,
    role,
    result,
    range,
  }), [queueId, range, result, role, scope, selectedChampionId]);
  const history = useMemo(() => filterPerformanceMatches(performance.matches, filters), [filters, performance.matches]);

  useEffect(() => { setVisibleMatches(initialVisibleMatches); }, [filters]);

  return (
    <section className="panel match-history" aria-labelledby="match-history-title">
      <div className="panel__header match-history__header">
        <div>
          <p className="eyebrow">Recent match history</p>
          <h2 id="match-history-title">{scope === "champion" && selectedChampion ? `${selectedChampion.name} matches` : "All recent matches"}</h2>
        </div>
        <StatusPill tone={performance.stale ? "warning" : performance.status === "ready" ? "positive" : "neutral"}>{history.length} shown</StatusPill>
      </div>

      <div className="segmented-control match-history__scope" aria-label="Match history scope">
        <button type="button" className={scope === "overall" ? "active" : ""} aria-pressed={scope === "overall"} onClick={() => setScope("overall")}>Overall</button>
        <button type="button" className={scope === "champion" ? "active" : ""} aria-pressed={scope === "champion"} disabled={!selectedChampionId} onClick={() => setScope("champion")}>{selectedChampion ? selectedChampion.name : "Selected champion"}</button>
      </div>

      <div className="match-history__filters" aria-label="Match history filters">
        <FilterSelect label="Queue" value={queueId ?? "all"} onChange={(value) => setQueueId(value === "all" ? null : Number(value))}>
          <option value="all">All queues</option>{queueIds.map((id) => <option value={id} key={id}>{queueLabel(id)}</option>)}
        </FilterSelect>
        <FilterSelect label="Role" value={role ?? "all"} onChange={(value) => setRole(value === "all" ? null : value as RuneRecommendationRole)}>
          <option value="all">All roles</option><option value="top">Top</option><option value="jungle">Jungle</option><option value="middle">Middle</option><option value="bottom">Bottom</option><option value="utility">Support</option><option value="aram">ARAM</option>
        </FilterSelect>
        <FilterSelect label="Result" value={result} onChange={(value) => setResult(value as MatchResultFilter)}>
          <option value="all">Wins and losses</option><option value="wins">Victories</option><option value="losses">Defeats</option>
        </FilterSelect>
        <FilterSelect label="Period" value={range} onChange={(value) => setRange(value as MatchRangeFilter)}>
          <option value="all">Full history</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
        </FilterSelect>
      </div>

      {history.length === 0 ? (
        <EmptyState icon={scope === "overall" ? History : Activity} title="No matches match these filters" description={performance.warnings[0] ?? "Clear a filter or refresh after completing another match."} />
      ) : (
        <>
          <PerformanceTrend matches={history.slice(0, 10)} />
          <ol className="match-history__list">
            {history.slice(0, visibleMatches).map((match) => <MatchHistoryItem key={match.id} match={match} champion={championById.get(match.championId) ?? null} />)}
          </ol>
          {visibleMatches < history.length ? <button className="button button--secondary match-history__more" type="button" onClick={() => setVisibleMatches((current) => current + initialVisibleMatches)}>Show more matches</button> : null}
        </>
      )}
    </section>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function PerformanceTrend({ matches }: { matches: PerformanceMatchRecord[] }) {
  const chronological = [...matches].reverse();
  const average = Math.round(matches.reduce((total, match) => total + match.overallScore, 0) / matches.length);
  return (
    <div className="match-trend">
      <div><TrendingUp size={16} aria-hidden="true" /><span>Form trend</span><strong>{average}/100 average</strong></div>
      <div className="match-trend__bars" role="img" aria-label={`Execution scores for the last ${matches.length} filtered matches, averaging ${average} out of 100`}>
        {chronological.map((match) => <span key={match.id} className={match.won ? "match-trend__bar--win" : ""} style={{ "--trend-score": `${Math.max(5, match.overallScore)}%` } as React.CSSProperties} title={`${match.overallScore}/100 · ${match.won ? "Victory" : "Defeat"}`} />)}
      </div>
    </div>
  );
}

function MatchHistoryItem({ match, champion }: { match: PerformanceMatchRecord; champion: ChampionRecord | null }) {
  const championName = champion?.name ?? `Champion ${match.championId}`;
  const icon = lcuAssetUrl(champion?.iconPath ?? null);
  return (
    <li className={`match-history__item match-history__item--${match.won ? "win" : "loss"}`}>
      <div className="match-history__champion"><span className="match-history__portrait" aria-hidden="true">{icon ? <img src={icon} alt="" loading="lazy" /> : championName.slice(0, 1)}</span><div><strong>{championName}</strong><span>{queueLabel(match.queueId)} · {roleLabel(match.role)}</span></div></div>
      <div className="match-history__result"><strong>{match.won ? "Victory" : "Defeat"}</strong><span>{formatRelativeTime(match.playedAt)}</span></div>
      <div className="match-history__stat"><span>K / D / A</span><strong>{match.kills} / {match.deaths} / {match.assists}</strong><small>{match.kda.toFixed(2)} KDA</small></div>
      <div className="match-history__stat"><span>Farm</span><strong>{match.farm} CS</strong><small>{match.farmPerMinute.toFixed(2)} / min</small></div>
      <div className="match-history__stat"><span>Impact</span><strong>{match.overallScore} / 100</strong><small>{match.killParticipation.toFixed(1)}% KP</small></div>
      <div className="match-history__meta"><Clock3 size={14} /><span>{match.durationMinutes.toFixed(1)} min</span><Target size={14} /><span>{match.damagePerMinute.toFixed(0)} dmg/min</span><Eye size={14} /><span>{match.visionPerMinute.toFixed(2)} vision/min</span></div>
    </li>
  );
}

function roleLabel(role: RuneRecommendationRole | null): string {
  if (role === "utility") return "Support";
  if (!role) return "Role unknown";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function queueLabel(queueId: number | null): string {
  if (queueId === 420) return "Ranked Solo/Duo";
  if (queueId === 440) return "Ranked Flex";
  if (queueId === 450) return "ARAM";
  if (queueId === 400) return "Normal Draft";
  if (queueId === 430) return "Normal Blind";
  if (queueId === 490) return "Quickplay";
  return queueId ? `Queue ${queueId}` : "League match";
}
