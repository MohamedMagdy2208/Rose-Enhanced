import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import { AutomationPage } from "./AutomationPage";

describe("AutomationPage", () => {
  it("shows the emergency off action only while automation is enabled", () => {
    const enabled = structuredClone(emptySnapshot);
    enabled.automation.riskAcknowledged = true;
    enabled.automation.autoPick = true;

    const enabledMarkup = renderToStaticMarkup(
      <AutomationPage snapshot={enabled} surface="client" onCommand={vi.fn()} />,
    );
    const disabledMarkup = renderToStaticMarkup(
      <AutomationPage snapshot={emptySnapshot} surface="client" onCommand={vi.fn()} />,
    );

    expect(enabledMarkup).toContain("Disable all");
    expect(disabledMarkup).not.toContain("Disable all");
  });
});
