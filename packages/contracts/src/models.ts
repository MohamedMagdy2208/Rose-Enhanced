export type ConnectionStatus =
  | "disconnected"
  | "discovering"
  | "connecting"
  | "connected"
  | "degraded";

export type CapabilityName =
  | "championCatalog"
  | "skinInventory"
  | "lootInventory"
  | "readyCheck"
  | "champSelect"
  | "runes"
  | "summonerSpells"
  | "clientTab";

export type CapabilitySet = Record<CapabilityName, boolean>;

export interface LcuConnectionState {
  status: ConnectionStatus;
  phase: string;
  region: string | null;
  locale: string | null;
  patch: string | null;
  capabilities: CapabilitySet;
  connectedAt: string | null;
  lastError: string | null;
}

export interface LootHolding {
  shardCount: number;
  permanentCount: number;
  essenceValue: number;
  rarity: string | null;
  expiresAt: string | null;
}

export interface ChromaRecord {
  id: number;
  name: string;
  colors: string[];
  imagePath: string | null;
  owned: boolean;
}

export interface SkinRecord {
  id: number;
  championId: number;
  name: string;
  rarity: string | null;
  contentId: string | null;
  tilePath: string | null;
  splashPath: string | null;
  owned: boolean;
  available: boolean;
  favorite: boolean;
  wishlisted: boolean;
  loot: LootHolding;
  chromas: ChromaRecord[];
}

export interface ChampionRecord {
  id: number;
  alias: string;
  name: string;
  iconPath: string | null;
  owned: boolean;
  skins: SkinRecord[];
}

export interface CollectionProgress {
  totalSkins: number;
  ownedSkins: number;
  lootSkins: number;
  favoriteSkins: number;
  wishlistSkins: number;
  completionPercent: number;
}

export interface CollectionSnapshot {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  source: "none" | "cache" | "live";
  stale: boolean;
  patch: string | null;
  accountKey: string | null;
  updatedAt: string | null;
  progress: CollectionProgress;
  champions: ChampionRecord[];
  warnings: string[];
}

export type AutomationRole =
  | "default"
  | "top"
  | "jungle"
  | "middle"
  | "bottom"
  | "utility"
  | "aram";

export interface RunePreset {
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
}

export interface AutomationProfile {
  id: string;
  name: string;
  queueIds: number[];
  role: AutomationRole;
  pickPriority: number[];
  banPriority: number[];
  spell1Id: number | null;
  spell2Id: number | null;
  runePreset: RunePreset | null;
  readyCheckDelayMs: number;
  lockLeadTimeMs: number;
}

export interface AutomationSettings {
  riskAcknowledged: boolean;
  executionMode: "automatic" | "confirm" | "dry-run";
  autoAccept: boolean;
  autoPick: boolean;
  autoBan: boolean;
  autoSpells: boolean;
  autoRunes: boolean;
}

export type AutomationActionType =
  | "accept"
  | "hover"
  | "lock"
  | "spells"
  | "runes"
  | "cancel"
  | "skip";

export interface AutomationDecision {
  action: AutomationActionType;
  sessionId: string;
  actionId: number | null;
  championId: number | null;
  profileId: string | null;
  reason: string;
}

export interface AutomationAuditEvent extends AutomationDecision {
  id: string;
  createdAt: string;
  result: "planned" | "success" | "cancelled" | "skipped" | "failed";
}

export interface PendingAutomationAction extends AutomationDecision {
  id: string;
  effect: "acceptReadyCheck" | "hoverAction" | "completeAction";
  createdAt: string;
  expiresAt: string;
}

export type IntegrationId = "rose" | "deceive" | "pengu";

export interface IntegrationState {
  id: IntegrationId;
  name: string;
  installed: boolean;
  running: boolean;
  managedProcess: boolean;
  executablePath: string | null;
  version: string | null;
  lastError: string | null;
}

export interface RemoteDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  connected: boolean;
  revoked: boolean;
}

export interface ClientTabState {
  installed: boolean;
  expectedPluginVersion: string;
  installedPluginVersion: string | null;
  installedProtocolVersion: number | null;
  activePluginVersion: string | null;
  protocolVersion: number;
  activeProtocolVersion: number | null;
  restartRequired: boolean;
  lastRepairAt: string | null;
  lastError: string | null;
}

export type DoctorCheckId = "desktopBridge" | "leagueClient" | "clientTab" | "collection";

export interface ConnectionDoctorCheck {
  id: DoctorCheckId;
  label: string;
  status: "healthy" | "attention" | "unavailable";
  detail: string;
  action: "repair-client-tab" | "refresh-collection" | null;
}

export interface ConnectionDoctorState {
  overall: "healthy" | "attention" | "unavailable";
  checkedAt: string;
  checks: ConnectionDoctorCheck[];
}

export interface AramBenchChampion {
  championId: number;
  isFavorite: boolean;
}

export interface AramState {
  active: boolean;
  currentChampionId: number | null;
  bench: AramBenchChampion[];
  favoriteChampionIds: number[];
  availableFavoriteChampionIds: number[];
  rerollsRemaining: number | null;
  rerollPoints: number | null;
  updatedAt: string | null;
}

