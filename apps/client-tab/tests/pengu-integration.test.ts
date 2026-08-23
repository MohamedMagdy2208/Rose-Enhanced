import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_TAB_PLUGIN_VERSION } from "@rose-enhanced/contracts";

const templateUrl = new URL("../pengu/index.template.js", import.meta.url);
const openWindows: Window[] = [];
const testBridgeToken = "test-bridge-token-with-at-least-thirty-two-characters";

async function loadBootstrap(window: Window, bridgeAvailable = true): Promise<void> {
  window.fetch = vi.fn(async () => {
    if (!bridgeAvailable) throw new window.TypeError("Bridge unavailable");
    return new window.Response(null, { status: 200 });
  }) as typeof window.fetch;
  const template = await readFile(templateUrl, "utf8");
  const executableSource = template
    .replaceAll("__ROSE_ENHANCED_TOKEN__", testBridgeToken)
    .replaceAll("__ROSE_ENHANCED_PORT__", "17654")
    .replaceAll("__ROSE_ENHANCED_NAV_ICON__", "data:image/png;base64,dGVzdA==")
    .replaceAll("__ROSE_ENHANCED_PLUGIN_VERSION__", CLIENT_TAB_PLUGIN_VERSION)
    .replaceAll("__ROSE_ENHANCED_PROTOCOL_VERSION__", "4");
  window.eval(executableSource);
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function createWindow(): Window {
  const window = new Window({ url: "http://127.0.0.1/" });
  openWindows.push(window);
  return window;
}

function installRoseSettingsFixture(window: Window): HTMLElement {
  const roseNavigation = window.document.createElement(
    "lol-uikit-navigation-item",
  );
  roseNavigation.className = "main-navigation-menu-item menu_item_Golden Rose";
  window.document.querySelector(".right-nav-menu")?.appendChild(roseNavigation);

  window.addEventListener("rose-open-settings", () => {
    const existingPanel = window.document.getElementById("rose-settings-panel");
    if (existingPanel) {
      existingPanel.remove();
      return;
    }
    const panel = window.document.createElement("section");
    panel.id = "rose-settings-panel";
    panel.innerHTML = `<div><button id="save-button">Save</button><button id="pengu-ui-button">Open Pengu Loader UI</button></div>`;
    window.document.body.appendChild(panel);
  });
  return roseNavigation;
}

afterEach(async () => {
  await Promise.all(openWindows.splice(0).map((window) => window.happyDOM.close()));
});

describe("Pengu client-surface integration", () => {
  it("keeps Rose's settings entry and a separate League navigation icon", async () => {
    const window = createWindow();
    window.document.body.innerHTML = '<nav class="right-nav-menu"></nav>';
    const roseNavigation = installRoseSettingsFixture(window);
    await loadBootstrap(window);

    window.dispatchEvent(
      new window.CustomEvent("rose-open-settings", {
        detail: { navItem: roseNavigation },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const entry = window.document.getElementById("rose-enhanced-settings-entry");
    const navigation = window.document.getElementById(
      "rose-enhanced-navigation-item",
    );

    expect(entry?.textContent).toContain("Rose Enhanced");
    expect(roseNavigation.nextElementSibling).toBe(navigation);
    expect(navigation?.getAttribute("role")).toBe("button");
    expect(navigation?.getAttribute("aria-label")).toBe("Open Rose Enhanced");
    expect(
      navigation?.querySelector<HTMLElement>(".rose-enhanced-navigation__icon")
        ?.style.backgroundImage,
    ).toContain("data:image/png;base64,dGVzdA==");
    entry?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlay = window.document.getElementById("rose-enhanced-client-overlay");
    const frame = overlay?.querySelector<HTMLIFrameElement>("iframe");

    expect(overlay).not.toBeNull();
    expect(frame?.src).toBe("http://127.0.0.1:17654/client/");
    expect(frame?.src).not.toContain("token=");
    expect(frame?.sandbox.contains("allow-scripts")).toBe(true);
    expect(frame?.sandbox.contains("allow-same-origin")).toBe(true);
    expect(frame?.sandbox.contains("allow-popups")).toBe(false);

    const postMessage = vi
      .spyOn(frame!.contentWindow!, "postMessage")
      .mockImplementation(() => undefined);
    frame?.dispatchEvent(new window.Event("load"));
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "rose-enhanced.auth",
        token: testBridgeToken,
        pluginVersion: CLIENT_TAB_PLUGIN_VERSION,
        protocolVersion: 4,
      },
      "http://127.0.0.1:17654",
    );

    overlay?.querySelector<HTMLButtonElement>(".rose-enhanced-close")?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(window.document.getElementById("rose-settings-panel")).not.toBeNull();
    expect(window.document.activeElement?.id).toBe("rose-enhanced-settings-entry");

    navigation?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(navigation?.getAttribute("aria-expanded")).toBe("true");
    expect(
      window.document
        .getElementById("rose-enhanced-client-overlay")
        ?.querySelector(".rose-enhanced-close")?.textContent,
    ).toBe("Close Rose Enhanced");
    window.document
      .querySelector<HTMLButtonElement>(".rose-enhanced-close")
      ?.click();
    expect(navigation?.getAttribute("aria-expanded")).toBe("false");
    expect(window.document.activeElement).toBe(navigation);
  });

  it("opens the navigation icon from the keyboard when Rose is absent", async () => {
    const window = createWindow();
    window.document.body.innerHTML = '<nav class="right-nav-menu"></nav>';
    await loadBootstrap(window);
    const navigation = window.document.querySelector<HTMLElement>(
      "#rose-enhanced-navigation-item",
    );

    expect(navigation?.getAttribute("role")).toBe("button");
    expect(navigation?.getAttribute("aria-haspopup")).toBe("dialog");
    navigation?.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const overlay = window.document.getElementById("rose-enhanced-client-overlay");
    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect(overlay?.querySelector("iframe")?.getAttribute("referrerpolicy")).toBe(
      "no-referrer",
    );

    overlay?.querySelector<HTMLButtonElement>(".rose-enhanced-close")?.click();
    expect(window.document.getElementById("rose-enhanced-client-overlay")).toBeNull();
    expect(window.document.activeElement).toBe(navigation);
  });

  // Regression: the 2026-08-23 stopped-host incident rendered Chromium's raw error page.
  it("shows a retryable in-client status when the desktop companion is stopped", async () => {
    const window = createWindow();
    window.document.body.innerHTML = '<nav class="right-nav-menu"></nav>';
    await loadBootstrap(window, false);

    window.document
      .querySelector<HTMLButtonElement>("#rose-enhanced-navigation-item")
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const overlay = window.document.getElementById("rose-enhanced-client-overlay");
    const retry = overlay?.querySelector<HTMLButtonElement>(".rose-enhanced-retry");
    expect(overlay?.querySelector("h1")?.textContent).toBe(
      "Rose Enhanced isn’t running",
    );
    expect(retry?.disabled).toBe(false);
    expect(retry?.textContent).toBe("Retry connection");
    expect(overlay?.querySelector("iframe")).toBeNull();
    expect(overlay?.textContent).not.toContain(testBridgeToken);

    vi.mocked(window.fetch).mockResolvedValueOnce(
      new window.Response(null, { status: 200 }),
    );
    retry?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(overlay?.querySelector("iframe")?.src).toBe(
      "http://127.0.0.1:17654/client/",
    );
  });
});
