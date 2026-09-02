import type { CompanionCommand, CommandResult, StartupSettings } from "@summonerkit/contracts";
import { companionCommandSchema } from "@summonerkit/contracts";
import type { AutomationService } from "./automation-service";
import type { AramService } from "./aram-service";
import type { CollectionService } from "./collection-service";
import type { ClientTabActivationResult, ClientTabActivationService } from "./client-tab-activation";
import type { CompanionStore } from "./companion-store";
import type { IntegrationService } from "./integration-service";
import type { InsightsService } from "./insights-service";
import type { LeagueSessionService } from "./league-session-service";
import type { PenguManager } from "./pengu-manager";
import type { PresenceService } from "./presence-service";
import type { RemoteService } from "./remote-service";
import type { SettingsStore } from "./settings-store";
import type { AppLogger } from "./logger";

interface CommandRouterDependencies {
  store: CompanionStore;
  settings: SettingsStore;
  collection: CollectionService;
  automation: AutomationService;
  aram: AramService;
  integrations: IntegrationService;
  insights: InsightsService;
  leagueSession: LeagueSessionService;
  presence: PresenceService;
  pengu: PenguManager;
  clientTabActivation: ClientTabActivationService;
  remote: RemoteService;
  openDesktop: () => void;
  setStartupEnabled: (enabled: boolean) => void;
  chooseExecutable: (id: "rose" | "deceive") => Promise<string | null>;
  logger: AppLogger;
}

const automationFeatureKeys = ["autoAccept", "autoPick", "autoBan", "autoSpells", "autoRunes"] as const;

export class CommandRouter {
  constructor(private readonly dependencies: CommandRouterDependencies) {}

  async dispatch(input: unknown): Promise<CommandResult> {
    const parsed = companionCommandSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "The command was rejected by runtime validation." };
    const command = parsed.data;
    try {
      const message = await this.execute(command);
      return { ok: true, message: message ?? this.successMessage(command) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.dependencies.logger.warn("Command failed", { command: command.type, error: message });
      return { ok: false, message };
    }
  }

