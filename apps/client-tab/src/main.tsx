import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PRODUCT_NAME } from "@summonerkit/contracts";
import { SummonerKitApp, emptySnapshot } from "@summonerkit/ui";
import { assertCurrentProtocol, receiveBridgeAuthorization } from "./bridge-auth";
import { WebSocketBridge } from "./websocket-bridge";

const baseUrl = `${window.location.protocol}//${window.location.host}`;
const container = document.getElementById("root");
if (!container) throw new Error("Client-tab root element was not found.");

try {
  const authorization = await receiveBridgeAuthorization(window);
  assertCurrentProtocol(authorization);
  const bridge = new WebSocketBridge(baseUrl, authorization.token, emptySnapshot);
  await bridge.registerClientSession(authorization.protocolVersion, authorization.pluginVersion);
  const initialSnapshot = await bridge.getSnapshot();
  createRoot(container).render(
    <StrictMode>
      <SummonerKitApp bridge={bridge} initialSnapshot={initialSnapshot} surface="client" />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : `The ${PRODUCT_NAME} bridge could not start.`;
  createRoot(container).render(
    <main className="client-startup-error" role="alert">
      <p className="eyebrow">Connection doctor</p>
      <h1>Client integration needs attention</h1>
      <p>{message}</p>
      <p>Open {PRODUCT_NAME} on Windows, choose Diagnostics, and run Repair &amp; reload. Active games and champion select are never interrupted.</p>
    </main>,
  );
}
