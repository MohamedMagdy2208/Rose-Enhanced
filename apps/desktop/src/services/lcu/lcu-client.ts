import { EventEmitter } from "node:events";
import https from "node:https";
import { Buffer } from "node:buffer";
import WebSocket, { type RawData } from "ws";
import type { CapabilitySet, LcuConnectionState } from "@summonerkit/contracts";
import type { AppLogger } from "../logger";
import { readLcuCredentials, type LcuCredentials } from "./lockfile";

export interface LcuEvent<T = unknown> {
  eventType: "Create" | "Update" | "Delete" | string;
  uri: string;
  data: T;
}

export class LcuHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
  }
}

type LcuMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const unavailableCapabilities = (): CapabilitySet => ({
  championCatalog: false,
  skinInventory: false,
  lootInventory: false,
  readyCheck: false,
  champSelect: false,
  runes: false,
  summonerSpells: false,
  presence: false,
  clientTab: false,
});

const MAX_LCU_RESPONSE_BYTES = 64 * 1024 * 1024;
const GAME_DATA_ASSET_PREFIX = "/lol-game-data/assets/";

export function allowedLcuAssetEndpoint(endpoint: string): boolean {
  if (!endpoint.startsWith(GAME_DATA_ASSET_PREFIX) || endpoint.includes("\\") || endpoint.includes("\0")) return false;
  try {
    const parsed = new URL(endpoint, "https://127.0.0.1");
    return !parsed.search && !parsed.hash && parsed.pathname === endpoint;
  } catch {
    return false;
  }
}

export class LcuClient extends EventEmitter {
  private credentials: LcuCredentials | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private state: LcuConnectionState = {
    status: "discovering",
    phase: "Waiting for League",
    region: null,
    locale: null,
    patch: null,
    capabilities: unavailableCapabilities(),
    connectedAt: null,
    lastError: null,
  };

  constructor(
    private readonly configuredPath: () => string | null,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  start(): void {
    this.stopping = false;
    void this.discoverAndConnect();
  }

  stop(): void {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1_000, "SummonerKit is closing");
    this.socket = null;
    this.credentials = null;
  }

  getState(): LcuConnectionState {
    return structuredClone(this.state);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.credentials !== null;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.requestJson<T>("GET", endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.requestJson<T>("POST", endpoint, body);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.requestJson<T>("PUT", endpoint, body);
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.requestJson<T>("PATCH", endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.requestJson<T>("DELETE", endpoint);
  }

  async restartLeagueUx(): Promise<void> {
    await this.post<void>("/riotclient/kill-and-restart-ux");
  }

  async getAsset(endpoint: string): Promise<{ body: Buffer; contentType: string }> {
    if (!allowedLcuAssetEndpoint(endpoint)) {
      throw new Error("Only local game-data assets may be proxied.");
    }
    const response = await this.requestBuffer("GET", endpoint);
    return {
      body: response.body,
      contentType: response.headers["content-type"] ?? "application/octet-stream",
    };
  }

  private async discoverAndConnect(): Promise<void> {
    if (this.stopping) return;
    try {
      const credentials = await readLcuCredentials(this.configuredPath());
      if (!credentials) {
        this.setState({
          status: "discovering",
          phase: "Waiting for League",
          lastError: "No active League lockfile was found in the configured or known installation folders.",
        });
        this.scheduleReconnect();
        return;
      }
      this.credentials = credentials;
      this.setState({ status: "connecting", phase: "Connecting", lastError: null });
      await this.openSocket(credentials);
    } catch (error) {
      this.logger.warn("League client connection failed", { error: String(error) });
      this.disconnectWithError(error);
    }
  }

  private async openSocket(credentials: LcuCredentials): Promise<void> {
    const authorization = `Basic ${Buffer.from(`riot:${credentials.password}`).toString("base64")}`;
    const socket = new WebSocket(`wss://127.0.0.1:${credentials.port}/`, {
      rejectUnauthorized: false,
      headers: { Authorization: authorization },
    });
    this.socket = socket;

    socket.once("open", () => {
      socket.send(JSON.stringify([5, "OnJsonApiEvent"]));
      void this.initializeConnection();
    });
    socket.on("message", (raw) => this.handleSocketMessage(raw));
    socket.once("close", () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopping) this.disconnectWithError(new Error("League event connection closed."));
    });
    socket.once("error", (error) => {
      this.logger.debug("League WebSocket error", { error: String(error) });
    });
  }

  private async initializeConnection(): Promise<void> {
    try {
      const regionLocale = await this.get<{ region?: string; locale?: string }>("/riotclient/region-locale");
      const phase = await this.get<string>("/lol-gameflow/v1/gameflow-phase").catch(() => "None");
      const patch = await this.get<string>("/lol-patch/v1/game-version").catch(() => null);
      const capabilities = await this.detectCapabilities();
      this.setState({
        status: "connected",
        phase,
        region: regionLocale.region ?? null,
        locale: regionLocale.locale ?? null,
        patch,
        capabilities,
        connectedAt: new Date().toISOString(),
        lastError: null,
      });
      this.logger.info("Connected to League Client API", { region: regionLocale.region, patch });
      this.emit("connected", this.getState());
    } catch (error) {
      this.disconnectWithError(error);
    }
  }

