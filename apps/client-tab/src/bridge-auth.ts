import { CLIENT_TAB_PROTOCOL_VERSION } from "@summonerkit/contracts";

export const BRIDGE_AUTH_MESSAGE_TYPE = "summonerkit.auth";
const bridgeTokenPattern = /^[A-Za-z0-9_-]{32,256}$/u;
const pluginVersionPattern = /^[A-Za-z0-9._-]{1,40}$/u;

export interface BridgeAuthorization {
  token: string;
  protocolVersion: number;
  pluginVersion: string;
}

interface BridgeAuthMessage {
  readonly type: typeof BRIDGE_AUTH_MESSAGE_TYPE;
  readonly token: string;
  readonly protocolVersion: number;
  readonly pluginVersion: string;
}

function isBridgeAuthMessage(value: unknown): value is BridgeAuthMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<BridgeAuthMessage>;
  const protocolVersion = candidate.protocolVersion;
  return (
    candidate.type === BRIDGE_AUTH_MESSAGE_TYPE &&
    typeof candidate.token === "string" &&
    bridgeTokenPattern.test(candidate.token) &&
    typeof protocolVersion === "number" &&
    Number.isSafeInteger(protocolVersion) &&
    protocolVersion >= 0 &&
    protocolVersion <= 100 &&
    typeof candidate.pluginVersion === "string" &&
    pluginVersionPattern.test(candidate.pluginVersion)
  );
}

export function receiveBridgeAuthorization(
  browserWindow: Window,
  timeoutMs = 10_000,
): Promise<BridgeAuthorization> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== browserWindow.parent || !isBridgeAuthMessage(event.data)) {
        return;
      }

      cleanup();
      resolve({
        token: event.data.token,
        protocolVersion: event.data.protocolVersion,
        pluginVersion: event.data.pluginVersion,
      });
    };
    const cleanup = (): void => {
      browserWindow.clearTimeout(timeoutId);
      browserWindow.removeEventListener("message", handleMessage);
    };
    const timeoutId = browserWindow.setTimeout(() => {
      cleanup();
      reject(new Error("The SummonerKit client tab did not receive bridge authorization."));
    }, timeoutMs);

    browserWindow.addEventListener("message", handleMessage);
  });
}

export function assertCurrentProtocol(authorization: BridgeAuthorization): void {
  if (authorization.protocolVersion !== CLIENT_TAB_PROTOCOL_VERSION) {
    throw new Error("The SummonerKit client integration is outdated. Repair it from the desktop app; League will reload automatically when safe.");
  }
}
