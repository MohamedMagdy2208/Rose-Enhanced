import type {
  ChampionRecord,
  CollectionSnapshot,
  LootHolding,
  SkinRecord,
} from "@summonerkit/contracts";

export interface RawOwnership {
  owned?: boolean;
}

export interface RawChroma {
  id: number;
  name?: string;
  colors?: string[];
  chromaPath?: string;
  ownership?: RawOwnership;
}

export interface RawSkin {
  id: number;
  name: string;
  rarity?: string;
  contentId?: string;
  tilePath?: string;
  splashPath?: string;
  ownership?: RawOwnership;
  chromas?: RawChroma[];
}

export interface RawChampion {
  id: number;
  alias: string;
  name: string;
  squarePortraitPath?: string;
  ownership?: RawOwnership;
  skins: RawSkin[];
}

export interface RawInventoryItem {
  itemId: number;
  owned?: boolean;
  inventoryType?: string;
  payload?: Record<string, unknown>;
}

export interface RawLootItem {
  count?: number;
  displayCategories?: string;
  expiryTime?: number;
  itemDesc?: string;
  localizedName?: string;
  lootId?: string;
  lootName?: string;
  parentStoreItemId?: number;
  rarity?: string;
  refId?: string;
  storeItemId?: number;
  tags?: string;
  type?: string;
  disenchantValue?: number;
}

export interface CollectionBuildInput {
  champions: RawChampion[];
  inventory: RawInventoryItem[];
  loot: RawLootItem[];
  favorites: ReadonlySet<number>;
  wishlist: ReadonlySet<number>;
  patch: string | null;
  accountKey: string | null;
  warnings?: string[];
  now?: Date;
}

const emptyLoot = (): LootHolding => ({
  shardCount: 0,
  permanentCount: 0,
  essenceValue: 0,
  rarity: null,
  expiresAt: null,
});

function isBaseSkin(skinId: number): boolean {
  return skinId % 1_000 === 0;
}

function candidateNumbers(item: RawLootItem): number[] {
  const numeric = [item.storeItemId, item.parentStoreItemId].filter(
    (value): value is number => Number.isInteger(value) && Number(value) > 0,
  );
  const text = [item.refId, item.lootId, item.lootName].filter(
    (value): value is string => Boolean(value),
  );

  for (const value of text) {
    for (const match of value.matchAll(/\d{3,9}/g)) {
      numeric.push(Number(match[0]));
    }
  }

  return [...new Set(numeric)];
}

function isPermanent(item: RawLootItem): boolean {
  const descriptor = [item.lootName, item.lootId, item.tags, item.type, item.itemDesc]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return descriptor.includes("permanent") || descriptor.includes("_perm");
}

function isExpired(item: RawLootItem, now: Date): boolean {
  if (!item.expiryTime || item.expiryTime <= 0) return false;
  return item.expiryTime < now.getTime();
}

function mergeLoot(
  lootItems: RawLootItem[],
  knownSkinIds: ReadonlySet<number>,
  now: Date,
): Map<number, LootHolding> {
  const result = new Map<number, LootHolding>();

  for (const item of lootItems) {
    if (isExpired(item, now)) continue;
    const skinId = candidateNumbers(item).find((candidate) => knownSkinIds.has(candidate));
    if (!skinId) continue;

    const current = result.get(skinId) ?? emptyLoot();
    const count = Math.max(0, item.count ?? 1);
    if (isPermanent(item)) current.permanentCount += count;
    else current.shardCount += count;
    current.essenceValue = Math.max(current.essenceValue, item.disenchantValue ?? 0);
    current.rarity ??= item.rarity ?? null;
    current.expiresAt ??= item.expiryTime
      ? new Date(item.expiryTime).toISOString()
      : null;
    result.set(skinId, current);
  }

  return result;
}

export function buildCollectionSnapshot(input: CollectionBuildInput): CollectionSnapshot {
  const now = input.now ?? new Date();
  const inventoryIds = new Set(
    input.inventory.filter((item) => item.owned !== false).map((item) => item.itemId),
  );
  const knownSkinIds = new Set(
    input.champions.flatMap((champion) => champion.skins.map((skin) => skin.id)),
  );
  const lootBySkin = mergeLoot(input.loot, knownSkinIds, now);

  const champions: ChampionRecord[] = input.champions
    .map((champion) => {
      const championOwned = champion.ownership?.owned ?? false;
      const skins: SkinRecord[] = champion.skins
        .map((skin) => {
          const owned =
            skin.ownership?.owned === true ||
            inventoryIds.has(skin.id) ||
            (isBaseSkin(skin.id) && championOwned);
          const chromas = (skin.chromas ?? []).map((chroma) => ({
            id: chroma.id,
            name: chroma.name ?? `Chroma ${chroma.id}`,
            colors: chroma.colors ?? [],
            imagePath: chroma.chromaPath ?? null,
            owned: chroma.ownership?.owned === true || inventoryIds.has(chroma.id),
          }));

          return {
            id: skin.id,
            championId: champion.id,
            name: skin.name,
            rarity: skin.rarity ?? null,
            contentId: skin.contentId ?? null,
            tilePath: skin.tilePath ?? null,
            splashPath: skin.splashPath ?? null,
            owned,
            available: true,
            favorite: input.favorites.has(skin.id),
            wishlisted: input.wishlist.has(skin.id),
            loot: lootBySkin.get(skin.id) ?? emptyLoot(),
            chromas,
          };
        })
        .sort((left, right) => left.id - right.id);

      return {
        id: champion.id,
        alias: champion.alias,
        name: champion.name,
        iconPath: champion.squarePortraitPath ?? null,
        owned: championOwned,
        skins,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const collectibleSkins = champions.flatMap((champion) =>
    champion.skins.filter((skin) => !isBaseSkin(skin.id)),
  );
  const ownedSkins = collectibleSkins.filter((skin) => skin.owned).length;
  const lootSkins = collectibleSkins.filter(
    (skin) => skin.loot.shardCount > 0 || skin.loot.permanentCount > 0,
  ).length;

  return {
    status: "ready",
    source: "live",
    stale: false,
    patch: input.patch,
    accountKey: input.accountKey,
    updatedAt: now.toISOString(),
    progress: {
      totalSkins: collectibleSkins.length,
      ownedSkins,
      lootSkins,
      favoriteSkins: collectibleSkins.filter((skin) => skin.favorite).length,
      wishlistSkins: collectibleSkins.filter((skin) => skin.wishlisted).length,
      completionPercent:
        collectibleSkins.length === 0
          ? 0
          : Math.round((ownedSkins / collectibleSkins.length) * 1_000) / 10,
    },
    champions,
    warnings: input.warnings ?? [],
  };
}
