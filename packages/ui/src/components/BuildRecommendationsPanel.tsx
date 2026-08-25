import { Boxes, FlaskConical } from "lucide-react";
import type { BuildRecommendation, CoachSnapshot, SummonerSpellOption } from "@summonerkit/contracts";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";
import { formatRelativeTime, lcuAssetUrl } from "../utils/assets";

const audienceLabel = { "high-elo": "High elo", pro: "Pro players", combined: "Combined" } as const;

export function BuildRecommendationsPanel({ coach, recommendations, spells }: { coach: CoachSnapshot; recommendations: BuildRecommendation[]; spells: SummonerSpellOption[] }) {
  const itemById = new Map(coach.items.map((item) => [item.id, item]));
  const spellById = new Map(spells.map((spell) => [spell.id, spell.name]));
  return (
    <section className="panel build-recommendations" aria-labelledby="build-recommendations-title">
      <div className="panel__header">
        <div><p className="eyebrow">Recent completed builds</p><h2 id="build-recommendations-title">Items and spell pairs</h2></div>
        <StatusPill tone={coach.stale ? "warning" : coach.status === "ready" ? "positive" : "neutral"}>{coach.source}</StatusPill>
      </div>
      {recommendations.length === 0 ? (
        <EmptyState icon={Boxes} title="No build sample for this filter" description={coach.warnings[0] ?? "Choose another champion, role, or sample."} />
      ) : (
        <div className="build-list">
          {recommendations.map((build) => (
            <article key={build.id} className="build-card">
              <header><div><span>{audienceLabel[build.audience]}</span><strong>Patch {build.patch}</strong></div><div><strong>{build.winRate.toFixed(1)}%</strong><small>sample win rate</small></div></header>
              <ol className="build-items" aria-label="Items seen together at match completion">
                {build.itemIds.map((itemId) => {
                  const item = itemById.get(itemId);
                  const source = lcuAssetUrl(item?.iconPath ?? null);
                  return <li key={itemId} title={item?.name ?? `Item ${itemId}`}>{source ? <img src={source} alt="" /> : <FlaskConical size={17} aria-hidden="true" />}<span>{item?.name ?? itemId}</span></li>;
                })}
              </ol>
              <footer><span>{build.spellIds.map((id) => spellById.get(id) ?? `Spell ${id}`).join(" + ")}</span><span>{build.sampleSize.toLocaleString()} games · {build.pickRate.toFixed(1)}% sample share</span><span>{formatRelativeTime(build.generatedAt)}</span></footer>
            </article>
          ))}
        </div>
      )}
      <p className="data-provenance">Items are completed-match combinations, not a forced purchase order. Item-set writes remain unavailable until the current client exposes a documented, non-destructive adapter.</p>
    </section>
  );
}
