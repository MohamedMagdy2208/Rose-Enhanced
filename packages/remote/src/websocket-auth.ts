export const remoteWebSocketProtocol = "rose-enhanced-v1";
const remoteAuthProtocolPrefix = "rose-enhanced-auth.";

export function remoteWebSocketProtocols(accessToken: string): string[] {
  return [remoteWebSocketProtocol, `${remoteAuthProtocolPrefix}${accessToken}`];
}

export function remoteTokenFromProtocols(protocolHeader: string | null): string | null {
  if (!protocolHeader) return null;
  const protocols = protocolHeader
    .split(",")
    .map((candidate) => candidate.trim());
  if (!protocols.includes(remoteWebSocketProtocol)) return null;
  const protocol = protocols.find((candidate) => candidate.startsWith(remoteAuthProtocolPrefix));
  return protocol?.slice(remoteAuthProtocolPrefix.length) || null;
}
