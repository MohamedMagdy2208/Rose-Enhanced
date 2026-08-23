import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { app } from "electron";
import { WebSocketServer, type WebSocket } from "ws";
import type { CompanionCommand, CommandResult } from "@rose-enhanced/contracts";
import type { CompanionStore } from "./companion-store";
import type { LcuClient } from "./lcu/lcu-client";
import type { AppLogger } from "./logger";
import { isClientSurfaceCommandAllowed } from "./client-surface-policy";
import {
  allowedLoopbackOrigin,
  bridgeSessionFromProtocols,
  expectedLoopbackHost,
} from "./loopback-security";

interface ClientRate {
  windowStartedAt: number;
  commands: number;
}

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

  constructor(private readonly dependencies: BridgeServerDependencies) {
    this.port = Number(process.env.ROSE_ENHANCED_BRIDGE_PORT ?? 17_654);
    this.server = http.createServer((request, response) => void this.handleRequest(request, response));
    this.webSockets = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
    this.server.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket, head));
    this.webSockets.on("connection", (socket) => this.handleSocket(socket));
    this.dependencies.store.on("changed", () => this.broadcastSnapshot());
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => {
        this.server.off("error", reject);
        this.dependencies.logger.info("Client-tab bridge listening", { host: "127.0.0.1", port: this.port });
        resolve();
      });
    });
  }

  stop(): Promise<void> {
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
      if (!this.authorizedRequest(request)) return this.send(response, 401, "Unauthorized");
      return this.sendJson(response, 200, this.dependencies.store.getSnapshot());
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
    socket.send(JSON.stringify({ type: "snapshot", snapshot: this.dependencies.store.getSnapshot() }));
    socket.on("message", (raw) => void this.handleSocketMessage(socket, raw.toString()));
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
      const message = JSON.parse(raw) as { type?: string; id?: string; command?: CompanionCommand };
      if (message.type !== "command" || typeof message.id !== "string" || !message.command) return;
      if (!isClientSurfaceCommandAllowed(message.command)) {
        socket.send(JSON.stringify({ type: "commandResult", id: message.id, result: { ok: false, message: "That command is available only in the desktop app." } }));
        return;
      }
      const result = await this.dependencies.dispatch(message.command);
      socket.send(JSON.stringify({ type: "commandResult", id: message.id, result }));
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
    const message = JSON.stringify({ type: "snapshot", snapshot: this.dependencies.store.getSnapshot() });
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
      return this.send(response, 404, "Client tab has not been built yet");
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
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    if (!Number.isSafeInteger(body.protocolVersion) || typeof body.pluginVersion !== "string") {
      throw new Error("Client session payload is invalid.");
    }
    return { protocolVersion: body.protocolVersion as number, pluginVersion: body.pluginVersion.slice(0, 40) };
  }

  private tokensMatch(candidate: string | null): boolean {
    if (!candidate) return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(this.dependencies.token);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private setSecurityHeaders(response: ServerResponse): void {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:${this.port}; connect-src 'self' ws://127.0.0.1:${this.port}; font-src 'self'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
  }

  private send(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(body);
  }

  private sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  }
}
