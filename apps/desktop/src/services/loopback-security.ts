const bridgeSessionProtocolPrefix = "summonerkit-session.";
export const DEFAULT_BRIDGE_PORT = 17_654;
const minimumBridgePort = 1_024;
const maximumBridgePort = 65_535;

/**
 * Resolve the bridge port once at process start so the HTTP server and the
 * generated client plugin cannot silently disagree about where to connect.
 */
export function bridgePortFromEnvironment(candidate = process.env.SUMMONERKIT_BRIDGE_PORT): number {
  if (candidate === undefined || candidate.trim() === "") return DEFAULT_BRIDGE_PORT;
  if (!/^\d+$/u.test(candidate)) throw new Error("SUMMONERKIT_BRIDGE_PORT must be a decimal TCP port.");
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < minimumBridgePort || port > maximumBridgePort) {
    throw new Error(`SUMMONERKIT_BRIDGE_PORT must be between ${minimumBridgePort} and ${maximumBridgePort}.`);
  }
  return port;
}

export function expectedLoopbackHost(port: number): string {
  return `127.0.0.1:${port}`;
}

export function allowedLoopbackOrigin(origin: string | undefined, port: number): boolean {
  return origin === `http://${expectedLoopbackHost(port)}`;
}

export function bridgeSessionProtocol(sessionId: string): string {
  return `${bridgeSessionProtocolPrefix}${sessionId}`;
}

export function bridgeSessionFromProtocols(protocolHeader: string | undefined): string | null {
  if (!protocolHeader) return null;
  const sessions = protocolHeader
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.startsWith(bridgeSessionProtocolPrefix));
  if (sessions.length !== 1) return null;
  const sessionId = sessions[0]!.slice(bridgeSessionProtocolPrefix.length);
  return /^[A-Za-z0-9_-]{32,128}$/u.test(sessionId) ? sessionId : null;
}
