import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import type { AppLogger } from "../logger";
import { LcuClient } from "./lcu-client";

const execFileAsync = promisify(execFile);
const password = "integration-password";

interface CapturedRequest {
  method: string;
  path: string;
  body: string;
  authorization: string | null;
}

class FakeLcuServer {
  readonly requests: CapturedRequest[] = [];
  readonly directory: string;
  readonly server: https.Server;
  readonly sockets: WebSocketServer;
  playerResponse = "None";

  private constructor(directory: string, server: https.Server, sockets: WebSocketServer) {
    this.directory = directory;
    this.server = server;
    this.sockets = sockets;
    server.on("request", (request, response) => void this.route(request, response));
  }

  static async start(): Promise<FakeLcuServer> {
    const directory = await mkdtemp(path.join(tmpdir(), "summonerkit-fake-lcu-"));
    try {
      await generateCertificate(directory);
      const server = https.createServer({
        key: await readFile(path.join(directory, "key.pem")),
        cert: await readFile(path.join(directory, "cert.pem")),
      });
      const sockets = new WebSocketServer({ server });
      const fakeLcu = new FakeLcuServer(directory, server, sockets);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fake LCU did not bind a TCP port.");
      await writeFile(path.join(directory, "lockfile"), `LeagueClientUx:1234:${address.port}:${password}:https`, "utf8");
      return fakeLcu;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  sendEvent(uri: string, payload: unknown): void {
    const frame = JSON.stringify([8, "OnJsonApiEvent", { eventType: "Update", uri, data: payload }]);
    for (const socket of this.sockets.clients) socket.send(frame);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets.clients) socket.terminate();
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    await rm(this.directory, { recursive: true, force: true });
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await requestBody(request);
    const requestPath = request.url ?? "/";
    this.requests.push({
      method: request.method ?? "GET",
      path: requestPath,
      body,
      authorization: request.headers.authorization ?? null,
    });
    if (request.headers.authorization !== expectedAuthorization()) {
      writeJson(response, 401, { error: "unauthorized" });
      return;
    }
    if (request.method === "POST" && requestPath === "/lol-matchmaking/v1/ready-check/accept") {
      if (body !== "{}") {
        writeJson(response, 400, { error: "expected an empty JSON object" });
        return;
      }
      this.playerResponse = "Accepted";
      // Reproduce the August 2026 LCU failure: the state changes, but the HTTP response never completes.
      return;
    }
    this.writeProbeResponse(requestPath, response);
  }

  private writeProbeResponse(requestPath: string, response: ServerResponse): void {
    const probes = new Map<string, unknown>([
      ["/riotclient/region-locale", { region: "EUW", locale: "en_GB" }],
      ["/lol-gameflow/v1/gameflow-phase", "Lobby"],
      ["/lol-patch/v1/game-version", "26.17.test"],
      ["/lol-game-data/assets/v1/champion-summary.json", []],
      ["/lol-inventory/v2/inventory/CHAMPION_SKIN", []],
      ["/lol-loot/v1/player-loot", []],
      ["/lol-perks/v1/pages", []],
      ["/lol-game-data/assets/v1/summoner-spells.json", []],
      ["/lol-chat/v1/me", { availability: "chat" }],
      ["/lol-matchmaking/v1/ready-check", { state: "InProgress", playerResponse: this.playerResponse }],
    ]);
    if (!probes.has(requestPath)) {
      writeJson(response, 404, { error: "missing fixture" });
      return;
    }
    writeJson(response, 200, probes.get(requestPath));
  }
}

async function generateCertificate(directory: string): Promise<void> {
  await writeFile(path.join(directory, "openssl.cnf"), "[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=127.0.0.1\n", "utf8");
  await execFileAsync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", path.join(directory, "key.pem"),
    "-out", path.join(directory, "cert.pem"),
    "-config", path.join(directory, "openssl.cnf"), "-days", "1",
  ], { windowsHide: true });
}

function expectedAuthorization(): string {
  return `Basic ${Buffer.from(`riot:${password}`).toString("base64")}`;
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": String(body.byteLength),
  });
  response.end(body);
}

let fakeLcu: FakeLcuServer | null = null;
let client: LcuClient | null = null;

afterEach(async () => {
  client?.stop();
  client = null;
  await fakeLcu?.close();
  fakeLcu = null;
});

describe("LCU HTTPS and WebSocket integration", () => {
  it("discovers authenticated LCU, consumes events, and confirms a timed-out ready-check accept", async () => {
    fakeLcu = await FakeLcuServer.start();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppLogger;
    client = new LcuClient(() => fakeLcu!.directory, logger);
    client.start();

    await vi.waitFor(() => expect(client!.getState()).toMatchObject({ status: "connected", phase: "Lobby", patch: "26.17.test" }));
    fakeLcu.sendEvent("/lol-gameflow/v1/gameflow-phase", "ChampSelect");
    await vi.waitFor(() => expect(client!.getState().phase).toBe("ChampSelect"));

    await client.respondToReadyCheck("accept");

    const acceptRequest = fakeLcu.requests.find((request) => request.path.endsWith("/ready-check/accept"));
    expect(acceptRequest).toEqual({
      method: "POST",
      path: "/lol-matchmaking/v1/ready-check/accept",
      body: "{}",
      authorization: expectedAuthorization(),
    });
    expect(fakeLcu.playerResponse).toBe("Accepted");
  }, 10_000);
});
