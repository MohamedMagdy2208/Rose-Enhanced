export type RecommendationRole = "top" | "jungle" | "middle" | "bottom" | "utility" | "aram";
export type RecommendationAudience = "high-elo" | "pro" | "combined";
export type SourceAudience = Exclude<RecommendationAudience, "combined">;

export interface BuildObservation {
  sampleKey: string;
  championId: number;
  role: RecommendationRole;
  queueId: number;
  patch: string;
  audience: SourceAudience;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  itemIds: number[];
  spellIds: number[];
  allyChampionIds: number[];
  enemyChampionIds: number[];
  won: boolean;
}

export interface PublishedRecommendation {
  id: string;
  championId: number;
  role: RecommendationRole;
  queueId: number;
  audience: RecommendationAudience;
  patch: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  sampleSize: number;
  winRate: number;
  pickRate: number;
  generatedAt: string;
}

export interface PublishedBuildRecommendation {
  id: string;
  championId: number;
  role: RecommendationRole;
  queueId: number;
  audience: RecommendationAudience;
  patch: string;
  itemIds: number[];
  spellIds: number[];
  sampleSize: number;
  winRate: number;
  pickRate: number;
  generatedAt: string;
}

export interface PublishedDraftSignal {
  id: string;
  championId: number;
  role: RecommendationRole;
  queueId: number;
  audience: RecommendationAudience;
  patch: string;
  sampleSize: number;
  winRate: number;
  synergyChampionIds: number[];
  toughMatchupChampionIds: number[];
  generatedAt: string;
}

export interface PublishedPatchImpact {
  id: string;
  patch: string;
  championId: number | null;
  category: "buff" | "nerf" | "adjustment" | "item" | "rune" | "system";
  title: string;
  summary: string;
  sourceUrl: string | null;
}

export interface FeedPublication {
  generatedAt: string;
  observationCount: number;
  cohortSize: number;
  platforms: PlatformRoute[];
  lookbackDays: number;
  patches: string[];
}

export interface RecommendationFeed {
  schemaVersion: 2;
  providerName: string;
  publication: FeedPublication;
  recommendations: PublishedRecommendation[];
  builds: PublishedBuildRecommendation[];
  draftSignals: PublishedDraftSignal[];
  patchImpacts: PublishedPatchImpact[];
}

export interface CohortPlayer {
  puuid: string;
  regionalRoute: RegionalRoute;
  audience: SourceAudience;
}

export type PlatformRoute = "BR1" | "EUN1" | "EUW1" | "JP1" | "KR" | "LA1" | "LA2" | "NA1" | "OC1" | "PH2" | "RU" | "SG2" | "TH2" | "TR1" | "TW2" | "VN2";
export type RegionalRoute = "AMERICAS" | "ASIA" | "EUROPE" | "SEA";

export interface ProRosterEntry {
  puuid: string;
  regionalRoute: RegionalRoute;
}
