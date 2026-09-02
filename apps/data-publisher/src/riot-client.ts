import type { PlatformRoute, RegionalRoute } from "./models.js";

const regionByPlatform: Record<PlatformRoute, RegionalRoute> = {
  BR1: "AMERICAS", LA1: "AMERICAS", LA2: "AMERICAS", NA1: "AMERICAS", OC1: "AMERICAS",
  EUN1: "EUROPE", EUW1: "EUROPE", RU: "EUROPE", TR1: "EUROPE",
  JP1: "ASIA", KR: "ASIA",
  PH2: "SEA", SG2: "SEA", TH2: "SEA", TW2: "SEA", VN2: "SEA",
};

export function regionalRouteFor(platform: PlatformRoute): RegionalRoute {
  return regionByPlatform[platform];
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class RiotApiClient {
  private nextRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly minimumIntervalMs: number,
  ) {}

  platform<T>(platform: PlatformRoute, path: string): Promise<T> {
    return this.request<T>(`${platform.toLowerCase()}.api.riotgames.com`, path);
  }

  regional<T>(region: RegionalRoute, path: string): Promise<T> {
    return this.request<T>(`${region.toLowerCase()}.api.riotgames.com`, path);
  }

  private async request<T>(host: string, path: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const delay = Math.max(0, this.nextRequestAt - Date.now());
      if (delay > 0) await wait(delay);
      this.nextRequestAt = Date.now() + this.minimumIntervalMs;
      const response = await fetch(`https://${host}${path}`, { headers: { "X-Riot-Token": this.apiKey } });
      if (response.ok) return await response.json() as T;
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 1_000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Riot API request failed with HTTP ${response.status} for ${host}${path}.`);
    }
    throw new Error(`Riot API request exhausted retries for ${host}${path}.`);
  }
}
