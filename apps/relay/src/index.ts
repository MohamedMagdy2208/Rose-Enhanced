import { DurableObject } from "cloudflare:workers";
import { remoteTokenFromProtocols, remoteWebSocketProtocol } from "@summonerkit/remote";

interface Env {
  ROOMS: DurableObjectNamespace<PairingRoom>;
  PAIRING_ADMIN_SECRET: string;
  MOBILE_ORIGIN: string;
}

interface RoomRecord {
  expiresAt: number;
  desktopTokenHash: string;
  desktopPublicKey: JsonWebKey;
  mobileTokenHash: string | null;
  mobilePublicKey: JsonWebKey | null;
  deviceId: string | null;
  deviceName: string | null;
  pairingProof: string | null;
}

interface SocketAttachment {
  role: "desktop" | "mobile";
  windowStartedAt: number;
  messagesInWindow: number;
}

interface RoomCreationRequest {
  desktopPublicKey: JsonWebKey;
  expiresInSeconds: number;
}

interface MobileClaim {
  pairingProof: string;
  deviceName: string;
  publicKey: JsonWebKey;
}

const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_HTTP_BODY_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_TEN_SECONDS = 40;
const MAX_SESSION_MS = 24 * 60 * 60 * 1_000;
const RELAY_PROTOCOL_VERSION = 1;
const p256Coordinate = /^[A-Za-z0-9_-]{43}$/u;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;
const sha256HexPattern = /^[0-9a-f]{64}$/u;

const responseSecurityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "cross-origin-resource-policy": "same-site",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { ...responseSecurityHeaders, ...headers } });
}

function randomToken(bytes = 24): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fixedTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function p256PublicKey(candidate: unknown): JsonWebKey | null {
  if (!candidate || typeof candidate !== "object") return null;
  const key = candidate as JsonWebKey;
  if (!(key.kty === "EC"
    && key.crv === "P-256"
    && typeof key.x === "string"
    && p256Coordinate.test(key.x)
    && typeof key.y === "string"
    && p256Coordinate.test(key.y))) return null;
  return { kty: "EC", crv: "P-256", x: key.x, y: key.y };
}

function roomCreationRequest(body: Record<string, unknown>): RoomCreationRequest | null {
  const desktopPublicKey = p256PublicKey(body.desktopPublicKey);
  if (!desktopPublicKey) return null;
  const requestedExpiry = typeof body.expiresInSeconds === "number" && Number.isFinite(body.expiresInSeconds)
    ? body.expiresInSeconds
    : 120;
  return {
    desktopPublicKey,
    expiresInSeconds: Math.min(Math.max(requestedExpiry, 30), 300),
  };
}

function mobileClaim(body: Record<string, unknown>): MobileClaim | null {
  const publicKey = p256PublicKey(body.publicKey);
  if (typeof body.pairingProof !== "string" || body.pairingProof.length !== 43 || !base64UrlPattern.test(body.pairingProof)) return null;
  if (typeof body.deviceName !== "string" || body.deviceName.trim().length < 1 || body.deviceName.length > 80) return null;
  if (!publicKey) return null;
  return { pairingProof: body.pairingProof, deviceName: body.deviceName.trim(), publicKey };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTTP_BODY_BYTES) {
    throw new Error("Request body is too large.");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_HTTP_BODY_BYTES) throw new Error("Request body is too large.");
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object.");
  return parsed as Record<string, unknown>;
}

function roomRoute(pathname: string): { roomId: string; action: "claim" | "socket" } | null {
  const match = /^\/rooms\/([A-Za-z0-9_-]{8,128})\/(claim|socket)$/u.exec(pathname);
  if (!match?.[1] || (match[2] !== "claim" && match[2] !== "socket")) return null;
  return { roomId: match[1], action: match[2] };
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin === env.MOBILE_ORIGIN
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : {};
}

function preflightResponse(cors: Record<string, string>): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseSecurityHeaders,
      ...cors,
      "access-control-allow-headers": "content-type,x-summonerkit-admin",
      "access-control-allow-methods": "POST,GET,OPTIONS",
    },
  });
}

function relayHealthResponse(env: Env): Response {
  const mobileOrigin = (() => {
    try {
      const url = new URL(env.MOBILE_ORIGIN);
      return url.protocol === "https:" && url.origin === env.MOBILE_ORIGIN ? url.origin : null;
    } catch {
      return null;
    }
  })();
  if (!mobileOrigin || !env.PAIRING_ADMIN_SECRET || env.PAIRING_ADMIN_SECRET.length < 32) {
    return json({ status: "misconfigured", service: "summonerkit-relay", protocolVersion: RELAY_PROTOCOL_VERSION }, 503);
  }
  return json({ status: "ok", service: "summonerkit-relay", protocolVersion: RELAY_PROTOCOL_VERSION, mobileOrigin, checkedAt: new Date().toISOString() });
}

