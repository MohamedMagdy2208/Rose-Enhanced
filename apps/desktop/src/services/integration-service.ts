import { spawn, execFile, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { IntegrationId, IntegrationState } from "@rose-enhanced/contracts";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";

const execFileAsync = promisify(execFile);
type ExternalIntegrationId = Exclude<IntegrationId, "pengu">;

async function exists(filePath: string | null): Promise<boolean> {
  if (!filePath) return false;
  try { await access(filePath); return true; } catch { return false; }
}

export class IntegrationService {
  private readonly managed = new Map<ExternalIntegrationId, ChildProcess>();

  constructor(
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly logger: AppLogger,
  ) {}

  async refresh(): Promise<void> {
    const configured = this.settings.get().integrationPaths;
    const running = await this.runningProcessNames();
    const states = await Promise.all(
      (["rose", "deceive"] as const).map(async (id): Promise<IntegrationState> => {
        const executablePath = configured[id] ?? (await this.findKnownPath(id));
        return {
          id,
          name: id === "rose" ? "Rose" : "Deceive",
          installed: await exists(executablePath),
          running: running.has(id) || this.isManagedRunning(id),
          managedProcess: this.isManagedRunning(id),
          executablePath,
          version: null,
          lastError: null,
        };
      }),
    );
    this.store.update((snapshot) => {
      snapshot.integrations = snapshot.integrations.map((integration) =>
        integration.id === "pengu"
          ? integration
          : states.find((state) => state.id === integration.id) ?? integration,
      );
    });
  }

  async configure(id: ExternalIntegrationId, executablePath: string | null): Promise<void> {
    if (executablePath && path.extname(executablePath).toLowerCase() !== ".exe") {
      throw new Error("Select a Windows executable file.");
    }
    if (executablePath && !(await exists(executablePath))) throw new Error("The selected executable does not exist.");
    await this.settings.update((settings) => {
      settings.integrationPaths[id] = executablePath;
    });
    await this.refresh();
  }

  async launch(id: ExternalIntegrationId): Promise<void> {
    const integration = this.store.getSnapshot().integrations.find((candidate) => candidate.id === id);
    if (!integration?.executablePath || !(await exists(integration.executablePath))) {
      throw new Error(`${integration?.name ?? id} is not configured.`);
    }
    if (integration.running) return;

    const child = spawn(integration.executablePath, [], {
      cwd: path.dirname(integration.executablePath),
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    this.managed.set(id, child);
    child.once("exit", () => {
      this.managed.delete(id);
      void this.refresh();
    });
    child.once("error", (error) => {
      this.logger.warn("External integration failed", { integration: id, error: String(error) });
      this.managed.delete(id);
      void this.refresh();
    });
    await this.refresh();
  }

  async stop(id: ExternalIntegrationId): Promise<void> {
    const child = this.managed.get(id);
    if (!child || child.exitCode !== null) throw new Error("Rose Enhanced did not start this process and will not stop it.");
    child.kill();
    this.managed.delete(id);
    await this.refresh();
  }

  private async findKnownPath(id: ExternalIntegrationId): Promise<string | null> {
    const local = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const candidates = id === "rose"
      ? [
          local ? path.join(local, "Programs", "Rose", "Rose.exe") : null,
          local ? path.join(local, "Rose", "Rose.exe") : null,
          programFiles ? path.join(programFiles, "Rose", "Rose.exe") : null,
        ]
      : [
          local ? path.join(local, "Deceive", "Deceive.exe") : null,
          local ? path.join(local, "Programs", "Deceive", "Deceive.exe") : null,
          programFiles ? path.join(programFiles, "Deceive", "Deceive.exe") : null,
        ];
    for (const candidate of candidates) if (candidate && (await exists(candidate))) return candidate;
    return null;
  }

  private isManagedRunning(id: ExternalIntegrationId): boolean {
    const child = this.managed.get(id);
    return Boolean(child && child.exitCode === null && !child.killed);
  }

  private async runningProcessNames(): Promise<Set<ExternalIntegrationId>> {
    if (process.platform !== "win32") return new Set();
    try {
      const script = "Get-Process -Name Rose,Deceive -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName | ConvertTo-Json -Compress";
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
      const parsed = stdout.trim() ? (JSON.parse(stdout) as string | string[]) : [];
      return new Set((Array.isArray(parsed) ? parsed : [parsed]).map((name) => name.toLowerCase()).filter((name): name is ExternalIntegrationId => name === "rose" || name === "deceive"));
    } catch {
      return new Set();
    }
  }
}
