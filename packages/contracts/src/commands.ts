import { z } from "zod";

const championId = z.number().int().positive();

export const runePresetSchema = z.object({
  primaryStyleId: z.number().int().positive(),
  subStyleId: z.number().int().positive(),
  selectedPerkIds: z.array(z.number().int().positive()).min(1).max(9),
});

export const automationProfileSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  queueIds: z.array(z.number().int().nonnegative()).max(50),
  role: z.enum(["default", "top", "jungle", "middle", "bottom", "utility", "aram"]),
  pickPriority: z.array(championId).max(40),
  banPriority: z.array(championId).max(40),
  spell1Id: z.number().int().positive().nullable(),
  spell2Id: z.number().int().positive().nullable(),
  runePreset: runePresetSchema.nullable(),
  readyCheckDelayMs: z.number().int().min(0).max(10_000),
  lockLeadTimeMs: z.number().int().min(1_000).max(15_000),
});

export const companionCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("desktop.open") }),
  z.object({ type: z.literal("automation.acknowledgeRisk") }),
  z.object({
    type: z.literal("automation.setMode"),
    mode: z.enum(["automatic", "confirm", "dry-run"]),
  }),
  z.object({ type: z.literal("automation.confirm"), pendingId: z.string().uuid() }),
  z.object({ type: z.literal("automation.dismiss"), pendingId: z.string().uuid() }),
  z.object({
    type: z.literal("automation.setEnabled"),
    feature: z.enum(["autoAccept", "autoPick", "autoBan", "autoSpells", "autoRunes"]),
    enabled: z.boolean(),
  }),
  z.object({ type: z.literal("profile.save"), profile: automationProfileSchema }),
  z.object({ type: z.literal("profile.delete"), profileId: z.string().min(1).max(80) }),
  z.object({ type: z.literal("collection.refresh") }),
  z.object({ type: z.literal("insights.refreshRunes") }),
  z.object({ type: z.literal("insights.refreshPerformance") }),
  z.object({ type: z.literal("runes.applyRecommendation"), recommendationId: z.string().min(1).max(160) }),
  z.object({ type: z.literal("collection.toggleFavorite"), skinId: championId }),
  z.object({ type: z.literal("collection.toggleWishlist"), skinId: championId }),
  z.object({ type: z.literal("champSelect.selectOwnedSkin"), skinId: championId }),
  z.object({
    type: z.literal("integration.configure"),
    integrationId: z.enum(["rose", "deceive"]),
    executablePath: z.string().max(2048).nullable(),
  }),
  z.object({
    type: z.literal("integration.chooseExecutable"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.object({
    type: z.literal("integration.launch"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.object({
    type: z.literal("integration.stop"),
    integrationId: z.enum(["rose", "deceive"]),
  }),
  z.object({ type: z.literal("clientTab.install") }),
  z.object({ type: z.literal("clientTab.repair") }),
  z.object({ type: z.literal("clientTab.uninstall") }),
  z.object({ type: z.literal("doctor.refresh") }),
  z.object({ type: z.literal("readyCheck.accept") }),
  z.object({ type: z.literal("readyCheck.decline") }),
  z.object({ type: z.literal("queue.start") }),
  z.object({ type: z.literal("queue.stop") }),
  z.object({ type: z.literal("champSelect.hover"), championId }),
  z.object({ type: z.literal("champSelect.lock"), championId }),
  z.object({
    type: z.literal("champSelect.setSpells"),
    spell1Id: z.number().int().positive(),
    spell2Id: z.number().int().positive(),
  }),
  z.object({ type: z.literal("champSelect.setRunePage"), pageId: z.number().int().positive() }),
  z.object({ type: z.literal("aram.benchSwap"), championId }),
  z.object({ type: z.literal("aram.toggleFavoriteChampion"), championId }),
  z.object({ type: z.literal("remote.revoke"), deviceId: z.string().uuid() }),
]);

export type CompanionCommand = z.infer<typeof companionCommandSchema>;

export type DomainEvent =
  | { type: "snapshot.changed"; revision: number }
  | { type: "connection.changed" }
  | { type: "collection.changed" }
  | { type: "automation.audit"; auditId: string }
  | { type: "integration.changed"; integrationId: "rose" | "deceive" | "pengu" };