function relayAdminError(request: Request, env: Env, cors: Record<string, string>): Response | null {
  if (!env.PAIRING_ADMIN_SECRET || env.PAIRING_ADMIN_SECRET.length < 32) {
    return json({ error: "Relay administrator secret is not securely configured." }, 503, cors);
  }
  const suppliedSecret = request.headers.get("x-summonerkit-admin") ?? "";
  return fixedTimeEqual(suppliedSecret, env.PAIRING_ADMIN_SECRET)
    ? null
    : json({ error: "Unauthorized" }, 401, cors);
}

async function createRoom(request: Request, env: Env, url: URL, cors: Record<string, string>): Promise<Response> {
  const authorizationError = relayAdminError(request, env, cors);
  if (authorizationError) return authorizationError;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch {
    return json({ error: "Invalid request body." }, 400, cors);
  }
  const creation = roomCreationRequest(body);
  if (!creation) return json({ error: "A P-256 desktop public key is required." }, 400, cors);
  const roomId = randomToken(12);
  const desktopToken = randomToken(32);
  const expiresAt = Date.now() + creation.expiresInSeconds * 1_000;
  await env.ROOMS.getByName(roomId).fetch("https://room.internal/create", {
    method: "POST",
    body: JSON.stringify({
      desktopPublicKey: creation.desktopPublicKey,
      desktopTokenHash: await digest(desktopToken),
      expiresAt,
    }),
  });
  return json({
    roomId,
    accessToken: desktopToken,
    expiresAt: new Date(expiresAt).toISOString(),
    websocketUrl: `${url.origin}/rooms/${roomId}/socket`,
  }, 201, cors);
}

async function forwardRoomRequest(request: Request, env: Env, url: URL, cors: Record<string, string>): Promise<Response> {
  const route = roomRoute(url.pathname);
  if (!route) return json({ error: "Not found" }, 404, cors);
  if (route.action === "claim" && request.headers.get("origin") !== env.MOBILE_ORIGIN) {
    return json({ error: "Pairing origin is not allowed." }, 403, cors);
  }
  const forwardedUrl = new URL(request.url);
  forwardedUrl.hostname = "room.internal";
  forwardedUrl.pathname = `/${route.action}`;
  const response = await env.ROOMS.getByName(route.roomId).fetch(new Request(forwardedUrl, request));
  if (route.action === "claim" && response.ok) {
    const claim = await response.json<Record<string, unknown>>();
    return json({ ...claim, websocketUrl: `${url.origin}/rooms/${route.roomId}/socket` }, response.status, cors);
  }
  const output = new Response(response.body, response);
  for (const [key, value] of Object.entries({ ...responseSecurityHeaders, ...cors })) output.headers.set(key, value);
  return output;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return preflightResponse(cors);
    if (request.method === "GET" && url.pathname === "/health") return relayHealthResponse(env);
    if (request.method === "POST" && url.pathname === "/rooms") return createRoom(request, env, url, cors);
    return forwardRoomRequest(request, env, url, cors);
  },
} satisfies ExportedHandler<Env>;

export class PairingRoom extends DurableObject<Env> {
  constructor(context: DurableObjectState, env: Env) {
    super(context, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") return this.create(request);
    if (request.method === "POST" && url.pathname === "/claim") return this.claim(request);
    if (request.method === "GET" && url.pathname === "/socket") return this.connectSocket(request);
    return json({ error: "Not found" }, 404);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      socket.close(1008, "Missing connection state");
      return;
    }
    const size = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    const now = Date.now();
    if (now - attachment.windowStartedAt >= 10_000) {
      attachment.windowStartedAt = now;
      attachment.messagesInWindow = 0;
    }
    attachment.messagesInWindow += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messagesInWindow > MAX_MESSAGES_PER_TEN_SECONDS) {
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    for (const peer of this.ctx.getWebSockets()) {
      const peerAttachment = peer.deserializeAttachment() as SocketAttachment | null;
      if (peer !== socket && peerAttachment?.role !== attachment.role) peer.send(message);
    }
  }

  async alarm(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Pairing room expired");
    await this.ctx.storage.deleteAll();
  }

