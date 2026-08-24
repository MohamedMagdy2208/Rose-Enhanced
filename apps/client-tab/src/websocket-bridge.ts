import type {
  AutomationProfile,
  BridgeListener,
  CommandResult,
  CompanionBridge,
  CompanionCommand,
  CompanionSnapshot,
  DiagnosticReport,
  DomainEvent,
} from "@summonerkit/contracts";

interface PendingRequest {
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}

export class WebSocketBridge implements CompanionBridge {
  private socket: WebSocket | null = null;
  private snapshot: CompanionSnapshot;
  private readonly listeners = new Set<BridgeListener>();
  private readonly pending = new Map<string, PendingRequest>();
  private reconnectTimer: number | null = null;
  private hasAuthenticatedSnapshot = false;
  private connecting = false;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    initialSnapshot: CompanionSnapshot,
  ) {
    this.snapshot = initialSnapshot;
    void this.connect();
  }

  async getSnapshot(): Promise<CompanionSnapshot> {
    try {
      const response = await fetch(`${this.baseUrl}/snapshot`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!response.ok) throw new Error(`Snapshot request returned ${response.status}.`);
      this.snapshot = await response.json() as CompanionSnapshot;
      this.hasAuthenticatedSnapshot = true;
    } catch (error) {
      if (!this.hasAuthenticatedSnapshot) throw error;
    }
    return structuredClone(this.snapshot);
  }

  async registerClientSession(protocolVersion: number, pluginVersion: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/client-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ protocolVersion, pluginVersion }),
    });
    if (!response.ok) throw new Error(`Client integration registration returned ${response.status}.`);
  }

  dispatch(command: CompanionCommand): Promise<CommandResult> {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, message: "Desktop bridge is not connected." });
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Desktop command timed out."));
      }, 8_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket?.send(JSON.stringify({ type: "command", id, command }));
    });
  }

  saveProfile(profile: AutomationProfile): Promise<CommandResult> {
    return this.dispatch({ type: "profile.save", profile });
  }

  exportDiagnostics(): Promise<DiagnosticReport> {
    return Promise.reject(new Error("Diagnostic export is available only in the desktop app."));
  }

  createRemotePairing(): Promise<never> {
    return Promise.reject(new Error("Mobile pairing is available only in the desktop app."));
  }

  subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    try {
      const session = await fetch(`${this.baseUrl}/bridge-session`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!session.ok) throw new Error(`Bridge session request returned ${session.status}.`);
      const payload = await session.json() as { sessionId?: unknown };
      if (typeof payload.sessionId !== "string" || payload.sessionId.length < 32) {
        throw new Error("Bridge session response was invalid.");
      }
      this.openSocket(payload.sessionId);
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private openSocket(sessionId: string): void {
    const socketUrl = this.baseUrl.replace(/^http/, "ws");
    const socket = new WebSocket(`${socketUrl}/events`, [
      "summonerkit-v1",
      `summonerkit-session.${sessionId}`,
    ]);
    this.socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      if (message.type === "snapshot" && message.snapshot) {
        this.snapshot = message.snapshot as CompanionSnapshot;
        this.emit({ type: "snapshot.changed", revision: this.snapshot.revision });
      }
      if (message.type === "commandResult" && typeof message.id === "string") {
        const request = this.pending.get(message.id);
        if (!request) return;
        window.clearTimeout(request.timeout);
        this.pending.delete(message.id);
        request.resolve(message.result as CommandResult);
      }
    } catch {
      // Invalid bridge messages are intentionally discarded.
    }
  }

  private emit(event: DomainEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 1_500);
  }
}
