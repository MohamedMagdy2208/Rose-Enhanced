import { useDeferredValue, useState } from "react";
import { Dices, Heart, RefreshCw, Search, Sparkles } from "lucide-react";
import type { ChampionRecord, CompanionCommand, CompanionSnapshot } from "@rose-enhanced/contracts";
import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { lcuAssetUrl } from "../utils/assets";

export function AramPage({
  snapshot,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const champions = snapshot.collection.champions.filter((champion) =>
    !deferredQuery || champion.name.toLowerCase().includes(deferredQuery),
  );
  const championById = new Map(snapshot.collection.champions.map((champion) => [champion.id, champion]));
  const currentChampion = snapshot.aram.currentChampionId
    ? championById.get(snapshot.aram.currentChampionId) ?? null
    : null;

  return (
    <div className="page aram-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">ARAM companion</p><h1>Your favorites, visible on the bench.</h1><p className="page-lede">Get notified when a favorite appears and choose every swap yourself.</p></div>
        <StatusPill tone={snapshot.aram.active ? "positive" : "neutral"}>{snapshot.aram.active ? "ARAM active" : "Waiting for ARAM"}</StatusPill>
      </header>

      <section className="aram-status" aria-label="ARAM status">
        <div><Dices size={22} aria-hidden="true" /><span>Current champion</span><strong>{currentChampion?.name ?? "—"}</strong></div>
        <div><RefreshCw size={22} aria-hidden="true" /><span>Rerolls remaining</span><strong>{snapshot.aram.rerollsRemaining ?? "—"}</strong></div>
        <div><Heart size={22} aria-hidden="true" /><span>Favorites on bench</span><strong>{snapshot.aram.availableFavoriteChampionIds.length}</strong></div>
      </section>

      {snapshot.aram.active ? (
        <BenchGrid bench={snapshot.aram.bench} championById={championById} onCommand={onCommand} />
      ) : (
        <EmptyState icon={Dices} title="No ARAM champion select" description="Your favorite pool remains saved. The bench will appear here when an ARAM champion select starts." />
      )}

      {currentChampion ? <OwnedSkinPicker champion={currentChampion} phase={snapshot.connection.phase} onCommand={onCommand} /> : null}

      <section className="aram-favorites" aria-labelledby="aram-favorites-title">
        <div className="panel__header"><div><p className="eyebrow">Favorite pool</p><h2 id="aram-favorites-title">Champion alerts</h2></div><StatusPill tone="rose">{snapshot.aram.favoriteChampionIds.length} saved</StatusPill></div>
        <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Search champions</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search champions" /></label>
        <div className="favorite-champion-grid">
          {champions.map((champion) => {
            const favorite = snapshot.aram.favoriteChampionIds.includes(champion.id);
            const icon = lcuAssetUrl(champion.iconPath);
            return (
              <button key={champion.id} type="button" className={favorite ? "active" : ""} aria-pressed={favorite} onClick={() => onCommand({ type: "aram.toggleFavoriteChampion", championId: champion.id })}>
                {icon ? <img src={icon} alt="" loading="lazy" /> : <span>{champion.name[0]}</span>}
                <strong>{champion.name}</strong><Heart size={14} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function BenchGrid({
  bench,
  championById,
  onCommand,
}: {
  bench: CompanionSnapshot["aram"]["bench"];
  championById: Map<number, ChampionRecord>;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  return (
    <section className="aram-bench" aria-labelledby="aram-bench-title">
      <div className="panel__header"><div><p className="eyebrow">Live bench</p><h2 id="aram-bench-title">Available champions</h2></div></div>
      {bench.length === 0 ? <p className="compact-empty">The bench is currently empty.</p> : (
        <div className="aram-bench-grid">
          {bench.map((entry) => {
            const champion = championById.get(entry.championId);
            const icon = lcuAssetUrl(champion?.iconPath ?? null);
            return (
              <article key={entry.championId} className={entry.isFavorite ? "favorite" : ""}>
                {icon ? <img src={icon} alt="" /> : <Sparkles aria-hidden="true" />}
                <div><strong>{champion?.name ?? `Champion ${entry.championId}`}</strong><small>{entry.isFavorite ? "Favorite available" : "On bench"}</small></div>
                <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "aram.benchSwap", championId: entry.championId })}>Swap</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OwnedSkinPicker({
  champion,
  phase,
  onCommand,
}: {
  champion: ChampionRecord;
  phase: string;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const ownedSkins = champion.skins.filter((skin) => skin.owned);
  if (ownedSkins.length === 0) return null;
  return (
    <section className="aram-skins" aria-labelledby="aram-skins-title">
      <div className="panel__header"><div><p className="eyebrow">Current champion</p><h2 id="aram-skins-title">Owned {champion.name} skins</h2></div></div>
      <div>{ownedSkins.map((skin) => <button key={skin.id} type="button" disabled={!phase.toLowerCase().includes("champselect")} onClick={() => onCommand({ type: "champSelect.selectOwnedSkin", skinId: skin.id })}>{skin.name}</button>)}</div>
    </section>
  );
}
