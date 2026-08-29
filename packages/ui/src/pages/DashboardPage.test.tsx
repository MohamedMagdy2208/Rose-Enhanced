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
    expect(markup).toContain("Stop all");
    expect(markup).toContain("Use your phone as a companion");
    expect(markup).toContain("Set up mobile");
  });

  it("does not navigate to the desktop-only mobile setup from the client tab", () => {
    const snapshot = structuredClone(emptySnapshot);
    const onNavigate = vi.fn();
    const onCommand = vi.fn(async () => undefined);
    const markup = renderToStaticMarkup(
      <DashboardPage snapshot={snapshot} onNavigate={onNavigate} onCommand={onCommand} canConfigureMobile={false} />,
    );

    expect(markup).toContain("Open desktop setup");
    expect(markup).not.toContain("Set up mobile");
  });
});
