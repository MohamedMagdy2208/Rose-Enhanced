import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  Menu,
  Notification,
  shell,
  Tray,
} from "electron";
import { PRODUCT_NAME, PRODUCT_REPOSITORY } from "@summonerkit/contracts";
import squirrelStartup from "electron-squirrel-startup";
import { registerIpc } from "./ipc";
import { allowedExternalUrl } from "./electron-security";
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
import { RemoteService } from "./services/remote-service";
import { SettingsStore } from "./services/settings-store";
import { UpdateService } from "./services/update-service";

if (squirrelStartup) app.quit();
app.setName(PRODUCT_NAME);

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

  mainWindow = createWindow();
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
  automation.start();
  aram.start();
  await bridge.start();
  await Promise.all([integrations.refresh(), pengu.refresh()]);
  lcu.start();
  createTray(mainWindow);

  app.on("before-quit", () => {
    isQuitting = true;
    clientTabActivation.stop();
    automation.stop();
    leagueSession.stop();
    insights.stop();
    remote.stop();
    lcu.stop();
    unregisterIpc();
    void bridge.stop();
  });
}

function createWindow(): BrowserWindow {
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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  return window;
}

function applicationAssetPath(filename: "icon.ico" | "tray-icon.png"): string {
  const assetDirectory = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.resolve(app.getAppPath(), "assets");
  return path.join(assetDirectory, filename);
}

function createTray(window: BrowserWindow): void {
  tray = new Tray(applicationAssetPath("tray-icon.png"));
  tray.setToolTip("SummonerKit");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open SummonerKit", click: () => { window.show(); window.focus(); } },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => { window.show(); window.focus(); });
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
