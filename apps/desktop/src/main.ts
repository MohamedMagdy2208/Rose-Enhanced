import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  Menu,
  net,
  Notification,
  protocol,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";
import {
  PRODUCT_NAME,
  PRODUCT_REPOSITORY,
  type AutomationSettings,
  type CompanionCommand,
  type CompanionSnapshot,
} from "@summonerkit/contracts";
import squirrelStartup from "electron-squirrel-startup";
import { registerIpc } from "./ipc";
import { allowedExternalUrl } from "./electron-security";
import { rendererFilePath, RENDERER_SCHEME } from "./renderer-protocol";
import { AutomationService } from "./services/automation-service";
import { AramService } from "./services/aram-service";
import { BridgeServer } from "./services/bridge-server";
import { ClientTabActivationService } from "./services/client-tab-activation";
import { CollectionService } from "./services/collection-service";
import { CommandRouter } from "./services/command-router";
import { CompanionStore } from "./services/companion-store";
import { IntegrationService } from "./services/integration-service";
import { InsightsService } from "./services/insights-service";
import { LcuClient } from "./services/lcu/lcu-client";
import { LeagueSessionService } from "./services/league-session-service";
import { AppLogger } from "./services/logger";
import { PenguManager } from "./services/pengu-manager";
import { PresenceService } from "./services/presence-service";
import { RemoteService } from "./services/remote-service";
import { SettingsStore } from "./services/settings-store";
import { UpdateService } from "./services/update-service";

if (squirrelStartup) app.quit();
app.setName(PRODUCT_NAME);
protocol.registerSchemesAsPrivileged([{
  scheme: RENDERER_SCHEME,
  privileges: { standard: true, secure: true, codeCache: true },
}]);

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

const installClientSurface = process.argv.includes("--install-client-surface");
const rotateClientToken = process.argv.includes("--rotate-client-token");
const startInBackground = process.argv.includes("--background");
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

