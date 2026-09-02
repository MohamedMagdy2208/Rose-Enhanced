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
import { draftCoachChoices, redactSensitive } from "@summonerkit/core";
import { deriveSessionKeys, EncryptedChannel, generateDeviceKeys, publicKeyFingerprint, remoteWebSocketProtocols, verifyPairingProof, type EncryptedEnvelope } from "@summonerkit/remote";
import QRCode from "qrcode";
import WebSocket from "ws";
import { z } from "zod";
import type { CompanionStore } from "./companion-store";
import type { AppLogger } from "./logger";
import type { SettingsStore } from "./settings-store";

const createRoomResponseSchema = z.object({
  roomId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u),
  expiresAt: z.string().datetime(),
  websocketUrl: z.string().url().max(2_048),
}).strict();

const peerKeySchema = z.object({
  kind: z.literal("peer-key"),
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(80),
  publicKey: z.record(z.string(), z.unknown()),
  pairingProof: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();

const remoteMessageSchema = z.object({
  kind: z.literal("command"),
  id: z.string().uuid(),
  command: companionCommandSchema,
}).strict();

const relayHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("summonerkit-relay"),
  protocolVersion: z.literal(1),
  mobileOrigin: z.string().url(),
  checkedAt: z.string().datetime(),
}).strict();

const MAX_REMOTE_PLAINTEXT_BYTES = 44 * 1024;
const MAX_REMOTE_FRAME_BYTES = 64 * 1024;
const MAX_REMOTE_ERROR_LENGTH = 240;

