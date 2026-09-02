import { z } from "zod";

const championId = z.number().int().positive();
const championPriority = z.array(championId).max(40).refine(
  (values) => new Set(values).size === values.length,
  "Champion priorities cannot contain duplicates.",
);

export const runePresetSchema = z.strictObject({
  primaryStyleId: z.number().int().positive(),
  subStyleId: z.number().int().positive(),
  selectedPerkIds: z.array(z.number().int().positive()).min(1).max(9),
});

export const automationProfileSchema = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  queueIds: z.array(z.number().int().nonnegative()).max(50),
  role: z.enum(["default", "top", "jungle", "middle", "bottom", "utility", "aram"]),
  pickPriority: championPriority,
  banPriority: championPriority,
  spell1Id: z.number().int().positive().nullable(),
  spell2Id: z.number().int().positive().nullable(),
  runePreset: runePresetSchema.nullable(),
  readyCheckDelayMs: z.number().int().min(0).max(10_000),
  lockLeadTimeMs: z.number().int().min(1_000).max(15_000),
});

export const companionCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("desktop.open") }),
  z.strictObject({
    type: z.literal("startup.setEnabled"),
    setting: z.enum(["launchOnWindowsStartup", "openOnLeagueDetected", "openOnRoseDetected"]),
    enabled: z.boolean(),
  }),
  z.strictObject({ type: z.literal("presence.set"), availability: z.enum(["online", "away"]) }),
  z.strictObject({ type: z.literal("automation.acknowledgeRisk") }),
  z.strictObject({
    type: z.literal("automation.setMode"),
    mode: z.enum(["automatic", "confirm", "dry-run"]),
  }),
  z.strictObject({ type: z.literal("automation.confirm"), pendingId: z.string().uuid() }),
  z.strictObject({ type: z.literal("automation.dismiss"), pendingId: z.string().uuid() }),
  z.strictObject({
    type: z.literal("automation.setEnabled"),
    feature: z.enum(["autoAccept", "autoPick", "autoBan", "autoSpells", "autoRunes"]),
    enabled: z.boolean(),
  }),
  z.strictObject({ type: z.literal("automation.disableAll") }),
  z.strictObject({ type: z.literal("profile.save"), profile: automationProfileSchema }),
  z.strictObject({
    type: z.literal("profile.setChampionPriorities"),
    profileId: z.string().min(1).max(80),
    pickPriority: championPriority,
    banPriority: championPriority,
  }),
  z.strictObject({ type: z.literal("profile.delete"), profileId: z.string().min(1).max(80) }),
  z.strictObject({ type: z.literal("collection.refresh") }),
  z.strictObject({ type: z.literal("insights.refreshRunes") }),
  z.strictObject({ type: z.literal("insights.refreshPerformance") }),
  z.strictObject({ type: z.literal("runes.applyRecommendation"), recommendationId: z.string().min(1).max(160) }),
  z.strictObject({ type: z.literal("collection.toggleFavorite"), skinId: championId }),
  z.strictObject({ type: z.literal("collection.toggleWishlist"), skinId: championId }),
  z.strictObject({ type: z.literal("champSelect.selectOwnedSkin"), skinId: championId }),
  z.strictObject({
    type: z.literal("integration.configure"),
    integrationId: z.enum(["rose", "deceive"]),
    executablePath: z.string().max(2048).nullable(),
  }),
  z.strictObject({
    type: z.literal("integration.chooseExecutable"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.strictObject({
    type: z.literal("integration.launch"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.strictObject({
    type: z.literal("integration.stop"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.strictObject({ type: z.literal("clientTab.install") }),
  z.strictObject({ type: z.literal("clientTab.repair") }),
  z.strictObject({ type: z.literal("clientTab.uninstall") }),
  z.strictObject({ type: z.literal("doctor.refresh") }),
  z.strictObject({ type: z.literal("readyCheck.accept") }),
  z.strictObject({ type: z.literal("readyCheck.decline") }),
  z.strictObject({ type: z.literal("queue.start") }),
  z.strictObject({ type: z.literal("queue.stop") }),
  z.strictObject({ type: z.literal("champSelect.hover"), championId }),
  z.strictObject({ type: z.literal("champSelect.lock"), championId }),
  z.strictObject({
    type: z.literal("champSelect.setSpells"),
    spell1Id: z.number().int().positive(),
    spell2Id: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal("champSelect.setRunePage"), pageId: z.number().int().positive() }),
  z.strictObject({ type: z.literal("aram.benchSwap"), championId }),
  z.strictObject({ type: z.literal("aram.toggleFavoriteChampion"), championId }),
  z.strictObject({ type: z.literal("remote.revoke"), deviceId: z.string().uuid() }),
  z.strictObject({
    type: z.literal("remote.configure"),
    relayUrl: z.string().url().max(2_048),
    mobileUrl: z.string().url().max(2_048),
    adminSecret: z.string().min(32).max(256),
  }),
]);

export type CompanionCommand = z.infer<typeof companionCommandSchema>;

export type DomainEvent =
  | { type: "snapshot.changed"; revision: number }
  | { type: "connection.changed" }
  | { type: "collection.changed" }
  | { type: "automation.audit"; auditId: string }
  | { type: "integration.changed"; integrationId: "rose" | "deceive" | "pengu" };
