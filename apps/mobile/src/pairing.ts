import {
  PRODUCT_NAME,
  companionCommandSchema,
  type CommandResult,
  type CompanionCommand,
  type RemoteCompanionSnapshot,
} from "@summonerkit/contracts";
import { createPairingProof, deriveSessionKeys, EncryptedChannel, generateDeviceKeys, publicKeyFingerprint, remoteWebSocketProtocols, type EncryptedEnvelope } from "@summonerkit/remote";
import { z } from "zod";

const claimResponseSchema = z.object({
  deviceId: z.string().uuid(),
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u),
  websocketUrl: z.string().url().max(2_048),
  desktopPublicKey: z.record(z.string(), z.unknown()),
}).strict();

const MAX_REMOTE_FRAME_BYTES = 64 * 1024;

type RemoteListener = (snapshot: RemoteCompanionSnapshot) => void;
type ConnectionListener = (connected: boolean) => void;
type MessageListener = (message: string) => void;
type ClaimResponse = z.infer<typeof claimResponseSchema>;

interface ActiveSession {
  roomId: string;
  relayUrl: string;
  claim: ClaimResponse;
  privateKey: JsonWebKey;
}

interface PairingRequest {
  roomId: string;
  oneTimeSecret: string;
  relayUrl: string;
  desktopKeyFingerprint: string;
  deviceName: string;
}

