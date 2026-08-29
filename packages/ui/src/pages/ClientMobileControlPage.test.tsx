import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import { ClientMobileControlPage } from "./ClientMobileControlPage";

describe("ClientMobileControlPage", () => {
  it("shows mobile status in the client without exposing pairing controls", () => {
    const snapshot = structuredClone(emptySnapshot);
    const markup = renderToStaticMarkup(
      <ClientMobileControlPage snapshot={snapshot} onCommand={vi.fn(async () => undefined)} />,
    );

    expect(markup).toContain("Your phone, alongside the League client.");
    expect(markup).toContain("Desktop setup required");
    expect(markup).toContain("Open desktop app");
    expect(markup).toContain("No phone is paired yet");
    expect(markup).not.toContain("Create pairing code");
    expect(markup).not.toContain("Relay administrator secret");
  });
});
