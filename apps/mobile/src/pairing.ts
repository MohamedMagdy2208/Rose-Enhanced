import {
  companionCommandSchema,
  type CommandResult,
  type CompanionCommand,
  type RemoteCompanionSnapshot,
} from "@summonerkit/contracts";
import { createPairingProof, deriveSessionKeys, EncryptedChannel, generateDeviceKeys, publicKeyFingerprint, remoteWebSocketProtocols, type EncryptedEnvelope } from "@summonerkit/remote";
import { z } from "zod";

const claimResponseSchema = z.object({
  deviceId: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
  websocketUrl: z.string().url(),
  desktopPublicKey: z.record(z.string(), z.unknown()),
});

type RemoteListener = (snapshot: RemoteCompanionSnapshot) => void;
type ConnectionListener = (connected: boolean) => void;
type MessageListener = (message: string) => void;
type ClaimResponse = z.infer<typeof claimResponseSchema>;

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
    if (!secureRelayUrl(request.relayUrl)) throw new Error("The pairing code contains an insecure relay URL.");
    const keys = await generateDeviceKeys();
    const pairingProof = await createPairingProof(request.oneTimeSecret, request.roomId, keys.publicKey);
    const claim = await this.claimRoom(request, keys.publicKey, pairingProof);
    if (await publicKeyFingerprint(claim.desktopPublicKey) !== request.desktopKeyFingerprint) {
      throw new Error("The relay returned a different desktop identity. Pairing was stopped.");
    }
    await this.openRemoteSocket(request.roomId, keys.privateKey, claim);
  }

  private async claimRoom(request: PairingRequest, publicKey: JsonWebKey, pairingProof: string): Promise<ClaimResponse> {
    const response = await fetch(`${request.relayUrl.replace(/\/$/u, "")}/rooms/${encodeURIComponent(request.roomId)}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingProof, deviceName: request.deviceName, publicKey }),
    });
    if (!response.ok) throw new Error(`Pairing was rejected (${response.status}).`);
    return claimResponseSchema.parse(await response.json());
  }

  private async openRemoteSocket(roomId: string, privateKey: JsonWebKey, claim: ClaimResponse): Promise<void> {
    this.channel = new EncryptedChannel(
      roomId,
      await deriveSessionKeys("mobile", roomId, privateKey, claim.desktopPublicKey),
    );
    const websocketUrl = new URL(claim.websocketUrl);
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
      this.channel = null;
      throw error;
    }
    this.bindSocket(socket);
  }

  private bindSocket(socket: WebSocket): void {
    socket.addEventListener("message", (event) => void this.receive(String(event.data)));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.channel = null;
      this.rejectPending("The encrypted desktop connection closed.");
      this.connectionListeners.forEach((listener) => listener(false));
    });
    this.connectionListeners.forEach((listener) => listener(true));
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
    if (!this.channel || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("This phone is not connected to SummonerKit.");
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
    this.socket?.close(1000, "Device disconnected");
    this.socket = null;
    this.channel = null;
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

  private async receive(raw: string): Promise<void> {
    if (!this.channel) return;
    try {
      const message = await this.channel.open<Record<string, unknown>>(JSON.parse(raw) as EncryptedEnvelope);
      if (message.kind === "snapshot" && message.snapshot) {
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

function secureRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}
