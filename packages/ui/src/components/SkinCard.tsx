import { Bookmark, Check, Gem, Heart, LockKeyhole, Sparkles } from "lucide-react";
import type { SkinRecord } from "@summonerkit/contracts";
import { lcuAssetUrl } from "../utils/assets";

export function SkinCard({
  skin,
  canSelect,
  onFavorite,
  onWishlist,
  onSelect,
}: {
  skin: SkinRecord;
  canSelect: boolean;
  onFavorite: () => void;
  onWishlist: () => void;
  onSelect: () => void;
}) {
  const imageUrl = lcuAssetUrl(skin.tilePath ?? skin.splashPath);
  const hasLoot = skin.loot.shardCount > 0 || skin.loot.permanentCount > 0;

  return (
    <article className="skin-card">
      <div className="skin-card__art">
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <div className="skin-card__placeholder" />}
        <div className="skin-card__badges" aria-label="Skin status">
          {skin.owned ? <span className="art-badge art-badge--owned"><Check size={12} /> Owned</span> : null}
          {skin.loot.permanentCount > 0 ? <span className="art-badge art-badge--permanent"><Gem size={12} /> Permanent ×{skin.loot.permanentCount}</span> : null}
          {skin.loot.shardCount > 0 ? <span className="art-badge art-badge--loot"><Sparkles size={12} /> Shard ×{skin.loot.shardCount}</span> : null}
        </div>
        <button
          className={`favorite-button${skin.favorite ? " favorite-button--active" : ""}`}
          type="button"
          aria-label={skin.favorite ? `Remove ${skin.name} from favorites` : `Add ${skin.name} to favorites`}
          aria-pressed={skin.favorite}
          onClick={onFavorite}
        >
          <Heart size={17} fill={skin.favorite ? "currentColor" : "none"} />
        </button>
        <button
          className={`wishlist-button${skin.wishlisted ? " wishlist-button--active" : ""}`}
          type="button"
          aria-label={skin.wishlisted ? `Remove ${skin.name} from wishlist` : `Add ${skin.name} to wishlist`}
          aria-pressed={skin.wishlisted}
          onClick={onWishlist}
        >
          <Bookmark size={16} fill={skin.wishlisted ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="skin-card__body">
        <div className="skin-card__heading">
          <div>
            <h3>{skin.name}</h3>
            <p>{skin.rarity ?? (skin.owned ? "In your collection" : hasLoot ? "Held in loot" : "Not owned")}</p>
          </div>
          {!skin.owned ? <LockKeyhole size={16} aria-label="Not owned" /> : null}
        </div>
        {skin.chromas.length > 0 ? (
          <div className="chroma-row" aria-label={`${skin.chromas.length} chromas`}>
            {skin.chromas.slice(0, 8).map((chroma) => (
              <span
                key={chroma.id}
                className={`chroma-dot${chroma.owned ? " chroma-dot--owned" : ""}`}
                title={`${chroma.name}${chroma.owned ? ", owned" : ""}`}
                style={{ background: chroma.colors[0] ?? "var(--surface-raised)" }}
              />
            ))}
            {skin.chromas.length > 8 ? <small>+{skin.chromas.length - 8}</small> : null}
          </div>
        ) : null}
        {skin.owned && canSelect ? (
          <button className="button button--compact button--primary" type="button" onClick={onSelect}>
            Select in champion select
          </button>
        ) : null}
      </div>
    </article>
  );
}