  private async detectCapabilities(): Promise<CapabilitySet> {
    const probe = async (endpoint: string): Promise<boolean> => {
      try {
        await this.get(endpoint);
        return true;
      } catch {
        return false;
      }
    };
    const [championCatalog, skinInventory, lootInventory, runes, summonerSpells, presence] = await Promise.all([
      probe("/lol-game-data/assets/v1/champion-summary.json"),
      probe("/lol-inventory/v2/inventory/CHAMPION_SKIN"),
      probe("/lol-loot/v1/player-loot"),
      probe("/lol-perks/v1/pages"),
      probe("/lol-game-data/assets/v1/summoner-spells.json"),
      probe("/lol-chat/v1/me"),
    ]);
    return {
      championCatalog,
      skinInventory,
      lootInventory,
      runes,
      summonerSpells,
      presence,
      readyCheck: true,
      champSelect: true,
      clientTab: false,
    };
  }

  private handleSocketMessage(raw: RawData): void {
    try {
      const message = JSON.parse(raw.toString()) as unknown;
      if (!Array.isArray(message) || message[0] !== 8 || message[1] !== "OnJsonApiEvent") return;
      const event = message[2] as LcuEvent;
      if (!event || typeof event.uri !== "string") return;
      if (event.uri === "/lol-gameflow/v1/gameflow-phase" && typeof event.data === "string") {
        this.setState({ phase: event.data });
      }
      this.emit("event", event);
    } catch (error) {
      this.logger.debug("Discarded malformed LCU event", { error: String(error) });
    }
  }

  private async requestJson<T>(method: LcuMethod, endpoint: string, body?: unknown): Promise<T> {
    const response = await this.requestBuffer(method, endpoint, body);
    if (response.body.length === 0) return undefined as T;
    try {
      return JSON.parse(response.body.toString("utf8")) as T;
    } catch {
      return response.body.toString("utf8") as T;
    }
  }

  private requestBuffer(
    method: LcuMethod,
    endpoint: string,
    body?: unknown,
  ): Promise<{ body: Buffer; headers: Record<string, string> }> {
    const credentials = this.credentials;
    if (!credentials) return Promise.reject(new Error("League client is not connected."));
    if (!endpoint.startsWith("/") || endpoint.length > 4_096 || /[\\\0\r\n]/u.test(endpoint)) {
      return Promise.reject(new Error("Invalid LCU endpoint."));
    }
    const serialized = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");

    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: "127.0.0.1",
          port: credentials.port,
          path: endpoint,
          method,
          auth: `riot:${credentials.password}`,
          rejectUnauthorized: false,
          headers: serialized
            ? { "Content-Type": "application/json", "Content-Length": String(serialized.byteLength) }
            : undefined,
          timeout: 6_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let responseSize = 0;
          let responseTooLarge = false;
          const declaredSize = Number(response.headers["content-length"] ?? "0");
          if (Number.isFinite(declaredSize) && declaredSize > MAX_LCU_RESPONSE_BYTES) {
            response.resume();
            reject(new Error("LCU response exceeded the local safety limit."));
            return;
          }
          response.on("data", (chunk: Buffer) => {
            responseSize += chunk.byteLength;
            if (responseSize > MAX_LCU_RESPONSE_BYTES) {
              responseTooLarge = true;
              response.destroy(new Error("LCU response exceeded the local safety limit."));
              return;
            }
            chunks.push(chunk);
          });
          response.once("error", reject);
          response.on("end", () => {
            if (responseTooLarge) return;
            const responseBody = Buffer.concat(chunks);
            const statusCode = response.statusCode ?? 500;
            if (statusCode < 200 || statusCode >= 300) {
              reject(new LcuHttpError(statusCode, endpoint, `LCU ${method} ${endpoint} returned ${statusCode}.`));
              return;
            }
            const headers = Object.fromEntries(
              Object.entries(response.headers).flatMap(([key, value]) =>
                typeof value === "string" ? [[key, value]] : [],
              ),
            );
            resolve({ body: responseBody, headers });
          });
        },
      );
      request.once("timeout", () => request.destroy(new Error(`LCU ${method} ${endpoint} timed out.`)));
      request.once("error", reject);
      if (serialized) request.write(serialized);
      request.end();
    });
  }

  private disconnectWithError(error: unknown): void {
    this.credentials = null;
    this.socket?.terminate();
    this.socket = null;
    this.setState({
      status: "disconnected",
      phase: "Waiting for League",
      capabilities: unavailableCapabilities(),
      connectedAt: null,
      lastError: error instanceof Error ? error.message : String(error),
    });
    this.emit("disconnected", this.getState());
    this.scheduleReconnect();
  }

  private setState(update: Partial<LcuConnectionState>): void {
    this.state = { ...this.state, ...update };
    this.emit("state", this.getState());
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.discoverAndConnect();
    }, 2_000);
  }
}
