import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("offers keyboard-native automation toggles with the next action in their accessible names", () => {
    const snapshot = structuredClone(emptySnapshot);
    snapshot.automation.riskAcknowledged = true;
    snapshot.automation.autoAccept = true;

    const markup = renderToStaticMarkup(
      <DashboardPage snapshot={snapshot} onNavigate={vi.fn()} onCommand={vi.fn()} />,
    );

    expect(markup).toContain('aria-label="Turn Auto Accept off"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Turn Auto Pick on"');
    expect(markup).toContain('aria-pressed="false"');
  });
});
