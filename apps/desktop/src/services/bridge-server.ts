import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { app } from "electron";
import { WebSocketServer, type WebSocket } from "ws";
import { companionCommandSchema, type CompanionCommand, type CommandResult } from "@summonerkit/contracts";
import type { CompanionStore } from "./companion-store";
import type { LcuClient } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";
import { isClientSurfaceCommandAllowed } from "./client-surface-policy";
import { clientSurfaceSnapshot } from "./client-surface-snapshot";
import {
  allowedLoopbackOrigin,
  bridgePortFromEnvironment,
  bridgeSessionFromProtocols,
  expectedLoopbackHost,
} from "./loopback-security";
import { z } from "zod";

interface ClientRate {
  windowStartedAt: number;
  commands: number;
}

const bridgeCommandMessageSchema = z.object({
  type: z.literal("command"),
  id: z.string().uuid(),
  command: companionCommandSchema,
}).strict();
const clientSessionSchema = z.object({
  protocolVersion: z.number().int().nonnegative().max(100),
  pluginVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/u),
}).strict();

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const bridgeSessionLifetimeMs = 30_000;
const maxPendingBridgeSessions = 64;
const maxBridgeJsonBytes = 8 * 1024 * 1024;
const maxBridgeHeaderBytes = 16 * 1024;

interface BridgeServerDependencies {
  token: string;
  store: CompanionStore;
  lcu: LcuClient;
  dispatch: (command: CompanionCommand) => Promise<CommandResult>;
  registerClientSession: (protocolVersion: number | null, pluginVersion: string | null) => void;
  logger: AppLogger;
}

export class BridgeServer {
  private readonly port: number;
  private readonly server: http.Server;
  private readonly sockets = new Set<WebSocket>();
  private readonly rates = new WeakMap<WebSocket, ClientRate>();
  private readonly sessions = new Map<string, number>();
  private readonly webSockets: WebSocketServer;
  private readonly handleStoreChanged = (): void => this.broadcastSnapshot();

