import type { LcuConnectionState } from "@summonerkit/contracts";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { LcuClient } from "./lcu/lcu-client";

export type ClientUxReloadDisposition = "reload" | "defer" | "next-launch";

export type ClientTabActivationResult =
  | { status: "not-needed" | "reloaded" | "deferred" | "next-launch" | "already-requested"; phase: string }
  | { status: "failed"; phase: string; message: string };

interface PendingClientTabActivation {
  repairAt: string;
  phase: string;
  connection: LcuConnectionState;
}

const SAFE_RELOAD_PHASES = new Set(["none", "lobby"]);

export function clientUxReloadDisposition(connection: LcuConnectionState): ClientUxReloadDisposition {
  if (connection.status === "connected") {
    return SAFE_RELOAD_PHASES.has(connection.phase.trim().toLowerCase()) ? "reload" : "defer";
  }
  return connection.status === "connecting" ? "defer" : "next-launch";
}

export class ClientTabActivationService {
  private attemptedRepairAt: string | null = null;
  private started = false;
  private readonly onLcuState = (): void => {
    void this.activatePending("automatic");
  };

  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.lcu.on("state", this.onLcuState);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.lcu.off("state", this.onLcuState);
  }

  async activatePending(source: "automatic" | "command" = "automatic"): Promise<ClientTabActivationResult> {
    const pending = this.pendingActivation();
    if (!pending) return { status: "not-needed", phase: this.store.getSnapshot().connection.phase };
    if (this.attemptedRepairAt === pending.repairAt) {
      return { status: "already-requested", phase: pending.phase };
    }
    const disposition = clientUxReloadDisposition(pending.connection);
    if (disposition === "defer") return { status: "deferred", phase: pending.phase };
    if (disposition === "next-launch") return this.waitForNextLaunch(pending, source);
    return this.requestLeagueUxReload(pending);
  }

  private pendingActivation(): PendingClientTabActivation | null {
    const snapshot = this.store.getSnapshot();
    const repairAt = snapshot.clientTab.lastRepairAt;
    if (!snapshot.clientTab.restartRequired || !repairAt) return null;
    return { repairAt, phase: snapshot.connection.phase, connection: snapshot.connection };
  }

  private waitForNextLaunch(
    pending: PendingClientTabActivation,
    source: "automatic" | "command",
  ): ClientTabActivationResult {
    const leagueConfirmedClosed = pending.connection.status === "discovering"
      && pending.connection.lastError?.includes("No active League lockfile") === true;
    if (source === "command" || leagueConfirmedClosed) {
      this.attemptedRepairAt = pending.repairAt;
      this.markReloadComplete(pending.repairAt);
    }
    return { status: "next-launch", phase: pending.phase };
  }

  private async requestLeagueUxReload(pending: PendingClientTabActivation): Promise<ClientTabActivationResult> {
    this.attemptedRepairAt = pending.repairAt;
    try {
      await this.lcu.restartLeagueUx();
      this.markReloadComplete(pending.repairAt);
      this.logger.info("Requested League UX reload for client-tab activation", {
        phase: pending.phase,
        repairAt: pending.repairAt,
      });
      return { status: "reloaded", phase: pending.phase };
    } catch (error) {
      return this.reloadFailure(error, pending);
    }
  }

  private reloadFailure(error: unknown, pending: PendingClientTabActivation): ClientTabActivationResult {
    const message = error instanceof Error ? error.message : String(error);
    this.store.update((snapshot) => { snapshot.clientTab.lastError = `Automatic League UI reload failed: ${message}`; });
    this.logger.warn("League UX reload failed after client-tab repair", { phase: pending.phase, error: message });
    return { status: "failed", phase: pending.phase, message: `The integration was repaired, but League's UI could not reload. ${message}` };
  }

  private markReloadComplete(repairAt: string): void {
    this.store.update((snapshot) => {
      if (snapshot.clientTab.lastRepairAt !== repairAt) return;
      snapshot.clientTab.restartRequired = false;
      snapshot.clientTab.lastError = null;
    });
  }
}
