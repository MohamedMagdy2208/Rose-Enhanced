import { EventEmitter } from "node:events";
import { createDefaultSettings } from "@rose-enhanced/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionStore } from "./companion-store";
import { LeagueSessionService } from "./league-session-service";
import type { LcuClient } from "./lcu/lcu-client";

class FakeLcu extends EventEmitter {
  phase = "Lobby";
  patch = vi.fn(async () => undefined);
  post = vi.fn(async () => undefined);
  put = vi.fn(async () => undefined);
  delete = vi.fn(async () => undefined);
  getState = () => ({ phase: this.phase });
  isConnected = () => true;
  get = vi.fn(async (endpoint: string) => {
    if (endpoint === "/lol-matchmaking/v1/ready-check") return null;
    if (endpoint === "/lol-lobby/v2/lobby") return { gameConfig: { queueId: 420 } };
    if (endpoint.endsWith("search-state")) return "NotSearching";
    if (endpoint === "/lol-champ-select/v1/session") return null;
    if (endpoint.includes("pickable")) return [103, 238];
    if (endpoint.includes("bannable")) return [103, 238];
    if (endpoint.endsWith("summoner-spells.json")) return [{ id: 4, name: "Flash" }, { id: 14, name: "Ignite" }];
    if (endpoint === "/lol-perks/v1/pages") return [{ id: 7, name: "Rose Enhanced · Mid", current: true }];
    return null;
  });
}

const activeServices: LeagueSessionService[] = [];
afterEach(() => activeServices.splice(0).forEach((service) => service.stop()));

async function fixture() {
  const lcu = new FakeLcu();
  const store = new CompanionStore(createDefaultSettings("test-token"));
  const service = new LeagueSessionService(lcu as unknown as LcuClient, store);
  activeServices.push(service);
  service.start();
  lcu.emit("connected");
  await vi.waitFor(() => expect(store.getSnapshot().session.queue.canStart).toBe(true));
  return { lcu, service, store };
}

function champSelectEvent(type: "pick" | "ban" = "pick") {
  return {
    uri: "/lol-champ-select/v1/session",
    eventType: "Create",
    data: {
      id: "session-1",
      localPlayerCellId: 1,
      actions: [[{ id: 9, actorCellId: 1, championId: 0, completed: false, isInProgress: true, type }]],
      myTeam: [
        { cellId: 1, assignedPosition: "MIDDLE", spell1Id: 4, spell2Id: 14 },
        { cellId: 2, championPickIntent: 103, summonerId: 123456, puuid: "must-not-leak" },
      ],
      theirTeam: [{ cellId: 6, championId: 238 }],
      timer: { phase: "PLANNING", adjustedTimeLeftInPhase: 25_000 },
      bans: { myTeamBans: [22], theirTeamBans: [55] },
    },
  };
}

describe("LeagueSessionService", () => {
  it("normalizes lobby and champion-select state without player identity fields", async () => {
    const { lcu, store } = await fixture();
    lcu.emit("event", champSelectEvent());
    await vi.waitFor(() => expect(store.getSnapshot().session.championSelect.pickableChampionIds).toEqual([103, 238]));
    const state = store.getSnapshot().session;
    expect(state.queue.activity).toBe("champ-select");
    expect(state.championSelect.localAction).toMatchObject({ id: 9, type: "pick", inProgress: true });
    expect(state.championSelect.timerRemainingMs).toBe(25_000);
    expect(JSON.stringify(state)).not.toContain("must-not-leak");
    expect(JSON.stringify(state)).not.toContain("123456");
  });

  it("starts only the existing lobby queue", async () => {
    const { lcu, service } = await fixture();
    await service.executeManual({ type: "queue.start" });
    expect(lcu.post).toHaveBeenCalledWith("/lol-lobby/v2/lobby/matchmaking/search");
  });

  it("rejects an allied intent ban and locks another available champion", async () => {
    const { lcu, service, store } = await fixture();
    lcu.emit("event", champSelectEvent("ban"));
    await vi.waitFor(() => expect(store.getSnapshot().session.championSelect.bannableChampionIds).toContain(238));
    await expect(service.executeManual({ type: "champSelect.lock", championId: 103 })).rejects.toThrow("allied champion intent");
    await service.executeManual({ type: "champSelect.lock", championId: 238 });
    expect(lcu.patch).toHaveBeenCalledWith("/lol-champ-select/v1/session/actions/9", { championId: 238, completed: true });
  });

  it("validates and applies spells and an existing rune page", async () => {
    const { lcu, service, store } = await fixture();
    lcu.emit("event", champSelectEvent());
    await vi.waitFor(() => expect(store.getSnapshot().session.summonerSpells).toHaveLength(2));
    await expect(service.executeManual({ type: "champSelect.setSpells", spell1Id: 4, spell2Id: 4 })).rejects.toThrow("different");
    await service.executeManual({ type: "champSelect.setSpells", spell1Id: 4, spell2Id: 14 });
    await service.executeManual({ type: "champSelect.setRunePage", pageId: 7 });
    expect(lcu.patch).toHaveBeenCalledWith("/lol-champ-select/v1/session/my-selection", { spell1Id: 4, spell2Id: 14 });
    expect(lcu.put).toHaveBeenCalledWith("/lol-perks/v1/currentpage", 7);
  });
});
