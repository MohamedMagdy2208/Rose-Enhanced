import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { nextEnabledTabIndex, SegmentedTabs } from "./SegmentedTabs";

describe("SegmentedTabs", () => {
  const options = [
    { value: "all", label: "All" },
    { value: "owned", label: "Owned", disabled: true },
    { value: "loot", label: "In loot" },
  ] as const;

  it("renders a radio group with a roving tab stop", () => {
    const markup = renderToStaticMarkup(
      <SegmentedTabs value="all" options={[...options]} onChange={vi.fn()} label="Filter skins" />,
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Filter skins"');
    expect(markup).toContain('role="radio"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("wraps arrow navigation and skips disabled options", () => {
    expect(nextEnabledTabIndex([...options], 0, "ArrowRight")).toBe(2);
    expect(nextEnabledTabIndex([...options], 2, "ArrowRight")).toBe(0);
    expect(nextEnabledTabIndex([...options], 0, "End")).toBe(2);
    expect(nextEnabledTabIndex([...options], 2, "Home")).toBe(0);
  });
});