  private async create(request: Request): Promise<Response> {
    if (await this.ctx.storage.get<RoomRecord>("room")) return json({ error: "Room already exists." }, 409);
    const body = await readJsonObject(request);
    if (!p256PublicKey(body.desktopPublicKey)
      || typeof body.desktopTokenHash !== "string"
      || !sha256HexPattern.test(body.desktopTokenHash)
      || typeof body.expiresAt !== "number"
      || !Number.isSafeInteger(body.expiresAt)
      || body.expiresAt <= Date.now()
      || body.expiresAt > Date.now() + 5 * 60 * 1_000) {
      return json({ error: "Room metadata is invalid." }, 400);
    }
    const desktopPublicKey = p256PublicKey(body.desktopPublicKey);
    if (!desktopPublicKey) return json({ error: "Room metadata is invalid." }, 400);
    const record: RoomRecord = {
      expiresAt: body.expiresAt,
      desktopTokenHash: body.desktopTokenHash,
      desktopPublicKey,
      mobileTokenHash: null,
      mobilePublicKey: null,
      deviceId: null,
      deviceName: null,
      pairingProof: null,
    };
    await this.ctx.storage.put<RoomRecord>("room", record);
    await this.ctx.storage.setAlarm(record.expiresAt);
    return json({ ok: true }, 201);
  }

  private async claim(request: Request): Promise<Response> {
    const record = await this.ctx.storage.get<RoomRecord>("room");
    if (!record || record.expiresAt <= Date.now()) return json({ error: "Pairing code expired." }, 410);
    if (record.mobileTokenHash) return json({ error: "Pairing code was already used." }, 409);
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request);
    } catch {
      return json({ error: "Invalid pairing request." }, 400);
    }
    const claim = mobileClaim(body);
    if (!claim) return json({ error: "Invalid pairing request." }, 400);
    const accessToken = randomToken(32);
    const deviceId = crypto.randomUUID();
    record.mobileTokenHash = await digest(accessToken);
    record.mobilePublicKey = claim.publicKey;
    record.deviceId = deviceId;
    record.deviceName = claim.deviceName;
    record.pairingProof = claim.pairingProof;
    record.expiresAt = Date.now() + MAX_SESSION_MS;
    await this.ctx.storage.put("room", record);
    await this.ctx.storage.setAlarm(record.expiresAt);
    return json({
      deviceId,
      accessToken,
      websocketUrl: request.url.replace(/\/claim(?:\?.*)?$/u, "/socket"),
      desktopPublicKey: record.desktopPublicKey,
    });
  }

  private async connectSocket(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket upgrade required." }, 426);
    const record = await this.ctx.storage.get<RoomRecord>("room");
    if (!record || record.expiresAt <= Date.now()) return json({ error: "Pairing room expired." }, 410);
    const token = remoteTokenFromProtocols(request.headers.get("sec-websocket-protocol")) ?? "";
    const tokenHash = await digest(token);
    const role = fixedTimeEqual(tokenHash, record.desktopTokenHash)
      ? "desktop"
      : record.mobileTokenHash && fixedTimeEqual(tokenHash, record.mobileTokenHash)
        ? "mobile"
        : null;
    if (!role) return json({ error: "Invalid device token." }, 401);
    if (role === "mobile" && request.headers.get("origin") !== this.env.MOBILE_ORIGIN) {
      return json({ error: "Mobile WebSocket origin is not allowed." }, 403);
    }
    for (const existing of this.ctx.getWebSockets()) {
      const attachment = existing.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === role) existing.close(1008, "Replaced by a newer connection");
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role, windowStartedAt: Date.now(), messagesInWindow: 0 } satisfies SocketAttachment);
    if (role === "desktop" && record.mobilePublicKey) {
      server.send(JSON.stringify({ kind: "peer-key", deviceId: record.deviceId, deviceName: record.deviceName, publicKey: record.mobilePublicKey, pairingProof: record.pairingProof }));
    } else if (role === "mobile" && record.mobilePublicKey) {
      const pairingMetadata = JSON.stringify({ kind: "peer-key", deviceId: record.deviceId, deviceName: record.deviceName, publicKey: record.mobilePublicKey, pairingProof: record.pairingProof });
      for (const existing of this.ctx.getWebSockets()) {
        const attachment = existing.deserializeAttachment() as SocketAttachment | null;
        if (existing !== server && attachment?.role === "desktop") existing.send(pairingMetadata);
      }
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": remoteWebSocketProtocol },
    });
  }
}
