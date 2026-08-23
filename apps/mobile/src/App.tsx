import { BellRing, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@rose-enhanced/contracts";
import { ChampionSelectPanel } from "./components/ChampionSelectPanel";
import { ConnectionGate } from "./components/ConnectionGate";
import { QueuePanel } from "./components/QueuePanel";
import { MobileRemote } from "./pairing";

type Stage = "unconfigured" | "ready" | "pairing" | "connected" | "error";

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.hash.replace(/^#/u, "")), []);
  const roomId = params.get("room") ?? "";
  const secret = params.get("secret") ?? "";
  const relay = params.get("relay") ?? "";
  const desktopKeyFingerprint = params.get("key") ?? "";
  const canPair = Boolean(roomId && secret && relay && desktopKeyFingerprint);
  const [stage, setStage] = useState<Stage>(canPair ? "ready" : "unconfigured");
  const [message, setMessage] = useState("Scan a pairing code from Rose Enhanced on your PC.");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");
  const [snapshot, setSnapshot] = useState<RemoteCompanionSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [remote] = useState(() => new MobileRemote());

  useEffect(() => remote.subscribe(setSnapshot), [remote]);
  useEffect(() => remote.subscribeMessage((nextMessage) => {
    setMessage(nextMessage);
    setMessageTone("neutral");
  }), [remote]);
  useEffect(() => remote.subscribeConnection((connected) => {
    if (connected) return;
    setStage((current) => current === "connected" ? "error" : current);
    setMessageTone("error");
    setMessage("The encrypted desktop connection closed. Create a new pairing code on the PC.");
  }), [remote]);
  useEffect(() => () => remote.disconnect(), [remote]);

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
      setStage("connected");
      setMessageTone("success");
      setMessage("Phone connected. Waiting for the first live desktop snapshot…");
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

  return (
    <main className="mobile-shell">
      <header className="brand-bar">
        <div className="brand-mark" aria-hidden="true"><span>RE</span></div>
        <div><p>ROSE ENHANCED</p><span>Encrypted remote</span></div>
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
          <QueuePanel snapshot={snapshot} pending={pending} send={send} />
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
