import type { IpcMainInvokeEvent, WebContents } from "electron";

const allowedExternalHosts = new Set([
  "github.com",
  "www.riotgames.com",
]);

export function allowedExternalUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && allowedExternalHosts.has(url.hostname)
      && !url.username && !url.password && !url.port && !url.hash
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function trustedRendererUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return false;
    if (url.protocol === "summonerkit:") return url.hostname === "app" && !url.port;
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export function trustedMainFrame(event: IpcMainInvokeEvent, contents: WebContents): boolean {
  return event.sender === contents
    && event.senderFrame === contents.mainFrame
    && event.senderFrame.url === contents.getURL()
    && trustedRendererUrl(event.senderFrame.url);
}
