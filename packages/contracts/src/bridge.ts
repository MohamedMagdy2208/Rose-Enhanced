import type {
  AutomationProfile,
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
  subscribe(listener: BridgeListener): () => void;
}
