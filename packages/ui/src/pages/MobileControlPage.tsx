import { useEffect, useState } from "react";
import { Copy, KeyRound, LockKeyhole, QrCode, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import type { CompanionBridge, CompanionCommand, CompanionSnapshot, RemotePairingOffer } from "@summonerkit/contracts";
import { StatusPill } from "../components/StatusPill";
import { formatRelativeTime } from "../utils/assets";

export function MobileControlPage({
  snapshot,
  bridge,
  onCommand,
}: {
  snapshot: CompanionSnapshot;
  bridge: CompanionBridge;
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const [offer, setOffer] = useState<RemotePairingOffer | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [relayUrl, setRelayUrl] = useState(snapshot.remote.relayUrl ?? "");
  const [mobileUrl, setMobileUrl] = useState(snapshot.remote.mobileUrl ?? "https://mohamedmagdy2208.github.io/SummonerKit/");
  const [adminSecret, setAdminSecret] = useState("");

  useEffect(() => {
    if (snapshot.remote.relayUrl) setRelayUrl(snapshot.remote.relayUrl);
    if (snapshot.remote.mobileUrl) setMobileUrl(snapshot.remote.mobileUrl);
  }, [snapshot.remote.mobileUrl, snapshot.remote.relayUrl]);

  const createPairing = async () => {
    setBusy(true);
    try {
      setOffer(await bridge.createRemotePairing());
      setMessage("Pairing code created. It can be used once and expires shortly.");
    } catch (error) {
      setOffer(null);
      setMessage(error instanceof Error ? error.message : "Pairing could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!offer) return;
    try {
      await navigator.clipboard.writeText(offer.pairingUrl);
      setMessage("Pairing link copied. Treat it like a short-lived password.");
    } catch {
      setMessage("Clipboard access was blocked. Scan the QR code instead.");
    }
  };

  const saveConfiguration = async () => {
    setBusy(true);
    try {
      await onCommand({ type: "remote.configure", relayUrl, mobileUrl, adminSecret });
      setAdminSecret("");
      setMessage("Configuration submitted. The relay status above confirms when it is ready.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page remote-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">Encrypted mobile control</p><h1>Queue and champion select, securely on your phone.</h1><p className="page-lede">Start the current lobby queue, answer ready checks, follow the draft, and choose champions, spells, runes, owned skins, or ARAM swaps. The relay routes ciphertext it cannot read, and the desktop validates every command.</p></div>
        <StatusPill tone={snapshot.remote.status === "connected" ? "positive" : snapshot.remote.status === "error" ? "danger" : snapshot.remote.relayConfigured ? "accent" : "neutral"}>{snapshot.remote.status}</StatusPill>
      </header>

      <section className="mobile-setup-guide" aria-labelledby="mobile-setup-title">
        <div><p className="eyebrow">Three-step setup</p><h2 id="mobile-setup-title">Pair once for the current secure session</h2></div>
        <ol>
          <li><span>1</span><div><strong>Keep SummonerKit in the tray</strong><p>The desktop owns League access and must remain running.</p></div></li>
          <li><span>2</span><div><strong>Create and scan a private code</strong><p>It expires after three minutes and cannot be claimed twice.</p></div></li>
          <li><span>3</span><div><strong>Install and enable alerts</strong><p>Add the PWA to your phone and allow local queue-pop notifications.</p></div></li>
        </ol>
        <p>Temporary phone network drops retry automatically. Desktop restarts, revocation, and expired sessions require a new code.</p>
      </section>

      <details className="remote-config-editor" open={!snapshot.remote.relayConfigured}>
        <summary>{snapshot.remote.relayConfigured ? "Change relay configuration" : "Configure the relay deployment"}</summary>
        <p>Deploy the included Cloudflare Worker once, then paste its HTTPS URL and the same administrator secret used by the Worker. The secret is protected with Windows credential encryption.</p>
        <div className="form-grid">
          <label className="field"><span>Relay Worker URL</span><input type="url" value={relayUrl} placeholder="https://summonerkit-relay.example.workers.dev" onChange={(event) => setRelayUrl(event.target.value)} /></label>
          <label className="field"><span>Mobile PWA URL</span><input type="url" value={mobileUrl} onChange={(event) => setMobileUrl(event.target.value)} /></label>
          <label className="field field--wide"><span>Relay administrator secret <small>{snapshot.remote.relayConfigured ? "Enter a new value only when changing configuration" : "At least 32 characters"}</small></span><input type="password" autoComplete="new-password" value={adminSecret} placeholder="Stored encrypted and never shown again" onChange={(event) => setAdminSecret(event.target.value)} /></label>
        </div>
        <button className="button button--secondary" type="button" disabled={busy || !relayUrl || !mobileUrl || adminSecret.length < 32} onClick={() => void saveConfiguration()}><ShieldCheck size={15} />Encrypt and save</button>
      </details>

      {!snapshot.remote.relayConfigured ? (
        <section className="remote-configuration" role="status">
          <KeyRound size={22} aria-hidden="true" />
          <div><h2>Relay configuration required</h2><p>{snapshot.remote.lastError}</p><code>SUMMONERKIT_RELAY_URL · SUMMONERKIT_MOBILE_URL · SUMMONERKIT_RELAY_ADMIN_SECRET</code></div>
        </section>
      ) : (
        <section className="pairing-panel">
          <div className="pairing-panel__copy"><p className="eyebrow">Add a device</p><h2>Scan once, then the secret disappears</h2><p>Create a three-minute pairing code. SummonerKit does not save the one-time secret or session keys.</p><button className="button button--primary" type="button" disabled={busy} onClick={() => void createPairing()}><QrCode size={16} /> {busy ? "Creating…" : offer ? "Replace pairing code" : "Create pairing code"}</button></div>
          {offer ? (
            <div className="pairing-code">
              <img src={offer.qrDataUrl} alt="One-time SummonerKit mobile pairing QR code" />
              <p>Expires {formatRelativeTime(offer.expiresAt)}</p>
              <button className="text-button" type="button" onClick={() => void copyLink()}><Copy size={14} /> Copy private link</button>
            </div>
          ) : <div className="pairing-placeholder"><Smartphone size={38} /><span>No active pairing code</span></div>}
        </section>
      )}

      <p className="form-message" role="status">{message}</p>

      <section className="device-panel" aria-labelledby="paired-devices-title">
        <div className="panel__header"><div><p className="eyebrow">Local trust list</p><h2 id="paired-devices-title">Paired devices</h2></div><ShieldCheck size={20} aria-hidden="true" /></div>
        {snapshot.remoteDevices.length === 0 ? <div className="compact-empty"><Smartphone size={20} /><span>No phones have been paired.</span></div> : (
          <ul className="device-list">
            {snapshot.remoteDevices.map((device) => (
              <li key={device.id}>
                <span className="device-list__icon"><Smartphone size={18} /></span>
                <div><strong>{device.name}</strong><small>{device.revoked ? "Revoked" : device.connected ? "Connected now" : device.lastSeenAt ? `Last seen ${formatRelativeTime(device.lastSeenAt)}` : "Not connected"}</small></div>
                <StatusPill tone={device.revoked ? "danger" : device.connected ? "positive" : "neutral"}>{device.revoked ? "revoked" : device.connected ? "connected" : "offline"}</StatusPill>
                {!device.revoked ? <button className="button button--danger button--compact" type="button" onClick={() => onCommand({ type: "remote.revoke", deviceId: device.id })}><Trash2 size={14} /> Revoke</button> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="device-panel__security"><LockKeyhole size={14} /> The device trust list stays local; private session keys are never sent to the relay.</p>
      </section>
    </div>
  );
}
