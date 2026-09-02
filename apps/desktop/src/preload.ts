import { contextBridge, ipcRenderer } from "electron";
import type {
  AutomationProfile,
  AppUpdateState,
  BridgeListener,
  CompanionBridge,
  CompanionCommand,
  CompanionSnapshot,
  DiagnosticReport,
  DomainEvent,
  RemotePairingOffer,
} from "@summonerkit/contracts";
import { ipcChannels } from "./ipc-channels";

const bridge: CompanionBridge = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot) as Promise<CompanionSnapshot>,
  dispatch: (command: CompanionCommand) => ipcRenderer.invoke(ipcChannels.dispatch, command),
  saveProfile: (profile: AutomationProfile) => ipcRenderer.invoke(ipcChannels.saveProfile, profile),
  exportDiagnostics: () => ipcRenderer.invoke(ipcChannels.diagnostics) as Promise<DiagnosticReport>,
  createRemotePairing: () => ipcRenderer.invoke(ipcChannels.createRemotePairing) as Promise<RemotePairingOffer>,
  getUpdateState: () => ipcRenderer.invoke(ipcChannels.getUpdateState) as Promise<AppUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke(ipcChannels.checkForUpdates) as Promise<AppUpdateState>,
  restartToUpdate: () => ipcRenderer.invoke(ipcChannels.restartToUpdate) as Promise<void>,
  subscribe: (listener: BridgeListener) => {
    const handler = (_event: Electron.IpcRendererEvent, domainEvent: DomainEvent) => listener(domainEvent);
    ipcRenderer.on(ipcChannels.event, handler);
    return () => ipcRenderer.off(ipcChannels.event, handler);
  },
};

contextBridge.exposeInMainWorld("summonerKit", bridge);
