import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverLeaguePath } from "./lockfile";

const priorLeaguePath = process.env.ROSE_ENHANCED_LEAGUE_PATH;

afterEach(() => {
  if (priorLeaguePath === undefined) delete process.env.ROSE_ENHANCED_LEAGUE_PATH;
  else process.env.ROSE_ENHANCED_LEAGUE_PATH = priorLeaguePath;
});

describe("discoverLeaguePath", () => {
  it("returns null for an explicitly missing installation", async () => {
    process.env.ROSE_ENHANCED_LEAGUE_PATH = "Z:\\definitely-missing-league";
    await expect(discoverLeaguePath("Z:\\also-missing-league")).resolves.toBeNull();
  });

  it("normalizes a configured Game folder to its lockfile-owning parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rose-enhanced-league-"));
    const game = path.join(root, "Game");
    await mkdir(game);
    await writeFile(path.join(root, "lockfile"), "LeagueClient:1:2:password:https", "utf8");
    process.env.ROSE_ENHANCED_LEAGUE_PATH = game;
    await expect(discoverLeaguePath(null)).resolves.toBe(root);
    await rm(root, { recursive: true, force: true });
  });
});
