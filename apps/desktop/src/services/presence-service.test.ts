import { EventEmitter } from "node:events";
import { createDefaultSettings } from "@summonerkit/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionStore } from "./companion-store";
import type { LcuClient } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";
import { normalizePresenceAvailability, PresenceService } from "./presence-service";

class FakeLcu extends EventEmitter {
  currentAvailability = "chat";
  connected = true;
  getState = () => ({ capabilities: { presence: true } });
  isConnected = () => this.connected;
  get = vi.fn(async () => ({ availability: this.currentAvailability, puuid: "must-not-leak" }));
  put = vi.fn(async (_endpoint: string, body: { availability: string }) => {
    this.currentAvailability = body.availability;
    return { availability: body.availability };
  });
}

const logger = { debug: vi.fn() } as unknown as AppLogger;
const activeServices: PresenceService[] = [];
afterEach(() => activeServices.splice(0).forEach((service) => service.stop()));

function fixture() {
  const lcu = new FakeLcu();
  const store = new CompanionStore(createDefaultSettings("test-token"));
  const service = new PresenceService(lcu as unknown as LcuClient, store, logger);
  activeServices.push(service);
  service.start();
  return { lcu, store, service };
}

describe("PresenceService", () => {
  it("normalizes only the two presence states SummonerKit promises", () => {
    expect(normalizePresenceAvailability("chat")).toBe("online");
    expect(normalizePresenceAvailability("away")).toBe("away");
    expect(normalizePresenceAvailability("offline")).toBeNull();
    expect(normalizePresenceAvailability("dnd")).toBeNull();
  });

  it("hydrates a minimized state without retaining identity fields", async () => {
    const { lcu, store } = fixture();
    lcu.emit("connected");
    await vi.waitFor(() => expect(store.getSnapshot().presence.status).toBe("ready"));
    expect(store.getSnapshot().presence.availability).toBe("online");
    expect(JSON.stringify(store.getSnapshot().presence)).not.toContain("must-not-leak");
  });

  it("writes Away and requires League to confirm it", async () => {
    const { lcu, store, service } = fixture();
    await service.setAvailability("away");
    expect(lcu.put).toHaveBeenCalledWith("/lol-chat/v1/me", { availability: "away" });
    expect(store.getSnapshot().presence).toMatchObject({ status: "ready", availability: "away", lastError: null });
  });

  it("keeps unknown activity-specific states truthful and resets on disconnect", () => {
    const { lcu, store } = fixture();
    lcu.emit("event", { uri: "/lol-chat/v1/me", eventType: "Update", data: { availability: "dnd" } });
    expect(store.getSnapshot().presence).toMatchObject({ status: "ready", availability: null });
    lcu.emit("disconnected");
    expect(store.getSnapshot().presence).toMatchObject({ status: "unavailable", availability: null });
  });
});
