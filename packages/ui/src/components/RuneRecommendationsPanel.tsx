import { DatabaseZap, ShieldCheck, Sparkles } from "lucide-react";
import type {
  CompanionCommand,
  ConnectionStatus,
  RunePerkRecord,
  RuneRecommendation,
  RuneRecommendationsSnapshot,
} from "@rose-enhanced/contracts";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";
import { formatRelativeTime, lcuAssetUrl } from "../utils/assets";

const audienceLabel = { "high-elo": "High elo", pro: "Pro players", combined: "Combined" } as const;

export function RuneRecommendationsPanel({
  runes,
  recommendations,
  connectionStatus,
  onCommand,
}: {
  runes: RuneRecommendationsSnapshot;
  recommendations: RuneRecommendation[];
  connectionStatus: ConnectionStatus;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const perkById = new Map(runes.perks.map((perk) => [perk.id, perk]));
  return (
    <section className="panel insights-runes" aria-labelledby="recommended-runes-title">
      <div className="panel__header">
        <div><p className="eyebrow">Recent online samples</p><h2 id="recommended-runes-title">Recommended rune pages</h2></div>
        <StatusPill tone={runes.stale ? "warning" : runes.status === "ready" ? "positive" : "neutral"}>
          {runes.source === "online" ? "Online" : runes.source}
        </StatusPill>
      </div>
      {recommendations.length === 0 ? (
        <EmptyState
          icon={DatabaseZap}
          title={runes.status === "unavailable" ? "Online rune feed not configured" : "No recommendation for this filter"}
          description={runes.warnings[0] ?? "Choose another champion, role, or player sample."}
        />
      ) : (
        <div className="rune-recommendation-list">
          {recommendations.map((recommendation) => (
            <article className="rune-recommendation" key={recommendation.id}>
              <header>
                <div>
                  <span className={`audience-mark audience-mark--${recommendation.audience}`}><Sparkles size={14} />{audienceLabel[recommendation.audience]}</span>
                  <h3>{recommendation.role} · Patch {recommendation.patch}</h3>
                </div>
                <div className="rune-sample"><strong>{recommendation.winRate.toFixed(1)}%</strong><span>win rate</span></div>
              </header>
              <RuneStrip ids={recommendation.selectedPerkIds} perkById={perkById} />
              <footer>
                <div className="rune-evidence">
                  <span>{recommendation.sampleSize.toLocaleString()} games</span>
                  <span>{recommendation.pickRate.toFixed(1)}% of sampled builds</span>
                  <span>{formatRelativeTime(recommendation.generatedAt)}</span>
                </div>
                <button
                  className="button button--primary button--compact"
                  type="button"
                  disabled={connectionStatus !== "connected"}
                  onClick={() => onCommand({ type: "runes.applyRecommendation", recommendationId: recommendation.id })}
                >
                  <ShieldCheck size={15} aria-hidden="true" /> Apply safely
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {runes.providerName ? <p className="data-provenance">Provider: {runes.providerName}. Results are descriptive samples, not a guarantee of the best choice for every match.</p> : null}
    </section>
  );
}

function RuneStrip({ ids, perkById }: { ids: number[]; perkById: Map<number, RunePerkRecord> }) {
  return (
    <ol className="rune-strip" aria-label="Selected rune perks">
      {ids.map((id, index) => {
        const perk = perkById.get(id);
        const source = lcuAssetUrl(perk?.iconPath ?? null);
        return (
          <li key={`${id}-${index}`} title={perk?.name ?? `Perk ${id}`}>
            {source ? <img src={source} alt="" /> : <span aria-hidden="true">{index + 1}</span>}
            <small>{perk?.name ?? id}</small>
          </li>
        );
      })}
    </ol>
  );
}
