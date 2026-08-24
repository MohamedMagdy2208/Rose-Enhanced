import { randomBytes } from "node:crypto";
import type {
  CommandResult,
  CompanionCommand,
  CompanionSnapshot,
  RemoteCompanionSnapshot,
  RemoteDevice,
  RemotePairingOffer,
} from "@summonerkit/contracts";
import { companionCommandSchema } from "@summonerkit/contracts";
import { deriveSessionKeys, EncryptedChannel, generateDeviceKeys, publicKeyFingerprint, remoteWebSocketProtocols, verifyPairingProof, type EncryptedEnvelope } from "@summonerkit/remote";
import QRCode from "qrcode";
import WebSocket from "ws";
import { z } from "zod";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";

const createRoomResponseSchema = z.object({
  roomId: z.string().min(8).max(128),
  accessToken: z.string().min(32).max(256),
  expiresAt: z.string().datetime(),
  websocketUrl: z.string().url(),
});

const peerKeySchema = z.object({
  kind: z.literal("peer-key"),
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
  publicKey: z.record(z.string(), z.unknown()),
  pairingProof: z.string().min(32).max(256),
});

const remoteMessageSchema = z.object({
  kind: z.literal("command"),
  id: z.string().uuid(),
  command: companionCommandSchema,
});

const MAX_REMOTE_PLAINTEXT_BYTES = 44 * 1024;

const REMOTE_COMMANDS = new Set<CompanionCommand["type"]>([
  "readyCheck.accept",
  "readyCheck.decline",
  "queue.start",
  "queue.stop",
  "champSelect.hover",
  "champSelect.lock",
  "champSelect.setSpells",
  "champSelect.setRunePage",
  "champSelect.selectOwnedSkin",
  "aram.benchSwap",
]);

export function isRemoteCommandAllowed(command: CompanionCommand): boolean {
  return REMOTE_COMMANDS.has(command.type);
}

interface ActivePairing {
  roomId: string;
  deviceId: string | null;
  socket: WebSocket;
  privateKey: JsonWebKey;
  oneTimeSecret: string;
  channel: EncryptedChannel | null;
}

export class RemoteService {
  private readonly relayUrl = process.env.SUMMONERKIT_RELAY_URL?.replace(/\/$/u, "") ?? null;
  private readonly mobileUrl = process.env.SUMMONERKIT_MOBILE_URL ?? null;
  private readonly adminSecret = process.env.SUMMONERKIT_RELAY_ADMIN_SECRET ?? null;
  private active: ActivePairing | null = null;
  private outbound = Promise.resolve();

  constructor(
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly dispatch: (command: CompanionCommand) => Promise<CommandResult>,
    private readonly logger: AppLogger,
  ) {
    this.store.on("changed", () => this.queueSnapshot());
    this.store.update((snapshot) => {
      snapshot.remote.relayConfigured = this.configured;
      snapshot.remote.status = this.configured ? "ready" : "unavailable";
      snapshot.remote.lastError = this.configured
        ? null
        : this.configurationError();
    });
  }

  get configured(): boolean {
    return Boolean(this.relayUrl && this.mobileUrl && this.adminSecret && this.adminSecret.length >= 32 && secureRelayUrl(this.relayUrl));
  }

  private configurationError(): string {
    if (!this.relayUrl || !this.mobileUrl || !this.adminSecret) {
      return "Set SUMMONERKIT_RELAY_URL, SUMMONERKIT_MOBILE_URL, and SUMMONERKIT_RELAY_ADMIN_SECRET.";
    }
    if (this.adminSecret.length < 32) return "SUMMONERKIT_RELAY_ADMIN_SECRET must contain at least 32 characters.";
    return "The relay URL must use HTTPS (HTTP is allowed only for localhost development).";
  }