export type QueueActivity =
  | "unavailable"
  | "lobby"
  | "searching"
  | "ready-check"
  | "champ-select"
  | "in-game";

export interface QueueControlState {
  activity: QueueActivity;
  lobbyAvailable: boolean;
  queueId: number | null;
  searchState: string | null;
  canStart: boolean;
  canStop: boolean;
}

export interface ReadyCheckControlState {
  active: boolean;
  state: string | null;
  canAccept: boolean;
  canDecline: boolean;
}

export interface ChampionSelectParticipant {
  cellId: number;
  championId: number | null;
  championPickIntent: number | null;
  assignedPosition: string | null;
  isLocalPlayer: boolean;
}

export interface ChampionSelectActionState {
  id: number;
  type: "pick" | "ban";
  championId: number | null;
  completed: boolean;
  inProgress: boolean;
}

export interface SummonerSpellOption {
  id: number;
  name: string;
}

export interface RunePageOption {
  id: number;
  name: string;
  current: boolean;
  roseManaged: boolean;
}

export interface ChampionSelectControlState {
  active: boolean;
  sessionId: string | null;
  timerPhase: string | null;
  timerRemainingMs: number | null;
  timerUpdatedAt: string | null;
  localPlayerCellId: number | null;
  localAction: ChampionSelectActionState | null;
  myTeam: ChampionSelectParticipant[];
  theirTeam: ChampionSelectParticipant[];
  myTeamBans: number[];
  theirTeamBans: number[];
  pickableChampionIds: number[];
  bannableChampionIds: number[];
  selectedChampionId: number | null;
  selectedSkinId: number | null;
  spell1Id: number | null;
  spell2Id: number | null;
}

export interface LeagueSessionState {
  queue: QueueControlState;
  readyCheck: ReadyCheckControlState;
  championSelect: ChampionSelectControlState;
  summonerSpells: SummonerSpellOption[];
  runePages: RunePageOption[];
}

export type InsightStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
export type RuneRecommendationAudience = "high-elo" | "pro" | "combined";
export type RuneRecommendationRole = Exclude<AutomationRole, "default">;

export interface RuneRecommendation {
  id: string;
  championId: number;
  role: RuneRecommendationRole;
  queueId: number;
  audience: RuneRecommendationAudience;
  patch: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  sampleSize: number;
  winRate: number;
  pickRate: number;
  generatedAt: string;
}

export interface RunePerkRecord {
  id: number;
  name: string;
  iconPath: string | null;
}

export interface RuneRecommendationsSnapshot {
  status: InsightStatus;
  source: "none" | "cache" | "online";
  stale: boolean;
  providerName: string | null;
  updatedAt: string | null;
  recommendations: RuneRecommendation[];
  perks: RunePerkRecord[];
  warnings: string[];
}

export interface ChampionPerformanceRecord {
  championId: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  averageKills: number;
  averageDeaths: number;
  averageAssists: number;
  kda: number;
  totalFarm: number;
  farmPerMinute: number;
  killParticipation: number;
  damagePerMinute: number;
  visionPerMinute: number;
  overallScore: number;
  lastPlayedAt: string | null;
}

export interface PerformanceSummary {
  games: number;
  championsPlayed: number;
  winRate: number;
  kda: number;
  farmPerMinute: number;
  overallScore: number;
}

export interface ChampionPerformanceSnapshot {
  status: InsightStatus;
  source: "none" | "cache" | "live";
  stale: boolean;
  matchesAnalyzed: number;
  windowLabel: string;
  updatedAt: string | null;
  summary: PerformanceSummary;
  champions: ChampionPerformanceRecord[];
  warnings: string[];
}

export interface InsightsSnapshot {
  runes: RuneRecommendationsSnapshot;
  performance: ChampionPerformanceSnapshot;
}

export interface RemoteChampionRecord {
  id: number;
  alias: string;
  name: string;
  owned: boolean;
}

export interface RemoteSkinRecord {
  id: number;
  championId: number;
  name: string;
}

export interface RemoteCompanionSnapshot {
  revision: number;
  connection: Pick<LcuConnectionState, "status" | "phase" | "patch" | "lastError">;
  session: LeagueSessionState;
  aram: AramState;
  champions: RemoteChampionRecord[];
  ownedSkins: RemoteSkinRecord[];
}

export interface RemoteState {
  status: "unavailable" | "ready" | "pairing" | "connected" | "error";
  relayConfigured: boolean;
  activeDeviceId: string | null;
  lastError: string | null;
}

export interface RemotePairingOffer {
  roomId: string;
  pairingUrl: string;
  qrDataUrl: string;
  expiresAt: string;
}

export interface CompanionSnapshot {
  revision: number;
  connection: LcuConnectionState;
  collection: CollectionSnapshot;
  automation: AutomationSettings;
  pendingAutomation: PendingAutomationAction[];
  profiles: AutomationProfile[];
  audit: AutomationAuditEvent[];
  integrations: IntegrationState[];
  clientTab: ClientTabState;
  doctor: ConnectionDoctorState;
  aram: AramState;
  session: LeagueSessionState;
  insights: InsightsSnapshot;
  remote: RemoteState;
  remoteDevices: RemoteDevice[];
}

export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  platform: string;
  snapshot: CompanionSnapshot;
  recentLogs: string[];
}
