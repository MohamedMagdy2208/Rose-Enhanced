import { CLIENT_TAB_PROTOCOL_VERSION } from "@rose-enhanced/contracts";

export const BRIDGE_AUTH_MESSAGE_TYPE = "rose-enhanced.auth";

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
  return (
    candidate.type === BRIDGE_AUTH_MESSAGE_TYPE &&
    typeof candidate.token === "string" &&
    candidate.token.length >= 32 &&
    Number.isSafeInteger(candidate.protocolVersion) &&
    typeof candidate.pluginVersion === "string" &&
    candidate.pluginVersion.length > 0
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
      reject(new Error("The Rose Enhanced client tab did not receive bridge authorization."));
    }, timeoutMs);

    browserWindow.addEventListener("message", handleMessage);
  });
}

export function assertCurrentProtocol(authorization: BridgeAuthorization): void {
  if (authorization.protocolVersion !== CLIENT_TAB_PROTOCOL_VERSION) {
    throw new Error("The Rose Enhanced client integration is outdated. Repair it, then restart League.");
  }
}