  constructor(private readonly dependencies: BridgeServerDependencies) {
    this.port = bridgePortFromEnvironment();
    this.server = http.createServer({ maxHeaderSize: maxBridgeHeaderBytes }, (request, response) => void this.handleRequest(request, response));
    this.server.maxHeadersCount = 64;
    this.server.requestTimeout = 10_000;
    this.server.headersTimeout = 5_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxRequestsPerSocket = 100;
    this.webSockets = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
    this.server.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket, head));
    this.webSockets.on("connection", (socket) => this.handleSocket(socket));
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => {
        this.server.off("error", reject);
        this.dependencies.store.off("changed", this.handleStoreChanged);
        this.dependencies.store.on("changed", this.handleStoreChanged);
        this.dependencies.logger.info("Client-tab bridge listening", { host: "127.0.0.1", port: this.port });
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    this.dependencies.store.off("changed", this.handleStoreChanged);
    for (const socket of this.sockets) socket.close(1_001, "Desktop bridge is closing");
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);
      this.setSecurityHeaders(response);
      if (request.headers.host !== expectedLoopbackHost(this.port)) return this.send(response, 421, "Misdirected request");
      await this.routeRequest(request, response, url);
    } catch (error) {
      this.dependencies.logger.debug("Bridge request failed", { error: String(error) });
      return this.send(response, 502, "Local bridge request failed");
    }
  }

  private async routeRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (request.method === "POST") return this.handlePost(request, response, url.pathname);
    if (request.method === "GET") return this.handleGet(request, response, url);
    return this.send(response, 405, "Method not allowed");
  }

  private async handlePost(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
    if (!this.allowedHttpOrigin(request)) return this.send(response, 403, "Origin not allowed");
    if (!this.authorizedRequest(request)) return this.send(response, 401, "Unauthorized");
    if (pathname === "/bridge-session") return this.issueBridgeSession(response);
    if (pathname !== "/client-session") return this.send(response, 404, "Not found");
    const session = await this.readClientSession(request);
    this.dependencies.registerClientSession(session.protocolVersion, session.pluginVersion);
    return this.sendJson(response, 200, { registered: true });
  }

  private async handleGet(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    if (url.pathname === "/health") {
      return this.sendJson(response, 200, { status: "ok", connected: this.dependencies.lcu.isConnected() });
    }
    if (url.pathname === "/snapshot") {
      if (!this.allowedHttpOrigin(request)) return this.send(response, 403, "Origin not allowed");
      if (!this.authorizedRequest(request)) return this.send(response, 401, "Unauthorized");
      return this.sendJson(response, 200, clientSurfaceSnapshot(this.dependencies.store.getSnapshot()));
    }
    if (url.pathname === "/lcu-asset") return this.serveLcuAsset(url, response);
    if (url.pathname === "/" || url.pathname.startsWith("/client")) return this.serveClientAsset(url.pathname, response);
    return this.send(response, 404, "Not found");
  }

  private async serveLcuAsset(url: URL, response: ServerResponse): Promise<void> {
    const assetPath = url.searchParams.get("path");
    if (!assetPath) return this.send(response, 400, "Missing asset path");
    const asset = await this.dependencies.lcu.getAsset(assetPath);
    response.writeHead(200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(asset.body);
  }

  private handleUpgrade(request: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer): void {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);
    const allowedHost = request.headers.host === expectedLoopbackHost(this.port);
    if (url.pathname !== "/events" || !allowedHost || !allowedLoopbackOrigin(request.headers.origin, this.port) || !this.consumeBridgeSession(request)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      this.webSockets.emit("connection", webSocket, request);
    });
  }

  private handleSocket(socket: WebSocket): void {
    this.sockets.add(socket);
    this.rates.set(socket, { windowStartedAt: Date.now(), commands: 0 });
    const initialSnapshot = this.serializePayload({ type: "snapshot", snapshot: clientSurfaceSnapshot(this.dependencies.store.getSnapshot()) });
    if (!initialSnapshot) {
      socket.close(1_011, "Bridge snapshot is too large");
      return;
    }
    socket.send(initialSnapshot);
    socket.on("message", (raw) => void this.handleSocketMessage(socket, raw.toString()));
    socket.on("error", (error) => this.dependencies.logger.debug("Client-tab bridge socket failed", { error: String(error) }));
    socket.on("close", () => {
      this.sockets.delete(socket);
      if (this.sockets.size === 0) this.dependencies.registerClientSession(null, null);
    });
  }

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    if (!this.consumeRate(socket)) {
      socket.close(1_008, "Command rate exceeded");
      return;
    }
    try {
      const message = bridgeCommandMessageSchema.parse(JSON.parse(raw));
      if (!isClientSurfaceCommandAllowed(message.command)) {
        this.sendSocketPayload(socket, { type: "commandResult", id: message.id, result: { ok: false, message: "That command is available only in the desktop app." } });
        return;
      }
      const result = await this.dependencies.dispatch(message.command);
      this.sendSocketPayload(socket, { type: "commandResult", id: message.id, result });
    } catch {
      socket.close(1_007, "Invalid command message");
    }
  }

  private consumeRate(socket: WebSocket): boolean {
    const now = Date.now();
    const rate = this.rates.get(socket) ?? { windowStartedAt: now, commands: 0 };
    if (now - rate.windowStartedAt > 10_000) {
      rate.windowStartedAt = now;
      rate.commands = 0;
    }
    rate.commands += 1;
    this.rates.set(socket, rate);
    return rate.commands <= 30;
  }

  private broadcastSnapshot(): void {
    const message = this.serializePayload({ type: "snapshot", snapshot: clientSurfaceSnapshot(this.dependencies.store.getSnapshot()) });
    if (!message) {
      for (const socket of this.sockets) socket.close(1_011, "Bridge snapshot is too large");
      return;
    }
    for (const socket of this.sockets) if (socket.readyState === socket.OPEN) socket.send(message);
  }

  private async serveClientAsset(requestPath: string, response: ServerResponse): Promise<void> {
    const root = this.clientDistPath();
    const relativeRequest = requestPath === "/" || requestPath === "/client" || requestPath === "/client/"
      ? "index.html"
      : requestPath.replace(/^\/client\//, "");
    const candidate = path.resolve(root, relativeRequest);
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return this.send(response, 400, "Invalid asset path");
    }
    try {
      await access(candidate);
      const details = await stat(candidate);
      if (!details.isFile()) return this.send(response, 404, "Not found");
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(candidate).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": candidate.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
      });
      createReadStream(candidate).pipe(response);
    } catch {
      return this.send(response, 404, "SummonerKit client tab has not been built yet");
    }
  }

  private clientDistPath(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, "dist");
    return path.resolve(app.getAppPath(), "../client-tab/dist");
  }

  private authorizedRequest(request: IncomingMessage): boolean {
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? null;
    return this.tokensMatch(bearer);
  }

  private allowedHttpOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    return origin === undefined || allowedLoopbackOrigin(origin, this.port);
  }

  private issueBridgeSession(response: ServerResponse): void {
    const sessionId = randomBytes(32).toString("base64url");
    const now = Date.now();
    for (const [candidate, expiresAt] of this.sessions) if (expiresAt <= now) this.sessions.delete(candidate);
    while (this.sessions.size >= maxPendingBridgeSessions) {
      const oldest = this.sessions.keys().next().value as string;
      this.sessions.delete(oldest);
    }
    this.sessions.set(sessionId, now + bridgeSessionLifetimeMs);
    this.sendJson(response, 201, { sessionId });
  }

  private consumeBridgeSession(request: IncomingMessage): boolean {
    const sessionId = bridgeSessionFromProtocols(request.headers["sec-websocket-protocol"]);
    if (!sessionId) return false;
    const expiresAt = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return expiresAt !== undefined && expiresAt > Date.now();
  }

  private async readClientSession(request: IncomingMessage): Promise<{ protocolVersion: number; pluginVersion: string }> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > 4_096) throw new Error("Client session payload is too large.");
      chunks.push(bytes);
    }
    const body = clientSessionSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return { protocolVersion: body.protocolVersion, pluginVersion: body.pluginVersion };
  }

  private tokensMatch(candidate: string | null): boolean {
    if (!candidate || candidate.length > 256) return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(this.dependencies.token);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private setSecurityHeaders(response: ServerResponse): void {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:${this.port}; connect-src 'self' ws://127.0.0.1:${this.port}; font-src 'self'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
  }

  private send(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(body);
  }

  private sendJson(response: ServerResponse, status: number, body: unknown): void {
    const serialized = this.serializePayload(body);
    if (!serialized) {
      this.send(response, 413, "Bridge response is too large");
      return;
    }
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(serialized);
  }

  private serializePayload(payload: unknown): string | null {
    const serialized = JSON.stringify(payload);
    if (typeof serialized !== "string") return null;
    return Buffer.byteLength(serialized, "utf8") <= maxBridgeJsonBytes ? serialized : null;
  }

  private sendSocketPayload(socket: WebSocket, payload: unknown): void {
    const serialized = this.serializePayload(payload);
    if (!serialized) {
      socket.close(1_011, "Bridge response is too large");
      return;
    }
    socket.send(serialized);
  }
}
