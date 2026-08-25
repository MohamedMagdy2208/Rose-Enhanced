import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Bookmark, Boxes, Clock3, CloudOff, Copy, Gem, Heart, PackageOpen, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { CollectionSnapshot, CompanionCommand } from "@summonerkit/contracts";
import { EmptyState } from "../components/EmptyState";
import { SkinCard } from "../components/SkinCard";
import { lcuAssetUrl } from "../utils/assets";

type CollectionFilter = "all" | "owned" | "loot" | "unowned" | "favorites" | "wishlist" | "chromas" | "duplicates" | "expiring";
type CollectionSort = "catalog" | "name" | "rarity" | "loot";

const filters: Array<{ id: CollectionFilter; label: string }> = [
  { id: "all", label: "All skins" },
  { id: "owned", label: "Owned" },
  { id: "loot", label: "In loot" },
  { id: "unowned", label: "Unowned" },
  { id: "favorites", label: "Favorites" },
  { id: "wishlist", label: "Wishlist" },
  { id: "chromas", label: "Has chromas" },
  { id: "duplicates", label: "Owned + loot" },
  { id: "expiring", label: "Expiring" },
];

const rarityOrder = new Map([
  ["mythic", 5],
  ["ultimate", 4],
  ["legendary", 3],
  ["epic", 2],
  ["deluxe", 1],
]);

