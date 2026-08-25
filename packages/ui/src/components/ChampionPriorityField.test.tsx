import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChampionRecord } from "@summonerkit/contracts";
import { ChampionPriorityField } from "./ChampionPriorityField";

const champions: ChampionRecord[] = [
  { id: 103, alias: "Ahri", name: "Ahri", iconPath: null, owned: true, skins: [] },
  { id: 7, alias: "Leblanc", name: "LeBlanc", iconPath: null, owned: true, skins: [] },
];

describe("ChampionPriorityField", () => {
  it("presents the first choice as primary and later choices as ordered backups", () => {
    const markup = renderToStaticMarkup(
      <ChampionPriorityField label="Pick fallback order" action="pick" helper="Primary, then backups." values={[103, 7]} champions={champions} onChange={() => undefined} />,
    );
    expect(markup).toContain("Primary");
    expect(markup).toContain("Backup 1");
    expect(markup).toContain("Search to add backup #3");
    expect(markup).toContain('aria-label="Move Ahri later"');
    expect(markup).toContain('aria-label="Remove LeBlanc"');
  });

  it("explains that an empty plan produces no automated action", () => {
    const markup = renderToStaticMarkup(
      <ChampionPriorityField label="Ban fallback order" action="ban" helper="Primary, then backups." values={[]} champions={champions} onChange={() => undefined} />,
    );
    expect(markup).toContain("No ban plan yet");
    expect(markup).toContain("SummonerKit does nothing when every choice is unavailable");
  });
});
