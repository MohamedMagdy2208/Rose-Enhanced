import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
  CLIENT_TAB_PLUGIN_VERSION,
  CLIENT_TAB_PROTOCOL_VERSION,
} from "@summonerkit/contracts";
import type { CompanionStore } from "./companion-store";
import type { SettingsStore } from "./settings-store";
import type { AppLogger } from "./logger";
import { bridgePortFromEnvironment } from "./loopback-security";

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class PenguManager {
  private readonly pluginName = "SummonerKit";
  private readonly legacyPluginName = "ROSE-Enhanced";

  constructor(
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly logger: AppLogger,
  ) {}

  async refresh(): Promise<void> {
    const pluginDirectory = await this.resolvePluginDirectory();
    const pluginPath = path.join(pluginDirectory, this.pluginName, "index.js");
    const installed = await exists(pluginPath);
    const installedMetadata = installed ? await this.readInstalledMetadata(pluginPath) : null;
    const installedPluginVersion = installedMetadata?.pluginVersion ?? null;
    const installedProtocolVersion = installedMetadata?.protocolVersion ?? null;
    this.store.update((snapshot) => {
      snapshot.connection.capabilities.clientTab = installed;
      snapshot.clientTab.installed = installed;
      snapshot.clientTab.installedPluginVersion = installedPluginVersion;
      snapshot.clientTab.installedProtocolVersion = installedProtocolVersion;
      snapshot.clientTab.restartRequired = installed
        ? snapshot.clientTab.restartRequired || installedPluginVersion !== CLIENT_TAB_PLUGIN_VERSION || installedProtocolVersion !== CLIENT_TAB_PROTOCOL_VERSION
        : false;
      if (!installed) {
        snapshot.clientTab.activePluginVersion = null;
        snapshot.clientTab.activeProtocolVersion = null;
      }
      snapshot.integrations = snapshot.integrations.map((integration) =>
        integration.id === "pengu"
          ? { ...integration, installed, executablePath: pluginDirectory, lastError: null }
          : integration,
      );
    });
  }

  async install(): Promise<void> {
    const templatePath = this.templatePath();
    if (!(await exists(templatePath))) throw new Error("The packaged client-tab template is missing.");
    const pluginRoot = await this.resolvePluginDirectory();
    const destination = path.join(pluginRoot, this.pluginName);
    await mkdir(destination, { recursive: true });
    const template = await readFile(templatePath, "utf8");
    const navigationIcon = await readFile(this.navigationIconPath());
    const bridgePort = bridgePortFromEnvironment();
    const bridgeToken = this.settings.get().bridgeToken;
    const navigationDataUrl = `data:image/png;base64,${navigationIcon.toString("base64")}`;
    const generated = template
      .replaceAll('"__SUMMONERKIT_TOKEN__"', JSON.stringify(bridgeToken))
      .replaceAll('"__SUMMONERKIT_PORT__"', JSON.stringify(String(bridgePort)))
      .replaceAll('"__SUMMONERKIT_NAV_ICON__"', JSON.stringify(navigationDataUrl))
      .replaceAll('"__SUMMONERKIT_PLUGIN_VERSION__"', JSON.stringify(CLIENT_TAB_PLUGIN_VERSION))
      .replaceAll('"__SUMMONERKIT_PROTOCOL_VERSION__"', JSON.stringify(String(CLIENT_TAB_PROTOCOL_VERSION)));
    await writeFile(path.join(destination, "index.js"), generated, { encoding: "utf8", mode: 0o600 });
    await this.removePluginDirectory(pluginRoot, this.legacyPluginName);
    this.store.update((snapshot) => {
      snapshot.clientTab.restartRequired = true;
      snapshot.clientTab.lastRepairAt = new Date().toISOString();
      snapshot.clientTab.lastError = null;
    });
    this.logger.info("Installed SummonerKit client surface", { destination });
    await this.refresh();
  }

  async uninstall(): Promise<void> {
    const pluginRoot = await this.resolvePluginDirectory();
    await this.removePluginDirectory(pluginRoot, this.pluginName);
    await this.removePluginDirectory(pluginRoot, this.legacyPluginName);
    this.logger.info("Removed SummonerKit client surface", { pluginRoot });
    await this.refresh();
  }

  async repairIfInstalled(): Promise<void> {
    await this.refresh();
    const state = this.store.getSnapshot().clientTab;
    const pluginRoot = await this.resolvePluginDirectory();
    const legacyInstalled = await exists(path.join(pluginRoot, this.legacyPluginName, "index.js"));
    const currentOutdated = state.installed
      && (state.installedPluginVersion !== CLIENT_TAB_PLUGIN_VERSION || state.installedProtocolVersion !== CLIENT_TAB_PROTOCOL_VERSION);
    if (legacyInstalled || currentOutdated) {
      try {
        await this.install();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn("Automatic client-tab repair failed", { error: message });
        this.store.update((snapshot) => { snapshot.clientTab.lastError = message; });
      }
    }
  }

  registerActiveSession(protocolVersion: number | null, pluginVersion: string | null): void {
    this.store.update((snapshot) => {
      const activeSessionReported = protocolVersion !== null && pluginVersion !== null;
      snapshot.clientTab.activeProtocolVersion = protocolVersion;
      snapshot.clientTab.activePluginVersion = pluginVersion;
      if (!activeSessionReported) return;

      const activeSessionCurrent = protocolVersion === CLIENT_TAB_PROTOCOL_VERSION
        && pluginVersion === CLIENT_TAB_PLUGIN_VERSION;
      const installedPluginCurrent = snapshot.clientTab.installedPluginVersion === CLIENT_TAB_PLUGIN_VERSION
        && snapshot.clientTab.installedProtocolVersion === CLIENT_TAB_PROTOCOL_VERSION;
      snapshot.clientTab.restartRequired = !activeSessionCurrent;
      if (!activeSessionCurrent && installedPluginCurrent && !snapshot.clientTab.lastRepairAt) {
        snapshot.clientTab.lastRepairAt = new Date().toISOString();
      }
    });
  }

  private async resolvePluginDirectory(): Promise<string> {
    const roseExecutable = this.settings.get().integrationPaths.rose;
    const candidates = [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Rose", "Pengu Loader", "plugins")
        : null,
      roseExecutable
        ? path.join(path.dirname(roseExecutable), "Pengu Loader", "plugins")
        : null,
      path.join(app.getPath("userData"), "Pengu Loader", "plugins"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    for (const candidate of candidates) {
      if (await exists(path.dirname(candidate))) return candidate;
    }
    return candidates[candidates.length - 1]!;
  }

  private templatePath(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, "pengu", "index.template.js");
    return path.resolve(app.getAppPath(), "../client-tab/pengu/index.template.js");
  }

  private navigationIconPath(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, "assets", "tray-icon.png");
    return path.resolve(app.getAppPath(), "assets", "tray-icon.png");
  }

  private async removePluginDirectory(pluginRoot: string, pluginName: string): Promise<void> {
    const resolvedRoot = path.resolve(pluginRoot);
    const destination = path.resolve(resolvedRoot, pluginName);
    const relative = path.relative(resolvedRoot, destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to remove an unexpected plugin path.");
    }
    await rm(destination, { recursive: true, force: true });
  }

  private async readInstalledMetadata(pluginPath: string): Promise<{ pluginVersion: string | null; protocolVersion: number | null }> {
    const source = await readFile(pluginPath, "utf8");
    const pluginVersion = /const pluginVersion = "([^"]+)";/u.exec(source)?.[1] ?? null;
    const protocolText = /const protocolVersion = Number\("(\d+)"\);/u.exec(source)?.[1];
    return { pluginVersion, protocolVersion: protocolText ? Number(protocolText) : null };
  }
}
