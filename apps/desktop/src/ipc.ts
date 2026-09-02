import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  AutomationProfile,
  AppUpdateState,
  DiagnosticReport,
  DomainEvent,
  RemotePairingOffer,
} from "@summonerkit/contracts";
import { redactSensitive } from "@summonerkit/core";
import type { CommandRouter } from "./services/command-router";
import type { CompanionStore } from "./services/companion-store";
import type { AppLogger } from "./services/logger";
import type { RemoteService } from "./services/remote-service";
import type { UpdateService } from "./services/update-service";
import { trustedMainFrame } from "./electron-security";
import { ipcChannels } from "./ipc-channels";

interface IpcDependencies {
  window: BrowserWindow;
  store: CompanionStore;
  router: CommandRouter;
  remote: RemoteService;
  updates: UpdateService;
  logger: AppLogger;
}

export function registerIpc({ window, store, router, remote, updates, logger }: IpcDependencies): () => void {
  const guard = <T>(event: IpcMainInvokeEvent, callback: () => T): T => {
    if (!trustedMainFrame(event, window.webContents)) throw new Error("Untrusted IPC sender.");
    return callback();
  };

  ipcMain.handle(ipcChannels.getSnapshot, (event) => guard(event, () => store.getSnapshot()));
  ipcMain.handle(ipcChannels.dispatch, (event, command: unknown) => guard(event, () => router.dispatch(command)));
  ipcMain.handle(ipcChannels.saveProfile, (event, profile: AutomationProfile) =>
    guard(event, () => router.dispatch({ type: "profile.save", profile })),
  );
  ipcMain.handle(ipcChannels.diagnostics, (event) =>
    guard(event, (): DiagnosticReport => ({
      generatedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: `${process.platform}-${process.arch}`,
      snapshot: redactSensitive(store.getSnapshot()) as DiagnosticReport["snapshot"],
      recentLogs: logger.getRecent(),
    })),
  );
  ipcMain.handle(ipcChannels.createRemotePairing, (event) =>
    guard(event, () => remote.createPairing()) as Promise<RemotePairingOffer>,
  );
  ipcMain.handle(ipcChannels.getUpdateState, (event) =>
    guard(event, (): AppUpdateState => updates.getState()),
  );
  ipcMain.handle(ipcChannels.checkForUpdates, (event) =>
    guard(event, () => updates.check()) as Promise<AppUpdateState>,
  );
  ipcMain.handle(ipcChannels.restartToUpdate, (event) =>
    guard(event, () => updates.restart()),
  );

  const publish = (revision: number) => {
    if (window.isDestroyed()) return;
    const event: DomainEvent = { type: "snapshot.changed", revision };
    window.webContents.send(ipcChannels.event, event);
  };
  store.on("changed", publish);

  return () => {
    store.off("changed", publish);
    for (const channel of [ipcChannels.getSnapshot, ipcChannels.dispatch, ipcChannels.saveProfile, ipcChannels.diagnostics, ipcChannels.createRemotePairing, ipcChannels.getUpdateState, ipcChannels.checkForUpdates, ipcChannels.restartToUpdate]) {
      ipcMain.removeHandler(channel);
    }
  };
}
