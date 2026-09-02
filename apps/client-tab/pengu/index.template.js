/**
 * SummonerKit client-surface bootstrap.
 * Generated with a local bridge token when installed by the desktop app.
 */
(() => {
  "use strict";

  const pluginVersion = "__SUMMONERKIT_PLUGIN_VERSION__";
  const protocolVersion = Number("__SUMMONERKIT_PROTOCOL_VERSION__");
  const config = Object.freeze({
    port: Number("__SUMMONERKIT_PORT__"),
    token: "__SUMMONERKIT_TOKEN__",
    navigationIcon: "__SUMMONERKIT_NAV_ICON__",
    pluginVersion,
    protocolVersion,
    desktopLaunchUrl: "__SUMMONERKIT_DESKTOP_LAUNCH_URL__",
  });
  const bridgeOrigin = `http://127.0.0.1:${config.port}`;
  const bridgeAuthMessageType = "summonerkit.auth";
  const ids = Object.freeze({
    navigation: "summonerkit-navigation-item",
    navigationSeparator: "summonerkit-navigation-separator",
    overlay: "summonerkit-client-overlay",
    roseEntry: "summonerkit-settings-entry",
    styles: "summonerkit-styles",
  });
  const rosePanelId = "rose-settings-panel";
  const roseNavigationSelector =
    "lol-uikit-navigation-item.menu_item_Golden.Rose";
  const roseEntryMarkup = `
    <span class="summonerkit-settings-entry__mark" aria-hidden="true"><img src="${config.navigationIcon}" alt=""></span>
    <span class="summonerkit-settings-entry__copy">
      <strong>SummonerKit</strong>
      <small>Collection, loot, and automation</small>
    </span>
    <span class="summonerkit-settings-entry__arrow" aria-hidden="true">›</span>
  `;
  const stylesheet = `
    #${ids.overlay} { position: fixed; inset: 78px 0 0; z-index: 100000; display: grid; grid-template-rows: 46px minmax(0, 1fr); color: #f0e6d2; background: #090b0f; }
    #${ids.overlay} iframe { width: 100%; height: 100%; border: 0; background: #090b0f; }
    #${ids.overlay} .summonerkit-content { min-height: 0; }
    #${ids.overlay} .summonerkit-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; border-bottom: 1px solid #463714; background: #010a13; }
    #${ids.overlay} .summonerkit-identity { display: flex; align-items: center; gap: 8px; color: #a09b8c; font: 700 13px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.08em; text-transform: uppercase; }
    #${ids.overlay} .summonerkit-identity__icon { width: 20px; height: 20px; object-fit: contain; }
    #${ids.overlay} .summonerkit-identity__accent { color: #f06a7f; }
    #${ids.overlay} .summonerkit-close { min-height: 32px; padding: 0 12px; color: #c8aa6e; background: #1e2328; border: 1px solid #785a28; font: 700 12px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.04em; cursor: pointer; }
    #${ids.overlay} .summonerkit-close:hover,
    #${ids.overlay} .summonerkit-retry:hover { color: #f0e6d2; border-color: #c89b3c; }
    #${ids.overlay} .summonerkit-close:focus-visible,
    #${ids.overlay} .summonerkit-retry:focus-visible,
    #${ids.roseEntry}:focus-visible,
    #${ids.navigation}:focus-visible { outline: 2px solid #cdfafa; outline-offset: -3px; }
    #${ids.roseEntry} { box-sizing: border-box; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 52px; margin-top: 8px; padding: 8px 12px; color: #f0e6d2; text-align: left; background: #1e2328; border: 1px solid #785a28; cursor: pointer; }
    #${ids.roseEntry}:hover { border-color: #c89b3c; background: #242a30; }
    #${ids.roseEntry} .summonerkit-settings-entry__mark { display: grid; place-items: center; width: 38px; height: 32px; border-right: 1px solid #463714; }
    #${ids.roseEntry} .summonerkit-settings-entry__mark img { width: 30px; height: 30px; object-fit: contain; }
    #${ids.roseEntry} .summonerkit-settings-entry__copy { display: grid; gap: 2px; }
    #${ids.roseEntry} strong { font: 700 14px/1.1 "Beaufort for LOL", Georgia, serif; }
    #${ids.roseEntry} small { color: #a09b8c; font: 12px/1.2 Arial, sans-serif; }
    #${ids.roseEntry} .summonerkit-settings-entry__arrow { color: #c8aa6e; font: 24px/1 Arial, sans-serif; }
    #${ids.navigation} { position: relative; display: grid; place-items: center; min-width: 64px; height: 78px; cursor: pointer; }
    #${ids.navigation} .summonerkit-navigation__wrapper { position: relative; display: grid; place-items: center; width: 100%; height: 100%; }
    #${ids.navigation} .summonerkit-navigation__glow { position: absolute; inset: 8px 7px; opacity: 0; background: radial-gradient(circle, rgb(240 106 127 / 28%) 0, transparent 68%); transition: opacity 140ms ease; }
    #${ids.navigation} .summonerkit-navigation__icon { width: 36px; height: 36px; background-color: transparent !important; background-position: center; background-repeat: no-repeat; background-size: contain; filter: saturate(.9) brightness(.92); transition: filter 140ms ease, transform 140ms ease; }
    #${ids.navigation}:hover .summonerkit-navigation__glow,
    #${ids.navigation}[aria-expanded="true"] .summonerkit-navigation__glow { opacity: 1; }
    #${ids.navigation}:hover .summonerkit-navigation__icon,
    #${ids.navigation}[aria-expanded="true"] .summonerkit-navigation__icon { filter: saturate(1.08) brightness(1.1); transform: translateY(-1px); }
    #${ids.navigation}[aria-expanded="true"]::after { position: absolute; right: 9px; bottom: 0; left: 9px; height: 2px; content: ""; background: #c89b3c; box-shadow: 0 0 8px rgb(200 155 60 / 70%); }
    #${ids.overlay} .summonerkit-connection { box-sizing: border-box; display: grid; place-items: center; width: 100%; height: 100%; padding: 32px; background: radial-gradient(circle at 50% 28%, #14202a 0, #090b0f 48%); }
    #${ids.overlay} .summonerkit-connection-card { width: min(520px, 100%); padding: 28px; text-align: center; border: 1px solid #463714; background: #010a13; box-shadow: 0 18px 48px rgb(0 0 0 / 45%); }
    #${ids.overlay} .summonerkit-connection-mark { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 18px; border: 1px solid #785a28; }
    #${ids.overlay} .summonerkit-connection-mark img { width: 100%; height: 100%; object-fit: contain; }
    #${ids.overlay} .summonerkit-connection h1 { margin: 0 0 10px; color: #f0e6d2; font: 700 24px/1.2 "Beaufort for LOL", Georgia, serif; }
    #${ids.overlay} .summonerkit-connection p { max-width: 420px; margin: 0 auto 20px; color: #a09b8c; font: 14px/1.55 Arial, sans-serif; }
    #${ids.overlay} .summonerkit-retry { min-height: 36px; padding: 0 18px; color: #c8aa6e; background: #1e2328; border: 1px solid #785a28; font: 700 12px/1 "Beaufort for LOL", Georgia, serif; letter-spacing: 0.04em; cursor: pointer; }
    #${ids.overlay} .summonerkit-retry:disabled { color: #5b5a56; border-color: #3c3c3c; cursor: wait; }
    @media (max-width: 760px) {
      #${ids.overlay} .summonerkit-close { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${ids.roseEntry} small { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      #${ids.overlay} *, #${ids.roseEntry}, #${ids.navigation} * { scroll-behavior: auto !important; transition: none !important; }
    }
  `;
  let lastFocusedElement = null;
  let connectionRetryTimer = null;
  let connectionRetryAttempt = 0;
  let desktopLaunchDeadline = 0;
  const desktopLaunchTimeout = 15_000;
  const connectionRetryDelays = Object.freeze([1_000, 2_000, 4_000, 8_000, 15_000]);

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

  const setNavigationActive = (active) => {
    document
      .getElementById(ids.navigation)
      ?.setAttribute("aria-expanded", String(active));
  };

  const clearConnectionRetry = () => {
    if (connectionRetryTimer !== null) window.clearTimeout(connectionRetryTimer);
    connectionRetryTimer = null;
  };

  const removeOverlay = () => {
    clearConnectionRetry();
    connectionRetryAttempt = 0;
    desktopLaunchDeadline = 0;
    document.getElementById(ids.overlay)?.remove();
    setNavigationActive(false);
  };

  const closeOverlayForLeagueChrome = (event) => {
    const overlay = document.getElementById(ids.overlay);
    const target = event.target;
    if (!overlay || !(target instanceof Node)) return;
    if (overlay.contains(target) || document.getElementById(ids.navigation)?.contains(target)) return;
    removeOverlay();
  };

  const closeOverlay = (afterClose) => {
    removeOverlay();
    afterClose();
  };

  const createIdentity = () => {
    const identity = document.createElement("div");
    identity.className = "summonerkit-identity";
    identity.innerHTML = `
      <img class="summonerkit-identity__icon" src="${config.navigationIcon}" alt="">
      <span class="summonerkit-identity__accent">SUMMONERKIT</span>
      <span aria-hidden="true">·</span>
      <span>BY MOHAMED MAGDY</span>
    `;
    return identity;
  };

  const createToolbar = (closeLabel, closeAction) => {
    const toolbar = document.createElement("header");
    toolbar.className = "summonerkit-toolbar";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "summonerkit-close";
    closeButton.setAttribute("aria-label", closeLabel);
    closeButton.textContent = closeLabel;
    closeButton.addEventListener("click", closeAction);
    toolbar.append(createIdentity(), closeButton);
    return { toolbar, closeButton };
  };

  const createClientFrame = () => {
    const frame = document.createElement("iframe");
    frame.title = "SummonerKit";
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
    content.className = "summonerkit-content summonerkit-connection";
    content.setAttribute("aria-live", "polite");
    content.innerHTML = `
      <section class="summonerkit-connection-card">
        <div class="summonerkit-connection-mark" aria-hidden="true"><img src="${config.navigationIcon}" alt=""></div>
        <h1>Connecting to SummonerKit…</h1>
        <p>Checking the desktop companion on this PC.</p>
        <button class="summonerkit-retry" type="button" disabled>Connecting…</button>
      </section>
    `;
    return content;
  };

  const showOfflineState = (content, retryButton) => {
    content.querySelector("h1").textContent = "Windows engine is stopped";
    content.querySelector("p").textContent =
      "Start and reconnect opens the SummonerKit desktop app, then reconnects this tab.";
    retryButton.disabled = false;
    retryButton.textContent = "Start & reconnect";
  };

  const showLaunchFailureState = (content, retryButton) => {
    content.querySelector("h1").textContent = "Windows did not start SummonerKit";
    content.querySelector("p").textContent =
      "Windows blocked the app link or the desktop app could not start. Try again and allow SummonerKit if Windows asks.";
    retryButton.disabled = false;
    retryButton.textContent = "Try start again";
  };

  const requestDesktopLaunch = () => {
    // External protocols are blocked from hidden frames by Chromium. A direct
    // new-window request made inside the user's button click preserves the
    // required user activation while keeping League's own page in place.
    window.open(config.desktopLaunchUrl, "_blank", "noopener,noreferrer");
  };

  const startDesktopAndConnect = (content) => {
    clearConnectionRetry();
    connectionRetryAttempt = 0;
    desktopLaunchDeadline = Date.now() + desktopLaunchTimeout;
    const retryButton = content.querySelector(".summonerkit-retry");
    retryButton.disabled = true;
    retryButton.textContent = "Starting…";
    content.querySelector("h1").textContent = "Starting SummonerKit…";
    content.querySelector("p").textContent =
      "Asking Windows to start the companion, then checking the local connection.";
    requestDesktopLaunch();
    connectionRetryTimer = window.setTimeout(() => {
      connectionRetryTimer = null;
      if (content.isConnected) void connectClient(content);
    }, 750);
  };

  const scheduleConnectionRetry = (content) => {
    clearConnectionRetry();
    if (!content.isConnected) return;
    const delay = connectionRetryDelays[
      Math.min(connectionRetryAttempt, connectionRetryDelays.length - 1)
    ];
    connectionRetryAttempt += 1;
    connectionRetryTimer = window.setTimeout(() => {
      connectionRetryTimer = null;
      if (content.isConnected) void connectClient(content);
    }, delay);
  };

  const connectClient = async (content) => {
    if (!content.isConnected || content.dataset.connecting === "true") return;
    content.dataset.connecting = "true";
    clearConnectionRetry();
    const retryButton = content.querySelector(".summonerkit-retry");
    retryButton.disabled = true;
    retryButton.textContent = "Connecting…";
    content.querySelector("h1").textContent = "Connecting to SummonerKit…";
    content.querySelector("p").textContent = "Checking the desktop companion on this PC.";

    try {
      if (!(await bridgeIsAvailable())) {
        if (content.isConnected) {
          const launchPending = desktopLaunchDeadline > Date.now();
          if (launchPending) {
            content.querySelector("h1").textContent = "Starting SummonerKit…";
            content.querySelector("p").textContent =
              "Waiting for the Windows app and checking the local connection.";
          } else {
            const launchTimedOut = desktopLaunchDeadline !== 0;
            desktopLaunchDeadline = 0;
            if (launchTimedOut) showLaunchFailureState(content, retryButton);
            else showOfflineState(content, retryButton);
          }
          scheduleConnectionRetry(content);
        }
        return;
      }

      if (!content.isConnected) return;
      clearConnectionRetry();
      connectionRetryAttempt = 0;
      desktopLaunchDeadline = 0;
      content.className = "summonerkit-content";
      content.removeAttribute("aria-live");
      content.replaceChildren(createClientFrame());
    } finally {
      delete content.dataset.connecting;
    }
  };

  const createClientContent = () => {
    const content = createConnectionContent();
    content
      .querySelector(".summonerkit-retry")
      .addEventListener("click", () => startDesktopAndConnect(content));
    return content;
  };

  const createOverlay = (closeAction) => {
    const overlay = document.createElement("section");
    overlay.id = ids.overlay;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "SummonerKit companion");
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAction();
    });
    return overlay;
  };

  const mountOverlay = (closeLabel, afterClose) => {
    removeOverlay();
    setNavigationActive(true);
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
    mountOverlay("Close SummonerKit", restorePreviousFocus);
  };

  const createRoseEntryButton = () => {
    const button = document.createElement("button");
    button.id = ids.roseEntry;
    button.type = "button";
    button.className = "summonerkit-settings-entry";
    button.setAttribute("aria-label", "Open SummonerKit in the League client");
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

  const configureNavigationItem = (navigationItem) => {
    navigationItem.id = ids.navigation;
    navigationItem.className =
      "main-navigation-menu-item menu_item_SummonerKit ember-view";
    navigationItem.title = "SummonerKit";
    navigationItem.tabIndex = 0;
    navigationItem.setAttribute("role", "button");
    navigationItem.setAttribute("aria-label", "Open SummonerKit");
    navigationItem.setAttribute("aria-haspopup", "dialog");
    navigationItem.setAttribute("aria-expanded", "false");
  };

  const createNavigationArtwork = () => {
    const iconWrapper = document.createElement("div");
    iconWrapper.className =
      "menu-item-icon-wrapper summonerkit-navigation__wrapper";
    const iconGlow = document.createElement("div");
    iconGlow.className = "menu-item-glow summonerkit-navigation__glow";
    const iconArtwork = document.createElement("div");
    iconArtwork.className = "menu-item-icon summonerkit-navigation__icon";
    iconArtwork.setAttribute("aria-hidden", "true");
    iconArtwork.style.backgroundImage = `url("${config.navigationIcon}")`;
    iconArtwork.style.webkitMaskImage = "none";
    iconWrapper.append(iconGlow, iconArtwork);
    return iconWrapper;
  };

  const openFromNavigation = (navigationItem, event) => {
    event.preventDefault();
    event.stopPropagation();
    openStandaloneOverlay(navigationItem);
  };

  const createNavigationItem = () => {
    const navigationItem = document.createElement("lol-uikit-navigation-item");
    configureNavigationItem(navigationItem);
    navigationItem.appendChild(createNavigationArtwork());
    navigationItem.addEventListener(
      "click",
      (event) => openFromNavigation(navigationItem, event),
      true,
    );
    navigationItem.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      openFromNavigation(navigationItem, event);
    });
    return navigationItem;
  };

  const createNavigationSeparator = () => {
    const separator = document.createElement("div");
    separator.id = ids.navigationSeparator;
    separator.className = "right-nav-vertical-rule";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  };

  const navigationPredecessor = (navigationContainer) => {
    const roseNavigationItem = findRoseNavigation();
    if (roseNavigationItem?.parentElement !== navigationContainer) return null;
    const roseSeparator =
      roseNavigationItem.nextElementSibling?.classList.contains(
        "right-nav-vertical-rule",
      )
        ? roseNavigationItem.nextElementSibling
        : null;
    return roseSeparator ?? roseNavigationItem;
  };

  const placeNavigation = (navigationContainer, navigationItem, navigationSeparator) => {
    const predecessor = navigationPredecessor(navigationContainer);
    const desiredPosition = predecessor
      ? predecessor.nextSibling
      : navigationContainer.firstChild;
    if (navigationItem.parentElement !== navigationContainer || desiredPosition !== navigationItem) {
      navigationContainer.insertBefore(navigationItem, desiredPosition);
    }
    if (navigationSeparator.parentElement !== navigationContainer || navigationItem.nextSibling !== navigationSeparator) {
      navigationContainer.insertBefore(navigationSeparator, navigationItem.nextSibling);
    }
  };

  const installNavigation = () => {
    const navigationContainer = document.querySelector(".right-nav-menu, .main-nav-bar");
    if (!navigationContainer) return false;
    const navigationItem =
      document.getElementById(ids.navigation) ?? createNavigationItem();
    const navigationSeparator =
      document.getElementById(ids.navigationSeparator) ?? createNavigationSeparator();
    placeNavigation(navigationContainer, navigationItem, navigationSeparator);
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
    installNavigation();
    installRoseEntry();
  };

  const start = () => {
    synchronizeIntegration();
    const observer = new MutationObserver(synchronizeIntegration);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("click", closeOverlayForLeagueChrome, true);
    window.addEventListener("rose-open-settings", () => {
      window.setTimeout(installRoseEntry, 0);
    });
  };

  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
