const bridgeSessionProtocolPrefix = "summonerkit-session.";

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
  const protocol = protocolHeader
    .split(",")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith(bridgeSessionProtocolPrefix));
  return protocol?.slice(bridgeSessionProtocolPrefix.length) || null;
}
