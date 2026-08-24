import { Eye, Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@summonerkit/contracts";
import { alliedIntentIds, availableChampionIds } from "../mobile-view";

interface ChampionPickerProps {
  snapshot: RemoteCompanionSnapshot;
  pending: boolean;
  send: (command: CompanionCommand) => void;
}

export function ChampionPicker({ snapshot, pending, send }: ChampionPickerProps) {
  const action = snapshot.session.championSelect.localAction;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(action?.championId ?? null);
  const availableIds = useMemo(() => new Set(availableChampionIds(snapshot)), [snapshot]);
  const alliedIds = useMemo(() => alliedIntentIds(snapshot), [snapshot]);
  const choices = useMemo(() => snapshot.champions
    .filter((champion) => availableIds.has(champion.id))
    .filter((champion) => champion.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name)), [availableIds, query, snapshot.champions]);
  const blockedBan = action?.type === "ban" && selectedId !== null && alliedIds.has(selectedId);
  useEffect(() => {
    if (action?.championId) setSelectedId(action.championId);
  }, [action?.championId]);

  if (!action) {
    return <div className="waiting-action" role="status"><strong>Waiting for your turn</strong><span>You can watch picks and bans live. Controls appear when your action begins.</span></div>;
  }

  return (
    <section className="champion-picker" aria-labelledby="picker-title">
      <div className="picker-heading"><div><p className="eyebrow">YOUR {action.type.toUpperCase()}</p><h3 id="picker-title">Choose a champion</h3></div><span>{choices.length} available</span></div>
      <label className="search-field"><Search size={17} /><span className="sr-only">Search champions</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search champions" autoComplete="off" /></label>
      <div className="champion-grid" role="listbox" aria-label={`Available champions for ${action.type}`}>
        {choices.map((champion) => {
          const conflicts = action.type === "ban" && alliedIds.has(champion.id);
          return (
            <button
              type="button"
              role="option"
              aria-selected={selectedId === champion.id}
              disabled={conflicts}
              key={champion.id}
              className={selectedId === champion.id ? "is-selected" : undefined}
              onClick={() => setSelectedId(champion.id)}
            >
              <span className="champion-monogram" aria-hidden="true">{champion.name.slice(0, 2).toUpperCase()}</span>
              <span>{champion.name}</span>
              {conflicts ? <small>Ally intent</small> : null}
            </button>
          );
        })}
      </div>
      {choices.length === 0 ? <p className="empty-copy">No available champion matches this search.</p> : null}
      <div className="sticky-actions">
        <button type="button" className="button-secondary" disabled={pending || !selectedId || blockedBan} onClick={() => selectedId && send({ type: "champSelect.hover", championId: selectedId })}><Eye size={18} />Hover</button>
        <button type="button" className="button-primary" disabled={pending || !selectedId || blockedBan} onClick={() => selectedId && send({ type: "champSelect.lock", championId: selectedId })}><Lock size={18} />Lock {action.type}</button>
      </div>
    </section>
  );
}
