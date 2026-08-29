import { createDefaultSettings } from "@summonerkit/core";
import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "./command-router";
import { CompanionStore } from "./companion-store";

describe("CommandRouter automation safety", () => {
  it("disables every automation feature in one persisted update", async () => {
    let persisted = createDefaultSettings("bridge-token-that-is-long-enough-for-tests");
    persisted.automation = {
      riskAcknowledged: true,
      executionMode: "automatic",
      autoAccept: true,
      autoPick: true,
      autoBan: true,
      autoSpells: true,
      autoRunes: true,
    };
    const store = new CompanionStore(persisted);
    const clearPending = vi.fn();
    const update = vi.fn(async (mutator: (settings: typeof persisted) => void) => {
      const next = structuredClone(persisted);
      mutator(next);
      persisted = next;
      return structuredClone(persisted);
    });
    const router = new CommandRouter({
      store,
      settings: { get: () => structuredClone(persisted), update },
      automation: { clearPending },
      collection: {},
      aram: {},
      integrations: {},
      insights: {},
      leagueSession: {},
      presence: {},
      pengu: {},
      clientTabActivation: {},
      remote: {},
      openDesktop: vi.fn(),
      setStartupEnabled: vi.fn(),
      chooseExecutable: vi.fn(async () => null),
      logger: { warn: vi.fn() },
    } as unknown as ConstructorParameters<typeof CommandRouter>[0]);

    const result = await router.dispatch({ type: "automation.disableAll" });

    expect(result).toEqual({ ok: true, message: "All automation features are disabled." });
    expect(update).toHaveBeenCalledTimes(1);
    expect(clearPending).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().automation).toEqual({
      riskAcknowledged: true,
      executionMode: "automatic",
      autoAccept: false,
      autoPick: false,
      autoBan: false,
      autoSpells: false,
      autoRunes: false,
    });
  });
});
