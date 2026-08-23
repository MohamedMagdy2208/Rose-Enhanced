import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
  CLIENT_TAB_PLUGIN_VERSION,
  CLIENT_TAB_PROTOCOL_VERSION,
} from "@rose-enhanced/contracts";
import type { CompanionStore } from "./companion-store";
import type { SettingsStore } from "./settings-store";
import type { AppLogger } from "./logger";

async function exists(candidate: string): Promise<boolean> {
  try { await access(candidate); return true; } catch { return false; }
}

export class PenguManager {
  private readonly pluginName = "ROSE-Enhanced";

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
    const generated = template
      .replaceAll("__ROSE_ENHANCED_TOKEN__", this.settings.get().bridgeToken)
      .replaceAll("__ROSE_ENHANCED_PORT__", process.env.ROSE_ENHANCED_BRIDGE_PORT ?? "17654")
      .replaceAll("__ROSE_ENHANCED_PLUGIN_VERSION__", CLIENT_TAB_PLUGIN_VERSION)
      .replaceAll("__ROSE_ENHANCED_PROTOCOL_VERSION__", String(CLIENT_TAB_PROTOCOL_VERSION));
    await writeFile(path.join(destination, "index.js"), generated, { encoding: "utf8", mode: 0o600 });
    this.store.update((snapshot) => {
      snapshot.clientTab.restartRequired = true;
      snapshot.clientTab.lastRepairAt = new Date().toISOString();
      snapshot.clientTab.lastError = null;
    });
    this.logger.info("Installed Rose Enhanced client surface", { destination });
    await this.refresh();
  }

  async uninstall(): Promise<void> {
    const pluginRoot = path.resolve(await this.resolvePluginDirectory());
    const destination = path.resolve(pluginRoot, this.pluginName);
    const relative = path.relative(pluginRoot, destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to remove an unexpected plugin path.");
    }
    await rm(destination, { recursive: true, force: true });
    this.logger.info("Removed Rose Enhanced client surface", { destination });
    await this.refresh();
  }

  async repairIfInstalled(): Promise<void> {
    await this.refresh();
    const state = this.store.getSnapshot().clientTab;
    if (state.installed && (state.installedPluginVersion !== CLIENT_TAB_PLUGIN_VERSION || state.installedProtocolVersion !== CLIENT_TAB_PROTOCOL_VERSION)) {
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
      snapshot.clientTab.activeProtocolVersion = protocolVersion;
      snapshot.clientTab.activePluginVersion = pluginVersion;
      snapshot.clientTab.restartRequired =
        protocolVersion !== CLIENT_TAB_PROTOCOL_VERSION || pluginVersion !== CLIENT_TAB_PLUGIN_VERSION;
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

  private async readInstalledMetadata(pluginPath: string): Promise<{ pluginVersion: string | null; protocolVersion: number | null }> {
    const source = await readFile(pluginPath, "utf8");
    const pluginVersion = /const pluginVersion = "([^"]+)";/u.exec(source)?.[1] ?? null;
    const protocolText = /const protocolVersion = Number\("(\d+)"\);/u.exec(source)?.[1];
    return { pluginVersion, protocolVersion: protocolText ? Number(protocolText) : null };
  }
}