async function bootstrap(): Promise<void> {
  await migrateLegacyUserData();
  const logger = new AppLogger();
  const settings = new SettingsStore(logger);
  const persisted = await settings.load();
  const store = new CompanionStore(persisted);
  const lcu = new LcuClient(() => settings.get().leaguePath, logger);
  const collection = new CollectionService(lcu, store, settings, logger);
  const leagueSession = new LeagueSessionService(lcu, store);
  const presence = new PresenceService(lcu, store, logger);
  const insights = new InsightsService(lcu, store, logger);
  const notifyUser = (title: string, body: string): void => {
    if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  };
  const automation = new AutomationService(lcu, store, settings, logger, notifyUser);
  const aram = new AramService(lcu, store, settings, notifyUser);
  const integrations = new IntegrationService(store, settings, logger);
  const pengu = new PenguManager(store, settings, logger);
  const clientTabActivation = new ClientTabActivationService(lcu, store, logger);
  const updates = new UpdateService(autoUpdater, {
    currentVersion: app.getVersion(),
    feedUrl: `https://update.electronjs.org/${PRODUCT_REPOSITORY}/${process.platform}-${process.arch}/${app.getVersion()}`,
    installedWithSquirrel: await squirrelInstallationAvailable(),
  });

  if (installClientSurface || rotateClientToken) {
    if (rotateClientToken) await settings.rotateBridgeToken();
    await pengu.install();
    app.quit();
    return;
  }

  await pengu.repairIfInstalled();

  mainWindow = createWindow(logger);
  const chooseExecutable = async (id: "rose" | "deceive"): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Choose ${id === "rose" ? "Rose" : "Deceive"} executable`,
      properties: ["openFile"],
      filters: [{ name: "Windows applications", extensions: ["exe"] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  };
  let router: CommandRouter;
  const remote = new RemoteService(store, settings, (command) => router.dispatch(command), logger);
  const openDesktop = (): void => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  router = new CommandRouter({
    store,
    settings,
    collection,
    automation,
    aram,
    integrations,
    insights,
    leagueSession,
    presence,
    pengu,
    clientTabActivation,
    remote,
    openDesktop,
    chooseExecutable,
    logger,
  });
  const bridge = new BridgeServer({
    token: persisted.bridgeToken,
    store,
    lcu,
    dispatch: (command) => router.dispatch(command),
    registerClientSession: (protocolVersion, pluginVersion) => {
      pengu.registerActiveSession(protocolVersion, pluginVersion);
      void clientTabActivation.activatePending();
    },
    logger,
  });
  const unregisterIpc = registerIpc({ window: mainWindow, store, router, remote, updates, logger });

  lcu.on("state", (state) => store.update((snapshot) => { snapshot.connection = state; }));
  clientTabActivation.start();
  collection.start();
  await insights.start();
  leagueSession.start();
  presence.start();
  automation.start();
  aram.start();
  await bridge.start();
  await Promise.all([integrations.refresh(), pengu.refresh()]);
  lcu.start();
  const disposeTray = createTray(mainWindow, store, router, notifyUser);

  app.on("before-quit", () => {
    isQuitting = true;
    disposeTray();
    clientTabActivation.stop();
    automation.stop();
    leagueSession.stop();
    presence.stop();
    insights.stop();
    remote.stop();
    lcu.stop();
    unregisterIpc();
    void bridge.stop();
  });
}

function createWindow(logger: AppLogger): BrowserWindow {
  const window = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 1_280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    icon: applicationAssetPath("icon.ico"),
    backgroundColor: "#090b0f",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      enableWebSQL: false,
      navigateOnDragDrop: false,
      partition: "summonerkit",
      safeDialogs: true,
      spellcheck: false,
      webviewTag: false,
    },
  });

  window.once("ready-to-show", () => {
    if (!startInBackground) window.show();
  });
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = allowedExternalUrl(url);
    if (externalUrl) void shell.openExternal(externalUrl);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const rendererRoot = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
    window.webContents.session.protocol.handle(RENDERER_SCHEME, (request) => {
      const filePath = rendererFilePath(rendererRoot, request.url);
      return filePath
        ? net.fetch(pathToFileURL(filePath).toString())
        : new Response(null, { status: 404 });
    });
  }

  void loadRenderer(window, logger);
  return window;
}

async function loadRenderer(window: BrowserWindow, logger: AppLogger): Promise<void> {
  try {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    else await window.loadURL(`${RENDERER_SCHEME}://app/index.html`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Desktop renderer failed to load", { error: message });
    const failurePage = `<!doctype html>
      <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
      <title>SummonerKit could not open</title><style>
      :root{color-scheme:dark;font-family:"Segoe UI",sans-serif}body{display:grid;min-height:100vh;margin:0;place-items:center;color:#f4efe8;background:#090b0f}.card{width:min(34rem,calc(100% - 3rem));padding:2rem;background:#12161d;border:1px solid #df6b65;border-radius:12px}.mark{color:#f06a7f;font:700 13px Georgia,serif;letter-spacing:.08em}h1{margin:.75rem 0;font:700 2rem Georgia,serif}p{margin:0;color:#bbb5ad;line-height:1.6}code{display:block;margin-top:1rem;padding:.75rem;color:#dfa452;background:#090b0f;border:1px solid #292f39;border-radius:8px;white-space:normal}
      </style></head><body><main class="card"><span class="mark">SUMMONERKIT</span><h1>The desktop interface could not load.</h1><p>The local engine can remain available to the League tab. Close this window, reopen SummonerKit, and check the diagnostic log if the problem continues.</p><code>Renderer load failed. No credentials were exposed.</code></main></body></html>`;
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failurePage)}`);
      if (!startInBackground) window.show();
    } catch {
      dialog.showErrorBox("SummonerKit could not open", "The desktop interface failed to load. Check the SummonerKit diagnostic log for details.");
    }
  }
}

function applicationAssetPath(filename: "icon.ico" | "tray-icon.png"): string {
  const assetDirectory = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.resolve(app.getAppPath(), "assets");
  return path.join(assetDirectory, filename);
}

const trayAutomationFeatures: ReadonlyArray<{
  key: Exclude<keyof AutomationSettings, "riskAcknowledged" | "executionMode">;
  label: string;
}> = [
  { key: "autoAccept", label: "Auto Accept" },
  { key: "autoPick", label: "Auto Pick" },
  { key: "autoBan", label: "Auto Ban" },
  { key: "autoSpells", label: "Auto Spells" },
  { key: "autoRunes", label: "Auto Runes" },
];

function createTray(
  window: BrowserWindow,
  store: CompanionStore,
  router: CommandRouter,
  notifyUser: (title: string, body: string) => void,
): () => void {
  tray = new Tray(applicationAssetPath("tray-icon.png"));
  tray.setToolTip("SummonerKit");

  const openWindow = (): void => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  let menuSignature = "";
  const dispatch = async (command: CompanionCommand): Promise<void> => {
    const result = await router.dispatch(command);
    if (!result.ok) {
      notifyUser("SummonerKit setting was not changed", result.message);
      menuSignature = "";
      refreshMenu();
    }
  };
  const refreshMenu = (): void => {
    if (!tray || tray.isDestroyed()) return;
    const snapshot = store.getSnapshot();
    const signature = trayMenuSignature(snapshot);
    if (signature === menuSignature) return;
    menuSignature = signature;
    tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(snapshot, openWindow, dispatch)));
  };

  refreshMenu();
  store.on("changed", refreshMenu);
  tray.on("double-click", openWindow);

  return () => {
    store.off("changed", refreshMenu);
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
  };
}

function trayMenuSignature(snapshot: CompanionSnapshot): string {
  return JSON.stringify({
    connection: snapshot.connection.status,
    presenceCapability: snapshot.connection.capabilities.presence,
    presenceStatus: snapshot.presence.status,
    presenceAvailability: snapshot.presence.availability,
    presenceError: snapshot.presence.lastError,
    riskAcknowledged: snapshot.automation.riskAcknowledged,
    executionMode: snapshot.automation.executionMode,
    features: trayAutomationFeatures.map((feature) => snapshot.automation[feature.key]),
  });
}

function trayMenuTemplate(
  snapshot: CompanionSnapshot,
  openWindow: () => void,
  dispatch: (command: CompanionCommand) => Promise<void>,
): MenuItemConstructorOptions[] {
  const presenceWritable = snapshot.connection.status === "connected"
    && snapshot.connection.capabilities.presence
    && snapshot.presence.status === "ready";
  const automationUnlocked = snapshot.automation.riskAcknowledged;
  const activeFeatures = trayAutomationFeatures.filter((feature) => snapshot.automation[feature.key]);
  const presenceDetail = snapshot.connection.status !== "connected"
    ? "League client is not connected"
    : !snapshot.connection.capabilities.presence
      ? "Presence is unavailable on this patch"
      : snapshot.presence.status === "loading"
        ? "Waiting for League to confirm"
        : snapshot.presence.status !== "ready"
          ? snapshot.presence.lastError ?? "Presence is temporarily unavailable"
          : null;

  const presenceMenu: MenuItemConstructorOptions[] = [
    ...(presenceDetail ? [{ label: presenceDetail, enabled: false } satisfies MenuItemConstructorOptions] : []),
    {
      label: "Online",
      type: "radio",
      checked: snapshot.presence.availability === "online",
      enabled: presenceWritable,
      click: () => { void dispatch({ type: "presence.set", availability: "online" }); },
    },
    {
      label: "Away",
      type: "radio",
      checked: snapshot.presence.availability === "away",
      enabled: presenceWritable,
      click: () => { void dispatch({ type: "presence.set", availability: "away" }); },
    },
  ];

  const automationMenu: MenuItemConstructorOptions[] = [
    ...(!automationUnlocked ? [{
      label: "Acknowledge risk in the app first",
      enabled: false,
    } satisfies MenuItemConstructorOptions] : []),
    ...trayAutomationFeatures.map<MenuItemConstructorOptions>((feature) => ({
      label: feature.label,
      type: "checkbox",
      checked: snapshot.automation[feature.key],
      enabled: automationUnlocked,
      click: () => {
        void dispatch({
          type: "automation.setEnabled",
          feature: feature.key,
          enabled: !snapshot.automation[feature.key],
        });
      },
    })),
    { type: "separator" },
    {
      label: `Execution mode: ${executionModeLabel(snapshot.automation.executionMode)}`,
      enabled: automationUnlocked,
      submenu: [
        {
          label: "Dry run",
          type: "radio",
          checked: snapshot.automation.executionMode === "dry-run",
          click: () => { void dispatch({ type: "automation.setMode", mode: "dry-run" }); },
        },
        {
          label: "Confirm each action",
          type: "radio",
          checked: snapshot.automation.executionMode === "confirm",
          click: () => { void dispatch({ type: "automation.setMode", mode: "confirm" }); },
        },
        {
          label: "Automatic",
          type: "radio",
          checked: snapshot.automation.executionMode === "automatic",
          click: () => { void dispatch({ type: "automation.setMode", mode: "automatic" }); },
        },
      ],
    },
    {
      label: "Disable all automation",
      enabled: automationUnlocked && activeFeatures.length > 0,
      click: () => {
        void (async () => {
          for (const feature of activeFeatures) {
            await dispatch({ type: "automation.setEnabled", feature: feature.key, enabled: false });
          }
        })();
      },
    },
  ];

  return [
    { label: "Open SummonerKit", click: openWindow },
    { type: "separator" },
    { label: "League presence", submenu: presenceMenu },
    { label: "Automation", submenu: automationMenu },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ];
}

function executionModeLabel(mode: AutomationSettings["executionMode"]): string {
  if (mode === "dry-run") return "Dry run";
  if (mode === "confirm") return "Confirm each action";
  return "Automatic";
}

async function migrateLegacyUserData(): Promise<void> {
  const legacyRoot = path.join(app.getPath("appData"), "@rose-enhanced", "desktop");
  const currentRoot = app.getPath("userData");
  for (const relativePath of ["settings.json", path.join("cache", "collection-v2.json"), path.join("cache", "insights-v1.json")]) {
    const source = path.join(legacyRoot, relativePath);
    const destination = path.join(currentRoot, relativePath);
    if (!(await fileExists(source)) || await fileExists(destination)) continue;
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function squirrelInstallationAvailable(): Promise<boolean> {
  if (!app.isPackaged || process.platform !== "win32") return false;
  const updateExecutable = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
  return fileExists(updateExecutable);
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

app.on("second-instance", () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.whenReady().then(bootstrap).catch((error) => {
  void dialog.showErrorBox("SummonerKit failed to start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  // The tray keeps the Windows companion alive.
});