export function CollectionPage({
  collection,
  phase,
  onCommand,
}: {
  collection: CollectionSnapshot;
  phase: string;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [sort, setSort] = useState<CollectionSort>("catalog");
  const [selectedChampionId, setSelectedChampionId] = useState<number | null>(null);
  const insights = useMemo(() => collectionInsights(collection), [collection]);

  const champions = useMemo(() => {
    return collection.champions.filter((champion) => {
      if (!deferredQuery) return true;
      return champion.name.toLowerCase().includes(deferredQuery) ||
        champion.skins.some((skin) => skin.name.toLowerCase().includes(deferredQuery));
    });
  }, [collection.champions, deferredQuery]);

  useEffect(() => {
    if (selectedChampionId && champions.some((champion) => champion.id === selectedChampionId)) return;
    setSelectedChampionId(champions[0]?.id ?? null);
  }, [champions, selectedChampionId]);

  const selectedChampion = champions.find((champion) => champion.id === selectedChampionId) ?? null;
  const visibleSkins = (selectedChampion?.skins ?? []).filter((skin) => {
    const matchesText = !deferredQuery || skin.name.toLowerCase().includes(deferredQuery) || selectedChampion?.name.toLowerCase().includes(deferredQuery);
    if (!matchesText) return false;
    if (filter === "owned") return skin.owned;
    if (filter === "loot") return skin.loot.shardCount > 0 || skin.loot.permanentCount > 0;
    if (filter === "unowned") return !skin.owned;
    if (filter === "favorites") return skin.favorite;
    if (filter === "wishlist") return skin.wishlisted;
    if (filter === "chromas") return skin.chromas.length > 0;
    if (filter === "duplicates") return skin.owned && (skin.loot.shardCount > 0 || skin.loot.permanentCount > 0);
    if (filter === "expiring") {
      const expiry = Date.parse(skin.loot.expiresAt ?? "");
      return Number.isFinite(expiry) && expiry > Date.now() && expiry <= Date.now() + 30 * 86_400_000;
    }
    return true;
  }).sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "rarity") return (rarityOrder.get(right.rarity?.toLowerCase() ?? "") ?? 0) - (rarityOrder.get(left.rarity?.toLowerCase() ?? "") ?? 0);
    if (sort === "loot") return (right.loot.shardCount + right.loot.permanentCount) - (left.loot.shardCount + left.loot.permanentCount);
    return left.id - right.id;
  });

  const canSelect = phase.toLowerCase().includes("champselect");

  return (
    <div className="page collection-page">
      <header className="page-header page-header--split">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Every champion. Every skin state.</h1>
          <p className="page-lede">Owned items and loot overlap by design, so duplicate shards never disappear from view.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => onCommand({ type: "collection.refresh" })}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      {collection.source === "cache" ? (
        <section className="collection-source collection-source--cached" role="status">
          <CloudOff size={18} aria-hidden="true" />
          <div><strong>Showing cached collection data</strong><p>League is unavailable or the live refresh failed. Ownership and loot may be out of date until the next successful refresh.</p></div>
        </section>
      ) : collection.source === "live" ? (
        <p className="collection-source collection-source--live" role="status"><ShieldCheck size={16} aria-hidden="true" /> Live League data</p>
      ) : null}

      <section className="collection-summary" aria-label="Collection progress">
        <div className="collection-summary__progress">
          <span>{collection.progress.completionPercent}%</span>
          <div><strong>Collection complete</strong><small>{collection.progress.ownedSkins} of {collection.progress.totalSkins} collectible skins</small></div>
        </div>
        <SummaryStat icon={ShieldCheck} label="Owned" value={collection.progress.ownedSkins} />
        <SummaryStat icon={PackageOpen} label="In loot" value={collection.progress.lootSkins} />
        <SummaryStat icon={Heart} label="Favorites" value={collection.progress.favoriteSkins} />
        <SummaryStat icon={Bookmark} label="Wishlist" value={collection.progress.wishlistSkins} />
      </section>

      <section className="collection-insights" aria-label="Collection intelligence">
        <InsightStat icon={Copy} label="Duplicate loot" value={insights.duplicateLoot} detail="Owned skins also held in loot" />
        <InsightStat icon={Bookmark} label="Wishlist in loot" value={insights.wishlistInLoot} detail="Wishlisted skins already available" />
        <InsightStat icon={Clock3} label="Expiring soon" value={insights.expiringSoon} detail="Loot expiring within 30 days" />
        <InsightStat icon={Gem} label="Listed essence" value={insights.listedEssence.toLocaleString()} detail="Read-only disenchant values" />
      </section>

      <div className="collection-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search champions and skins</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search champions or skins" />
        </label>
        <div className="segmented-control" aria-label="Filter skins">
          {filters.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <label className="select-field">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as CollectionSort)}>
            <option value="catalog">Catalog order</option>
            <option value="name">Name</option>
            <option value="rarity">Rarity</option>
            <option value="loot">Loot count</option>
          </select>
        </label>
      </div>

      {collection.status === "loading" ? <CollectionSkeleton /> : null}
      {collection.status === "unavailable" || collection.status === "error" ? (
        <EmptyState icon={Boxes} title="Collection unavailable" description={collection.warnings[0] ?? "Connect to the League client, then refresh this page."} />
      ) : null}
      {collection.status === "ready" && champions.length === 0 ? (
        <EmptyState icon={Search} title="No matching champions" description="Try a different champion or skin name." />
      ) : null}

      {collection.status === "ready" && champions.length > 0 ? (
        <div className="collection-browser">
          <nav className="champion-list" aria-label="Champions">
            {champions.map((champion) => {
              const icon = lcuAssetUrl(champion.iconPath);
              const owned = champion.skins.filter((skin) => skin.owned).length;
              return (
                <button key={champion.id} type="button" className={selectedChampionId === champion.id ? "active" : ""} aria-current={selectedChampionId === champion.id ? "true" : undefined} onClick={() => setSelectedChampionId(champion.id)}>
                  <span className="champion-list__portrait">{icon ? <img src={icon} alt="" loading="lazy" /> : champion.name.slice(0, 1)}</span>
                  <span><strong>{champion.name}</strong><small>{owned}/{champion.skins.length} skins</small></span>
                </button>
              );
            })}
          </nav>

          <section className="skin-browser" aria-labelledby="selected-champion-heading">
            <header className="skin-browser__header">
              <div><p className="eyebrow">Champion collection</p><h2 id="selected-champion-heading">{selectedChampion?.name}</h2></div>
              <span>{visibleSkins.length} shown</span>
            </header>
            {visibleSkins.length === 0 ? (
              <EmptyState icon={Sparkles} title="No skins in this filter" description="Choose another filter or champion." />
            ) : (
              <div className="skin-grid">
                {visibleSkins.map((skin) => (
                  <SkinCard
                    key={skin.id}
                    skin={skin}
                    canSelect={canSelect}
                    onFavorite={() => onCommand({ type: "collection.toggleFavorite", skinId: skin.id })}
                    onWishlist={() => onCommand({ type: "collection.toggleWishlist", skinId: skin.id })}
                    onSelect={() => onCommand({ type: "champSelect.selectOwnedSkin", skinId: skin.id })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: number }) {
  return <div className="summary-stat"><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>;
}

function InsightStat({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string | number; detail: string }) {
  return <div><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export function collectionInsights(collection: CollectionSnapshot, now = Date.now()) {
  const skins = collection.champions.flatMap((champion) => champion.skins);
  const hasLoot = (skin: typeof skins[number]) => skin.loot.shardCount > 0 || skin.loot.permanentCount > 0;
  return {
    duplicateLoot: skins.filter((skin) => skin.owned && hasLoot(skin)).length,
    wishlistInLoot: skins.filter((skin) => skin.wishlisted && hasLoot(skin)).length,
    expiringSoon: skins.filter((skin) => {
      const expiry = Date.parse(skin.loot.expiresAt ?? "");
      return Number.isFinite(expiry) && expiry > now && expiry <= now + 30 * 86_400_000;
    }).length,
    listedEssence: skins.reduce((total, skin) => total + skin.loot.essenceValue * (skin.loot.shardCount + skin.loot.permanentCount), 0),
  };
}

function CollectionSkeleton() {
  return <div className="collection-skeleton" aria-busy="true" aria-label="Loading collection">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
}
