import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface LcuCredentials {
  processName: string;
  processId: number;
  port: number;
  password: string;
  protocol: "https";
  lockfilePath: string;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\\\\/g, "\\");
}

async function directoryWithLockfile(candidate: string): Promise<string | null> {
  const normalized = path.resolve(candidate);
  const directories = path.basename(normalized).toLowerCase() === "game"
    ? [normalized, path.dirname(normalized)]
    : [normalized];
  for (const directory of directories) {
    if (await exists(path.join(directory, "lockfile"))) return directory;
  }
  return null;
}

export async function discoverLeaguePath(configuredPath: string | null): Promise<string | null> {
  const explicitPath = process.env.ROSE_ENHANCED_LEAGUE_PATH ?? configuredPath;
  if (explicitPath) {
    return directoryWithLockfile(explicitPath);
  }

  const installsPath = process.env.PROGRAMDATA
    ? path.join(process.env.PROGRAMDATA, "Riot Games", "RiotClientInstalls.json")
    : null;
  const candidates = [
    process.env.PROGRAMDATA
      ? path.join(process.env.PROGRAMDATA, "Riot Games", "Metadata", "league_of_legends.live", "league_of_legends.live.product_settings.yaml")
      : null,
    "C:\\Riot Games\\League of Legends",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Riot Games", "League of Legends") : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  if (installsPath && await exists(installsPath)) {
    try {
      const installs = JSON.parse(await readFile(installsPath, "utf8")) as { associated_client?: Record<string, string> };
      candidates.push(...Object.keys(installs.associated_client ?? {}).filter((candidate) => /league of legends/i.test(candidate)));
    } catch {
      // Corrupt Riot metadata is ignored in favor of the remaining known locations.
    }
  }

  for (const candidate of candidates) {
    if (candidate.endsWith(".yaml") && (await exists(candidate))) {
      const metadata = await readFile(candidate, "utf8");
      const match = metadata.match(/^\s*product_install_full_path\s*:\s*(.+)$/m);
      if (match?.[1]) {
        const resolved = unquote(match[1]);
        const installed = await directoryWithLockfile(resolved);
        if (installed) return installed;
      }
      continue;
    }
    const installed = await directoryWithLockfile(candidate);
    if (installed) return installed;
  }
  return null;
}

export async function readLcuCredentials(configuredPath: string | null): Promise<LcuCredentials | null> {
  const leaguePath = await discoverLeaguePath(configuredPath);
  if (!leaguePath) return null;
  const lockfilePath = path.join(leaguePath, "lockfile");
  const parts = (await readFile(lockfilePath, "utf8")).trim().split(":");
  if (parts.length !== 5) throw new Error("League lockfile has an unexpected format.");
  const [processName, processId, port, password, protocol] = parts;
  if (!processName || !processId || !port || !password || protocol !== "https") {
    throw new Error("League lockfile contains invalid connection data.");
  }
  const parsedProcessId = Number(processId);
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedProcessId) || !Number.isInteger(parsedPort)) {
    throw new Error("League lockfile contains invalid numeric fields.");
  }
  return { processName, processId: parsedProcessId, port: parsedPort, password, protocol, lockfilePath };
}
