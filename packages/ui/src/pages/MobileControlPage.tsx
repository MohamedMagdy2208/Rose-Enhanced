import { useState } from "react";
import { Copy, KeyRound, LockKeyhole, QrCode, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import type { CompanionBridge, CompanionCommand, CompanionSnapshot, RemotePairingOffer } from "@rose-enhanced/contracts";
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

  return (
    <div className="page remote-page">
      <header className="page-header page-header--split">
        <div><p className="eyebrow">Encrypted mobile control</p><h1>Queue and champion select, securely on your phone.</h1><p className="page-lede">Start the current lobby queue, answer ready checks, follow the draft, and choose champions, spells, runes, owned skins, or ARAM swaps. The relay routes ciphertext it cannot read, and the desktop validates every command.</p></div>
        <StatusPill tone={snapshot.remote.status === "connected" ? "positive" : snapshot.remote.status === "error" ? "danger" : snapshot.remote.relayConfigured ? "rose" : "neutral"}>{snapshot.remote.status}</StatusPill>
      </header>

      {!snapshot.remote.relayConfigured ? (
        <section className="remote-configuration" role="status">
          <KeyRound size={22} aria-hidden="true" />
          <div><h2>Relay configuration required</h2><p>{snapshot.remote.lastError}</p><code>ROSE_ENHANCED_RELAY_URL · ROSE_ENHANCED_MOBILE_URL · ROSE_ENHANCED_RELAY_ADMIN_SECRET</code></div>
        </section>
      ) : (
        <section className="pairing-panel">
          <div className="pairing-panel__copy"><p className="eyebrow">Add a device</p><h2>Scan once, then the secret disappears</h2><p>Create a three-minute pairing code. Rose Enhanced does not save the one-time secret or session keys.</p><button className="button button--primary" type="button" disabled={busy} onClick={() => void createPairing()}><QrCode size={16} /> {busy ? "Creating…" : offer ? "Replace pairing code" : "Create pairing code"}</button></div>
          {offer ? (
            <div className="pairing-code">
              <img src={offer.qrDataUrl} alt="One-time Rose Enhanced mobile pairing QR code" />
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
