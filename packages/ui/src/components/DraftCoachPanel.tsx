import { Lightbulb, MousePointerClick, ScanSearch } from "lucide-react";
import type { CompanionCommand, CompanionSnapshot } from "@summonerkit/contracts";
import { draftCoachChoices } from "@summonerkit/core";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

export function DraftCoachPanel({ snapshot, onCommand }: { snapshot: CompanionSnapshot; onCommand: (command: CompanionCommand) => Promise<void> }) {
  const choices = draftCoachChoices(snapshot, 3);
  const championNames = new Map(snapshot.collection.champions.map((champion) => [champion.id, champion.name]));
  const action = snapshot.session.championSelect.localAction;
  return (
    <section className="panel draft-coach" aria-labelledby="draft-coach-title">
      <div className="panel__header">
        <div><p className="eyebrow">Draft intelligence</p><h2 id="draft-coach-title">Three choices. Clear reasons.</h2></div>
        <StatusPill tone={choices.length > 0 ? "positive" : "neutral"}>{action?.type ?? "standby"}</StatusPill>
      </div>
      {!snapshot.session.championSelect.active ? (
        <EmptyState icon={ScanSearch} title="Waiting for champion select" description="Composition and matchup choices appear when the live draft is available." />
      ) : choices.length === 0 ? (
        <EmptyState icon={ScanSearch} title="No valid choices remain" description="The coach respects current picks, bans, allied intent, and the client availability list." />
      ) : (
        <ol className="draft-choice-list">
          {choices.map((choice, index) => (
            <li key={choice.championId}>
              <span className="draft-choice__rank" aria-label={`Choice ${index + 1}`}>{index + 1}</span>
              <div className="draft-choice__body">
                <div><strong>{championNames.get(choice.championId) ?? `Champion ${choice.championId}`}</strong><StatusPill tone={choice.confidence === "high" ? "positive" : choice.confidence === "medium" ? "warning" : "neutral"}>{choice.confidence}</StatusPill></div>
                <ul>{choice.reasons.map((reason) => <li key={reason}><Lightbulb size={13} aria-hidden="true" />{reason}</li>)}</ul>
              </div>
              <div className="draft-choice__action"><strong>{choice.score}</strong><small>evidence score</small><button className="button button--secondary button--compact" type="button" disabled={!action?.inProgress} onClick={() => onCommand({ type: "champSelect.hover", championId: choice.championId })}><MousePointerClick size={14} aria-hidden="true" /> Hover</button></div>
            </li>
          ))}
        </ol>
      )}
      <p className="data-provenance">Options combine your profile, recent local results, aggregate samples, visible picks, and allied intent. They never replace your decision.</p>
    </section>
  );
}
