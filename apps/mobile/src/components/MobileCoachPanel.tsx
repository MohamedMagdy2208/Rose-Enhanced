import { Boxes, Lightbulb, MousePointerClick, Sparkles } from "lucide-react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@summonerkit/contracts";
import { championName } from "../mobile-view";

interface MobileCoachPanelProps {
  snapshot: RemoteCompanionSnapshot;
  pending: boolean;
  send: (command: CompanionCommand) => void;
}

export function MobileCoachPanel({ snapshot, pending, send }: MobileCoachPanelProps) {
  const { coach } = snapshot;
  const action = snapshot.session.championSelect.localAction;
  const selectedChampionId = snapshot.session.championSelect.selectedChampionId;
  const itemNames = new Map(coach.items.map((item) => [item.id, item.name]));
  const builds = coach.builds.filter((build) => !selectedChampionId || build.championId === selectedChampionId).slice(0, 2);

  return (
    <section className="mobile-coach" aria-labelledby="mobile-coach-title">
      <div className="section-heading">
        <div><p className="eyebrow">DRAFT COACH</p><h2 id="mobile-coach-title">Choices with reasons</h2></div>
        <Sparkles size={21} aria-hidden="true" />
      </div>
      <p className={`mobile-coach-health mobile-coach-health--${coach.guidance.status}`}>
        Evidence {coach.guidance.status}
        {coach.guidance.providerName ? ` · ${coach.guidance.providerName}` : ""}
        {coach.guidance.generatedAt ? ` · ${new Date(coach.guidance.generatedAt).toLocaleDateString()}` : ""}
        {coach.guidance.currentPatchCovered === false ? " · previous patch fallback" : ""}
      </p>

      {coach.draftChoices.length > 0 ? (
        <ol className="mobile-coach-choices">
          {coach.draftChoices.map((choice, index) => (
            <li key={choice.championId}>
              <span className="mobile-coach-rank">{index + 1}</span>
              <div><strong>{championName(snapshot.champions, choice.championId)}</strong><small>{choice.confidence} confidence · score {choice.score}</small><p><Lightbulb size={12} aria-hidden="true" />{choice.reasons[0]}</p></div>
              <button type="button" className="button-secondary" disabled={pending || !action?.inProgress} aria-label={`Hover ${championName(snapshot.champions, choice.championId)}`} onClick={() => send({ type: "champSelect.hover", championId: choice.championId })}><MousePointerClick size={15} aria-hidden="true" />Hover</button>
            </li>
          ))}
        </ol>
      ) : <p className="empty-copy mobile-coach-empty">Draft suggestions appear when your pick or ban action begins.</p>}

      {builds.length > 0 ? (
        <div className="mobile-builds">
          <div className="mobile-builds-heading"><Boxes size={16} aria-hidden="true" /><strong>Recent completed builds</strong></div>
          {builds.map((build) => (
            <article key={build.id}>
              <div><strong>{build.itemIds.map((itemId) => itemNames.get(itemId) ?? `Item ${itemId}`).join(" · ")}</strong><small>{build.audience} · patch {build.patch} · {build.sampleSize.toLocaleString()} games</small></div>
              <span>{build.winRate.toFixed(1)}%</span>
            </article>
          ))}
          <p>Completed-match combinations are evidence, not a forced purchase order.</p>
        </div>
      ) : null}
    </section>
  );
}

export function MobilePatchBrief({ snapshot }: { snapshot: RemoteCompanionSnapshot }) {
  if (snapshot.coach.patchImpacts.length === 0) return null;
  return (
    <section className="mobile-patch-brief" aria-labelledby="mobile-patch-title">
      <div className="section-heading"><div><p className="eyebrow">PATCH CENTER</p><h2 id="mobile-patch-title">Changes for your pool</h2></div><Sparkles size={20} aria-hidden="true" /></div>
      <ol>{snapshot.coach.patchImpacts.slice(0, 3).map((impact) => <li key={impact.id}><span>{impact.category}</span><div><strong>{impact.title}</strong><p>{impact.summary}</p></div></li>)}</ol>
    </section>
  );
}
