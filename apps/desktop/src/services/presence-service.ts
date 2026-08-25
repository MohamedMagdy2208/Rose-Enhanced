import type { PresenceAvailability } from "@summonerkit/contracts";
import type { CompanionStore } from "./companion-store";
import type { LcuClient, LcuEvent } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";

interface RawPresence {
  availability?: unknown;
}

const lcuAvailability: Record<PresenceAvailability, string> = {
  online: "chat",
  away: "away",
};

export function normalizePresenceAvailability(candidate: unknown): PresenceAvailability | null {
  if (candidate === "chat") return "online";
  if (candidate === "away") return "away";
  return null;
}

export class PresenceService {
  constructor(
    private readonly lcu: LcuClient,
    private readonly store: CompanionStore,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    this.lcu.on("connected", this.onConnected);
    this.lcu.on("disconnected", this.onDisconnected);
    this.lcu.on("event", this.onEvent);
  }

  stop(): void {
    this.lcu.off("connected", this.onConnected);
    this.lcu.off("disconnected", this.onDisconnected);
    this.lcu.off("event", this.onEvent);
  }

  async setAvailability(availability: PresenceAvailability): Promise<void> {
    if (!this.lcu.isConnected()) throw new Error("Connect to League before changing presence.");
    if (!this.lcu.getState().capabilities.presence) {
      throw new Error("Presence controls are unavailable on this League client patch.");
    }
    this.store.update((snapshot) => {
      snapshot.presence = { ...snapshot.presence, status: "loading", lastError: null };
    });
    try {
      await this.lcu.put<RawPresence>("/lol-chat/v1/me", { availability: lcuAvailability[availability] });
      const confirmed = await this.lcu.get<RawPresence>("/lol-chat/v1/me");
      if (normalizePresenceAvailability(confirmed.availability) !== availability) {
        throw new Error("League did not confirm the requested presence state.");
      }
      this.publish(confirmed);
    } catch (error) {
      this.publishError(error);
      throw error;
    }
  }

  async refresh(): Promise<void> {
    if (!this.lcu.isConnected() || !this.lcu.getState().capabilities.presence) {
      this.publishUnavailable();
      return;
    }
    this.store.update((snapshot) => {
      snapshot.presence = { ...snapshot.presence, status: "loading", lastError: null };
    });
    try {
      this.publish(await this.lcu.get<RawPresence>("/lol-chat/v1/me"));
    } catch (error) {
      this.publishError(error);
    }
  }

  private readonly onConnected = (): void => { void this.refresh(); };
  private readonly onDisconnected = (): void => this.publishUnavailable();
  private readonly onEvent = (event: LcuEvent): void => {
    if (event.uri !== "/lol-chat/v1/me") return;
    if (event.eventType === "Delete") this.publishUnavailable();
    else this.publish(event.data as RawPresence);
  };

  private publish(raw: RawPresence): void {
    this.store.update((snapshot) => {
      snapshot.presence = {
        status: "ready",
        availability: normalizePresenceAvailability(raw.availability),
        updatedAt: new Date().toISOString(),
        lastError: null,
      };
    });
  }

  private publishUnavailable(): void {
    this.store.update((snapshot) => {
      snapshot.presence = {
        status: "unavailable",
        availability: null,
        updatedAt: null,
        lastError: "Connect to League to manage presence.",
      };
    });
  }

  private publishError(error: unknown): void {
    this.logger.debug("League presence refresh failed", { error: String(error) });
    this.store.update((snapshot) => {
      snapshot.presence = {
        ...snapshot.presence,
        status: "error",
        lastError: "League presence is temporarily unavailable on this client patch.",
      };
    });
  }
}
