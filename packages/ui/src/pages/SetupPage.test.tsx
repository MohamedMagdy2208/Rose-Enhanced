import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import { SetupPage } from "./SetupPage";

describe("SetupPage startup preferences", () => {
  it("exposes Windows and League startup controls", () => {
    const snapshot = structuredClone(emptySnapshot);
    snapshot.startup.launchOnWindowsStartup = true;

    const markup = renderToStaticMarkup(
      <SetupPage snapshot={snapshot} onCommand={vi.fn()} onNavigate={vi.fn()} onComplete={vi.fn()} />,
    );

    expect(markup).toContain("Start with Windows");
    expect(markup).toContain("Open when League connects");
    expect(markup).toContain('type="checkbox" checked=""');
  });
});
