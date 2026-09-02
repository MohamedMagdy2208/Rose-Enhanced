import path from "node:path";
import { DESKTOP_LAUNCH_PROTOCOL_SCHEME } from "@summonerkit/contracts";

export const RENDERER_SCHEME = DESKTOP_LAUNCH_PROTOCOL_SCHEME;

export function rendererFilePath(rendererRoot: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== `${RENDERER_SCHEME}:` || url.hostname !== "app" || url.username || url.password || url.port) return null;
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const root = path.resolve(rendererRoot);
    const candidate = path.resolve(root, relativePath);
    const relative = path.relative(root, candidate);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : null;
  } catch {
    return null;
  }
}
