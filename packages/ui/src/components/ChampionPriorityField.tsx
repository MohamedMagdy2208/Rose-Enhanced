import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Search, X } from "lucide-react";
import type { ChampionRecord } from "@summonerkit/contracts";
import { lcuAssetUrl } from "../utils/assets";

export function ChampionPriorityField({
  label,
  action,
  helper,
  values,
  champions,
  onChange,
}: {
  label: string;
  action: "pick" | "ban";
  helper: string;
  values: number[];
  champions: ChampionRecord[];
  onChange: (values: number[]) => void;
}) {
  const descriptionId = useId();
  const [query, setQuery] = useState("");
  const championById = useMemo(() => new Map(champions.map((champion) => [champion.id, champion])), [champions]);
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return champions
      .filter((champion) => !values.includes(champion.id) && `${champion.name} ${champion.alias}`.toLowerCase().includes(normalized))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 8);
  }, [champions, query, values]);
  const nextPosition = values.length === 0 ? `primary ${action}` : `backup #${values.length + 1}`;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <fieldset className="priority-field field--wide">
      <legend><span>{label}</span><small id={descriptionId}>{helper}</small></legend>
      <label className="priority-field__search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search champions for {label.toLowerCase()}</span>
        <input
          type="search"
          value={query}
          placeholder={`Search to add ${nextPosition}`}
          autoComplete="off"
          aria-describedby={descriptionId}
          disabled={values.length >= 40}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {suggestions.length > 0 ? (
        <div className="priority-field__suggestions" aria-label={`${label} search results`}>
          {suggestions.map((champion) => <ChampionButton key={champion.id} champion={champion} position={nextPosition} onClick={() => { onChange([...values, champion.id]); setQuery(""); }} />)}
        </div>
      ) : query.trim() && champions.length > 0 ? <p className="priority-field__empty" role="status">No matching champion remains.</p> : null}
      {champions.length === 0 ? <p className="priority-field__empty">Connect League and refresh Collection to load champion names.</p> : null}
      {values.length >= 40 ? <p className="priority-field__empty" role="status">The maximum of 40 choices is configured.</p> : null}
      <ol className="priority-field__selected" aria-label={`${label}, highest priority first`} aria-live="polite">
        {values.map((id, index) => {
          const champion = championById.get(id);
          return (
            <li key={id}>
              <span className="priority-field__position"><strong>{index === 0 ? "Primary" : `Backup ${index}`}</strong><small>#{index + 1}</small></span>
              <ChampionIdentity champion={champion ?? null} id={id} />
              <button className="icon-button icon-button--small" type="button" disabled={index === 0} aria-label={`Move ${champion?.name ?? id} earlier`} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button className="icon-button icon-button--small" type="button" disabled={index === values.length - 1} aria-label={`Move ${champion?.name ?? id} later`} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button className="icon-button icon-button--small" type="button" aria-label={`Remove ${champion?.name ?? id}`} onClick={() => onChange(values.filter((value) => value !== id))}><X size={14} /></button>
            </li>
          );
        })}
      </ol>
      {values.length === 0 ? <p className="priority-field__empty">No {action} plan yet. Search for a champion above; SummonerKit does nothing when every choice is unavailable.</p> : (
        <div className="priority-field__footer">
          <span>If an earlier choice is banned, picked, unavailable, or protected by teammate intent, the next backup is tried.</span>
          <button className="button button--ghost button--compact" type="button" onClick={() => onChange([])}><RotateCcw size={13} aria-hidden="true" /> Clear plan</button>
        </div>
      )}
    </fieldset>
  );
}

function ChampionButton({ champion, position, onClick }: { champion: ChampionRecord; position: string; onClick: () => void }) {
  return <button type="button" aria-label={`Add ${champion.name} as ${position}`} onClick={onClick}><ChampionIdentity champion={champion} id={champion.id} /><span aria-hidden="true">+</span></button>;
}

function ChampionIdentity({ champion, id }: { champion: ChampionRecord | null; id: number }) {
  const icon = lcuAssetUrl(champion?.iconPath ?? null);
  const name = champion?.name ?? `Champion ${id}`;
  return <span className="champion-identity"><span aria-hidden="true">{icon ? <img src={icon} alt="" /> : name.slice(0, 1)}</span><strong>{name}</strong></span>;
}
