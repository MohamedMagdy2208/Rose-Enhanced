import { PRODUCT_NAME, type RunePreset } from "@summonerkit/contracts";
import type { LcuClient } from "./lcu/lcu-client";

interface RunePage {
  id: number;
  name: string;
}

export class RunePageService {
  constructor(private readonly lcu: LcuClient) {}

  async apply(name: string, preset: RunePreset): Promise<number> {
    if (preset.selectedPerkIds.length !== 9) {
      throw new Error("A complete rune recommendation must contain exactly nine perk selections.");
    }
    const safeName = `${PRODUCT_NAME} · ${name}`.slice(0, 40);
    const pages = await this.lcu.get<RunePage[]>("/lol-perks/v1/pages");
    const existing = pages.find((page) => page.name === safeName);
    const payload = {
      name: safeName,
      primaryStyleId: preset.primaryStyleId,
      subStyleId: preset.subStyleId,
      selectedPerkIds: preset.selectedPerkIds,
      current: true,
    };
    const page = existing
      ? await this.lcu.put<RunePage>(`/lol-perks/v1/pages/${existing.id}`, { ...payload, id: existing.id })
      : await this.lcu.post<RunePage>("/lol-perks/v1/pages", payload);
    await this.lcu.put("/lol-perks/v1/currentpage", page.id);
    return page.id;
  }
}
