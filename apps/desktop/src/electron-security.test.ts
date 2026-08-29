import { describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { allowedExternalUrl, trustedMainFrame, trustedRendererUrl } from "./electron-security";

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

  it.each([
    "summonerkit://app/index.html",
    "http://127.0.0.1:5173/",
    "http://localhost:5173/index.html",
  ])("accepts a renderer URL on %s", (url) => {
    expect(trustedRendererUrl(url)).toBe(true);
  });

  it.each([
    "data:text/html,<script>alert(1)</script>",
    "file:///C:/Windows/System32/calc.exe",
    "https://evil.example/renderer.html",
    "summonerkit://app@evil.example/index.html",
  ])("rejects an untrusted renderer URL %s", (url) => {
    expect(trustedRendererUrl(url)).toBe(false);
  });

  it("accepts only the trusted top-level renderer frame", () => {
    const mainFrame = { url: "summonerkit://app/index.html" };
    const contents = { mainFrame, getURL: () => mainFrame.url } as unknown as WebContents;
    const trustedEvent = { sender: contents, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent;
    const childFrameEvent = { sender: contents, senderFrame: { url: mainFrame.url } } as unknown as IpcMainInvokeEvent;

    expect(trustedMainFrame(trustedEvent, contents)).toBe(true);
    expect(trustedMainFrame(childFrameEvent, contents)).toBe(false);

    const dataFrame = { url: "data:text/html,blocked" };
    const dataContents = { mainFrame: dataFrame, getURL: () => dataFrame.url } as unknown as WebContents;
    const dataEvent = { sender: dataContents, senderFrame: dataFrame } as unknown as IpcMainInvokeEvent;
    expect(trustedMainFrame(dataEvent, dataContents)).toBe(false);
  });
});
