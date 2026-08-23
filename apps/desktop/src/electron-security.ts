import type { IpcMainInvokeEvent, WebContents } from "electron";

const allowedExternalHosts = new Set([
  "github.com",
  "www.riotgames.com",
]);

export function allowedExternalUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && allowedExternalHosts.has(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function trustedMainFrame(event: IpcMainInvokeEvent, contents: WebContents): boolean {
  return event.sender === contents
    && event.senderFrame === contents.mainFrame
    && event.senderFrame.url === contents.getURL();
}