  private async execute(command: CompanionCommand): Promise<string | void> {
    switch (command.type) {
      case "desktop.open":
        this.dependencies.openDesktop();
        return;
      case "startup.setEnabled": {
        if (command.setting === "launchOnWindowsStartup") {
          this.dependencies.setStartupEnabled(command.enabled);
        }
        const settings = await this.dependencies.settings.update((draft) => {
          draft.startup[command.setting] = command.enabled;
        });
        this.dependencies.store.update((snapshot) => { snapshot.startup = settings.startup; });
        return;
      }
      case "presence.set":
        await this.dependencies.presence.setAvailability(command.availability);
        return;
      case "automation.acknowledgeRisk": {
        const settings = await this.dependencies.settings.update((draft) => {
          draft.automation.riskAcknowledged = true;
        });
        this.dependencies.store.update((snapshot) => { snapshot.automation = settings.automation; });
        return;
      }
      case "automation.setMode": {
        const settings = await this.dependencies.settings.update((draft) => {
          draft.automation.executionMode = command.mode;
        });
        this.dependencies.automation.clearPending();
        this.dependencies.store.update((snapshot) => { snapshot.automation = settings.automation; });
        return;
      }
      case "automation.confirm":
        await this.dependencies.automation.confirmPending(command.pendingId);
        return;
      case "automation.dismiss":
        this.dependencies.automation.dismissPending(command.pendingId);
        return;
      case "automation.setEnabled": {
        const current = this.dependencies.settings.get();
        if (command.enabled && !current.automation.riskAcknowledged) {
          throw new Error("Acknowledge the automation risk before enabling a feature.");
        }
        const settings = await this.dependencies.settings.update((draft) => {
          draft.automation[command.feature] = command.enabled;
        });
        this.dependencies.store.update((snapshot) => { snapshot.automation = settings.automation; });
        return;
      }
      case "automation.disableAll": {
        this.dependencies.automation.clearPending();
        const settings = await this.dependencies.settings.update((draft) => {
          for (const feature of automationFeatureKeys) draft.automation[feature] = false;
        });
        this.dependencies.store.update((snapshot) => { snapshot.automation = settings.automation; });
        return;
      }
      case "profile.save": {
        const settings = await this.dependencies.settings.update((draft) => {
          const index = draft.profiles.findIndex((profile) => profile.id === command.profile.id);
          if (index >= 0) draft.profiles[index] = command.profile;
          else draft.profiles.push(command.profile);
        });
        this.dependencies.store.update((snapshot) => { snapshot.profiles = settings.profiles; });
        return;
      }
      case "profile.setChampionPriorities": {
        const settings = await this.dependencies.settings.update((draft) => {
          const profile = draft.profiles.find((candidate) => candidate.id === command.profileId);
          if (!profile) throw new Error("That automation profile no longer exists.");
          profile.pickPriority = command.pickPriority;
          profile.banPriority = command.banPriority;
        });
        this.dependencies.automation.clearPending();
        this.dependencies.store.update((snapshot) => { snapshot.profiles = settings.profiles; });
        return;
      }
      case "profile.delete": {
        if (command.profileId === "default") throw new Error("The default profile cannot be deleted.");
        const settings = await this.dependencies.settings.update((draft) => {
          draft.profiles = draft.profiles.filter((profile) => profile.id !== command.profileId);
        });
        this.dependencies.store.update((snapshot) => { snapshot.profiles = settings.profiles; });
        return;
      }
      case "collection.refresh":
        await this.dependencies.collection.refresh();
        return;
      case "insights.refreshRunes":
        await this.dependencies.insights.refreshRunes();
        return;
      case "insights.refreshPerformance":
        await this.dependencies.insights.refreshPerformance();
        return;
      case "runes.applyRecommendation":
        await this.dependencies.insights.applyRecommendation(command.recommendationId);
        return;
      case "collection.toggleFavorite": {
        const settings = await this.dependencies.settings.update((draft) => {
          const favorites = new Set(draft.favorites);
          if (favorites.has(command.skinId)) favorites.delete(command.skinId);
          else favorites.add(command.skinId);
          draft.favorites = [...favorites];
        });
        this.dependencies.store.update((snapshot) => {
          snapshot.collection.champions.forEach((champion) => {
            champion.skins.forEach((skin) => {
              if (skin.id === command.skinId) skin.favorite = settings.favorites.includes(skin.id);
            });
          });
          snapshot.collection.progress.favoriteSkins = snapshot.collection.champions
            .flatMap((champion) => champion.skins)
            .filter((skin) => skin.favorite).length;
        });
        return;
      }
      case "collection.toggleWishlist": {
        const settings = await this.dependencies.settings.update((draft) => {
          const wishlist = new Set(draft.wishlist);
          if (wishlist.has(command.skinId)) wishlist.delete(command.skinId);
          else wishlist.add(command.skinId);
          draft.wishlist = [...wishlist];
        });
        this.dependencies.store.update((snapshot) => {
          for (const skin of snapshot.collection.champions.flatMap((champion) => champion.skins)) {
            if (skin.id === command.skinId) skin.wishlisted = settings.wishlist.includes(skin.id);
          }
          snapshot.collection.progress.wishlistSkins = snapshot.collection.champions
            .flatMap((champion) => champion.skins)
            .filter((skin) => skin.wishlisted).length;
        });
        return;
      }
      case "integration.configure":
        await this.dependencies.integrations.configure(command.integrationId, command.executablePath);
        return;
      case "integration.chooseExecutable": {
        const selected = await this.dependencies.chooseExecutable(command.integrationId);
        if (selected) await this.dependencies.integrations.configure(command.integrationId, selected);
        return;
      }
      case "integration.launch":
        await this.dependencies.integrations.launch(command.integrationId);
        return;
      case "integration.stop":
        await this.dependencies.integrations.stop(command.integrationId);
        return;
      case "clientTab.install":
        await this.dependencies.pengu.install();
        return this.clientTabActivationMessage("installed", await this.dependencies.clientTabActivation.activatePending("command"));
      case "clientTab.repair":
        await this.dependencies.pengu.install();
        return this.clientTabActivationMessage("repaired", await this.dependencies.clientTabActivation.activatePending("command"));
      case "clientTab.uninstall":
        await this.dependencies.pengu.uninstall();
        return;
      case "doctor.refresh":
        await this.dependencies.pengu.refresh();
        return;
      case "aram.toggleFavoriteChampion":
        await this.dependencies.aram.toggleFavorite(command.championId);
        return;
      case "remote.revoke":
        await this.dependencies.remote.revoke(command.deviceId);
        return;
      case "remote.configure":
        await this.dependencies.remote.configure(command.relayUrl, command.mobileUrl, command.adminSecret);
        return;
      case "readyCheck.accept":
      case "readyCheck.decline":
      case "queue.start":
      case "queue.stop":
      case "champSelect.hover":
      case "champSelect.lock":
      case "champSelect.setSpells":
      case "champSelect.setRunePage":
      case "champSelect.selectOwnedSkin":
        await this.dependencies.leagueSession.executeManual(command);
        return;
      case "aram.benchSwap":
        await this.dependencies.aram.swap(command.championId);
        return;
    }
  }

