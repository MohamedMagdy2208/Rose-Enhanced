import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverLeaguePath, readLcuCredentials } from "./lockfile";

const priorLeaguePath = process.env.SUMMONERKIT_LEAGUE_PATH;

afterEach(() => {
  if (priorLeaguePath === undefined) delete process.env.SUMMONERKIT_LEAGUE_PATH;
  else process.env.SUMMONERKIT_LEAGUE_PATH = priorLeaguePath;
});

describe("discoverLeaguePath", () => {
  it("returns null for an explicitly missing installation", async () => {
    process.env.SUMMONERKIT_LEAGUE_PATH = "Z:\\definitely-missing-league";
    await expect(discoverLeaguePath("Z:\\also-missing-league")).resolves.toBeNull();
  });

  it("normalizes a configured Game folder to its lockfile-owning parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "summonerkit-league-"));
    const game = path.join(root, "Game");
    await mkdir(game);
    await writeFile(path.join(root, "lockfile"), "LeagueClient:1:2:password:https", "utf8");
    process.env.SUMMONERKIT_LEAGUE_PATH = game;
    await expect(discoverLeaguePath(null)).resolves.toBe(root);
    await rm(root, { recursive: true, force: true });
  });

  it("accepts a bounded League lockfile and normalizes its credentials", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "summonerkit-lockfile-"));
    await writeFile(path.join(root, "lockfile"), "LeagueClientUx:1234:51234:password-value:https\n", "utf8");
    await expect(readLcuCredentials(root)).resolves.toMatchObject({ processName: "LeagueClientUx", processId: 1234, port: 51234, password: "password-value", protocol: "https" });
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    "LeagueClientUx:0:51234:password:https",
    "LeagueClientUx:1234:65536:password:https",
    "League Client:1234:51234:password:https",
    "LeagueClientUx:1234:51234:password:http",
  ])("rejects unsafe lockfile data %s", async (contents) => {
    const root = await mkdtemp(path.join(tmpdir(), "summonerkit-invalid-lockfile-"));
    await writeFile(path.join(root, "lockfile"), contents, "utf8");
    await expect(readLcuCredentials(root)).rejects.toThrow(/invalid connection data|invalid numeric fields/u);
    await rm(root, { recursive: true, force: true });
  });
});
