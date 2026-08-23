import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  AutomationProfile,
  DiagnosticReport,
  DomainEvent,
  RemotePairingOffer,
} from "@rose-enhanced/contracts";
import { redactSensitive } from "@rose-enhanced/core";
import type { CommandRouter } from "./services/command-router";
import type { CompanionStore } from "./services/companion-store";
import type { AppLogger } from "./services/logger";
import type { RemoteService } from "./services/remote-service";
import { trustedMainFrame } from "./electron-security";

export const ipcChannels = {
  getSnapshot: "rose-enhanced:get-snapshot",
  dispatch: "rose-enhanced:dispatch",
  saveProfile: "rose-enhanced:save-profile",
  diagnostics: "rose-enhanced:diagnostics",
  createRemotePairing: "rose-enhanced:create-remote-pairing",
  event: "rose-enhanced:event",
} as const;

interface IpcDependencies {
  window: BrowserWindow;
  store: CompanionStore;
  router: CommandRouter;
  remote: RemoteService;
  logger: AppLogger;
}

export function registerIpc({ window, store, router, remote, logger }: IpcDependencies): () => void {
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

  const publish = (revision: number) => {
    if (window.isDestroyed()) return;
    const event: DomainEvent = { type: "snapshot.changed", revision };
    window.webContents.send(ipcChannels.event, event);
  };
  store.on("changed", publish);

  return () => {
    store.off("changed", publish);
    for (const channel of [ipcChannels.getSnapshot, ipcChannels.dispatch, ipcChannels.saveProfile, ipcChannels.diagnostics, ipcChannels.createRemotePairing]) {
      ipcMain.removeHandler(channel);
    }
  };
}