  private clientTabActivationMessage(
    action: "installed" | "repaired",
    activation: ClientTabActivationResult,
  ): string {
    const prefix = `Client integration ${action}.`;
    if (activation.status === "reloaded") return `${prefix} League's UI is reloading now; the game process was not touched.`;
    if (activation.status === "deferred") return `${prefix} The UI reload is queued until League returns to Home or Lobby (current phase: ${activation.phase}).`;
    if (activation.status === "next-launch") return `${prefix} It will load automatically the next time League starts.`;
    if (activation.status === "already-requested") return `${prefix} A League UI reload has already been requested.`;
    if (activation.status === "failed") throw new Error(activation.message);
    return prefix;
  }

  private successMessage(command: CompanionCommand): string {
    if (command.type === "desktop.open") return "Desktop app opened.";
    if (command.type === "startup.setEnabled") return startupSettingMessage(command.setting, command.enabled);
    if (command.type === "presence.set") return `Presence changed to ${command.availability}.`;
    if (command.type === "collection.refresh") return "Collection synchronized.";
    if (command.type === "insights.refreshRunes") return "Online coaching guidance refreshed.";
    if (command.type === "insights.refreshPerformance") return "Champion performance refreshed.";
    if (command.type === "runes.applyRecommendation") return "Recommended runes applied to a SummonerKit page.";
    if (command.type === "collection.toggleFavorite") return "Favorite updated.";
    if (command.type === "collection.toggleWishlist") return "Wishlist updated.";
    if (command.type === "profile.save") return "Automation profile saved.";
    if (command.type === "profile.setChampionPriorities") return "Champion fallback plan saved.";
    if (command.type === "profile.delete") return "Automation profile deleted.";
    if (command.type === "automation.acknowledgeRisk") return "Risk acknowledgement saved locally.";
    if (command.type === "automation.setEnabled") return `${command.feature} ${command.enabled ? "enabled" : "disabled"}.`;
    if (command.type === "automation.disableAll") return "All automation features are disabled.";
    if (command.type === "automation.setMode") return `Automation mode changed to ${command.mode}.`;
    if (command.type === "automation.confirm") return "Automation action confirmed.";
    if (command.type === "automation.dismiss") return "Automation action dismissed.";
    if (command.type === "clientTab.install") return "Client integration installed.";
    if (command.type === "clientTab.repair") return "Client integration repaired.";
    if (command.type === "clientTab.uninstall") return "Client integration removed. Restart the League client to unload it.";
    if (command.type === "doctor.refresh") return "Connection checks refreshed.";
    if (command.type === "aram.toggleFavoriteChampion") return "ARAM favorite updated.";
    if (command.type === "remote.revoke") return "Mobile device revoked.";
    if (command.type === "remote.configure") return "Mobile relay configuration encrypted and saved.";
    if (command.type.startsWith("integration.")) return "Integration updated.";
    return "Command completed.";
  }
}

function startupSettingMessage(setting: keyof StartupSettings, enabled: boolean): string {
  if (setting === "launchOnWindowsStartup") return `Start with Windows ${enabled ? "enabled" : "disabled"}.`;
  if (setting === "openOnLeagueDetected") return `Open on League detection ${enabled ? "enabled" : "disabled"}.`;
  return `Open on Rose detection ${enabled ? "enabled" : "disabled"}.`;
}
