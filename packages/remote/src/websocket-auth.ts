export const remoteWebSocketProtocol = "summonerkit-v1";
const remoteAuthProtocolPrefix = "summonerkit-auth.";
const remoteTokenPattern = /^[A-Za-z0-9_-]{32,256}$/u;

export function remoteWebSocketProtocols(accessToken: string): string[] {
  if (!remoteTokenPattern.test(accessToken)) throw new Error("Invalid remote access token.");
  return [remoteWebSocketProtocol, `${remoteAuthProtocolPrefix}${accessToken}`];
}

export function remoteTokenFromProtocols(protocolHeader: string | null): string | null {
  if (!protocolHeader) return null;
  const protocols = protocolHeader
    .split(",")
    .map((candidate) => candidate.trim());
  if (!protocols.includes(remoteWebSocketProtocol)) return null;
  const authProtocols = protocols.filter((candidate) => candidate.startsWith(remoteAuthProtocolPrefix));
  if (authProtocols.length !== 1) return null;
  const token = authProtocols[0]!.slice(remoteAuthProtocolPrefix.length);
  return remoteTokenPattern.test(token) ? token : null;
}