export class MobileRemote {
  private socket: WebSocket | null = null;
  private channel: EncryptedChannel | null = null;
  private session: ActiveSession | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectEnabled = false;
  private authenticated = false;
  private authenticationTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<RemoteListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private messageListeners = new Set<MessageListener>();
  private pendingCommands = new Map<string, {
    resolve: (commandResult: CommandResult) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  async pair(request: PairingRequest): Promise<void> {
    this.disconnect();
    if (!/^[A-Za-z0-9_-]{8,128}$/u.test(request.roomId)) throw new Error("The pairing code contains an invalid room identifier.");
    if (!/^[A-Za-z0-9_-]{43}$/u.test(request.desktopKeyFingerprint)) throw new Error("The pairing code contains an invalid desktop identity.");
    if (!secureRelayUrl(request.relayUrl)) throw new Error("The pairing code contains an insecure relay URL.");
    const keys = await generateDeviceKeys();
    const pairingProof = await createPairingProof(request.oneTimeSecret, request.roomId, keys.publicKey);
    const claim = await this.claimRoom(request, keys.publicKey, pairingProof);
    if (await publicKeyFingerprint(claim.desktopPublicKey) !== request.desktopKeyFingerprint) {
      throw new Error("The relay returned a different desktop identity. Pairing was stopped.");
    }
    validateRelaySocketUrl(claim.websocketUrl, request.relayUrl, request.roomId);
    this.session = { roomId: request.roomId, relayUrl: request.relayUrl, claim, privateKey: keys.privateKey };
    this.reconnectEnabled = true;
    await this.openRemoteSocket(claim);
  }

  private async claimRoom(request: PairingRequest, publicKey: JsonWebKey, pairingProof: string): Promise<ClaimResponse> {
    const response = await fetch(`${request.relayUrl.replace(/\/$/u, "")}/rooms/${encodeURIComponent(request.roomId)}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingProof, deviceName: request.deviceName, publicKey }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Pairing was rejected (${response.status}).`);
    return claimResponseSchema.parse(await response.json());
  }

  private async openRemoteSocket(claim: ClaimResponse): Promise<void> {
    const session = this.session;
    if (!session) throw new Error("The encrypted mobile session is unavailable.");
    this.channel = new EncryptedChannel(
      session.roomId,
      await deriveSessionKeys("mobile", session.roomId, session.privateKey, claim.desktopPublicKey),
    );
    this.authenticated = false;
    const websocketUrl = validateRelaySocketUrl(claim.websocketUrl, session.relayUrl, session.roomId);
    const socket = new WebSocket(websocketUrl, remoteWebSocketProtocols(claim.accessToken));
    this.socket = socket;
    try {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("The encrypted relay connection failed.")), { once: true });
      });
    } catch (error) {
      socket.close();
      this.socket = null;
      throw error;
    }
    this.bindSocket(socket);
    this.authenticationTimer = setTimeout(() => {
      if (this.socket === socket && !this.authenticated) socket.close(1008, "Desktop authentication timed out");
    }, 8_000);
  }

  private bindSocket(socket: WebSocket): void {
    socket.addEventListener("message", (event) => void this.receive(String(event.data)));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.authenticated = false;
      if (this.authenticationTimer) clearTimeout(this.authenticationTimer);
      this.authenticationTimer = null;
      this.rejectPending("The encrypted desktop connection closed.");
      this.connectionListeners.forEach((listener) => listener(false));
      this.scheduleReconnect();
    });
  }

  subscribe(listener: RemoteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  subscribeMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  async dispatch(command: CompanionCommand): Promise<CommandResult> {
    const safeCommand = companionCommandSchema.parse(command);
    if (!this.authenticated || !this.channel || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`This phone is not connected to ${PRODUCT_NAME}.`);
    }
    const id = crypto.randomUUID();
    const response = new Promise<CommandResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error("The desktop did not confirm the command in time."));
      }, 10_000);
      this.pendingCommands.set(id, { resolve, reject, timeout });
    });
    try {
      this.socket.send(JSON.stringify(await this.channel.seal({ kind: "command", id, command: safeCommand })));
      return await response;
    } catch (error) {
      const pending = this.pendingCommands.get(id);
      if (pending) clearTimeout(pending.timeout);
      this.pendingCommands.delete(id);
      throw error;
    }
  }

  disconnect(): void {
    this.reconnectEnabled = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.authenticationTimer) clearTimeout(this.authenticationTimer);
    this.reconnectTimer = null;
    this.authenticationTimer = null;
    this.socket?.close(1000, "Device disconnected");
    this.socket = null;
    this.channel = null;
    this.session = null;
    this.reconnectAttempt = 0;
    this.authenticated = false;
    this.rejectPending("The encrypted desktop connection closed.");
    this.connectionListeners.forEach((listener) => listener(false));
  }

  private rejectPending(message: string): void {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pendingCommands.clear();
  }

  private scheduleReconnect(): void {
    if (!this.reconnectEnabled || !this.session || this.reconnectTimer || this.reconnectAttempt >= 5) return;
    const attempt = this.reconnectAttempt;
    this.reconnectAttempt += 1;
    const delay = reconnectDelayMs(attempt);
    this.messageListeners.forEach((listener) => listener(`Connection interrupted. Reconnecting in ${Math.round(delay / 1_000)}s…`));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const session = this.session;
      if (!session || !this.reconnectEnabled) return;
      void this.openRemoteSocket(session.claim)
        .then(() => this.messageListeners.forEach((listener) => listener("Relay reconnected. Verifying the desktop channel…")))
        .catch(() => this.scheduleReconnect());
    }, delay);
  }

  private async receive(raw: string): Promise<void> {
    if (!this.channel) return;
    if (new TextEncoder().encode(raw).byteLength > MAX_REMOTE_FRAME_BYTES) {
      this.disconnect();
      return;
    }
    try {
      const message = await this.channel.open<Record<string, unknown>>(JSON.parse(raw) as EncryptedEnvelope);
      if (message.kind === "snapshot" && message.snapshot) {
        if (!this.authenticated) {
          this.authenticated = true;
          this.reconnectAttempt = 0;
          if (this.authenticationTimer) clearTimeout(this.authenticationTimer);
          this.authenticationTimer = null;
          this.connectionListeners.forEach((listener) => listener(true));
        }
        this.listeners.forEach((listener) => listener(message.snapshot as RemoteCompanionSnapshot));
      } else if (message.kind === "command-result" && typeof message.id === "string" && message.result && typeof message.result === "object") {
        const commandResult = message.result as { ok?: unknown; message?: unknown };
        const pending = this.pendingCommands.get(message.id);
        if (pending && typeof commandResult.ok === "boolean" && typeof commandResult.message === "string") {
          const resultMessage = commandResult.message;
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(message.id);
          pending.resolve({ ok: commandResult.ok, message: resultMessage });
          this.messageListeners.forEach((listener) => listener(resultMessage));
        }
      } else if (message.kind === "error" && typeof message.message === "string") {
        const errorMessage = message.message;
        this.messageListeners.forEach((listener) => listener(errorMessage));
      }
    } catch {
      this.disconnect();
    }
  }
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(15_000, 1_000 * 2 ** Math.max(0, attempt));
}

function secureRelayUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
      && (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")));
  } catch {
    return false;
  }
}

export function validateRelaySocketUrl(candidate: string, relayUrl: string, roomId: string): URL {
  const socket = new URL(candidate);
  const relay = new URL(relayUrl);
  const expectedProtocol = relay.protocol === "https:" ? "wss:" : "ws:";
  if (socket.host !== relay.host || socket.protocol !== expectedProtocol || socket.username || socket.password || socket.search || socket.hash || socket.pathname !== `/rooms/${roomId}/socket`) {
    throw new Error("The mobile relay returned an unexpected WebSocket endpoint.");
  }
  return socket;
}
