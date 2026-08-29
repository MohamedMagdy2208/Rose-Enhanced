import { BellRing, Download, LockKeyhole, Power, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  PRODUCT_AUTHOR,
  PRODUCT_ICON_DATA_URL,
  PRODUCT_NAME,
  type CompanionCommand,
  type RemoteCompanionSnapshot,
} from "@summonerkit/contracts";
import { ChampionSelectPanel } from "./components/ChampionSelectPanel";
import { ConnectionGate } from "./components/ConnectionGate";
import { MobilePatchBrief } from "./components/MobileCoachPanel";
import { QueuePanel } from "./components/QueuePanel";
import { MobileRemote } from "./pairing";

type Stage = "unconfigured" | "ready" | "pairing" | "connected" | "error";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PairingLink {
  roomId: string;
  secret: string;
  relay: string;
  desktopKeyFingerprint: string;
  canPair: boolean;
}

function pairingLinkFromHash(hash: string): PairingLink {
  const params = new URLSearchParams(hash.replace(/^#/u, ""));
  const roomId = params.get("room") ?? "";
  const secret = params.get("secret") ?? "";
  const relay = params.get("relay") ?? "";
  const desktopKeyFingerprint = params.get("key") ?? "";
  return {
    roomId,
    secret,
    relay,
    desktopKeyFingerprint,
    canPair: Boolean(roomId && secret && relay && desktopKeyFingerprint),
  };
}

export function App() {
  const [pairingLink, setPairingLink] = useState(() => pairingLinkFromHash(window.location.hash));
  const { roomId, secret, relay, desktopKeyFingerprint, canPair } = pairingLink;
  const [stage, setStage] = useState<Stage>(canPair ? "ready" : "unconfigured");
  const [message, setMessage] = useState(`Scan a pairing code from ${PRODUCT_NAME} on your PC.`);
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [snapshot, setSnapshot] = useState<RemoteCompanionSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");
  const lastAlertKey = useRef<string | null>(null);
  const [remote] = useState(() => new MobileRemote());

  useEffect(() => {
    const syncPairingLink = () => {
      const nextPairingLink = pairingLinkFromHash(window.location.hash);
      setPairingLink(nextPairingLink);
      setStage((current) => current === "pairing" || current === "connected"
        ? current
        : nextPairingLink.canPair ? "ready" : "unconfigured");
      setMessageTone("neutral");
      setMessage(nextPairingLink.canPair
        ? "Pairing code loaded. Connect this phone to your desktop."
        : `Scan a pairing code from ${PRODUCT_NAME} on your PC.`);
    };
    window.addEventListener("hashchange", syncPairingLink);
    return () => window.removeEventListener("hashchange", syncPairingLink);
  }, []);
  useEffect(() => remote.subscribe(setSnapshot), [remote]);
  useEffect(() => remote.subscribeMessage((nextMessage) => {
    setMessage(nextMessage);
    setMessageTone("neutral");
  }), [remote]);
  useEffect(() => remote.subscribeConnection((connected) => {
    if (connected) {
      setStage("connected");
      setMessageTone("success");
      setMessage("Encrypted desktop connection is active.");
      return;
    }
    setStage((current) => current === "connected" ? "error" : current);
    setMessageTone("error");
    setMessage("The encrypted desktop connection closed. Automatic recovery will retry briefly.");
  }), [remote]);
  useEffect(() => () => remote.disconnect(), [remote]);
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const localAction = snapshot.session.championSelect.localAction;
    const key = snapshot.session.readyCheck.active
      ? "ready-check"
      : localAction?.inProgress ? `champ-select:${localAction.type}:${localAction.id}` : null;
    if (!key) { lastAlertKey.current = null; return; }
    if (key === lastAlertKey.current) return;
    lastAlertKey.current = key;
    if (!alertsEnabled || !document.hidden || typeof Notification === "undefined") return;
    const readyCheck = key === "ready-check";
    const title = readyCheck ? "League match found" : `Your ${localAction?.type ?? "draft"} is ready`;
    const options = { body: readyCheck ? `Open ${PRODUCT_NAME} Mobile to accept or decline.` : `Open ${PRODUCT_NAME} Mobile to hover or lock a champion.`, icon: "./icon-192.png", tag: key };
    void navigator.serviceWorker?.ready
      .then((registration) => registration.showNotification(title, options))
      .catch(() => { try { new Notification(title, options); } catch { /* The in-page status remains available. */ } });
  }, [alertsEnabled, snapshot]);

  const pair = async () => {
    setStage("pairing");
    setMessageTone("neutral");
    setMessage("Verifying the desktop and establishing encrypted keys…");
    try {
      await remote.pair({
        roomId,
        oneTimeSecret: secret,
        relayUrl: relay,
        desktopKeyFingerprint,
        deviceName: navigator.userAgent.includes("Mobile") ? "My phone" : "Mobile browser",
      });
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
      setMessageTone("neutral");
      setMessage("Relay connected. Verifying the encrypted desktop snapshot…");
    } catch (error) {
      setStage("error");
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Pairing failed.");
    }
  };

  const send = (command: CompanionCommand): void => {
    if (pending) return;
    setPending(true);
    setMessageTone("neutral");
    setMessage("Waiting for desktop validation…");
    void remote.dispatch(command)
      .then((commandResult) => {
        setMessage(commandResult.message);
        setMessageTone(commandResult.ok ? "success" : "error");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Command failed.");
        setMessageTone("error");
      })
      .finally(() => setPending(false));
  };

  const connected = stage === "connected";
  const leagueConnected = snapshot?.connection.status === "connected";
  const enableAlerts = async () => {
    if (typeof Notification === "undefined") { setMessage("This browser does not support local notifications."); return; }
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");
    setMessage(permission === "granted" ? "Queue and champion-select alerts enabled." : "Notification permission was not granted.");
    setMessageTone(permission === "granted" ? "success" : "error");
  };
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <main className="mobile-shell">
      <header className="brand-bar">
        <div className="brand-mark" role="img" aria-label={`${PRODUCT_NAME} mark`}><img src={PRODUCT_ICON_DATA_URL} alt="" /></div>
        <div><p>{PRODUCT_NAME.toUpperCase()}</p><span>Encrypted remote · by {PRODUCT_AUTHOR}</span></div>
        <span className={`connection-pill ${connected ? "is-connected" : ""}`}><span aria-hidden="true" />{connected ? "Connected" : "Offline"}</span>
      </header>

      {!connected ? (
        <>
          <section className="hero-card">
            <p className="eyebrow">PRIVATE BY DESIGN</p>
            <h1>League control, from your phone.</h1>
            <p>Start the current lobby queue, answer ready checks, follow champion select, and choose your draft and loadout.</p>
            <div className="security-line"><LockKeyhole size={17} /><span>AES-256-GCM · desktop identity pinned · replay protected</span></div>
          </section>
          <ConnectionGate stage={stage} message={message} onPair={() => void pair()} />
        </>
      ) : snapshot ? (
        <>
          <section className="client-strip" aria-label="League client status">
            <span className={`status-dot ${leagueConnected ? "status-dot--on" : ""}`} aria-hidden="true" />
            <div><strong>{leagueConnected ? "League client connected" : "Waiting for League"}</strong><small>{snapshot.connection.phase}{snapshot.connection.patch ? ` · ${snapshot.connection.patch}` : ""}</small></div>
            <ShieldCheck size={20} aria-label="Encrypted channel verified" />
          </section>
          <section className="mobile-quick-actions" aria-label="Mobile app options">
            <button type="button" className={alertsEnabled ? "is-enabled" : ""} onClick={() => void enableAlerts()}><BellRing size={16} />{alertsEnabled ? "Alerts enabled" : "Enable alerts"}</button>
            {installPrompt ? <button type="button" onClick={() => void install()}><Download size={16} />Install app</button> : null}
            <button type="button" className="is-danger" disabled={pending} onClick={() => send({ type: "automation.disableAll" })}><Power size={16} />Stop automation</button>
          </section>
          <QueuePanel snapshot={snapshot} pending={pending} send={send} />
          <MobilePatchBrief snapshot={snapshot} />
          <ChampionSelectPanel snapshot={snapshot} pending={pending} send={send} />
          {!snapshot.session.championSelect.active ? (
            <section className="standby-card">
              <BellRing size={21} />
              <div><strong>Champion select will appear automatically</strong><p>Keep this page open. Picks, bans, timer, spells, runes, skins, and ARAM bench controls update from your PC.</p></div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="snapshot-loading" aria-busy="true" aria-live="polite"><span /><span /><span /><p>Loading encrypted League state…</p></section>
      )}

      <p className={`live-message live-message--${messageTone}`} role="status" aria-live="polite">{pending ? "Working · " : ""}{message}</p>
    </main>
  );
}
