const bridgePort = 17_654;

export function lcuAssetUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `http://127.0.0.1:${bridgePort}/lcu-asset?path=${encodeURIComponent(path)}`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const elapsed = Date.now() - Date.parse(iso);
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatLeaguePatch(version: string | null): string | null {
  if (!version) return null;
  const patch = version.match(/(?:^|\D)(\d{1,3}\.\d{1,3})(?=\D|$)/u)?.[1];
  if (patch) return patch;
  const compact = version.split(/[+\s]/u, 1)[0] ?? version;
  return compact.length <= 16 ? compact : `${compact.slice(0, 15)}…`;
}
