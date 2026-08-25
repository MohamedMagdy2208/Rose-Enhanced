import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { allowedExternalUrl, trustedMainFrame } from "./electron-security";

describe("Electron security policy", () => {
  it.each([
    "https://github.com/Alban1911/Rose",
    "https://www.riotgames.com/en/terms-of-service",
  ])("allows the documented external destination %s", (url) => {
    expect(allowedExternalUrl(url)).toBe(url);
  });

  it.each([
    "http://github.com/Alban1911/Rose",
    "https://github.com.evil.example/phish",
    "file:///C:/Windows/System32/calc.exe",
    "not a URL",
  ])("rejects unsafe external destination %s", (url) => {
    expect(allowedExternalUrl(url)).toBeNull();
  });

  it("accepts only the trusted top-level renderer frame", () => {
    const mainFrame = { url: "summonerkit://app/index.html" };
    const contents = { mainFrame, getURL: () => mainFrame.url } as unknown as WebContents;
    const trustedEvent = { sender: contents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent;
    const childFrameEvent = { sender: contents, senderFrame: { url: mainFrame.url } } as unknown as IpcMainInvokeEvent;

    expect(trustedMainFrame(trustedEvent, contents)).toBe(true);
    expect(trustedMainFrame(childFrameEvent, contents)).toBe(false);
  });
});