  async createPairing(): Promise<RemotePairingOffer> {
    if (!this.relayUrl || !this.mobileUrl || !this.adminSecret || this.adminSecret.length < 32 || !secureRelayUrl(this.relayUrl)) {
      throw new Error("Mobile relay is not configured on this desktop build.");
    }
    const relayUrl = this.relayUrl;
    const mobileUrl = this.mobileUrl;
    const adminSecret = this.adminSecret;
    this.disconnectActive("A new pairing code was created.");
    const keys = await generateDeviceKeys();
    const oneTimeSecret = randomBytes(32).toString("base64url");
    const desktopKeyFingerprint = await publicKeyFingerprint(keys.publicKey);
    const room = await (async () => {
      try {
        const response = await fetch(`${relayUrl}/rooms`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-summonerkit-admin": adminSecret },
          body: JSON.stringify({ desktopPublicKey: keys.publicKey, expiresInSeconds: 180 }),
        });
        if (!response.ok) throw new Error(`The mobile relay rejected room creation (${response.status}).`);
        return createRoomResponseSchema.parse(await response.json());
      } catch (error) {
        this.reportError(error);
        throw error;
      }
    })();
    const websocketUrl = new URL(room.websocketUrl);
    const socket = new WebSocket(websocketUrl, remoteWebSocketProtocols(room.accessToken));
    this.active = { roomId: room.roomId, deviceId: null, socket, privateKey: keys.privateKey, oneTimeSecret, channel: null };
    this.store.update((snapshot) => {
      snapshot.remote.status = "pairing";
      snapshot.remote.activeDeviceId = null;
      snapshot.remote.lastError = null;
    });
    this.bindSocket(socket);
    try {
      await waitForOpen(socket);
      const mobile = new URL(mobileUrl);
      mobile.hash = new URLSearchParams({
        room: room.roomId,
        secret: oneTimeSecret,
        relay: relayUrl,
        key: desktopKeyFingerprint,
      }).toString();
      const pairingUrl = mobile.toString();
      const qrDataUrl = await QRCode.toDataURL(pairingUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
        color: { dark: "#24161bff", light: "#fffaf8ff" },
      });
      return { roomId: room.roomId, pairingUrl, qrDataUrl, expiresAt: room.expiresAt };
    } catch (error) {
      this.disconnectActive("Pairing setup failed.");
      this.reportError(error);
      throw error;
    }
  }

  async revoke(deviceId: string): Promise<void> {
    const device = this.settings.get().remoteDevices.find((candidate) => candidate.id === deviceId);
    if (!device) throw new Error("The mobile device is unknown.");
    if (this.active?.deviceId === deviceId) this.disconnectActive("Device revoked.");
    const updated = await this.settings.update((draft) => {
      draft.remoteDevices = draft.remoteDevices.map((candidate) =>
        candidate.id === deviceId ? { ...candidate, connected: false, revoked: true } : candidate,
      );
    });
    this.store.update((snapshot) => { snapshot.remoteDevices = updated.remoteDevices; });
  }

  stop(): void {
    this.disconnectActive("Desktop companion stopped.");
    void this.persistAllDisconnected();
  }

  private bindSocket(socket: WebSocket): void {
    socket.on("message", (data) => void this.receive(socket, String(data)));
    socket.on("close", () => void this.handleClose(socket));
    socket.on("error", (error) => {
      this.logger.warn("Remote relay connection failed", { error: error.message });
      if (this.active?.socket !== socket) return;
      this.store.update((snapshot) => {
        snapshot.remote.status = "error";
        snapshot.remote.lastError = "The encrypted relay connection failed.";
      });
    });
  }

  private async receive(socket: WebSocket, raw: string): Promise<void> {
    const active = this.active;
    if (!active || active.socket !== socket) return;
    try {
      const candidate = JSON.parse(raw) as unknown;
      const peer = peerKeySchema.safeParse(candidate);
      if (peer.success) {
        if (active.channel && active.deviceId === peer.data.deviceId) {
          this.queueSnapshot();
          return;
        }
        const known = this.settings.get().remoteDevices.find((device) => device.id === peer.data.deviceId);
        if (known?.revoked) throw new Error("This device was revoked locally.");
        if (!(await verifyPairingProof(peer.data.pairingProof, active.oneTimeSecret, active.roomId, peer.data.publicKey))) {
          throw new Error("The mobile pairing proof is invalid.");
        }
        active.channel = new EncryptedChannel(
          active.roomId,
          await deriveSessionKeys("desktop", active.roomId, active.privateKey, peer.data.publicKey),
        );
        active.deviceId = peer.data.deviceId;
        await this.recordConnectedDevice(peer.data.deviceId, peer.data.deviceName);
        this.queueSnapshot();
        return;
      }
      if (!active.channel) throw new Error("The mobile peer has not completed its authenticated handshake.");
      const opened = await active.channel.open<unknown>(candidate as EncryptedEnvelope);
      const message = remoteMessageSchema.parse(opened);
      if (!isRemoteCommandAllowed(message.command)) throw new Error("That command is not available to mobile devices.");
      const result = await this.dispatch(message.command);
      this.queueEncrypted({ kind: "command-result", id: message.id, result });
      await this.touchDevice(active.deviceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Remote message rejected", { error: message });
      this.queueEncrypted({ kind: "error", message });
      if (!active.channel) active.socket.close(1008, "Invalid pairing handshake");
    }
  }

  private async recordConnectedDevice(id: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    const next: RemoteDevice = { id, name, pairedAt: now, lastSeenAt: now, connected: true, revoked: false };
    const settings = await this.settings.update((draft) => {
      const existing = draft.remoteDevices.findIndex((device) => device.id === id);
      if (existing >= 0) draft.remoteDevices[existing] = { ...draft.remoteDevices[existing]!, ...next };
      else draft.remoteDevices.push(next);
    });
    this.store.update((snapshot) => {
      snapshot.remote.status = "connected";
      snapshot.remote.activeDeviceId = id;
      snapshot.remote.lastError = null;
      snapshot.remoteDevices = settings.remoteDevices;
    });
  }

  private async touchDevice(id: string | null): Promise<void> {
    if (!id) return;
    const now = new Date().toISOString();
    const settings = await this.settings.update((draft) => {
      draft.remoteDevices = draft.remoteDevices.map((device) => device.id === id ? { ...device, lastSeenAt: now } : device);
    });
    this.store.update((snapshot) => { snapshot.remoteDevices = settings.remoteDevices; });
  }

  private queueSnapshot(): void {
    if (!this.active?.channel || this.active.socket.readyState !== WebSocket.OPEN) return;
    this.queueEncrypted({ kind: "snapshot", snapshot: remoteSnapshot(this.store.getSnapshot()) });
  }

  private queueEncrypted(value: unknown): void {
    const active = this.active;
    if (!active?.channel || active.socket.readyState !== WebSocket.OPEN) return;
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_REMOTE_PLAINTEXT_BYTES) {
      this.logger.warn("Remote encrypted payload exceeded the safe relay limit");
      return;
    }
    this.outbound = this.outbound
      .then(async () => {
        if (this.active !== active || active.socket.readyState !== WebSocket.OPEN || !active.channel) return;
        active.socket.send(JSON.stringify(await active.channel.seal(value)));
      })
      .catch((error: unknown) => this.logger.warn("Remote encrypted send failed", { error: String(error) }));
  }

  private async handleClose(socket: WebSocket): Promise<void> {
    if (this.active?.socket !== socket) return;
    const deviceId = this.active.deviceId;
    this.active = null;
    if (deviceId) {
      const settings = await this.settings.update((draft) => {
        draft.remoteDevices = draft.remoteDevices.map((device) => device.id === deviceId ? { ...device, connected: false } : device);
      });
      this.store.update((snapshot) => {
        snapshot.remoteDevices = settings.remoteDevices;
        snapshot.remote.status = this.configured ? "ready" : "unavailable";
        snapshot.remote.activeDeviceId = null;
      });
      return;
    }
    this.store.update((snapshot) => {
      snapshot.remote.status = snapshot.remote.lastError ? "error" : this.configured ? "ready" : "unavailable";
      snapshot.remote.activeDeviceId = null;
    });
  }

  private disconnectActive(reason: string): void {
    const active = this.active;
    this.active = null;
    if (active && active.socket.readyState < WebSocket.CLOSING) active.socket.close(1000, reason);
    this.store.update((snapshot) => {
      snapshot.remote.status = this.configured ? "ready" : "unavailable";
      snapshot.remote.activeDeviceId = null;
      snapshot.remoteDevices = snapshot.remoteDevices.map((device) => ({ ...device, connected: false }));
    });
  }

  private async persistAllDisconnected(): Promise<void> {
    const settings = await this.settings.update((draft) => {
      draft.remoteDevices = draft.remoteDevices.map((device) => ({ ...device, connected: false }));
    });
    this.store.update((snapshot) => { snapshot.remoteDevices = settings.remoteDevices; });
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.store.update((snapshot) => {
      snapshot.remote.status = "error";
      snapshot.remote.lastError = message;
    });
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The encrypted relay connection timed out.")), 8_000);
    socket.once("open", () => { clearTimeout(timeout); resolve(); });
    socket.once("error", () => { clearTimeout(timeout); reject(new Error("The encrypted relay connection failed.")); });
  });
}

export function remoteSnapshot(snapshot: CompanionSnapshot): RemoteCompanionSnapshot {
  const selectedChampionId = snapshot.session.championSelect.selectedChampionId;
  const ownedSkins = selectedChampionId
    ? snapshot.collection.champions
      .find((champion) => champion.id === selectedChampionId)
      ?.skins.filter((skin) => skin.owned)
      .map((skin) => ({ id: skin.id, championId: skin.championId, name: skin.name })) ?? []
    : [];
  return {
    revision: snapshot.revision,
    connection: {
      status: snapshot.connection.status,
      phase: snapshot.connection.phase,
      patch: snapshot.connection.patch,
      lastError: snapshot.connection.lastError,
    },
    session: structuredClone(snapshot.session),
    aram: structuredClone(snapshot.aram),
    champions: snapshot.collection.champions.map((champion) => ({
      id: champion.id,
      alias: champion.alias,
      name: champion.name,
      owned: champion.owned,
    })),
    ownedSkins,
  };
}

function secureRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"));
  } catch {
    return false;
  }
}
