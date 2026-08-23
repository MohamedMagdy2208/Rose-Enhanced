import { describe, expect, it } from "vitest";
import { standardChampionIds } from "./collection-service";

describe("standardChampionIds", () => {
  it("excludes virtual game-mode variants from the collection catalog", () => {
    expect(standardChampionIds([
      { id: 103 },
      { id: 60103 },
      { id: 0 },
      { id: 266 },
    ])).toEqual([103, 266]);
  });
});
