import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../bridge/empty-snapshot";
import { MobileControlPage } from "./MobileControlPage";

describe("MobileControlPage", () => {
  it("renders the setup state without requiring a configured relay", () => {
    const snapshot = structuredClone(emptySnapshot);
    const markup = renderToStaticMarkup(
      <MobileControlPage
        snapshot={snapshot}
        bridge={{} as never}
        onCommand={vi.fn(async () => undefined)}
      />,
    );

    expect(markup).toContain("Configure the relay deployment");
    expect(markup).toContain("Relay configuration required");
  });
});
