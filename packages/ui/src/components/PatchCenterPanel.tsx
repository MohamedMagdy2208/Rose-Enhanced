import { ExternalLink, History, Newspaper } from "lucide-react";
import type { CompanionSnapshot } from "@summonerkit/contracts";
import { personalizedPatchReadiness } from "@summonerkit/core";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";
import { formatLeaguePatch } from "../utils/assets";

export function PatchCenterPanel({ snapshot }: { snapshot: CompanionSnapshot }) {
  const currentPatch = formatLeaguePatch(snapshot.connection.patch);
  const championNames = new Map(snapshot.collection.champions.map((champion) => [champion.id, champion.name]));
  const readiness = personalizedPatchReadiness(snapshot).slice(0, 5);
  const personalIds = new Set(readiness.map((entry) => entry.championId));
  const impacts = snapshot.insights.coach.patchImpacts.filter((impact) => (!currentPatch || impact.patch.startsWith(currentPatch)) && (impact.championId === null || personalIds.has(impact.championId))).slice(0, 5);
  return (
    <section className="panel patch-center" aria-labelledby="patch-center-title">
      <div className="panel__header"><div><p className="eyebrow">Personalized patch center</p><h2 id="patch-center-title">What affects your pool</h2></div><StatusPill tone={currentPatch ? "positive" : "neutral"}>{currentPatch ?? "unknown"}</StatusPill></div>
      {impacts.length > 0 ? <ol className="patch-impact-list">{impacts.map((impact) => <li key={impact.id}><span className={`patch-category patch-category--${impact.category}`}>{impact.category}</span><div><strong>{impact.championId ? championNames.get(impact.championId) ?? `Champion ${impact.championId}` : impact.title}</strong><p>{impact.summary}</p>{impact.sourceUrl ? <a href={impact.sourceUrl} target="_blank" rel="noreferrer">Official source <ExternalLink size={12} /></a> : null}</div></li>)}</ol> : readiness.length > 0 ? <ol className="patch-readiness-list">{readiness.map((entry) => <li key={entry.championId}><History size={15} aria-hidden="true" /><span>{championNames.get(entry.championId) ?? `Champion ${entry.championId}`}</span><StatusPill tone={entry.status === "current" ? "positive" : entry.status === "stale" ? "warning" : "neutral"}>{entry.status}</StatusPill><small>{entry.dataPatch ? `Evidence ${entry.dataPatch}` : "No online sample"}</small></li>)}</ol> : <EmptyState icon={Newspaper} title="No personal patch impact yet" description="Play champions, favorite skins, or add profile picks to build your personalized list." />}
      {impacts.length === 0 && readiness.length > 0 ? <p className="data-provenance">No curated change summary is available, so this view shows recommendation readiness instead of guessing patch effects.</p> : null}
    </section>
  );
}
