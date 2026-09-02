import { PRODUCT_NAME, type AppUpdateState } from "@summonerkit/contracts";

type SimpleUpdateEvent = "checking-for-update" | "update-available" | "update-not-available";

export interface DesktopUpdater {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void | Promise<void>;
  quitAndInstall(): void;
  on(event: SimpleUpdateEvent, listener: () => void): void;
  on(event: "update-downloaded", listener: (event: unknown, notes: unknown, releaseName: string) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

interface UpdateServiceOptions {
  currentVersion: string;
  feedUrl: string;
  installedWithSquirrel: boolean;
}

export class UpdateService {
  private state: AppUpdateState;

  constructor(
    private readonly updater: DesktopUpdater,
    private readonly options: UpdateServiceOptions,
  ) {
    this.state = initialUpdateState(options);
    this.bindEvents();
    if (options.installedWithSquirrel) this.updater.setFeedURL({ url: options.feedUrl });
  }

  getState(): AppUpdateState {
    return structuredClone(this.state);
  }

  async check(): Promise<AppUpdateState> {
    if (!this.state.canCheck || this.isBusy()) return this.getState();
    this.setState("checking", "Checking GitHub Releases…");
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.fail(error);
    }
    return this.getState();
  }

  restart(): void {
    if (!this.state.canRestart) throw new Error("No downloaded update is ready to install.");
    this.updater.quitAndInstall();
  }

  private bindEvents(): void {
    this.updater.on("checking-for-update", () => this.setState("checking", "Checking GitHub Releases…"));
    this.updater.on("update-available", () => this.setState("downloading", "Downloading the release package…"));
    this.updater.on("update-not-available", () => this.markCurrent());
    this.updater.on("update-downloaded", (_event, _notes, releaseName) => this.markReady(releaseName));
    this.updater.on("error", (error) => this.fail(error));
  }

  private isBusy(): boolean {
    return this.state.status === "checking" || this.state.status === "downloading";
  }

  private markCurrent(): void {
    this.setState("current", `${PRODUCT_NAME} ${this.options.currentVersion} is up to date.`, {
      checkedAt: new Date().toISOString(),
    });
  }

  private markReady(releaseName: string): void {
    const availableVersion = releaseName.replace(/^v/u, "") || null;
    this.setState("ready", `${PRODUCT_NAME} ${availableVersion ?? "update"} is ready. Restart to install it.`, {
      availableVersion,
      checkedAt: new Date().toISOString(),
      canRestart: true,
    });
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setState("error", `Update check failed: ${message}`, { checkedAt: new Date().toISOString() });
  }

  private setState(status: AppUpdateState["status"], message: string, changes: Partial<AppUpdateState> = {}): void {
    this.state = { ...this.state, ...changes, status, message };
  }
}

function initialUpdateState(options: UpdateServiceOptions): AppUpdateState {
  if (!options.installedWithSquirrel) {
    return {
      status: "unavailable",
      currentVersion: options.currentVersion,
      availableVersion: null,
      checkedAt: null,
      message: `Install ${PRODUCT_NAME} with Windows Setup to enable one-click updates. Portable and development builds can use GitHub Releases.`,
      canCheck: false,
      canRestart: false,
    };
  }
  return {
    status: "idle",
    currentVersion: options.currentVersion,
    availableVersion: null,
    checkedAt: null,
    message: `Check GitHub Releases when you are ready. ${PRODUCT_NAME} never installs an update silently.`,
    canCheck: true,
    canRestart: false,
  };
}
