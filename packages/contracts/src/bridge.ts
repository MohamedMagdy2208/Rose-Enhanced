import type {
  AutomationProfile,
  AppUpdateState,
  CompanionSnapshot,
  DiagnosticReport,
  RemotePairingOffer,
} from "./models";
import type { CompanionCommand, DomainEvent } from "./commands";

export interface CommandResult {
  ok: boolean;
  message: string;
}

export type BridgeListener = (event: DomainEvent) => void;

export interface CompanionBridge {
  getSnapshot(): Promise<CompanionSnapshot>;
  dispatch(command: CompanionCommand): Promise<CommandResult>;
  saveProfile(profile: AutomationProfile): Promise<CommandResult>;
  exportDiagnostics(): Promise<DiagnosticReport>;
  createRemotePairing(): Promise<RemotePairingOffer>;
  getUpdateState?(): Promise<AppUpdateState>;
  checkForUpdates?(): Promise<AppUpdateState>;
  restartToUpdate?(): Promise<void>;
  subscribe(listener: BridgeListener): () => void;
}
