/**
 * Rose Enhanced client-surface bootstrap.
 * Generated with a local bridge token when installed by the desktop app.
 */
(() => {
  "use strict";

  const pluginVersion = "__ROSE_ENHANCED_PLUGIN_VERSION__";
  const protocolVersion = Number("__ROSE_ENHANCED_PROTOCOL_VERSION__");
  const config = Object.freeze({
    port: Number("__ROSE_ENHANCED_PORT__"),
    token: "__ROSE_ENHANCED_TOKEN__",
    pluginVersion,
    protocolVersion,
  });
  const bridgeOrigin = `http://127.0.0.1:${config.port}`;
  const bridgeAuthMessageType = "rose-enhanced.auth";
  const ids = Object.freeze({
    fallbackNavigation: "rose-enhanced-navigation-item",
    overlay: "rose-enhanced-client-overlay",
    roseEntry: "rose-enhanced-settings-entry",
    styles: "rose-enhanced-styles",
  });
  const rosePanelId = "rose-settings-panel";
  const roseNavigationSelector =
    "lol-uikit-navigation-item.menu_item_Golden.Rose";
  const fallbackDelayMs = 4_000;
  const roseEntryMarkup = `
    <span class="rose-enhanced-settings-entry__mark" aria-hidden="true">RE+</span>
    <span class="rose-enhanced-settings-entry__copy">
      <strong>Rose Enhanced</strong>
      <small>Collection, loot, and automation</small>
    </span>
    <span class="rose-enhanced-settings-entry__arrow" aria-hidden="true">›</span>
  `;
  const stylesheet = `
    #${ids.overlay} { position: fixed; inset: 78px 0 0; z-index: 100000; display: grid; grid-template-rows: 46px minmax(0, 1fr); color: #f0e6d2; background: #090b0f; }
    #${ids.overlay} iframe { width: 100%; height: 100%; border: 0; background: #090b0f; }
    #${ids.overlay} .rose-enhanced-content { min-height: 0; }
    #${ids.overlay} .rose-enhanced-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; border-bottom: 1px solid #463714; background: #010a13; }
    #${ids.overlay} .rose-enhanced-identity { display: flex; align-items: center; gap: 8px; color: #a09b8c; font: 700 13px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.08em; text-transform: uppercase; }
    #${ids.overlay} .rose-enhanced-identity__rose { color: #f06a7f; }
    #${ids.overlay} .rose-enhanced-close { min-height: 32px; padding: 0 12px; color: #c8aa6e; background: #1e2328; border: 1px solid #785a28; font: 700 12px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.04em; cursor: pointer; }
    #${ids.overlay} .rose-enhanced-close:hover,
    #${ids.overlay} .rose-enhanced-retry:hover { color: #f0e6d2; border-color: #c89b3c; }
    #${ids.overlay} .rose-enhanced-close:focus-visible,
    #${ids.overlay} .rose-enhanced-retry:focus-visible,
    #${ids.roseEntry}:focus-visible,
    #${ids.fallbackNavigation}:focus-visible { outline: 2px solid #cdfafa; outline-offset: 2px; }
    #${ids.roseEntry} { box-sizing: border-box; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 52px; margin-top: 8px; padding: 8px 12px; color: #f0e6d2; text-align: left; background: #1e2328; border: 1px solid #785a28; cursor: pointer; }
    #${ids.roseEntry}:hover { border-color: #c89b3c; background: #242a30; }
    #${ids.roseEntry} .rose-enhanced-settings-entry__mark { display: grid; place-items: center; width: 38px; height: 32px; color: #f06a7f; border-right: 1px solid #463714; font: 700 13px/1 Georgia, serif; }
    #${ids.roseEntry} .rose-enhanced-settings-entry__copy { display: grid; gap: 2px; }
    #${ids.roseEntry} strong { font: 700 14px/1.1 "Beaufort for LOL", Georgia, serif; }
    #${ids.roseEntry} small { color: #a09b8c; font: 12px/1.2 Arial, sans-serif; }
    #${ids.roseEntry} .rose-enhanced-settings-entry__arrow { color: #c8aa6e; font: 24px/1 Arial, sans-serif; }
    #${ids.fallbackNavigation} { display: grid; place-items: center; min-width: 48px; height: 42px; color: #f06a7f; background: transparent; border: 0; font: 700 13px/1 Georgia, serif; cursor: pointer; }
    #${ids.fallbackNavigation}:hover { color: #f4efe8; }
    #${ids.overlay} .rose-enhanced-connection { box-sizing: border-box; display: grid; place-items: center; width: 100%; height: 100%; padding: 32px; background: radial-gradient(circle at 50% 28%, #14202a 0, #090b0f 48%); }
    #${ids.overlay} .rose-enhanced-connection-card { width: min(520px, 100%); padding: 28px; text-align: center; border: 1px solid #463714; background: #010a13; box-shadow: 0 18px 48px rgb(0 0 0 / 45%); }
    #${ids.overlay} .rose-enhanced-connection-mark { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 18px; color: #f06a7f; border: 1px solid #785a28; font: 700 15px/1 Georgia, serif; }
    #${ids.overlay} .rose-enhanced-connection h1 { margin: 0 0 10px; color: #f0e6d2; font: 700 24px/1.2 "Beaufort for LOL", Georgia, serif; }
    #${ids.overlay} .rose-enhanced-connection p { max-width: 420px; margin: 0 auto 20px; color: #a09b8c; font: 14px/1.55 Arial, sans-serif; }
    #${ids.overlay} .rose-enhanced-retry { min-height: 36px; padding: 0 18px; color: #c8aa6e; background: #1e2328; border: 1px solid #785a28; font: 700 12px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.04em; cursor: pointer; }
    #${ids.overlay} .rose-enhanced-retry:disabled { color: #5b5a56; border-color: #3c3c3c; cursor: wait; }
    @media (max-width: 760px) {
      #${ids.overlay} .rose-enhanced-close { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${ids.roseEntry} small { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      #${ids.overlay} *, #${ids.roseEntry} { scroll-behavior: auto !important; transition: none !important; }
    }
  `;
  let lastFocusedElement = null;

  const findRoseNavigation = () => {
    const navigation = document.querySelector(roseNavigationSelector);
    if (navigation) return navigation;

    return document
      .querySelector(
        'lol-uikit-navigation-item .menu-item-icon[style*="golden_rose.png"]',
      )
      ?.closest("lol-uikit-navigation-item") ?? null;
  };

  const requestRoseSettings = () => {
    const navigation = findRoseNavigation();
    if (!navigation) return;

    window.dispatchEvent(
      new CustomEvent("rose-open-settings", {
        detail: { navItem: navigation },
        bubbles: true,
        cancelable: true,
      }),
    );
    window.setTimeout(() => {
      installRoseEntry();
      document.getElementById(ids.roseEntry)?.focus();
    }, 0);
  };

  const restorePreviousFocus = () => {
    if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
  };

  const removeOverlay = () => {
    document.getElementById(ids.overlay)?.remove();
  };

  const closeOverlay = (afterClose) => {
    removeOverlay();
    afterClose();
  };

  const createIdentity = () => {
    const identity = document.createElement("div");
    identity.className = "rose-enhanced-identity";
    identity.innerHTML = `
      <span class="rose-enhanced-identity__rose">ROSE</span>
      <span aria-hidden="true">/</span>
      <span>Enhanced</span>
    `;
    return identity;
  };

  const createToolbar = (closeLabel, closeAction) => {
    const toolbar = document.createElement("header");
    toolbar.className = "rose-enhanced-toolbar";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "rose-enhanced-close";
    closeButton.setAttribute("aria-label", closeLabel);
    closeButton.textContent = closeLabel;
    closeButton.addEventListener("click", closeAction);
    toolbar.append(createIdentity(), closeButton);
    return { toolbar, closeButton };
  };

  const createClientFrame = () => {
    const frame = document.createElement("iframe");
    frame.title = "Rose Enhanced";
    frame.addEventListener("load", () => {
      frame.contentWindow?.postMessage(
        {
          type: bridgeAuthMessageType,
          token: config.token,
          pluginVersion: config.pluginVersion,
          protocolVersion: config.protocolVersion,
        },
        bridgeOrigin,
      );
    });
    frame.src = `${bridgeOrigin}/client/`;
    frame.referrerPolicy = "no-referrer";
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    return frame;
  };

  const isBridgeUnavailableError = (error) =>
    error instanceof TypeError || error?.name === "AbortError";

  const bridgeIsAvailable = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2_500);

    try {
      await fetch(`${bridgeOrigin}/health`, {
        cache: "no-store",
        credentials: "omit",
        mode: "no-cors",
        signal: controller.signal,
      });
      return true;
    } catch (error) {
      if (isBridgeUnavailableError(error)) return false;
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const createConnectionContent = () => {
    const content = document.createElement("main");
    content.className = "rose-enhanced-content rose-enhanced-connection";
    content.setAttribute("aria-live", "polite");
    content.innerHTML = `
      <section class="rose-enhanced-connection-card">
        <div class="rose-enhanced-connection-mark" aria-hidden="true">RE+</div>
        <h1>Connecting to Rose Enhanced…</h1>
        <p>Checking the desktop companion on this PC.</p>
        <button class="rose-enhanced-retry" type="button" disabled>Connecting…</button>
      </section>
    `;
    return content;
  };

  const showOfflineState = (content, retryButton) => {
    content.querySelector("h1").textContent = "Rose Enhanced isn’t running";
    content.querySelector("p").textContent =
      "Start Rose Enhanced on Windows, then retry. The companion can stay quietly in the system tray.";
    retryButton.disabled = false;
    retryButton.textContent = "Retry connection";
    retryButton.focus();
  };

  const connectClient = async (content) => {
    const retryButton = content.querySelector(".rose-enhanced-retry");
    retryButton.disabled = true;
    retryButton.textContent = "Connecting…";
    content.querySelector("h1").textContent = "Connecting to Rose Enhanced…";
    content.querySelector("p").textContent = "Checking the desktop companion on this PC.";

    if (!(await bridgeIsAvailable())) {
      if (content.isConnected) showOfflineState(content, retryButton);
      return;
    }

    if (!content.isConnected) return;
    content.className = "rose-enhanced-content";
    content.removeAttribute("aria-live");
    content.replaceChildren(createClientFrame());
  };

  const createClientContent = () => {
    const content = createConnectionContent();
    content
      .querySelector(".rose-enhanced-retry")
      .addEventListener("click", () => void connectClient(content));
    return content;
  };

  const createOverlay = (closeAction) => {
    const overlay = document.createElement("section");
    overlay.id = ids.overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Rose Enhanced companion");
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAction();
    });
    return overlay;
  };

  const mountOverlay = (closeLabel, afterClose) => {
    removeOverlay();
    const closeAction = () => closeOverlay(afterClose);
    const overlay = createOverlay(closeAction);
    const { toolbar, closeButton } = createToolbar(closeLabel, closeAction);
    const content = createClientContent();
    overlay.append(toolbar, content);
    document.body.appendChild(overlay);
    closeButton.focus();
    void connectClient(content);
  };

  const openRoseOverlay = (triggerElement) => {
    lastFocusedElement = triggerElement;
    document.getElementById(rosePanelId)?.remove();
    mountOverlay("Back to Rose settings", requestRoseSettings);
  };

  const openStandaloneOverlay = (triggerElement) => {
    lastFocusedElement = triggerElement;
    mountOverlay("Close Rose Enhanced", restorePreviousFocus);
  };

  const createRoseEntryButton = () => {
    const button = document.createElement("button");
    button.id = ids.roseEntry;
    button.type = "button";
    button.className = "rose-enhanced-settings-entry";
    button.setAttribute("aria-label", "Open Rose Enhanced in the League client");
    button.innerHTML = roseEntryMarkup;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openRoseOverlay(button);
    });
    return button;
  };

  const insertRoseEntry = (panel, button) => {
    const anchor =
      panel.querySelector("#pengu-ui-button") ??
      panel.querySelector("#save-button");
    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(button, anchor);
      return;
    }
    panel.querySelector("lc-flyout-content")?.appendChild(button);
  };

  function installRoseEntry() {
    const panel = document.getElementById(rosePanelId);
    if (!panel || document.getElementById(ids.roseEntry)) return false;
    const button = createRoseEntryButton();
    insertRoseEntry(panel, button);
    return button.isConnected;
  }

  const removeFallbackNavigation = () => {
    document.getElementById(ids.fallbackNavigation)?.remove();
  };

  const createFallbackButton = () => {
    const button = document.createElement("button");
    button.id = ids.fallbackNavigation;
    button.type = "button";
    button.title = "Rose Enhanced";
    button.setAttribute("aria-label", "Open Rose Enhanced");
    button.textContent = "RE+";
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        openStandaloneOverlay(button);
      },
      true,
    );
    return button;
  };

  const installFallbackNavigation = () => {
    if (findRoseNavigation()) {
      removeFallbackNavigation();
      return false;
    }
    if (document.getElementById(ids.fallbackNavigation)) return true;
    const navigation = document.querySelector(".right-nav-menu, .main-nav-bar");
    if (!navigation) return false;
    navigation.prepend(createFallbackButton());
    return true;
  };

  const installStyles = () => {
    if (document.getElementById(ids.styles)) return;
    const style = document.createElement("style");
    style.id = ids.styles;
    style.textContent = stylesheet;
    document.head.appendChild(style);
  };

  const synchronizeIntegration = () => {
    installStyles();
    if (!findRoseNavigation()) return;
    removeFallbackNavigation();
    installRoseEntry();
  };

  const start = () => {
    synchronizeIntegration();
    const observer = new MutationObserver(synchronizeIntegration);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("rose-open-settings", () => {
      window.setTimeout(installRoseEntry, 0);
    });
    window.setTimeout(() => {
      synchronizeIntegration();
      installFallbackNavigation();
    }, fallbackDelayMs);
  };

  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
