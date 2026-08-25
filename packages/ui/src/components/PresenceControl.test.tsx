import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PresenceState } from "@summonerkit/contracts";
import { PresenceControl, presencePresentation } from "./PresenceControl";

const presence = (overrides: Partial<PresenceState> = {}): PresenceState => ({
  status: "ready",
  availability: "online",
  updatedAt: "2026-08-24T00:00:00.000Z",
  lastError: null,
  ...overrides,
});

describe("PresenceControl", () => {
  it("exposes keyboard-native pressed buttons and truthful offline copy", () => {
    const markup = renderToStaticMarkup(<PresenceControl presence={presence()} writable onCommand={vi.fn()} />);
    expect(markup).toContain('aria-label="Choose League presence"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("True Offline is not simulated");
  });

  it("explains activity-specific League states without labeling them offline", () => {
    expect(presencePresentation(presence({ availability: null }))).toMatchObject({
      label: "League managed",
      tone: "neutral",
    });
  });

  it("disables writes while the capability is unavailable", () => {
    const markup = renderToStaticMarkup(<PresenceControl presence={presence({ status: "unavailable", availability: null })} writable={false} onCommand={vi.fn()} />);
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});