const REMOTE_COMMANDS = new Set<CompanionCommand["type"]>([
  "automation.disableAll",
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

async function deployedRelayHealth(relayUrl: string, fetcher: typeof fetch) {
  const response = await fetcher(`${relayUrl.replace(/\/$/u, "")}/health`, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`The mobile relay health check returned HTTP ${response.status}.`);
  return relayHealthSchema.parse(await response.json());
}

async function assertMobileShell(mobileUrl: string, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(mobileUrl, {
    method: "GET",
    headers: { accept: "text/html" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`The mobile PWA health check returned HTTP ${response.status}.`);
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    throw new Error("The configured mobile URL did not return the SummonerKit web application.");
  }
}

export async function probeRemoteDeployment(
  relayUrl: string,
  mobileUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const health = await deployedRelayHealth(relayUrl, fetcher);
  const expectedMobileOrigin = new URL(mobileUrl).origin;
  if (health.mobileOrigin !== expectedMobileOrigin) {
    throw new Error(`The relay allows ${health.mobileOrigin}, but the mobile app uses ${expectedMobileOrigin}.`);
  }
  await assertMobileShell(mobileUrl, fetcher);
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
  private relayUrl: string | null;
  private mobileUrl: string | null;
  private adminSecret: string | null;
  private active: ActivePairing | null = null;
  private outbound = Promise.resolve();

  constructor(
    private readonly store: CompanionStore,
    private readonly settings: SettingsStore,
    private readonly dispatch: (command: CompanionCommand) => Promise<CommandResult>,
    private readonly logger: AppLogger,
  ) {
    const configuration = this.settings.get().remoteConfiguration;
    this.relayUrl = process.env.SUMMONERKIT_RELAY_URL?.replace(/\/$/u, "") ?? configuration.relayUrl;
    this.mobileUrl = process.env.SUMMONERKIT_MOBILE_URL ?? configuration.mobileUrl;
    this.adminSecret = process.env.SUMMONERKIT_RELAY_ADMIN_SECRET ?? configuration.adminSecret;
    this.store.on("changed", () => this.queueSnapshot());
    this.store.update((snapshot) => {
      snapshot.remote.relayConfigured = this.configured;
      snapshot.remote.relayUrl = this.relayUrl;
      snapshot.remote.mobileUrl = this.mobileUrl;
      snapshot.remote.status = this.configured ? "ready" : "unavailable";
      snapshot.remote.lastError = this.configured
        ? null
        : this.configurationError();
    });
    if (this.configured) void this.verifyConfiguredDeployment();
  }

  get configured(): boolean {
    return Boolean(this.relayUrl && this.mobileUrl && this.adminSecret && this.adminSecret.length >= 32 && secureRelayUrl(this.relayUrl) && secureMobileUrl(this.mobileUrl));
  }

  private configurationError(): string {
    if (!this.relayUrl || !this.mobileUrl || !this.adminSecret) {
      return "Set SUMMONERKIT_RELAY_URL, SUMMONERKIT_MOBILE_URL, and SUMMONERKIT_RELAY_ADMIN_SECRET.";
    }
    if (this.adminSecret.length < 32) return "SUMMONERKIT_RELAY_ADMIN_SECRET must contain at least 32 characters.";
    return "The relay and mobile URLs must use HTTPS (HTTP is allowed only for localhost development).";
  }

  async configure(relayUrl: string, mobileUrl: string, adminSecret: string): Promise<void> {
    const normalizedRelay = relayUrl.replace(/\/$/u, "");
    if (!secureRelayUrl(normalizedRelay) || !secureMobileUrl(mobileUrl)) {
      throw new Error("The relay and mobile URLs must use HTTPS, except for localhost development.");
    }
    if (adminSecret.length < 32) throw new Error("The relay administrator secret must contain at least 32 characters.");
    await probeRemoteDeployment(normalizedRelay, mobileUrl);
    this.disconnectActive("Mobile relay configuration changed.");
    const settings = await this.settings.update((draft) => {
      draft.remoteConfiguration = { relayUrl: normalizedRelay, mobileUrl, adminSecret };
    });
    this.relayUrl = settings.remoteConfiguration.relayUrl;
    this.mobileUrl = settings.remoteConfiguration.mobileUrl;
    this.adminSecret = settings.remoteConfiguration.adminSecret;
    this.store.update((snapshot) => {
      snapshot.remote.relayConfigured = this.configured;
      snapshot.remote.relayUrl = this.relayUrl;
      snapshot.remote.mobileUrl = this.mobileUrl;
      snapshot.remote.status = this.configured ? "ready" : "unavailable";
      snapshot.remote.lastError = this.configured ? null : this.configurationError();
    });
  }

  async createPairing(): Promise<RemotePairingOffer> {
    if (!this.relayUrl || !this.mobileUrl || !this.adminSecret || this.adminSecret.length < 32 || !secureRelayUrl(this.relayUrl) || !secureMobileUrl(this.mobileUrl)) {
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
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`The mobile relay rejected room creation (${response.status}).`);
        return createRoomResponseSchema.parse(await response.json());
      } catch (error) {
        this.reportError(error);
        throw error;
      }
    })();
    const websocketUrl = validatedRelaySocketUrl(room.websocketUrl, relayUrl, room.roomId);
    const socket = new WebSocket(websocketUrl, remoteWebSocketProtocols(room.accessToken), {
      maxPayload: MAX_REMOTE_FRAME_BYTES,
      perMessageDeflate: false,
      handshakeTimeout: 8_000,
    });
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

  private async verifyConfiguredDeployment(): Promise<void> {
    if (!this.relayUrl || !this.mobileUrl) return;
    try {
      await probeRemoteDeployment(this.relayUrl, this.mobileUrl);
      if (!this.active) this.store.update((snapshot) => {
        snapshot.remote.status = "ready";
        snapshot.remote.lastError = null;
      });
    } catch (error) {
      this.logger.warn("Mobile deployment health check failed", { error: String(error) });
      if (!this.active) this.reportError(error);
    }
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
        if (active.channel) return;
        const known = this.settings.get().remoteDevices.find((device) => device.id === peer.data.deviceId);
        if (known?.revoked) throw new Error("This device was revoked locally.");
        if (!(await verifyPairingProof(peer.data.pairingProof, active.oneTimeSecret, active.roomId, peer.data.publicKey))) {
          throw new Error("The mobile pairing proof is invalid.");
        }
        // The QR secret is only needed for this proof. Drop it immediately so
        // a claimed pairing cannot be reused from the active desktop state.
        active.oneTimeSecret = "";
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
      const safeMessage = String(redactSensitive(message)).slice(0, MAX_REMOTE_ERROR_LENGTH);
      this.logger.warn("Remote message rejected", { error: safeMessage });
      this.queueEncrypted({ kind: "error", message: safeMessage });
      if (!active.channel) active.socket.close(1008, "Invalid pairing handshake");
    }
  }

  private async recordConnectedDevice(id: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    const pairedAt = this.settings.get().remoteDevices.find((device) => device.id === id)?.pairedAt ?? now;
    const next: RemoteDevice = { id, name, pairedAt, lastSeenAt: now, connected: true, revoked: false };
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
    const safeMessage = String(redactSensitive(message)).slice(0, MAX_REMOTE_ERROR_LENGTH);
    this.store.update((snapshot) => {
      snapshot.remote.status = "error";
      snapshot.remote.lastError = safeMessage;
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
  const builds = selectedChampionId
    ? snapshot.insights.coach.builds
      .filter((build) => build.championId === selectedChampionId)
      .sort((left, right) => right.sampleSize - left.sampleSize)
      .slice(0, 3)
    : [];
  const itemIds = new Set(builds.flatMap((build) => build.itemIds));
  const currentPatch = snapshot.connection.patch?.match(/^\d+\.\d+/u)?.[0] ?? null;
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
    coach: {
      guidance: {
        status: snapshot.insights.guidance.status,
        source: snapshot.insights.guidance.source,
        providerName: snapshot.insights.guidance.providerName,
        generatedAt: snapshot.insights.guidance.generatedAt,
        currentPatchCovered: snapshot.insights.guidance.currentPatchCovered,
        coverage: structuredClone(snapshot.insights.guidance.coverage),
      },
      draftChoices: draftCoachChoices(snapshot, 3),
      builds: structuredClone(builds),
      items: snapshot.insights.coach.items.filter((item) => itemIds.has(item.id)),
      patchImpacts: snapshot.insights.coach.patchImpacts
        .filter((impact) => (!currentPatch || impact.patch.startsWith(currentPatch)) && (impact.championId === null || impact.championId === selectedChampionId))
        .slice(0, 5),
    },
  };
}

function secureRelayUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return isSecureRemoteUrl(url)
      && url.pathname === "/"
      && (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")));
  } catch {
    return false;
  }
}

function secureMobileUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return isSecureRemoteUrl(url)
      && (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")));
  } catch {
    return false;
  }
}

function isSecureRemoteUrl(url: URL): boolean {
  return !url.username && !url.password && !url.search && !url.hash;
}

export function validatedRelaySocketUrl(candidate: string, relayUrl: string, roomId: string): URL {
  const socket = new URL(candidate);
  const relay = new URL(relayUrl);
  const expectedProtocol = relay.protocol === "https:" ? "wss:" : "ws:";
  if (socket.host !== relay.host || socket.protocol !== expectedProtocol || socket.username || socket.password || socket.search || socket.hash || socket.pathname !== `/rooms/${roomId}/socket`) {
    throw new Error("The mobile relay returned an unexpected WebSocket endpoint.");
  }
  return socket;
}
