import type { CompanionCommand } from "@summonerkit/contracts";

const clientSurfaceCommands = new Set<CompanionCommand["type"]>([
  "desktop.open",
  "startup.setEnabled",
  "presence.set",
  "automation.confirm",
  "automation.dismiss",
  "automation.setEnabled",
  "automation.disableAll",
  "profile.setChampionPriorities",
  "collection.refresh",
  "collection.toggleFavorite",
  "collection.toggleWishlist",
  "insights.refreshRunes",
  "insights.refreshPerformance",
  "runes.applyRecommendation",
  "champSelect.selectOwnedSkin",
  "readyCheck.accept",
  "readyCheck.decline",
  "queue.start",
  "queue.stop",
  "champSelect.hover",
  "champSelect.lock",
  "champSelect.setSpells",
  "champSelect.setRunePage",
  "aram.benchSwap",
  "aram.toggleFavoriteChampion",
]);

export function isClientSurfaceCommandAllowed(command: { type?: unknown }): boolean {
  return typeof command.type === "string"
    && clientSurfaceCommands.has(command.type as CompanionCommand["type"]);
}
