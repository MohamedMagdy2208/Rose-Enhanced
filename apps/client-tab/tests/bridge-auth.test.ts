import { Window as HappyWindow } from "happy-dom";
import { describe, expect, it } from "vitest";
import { CLIENT_TAB_PLUGIN_VERSION } from "@rose-enhanced/contracts";
import {
  BRIDGE_AUTH_MESSAGE_TYPE,
  receiveBridgeAuthorization,
} from "../src/bridge-auth";

const expectedToken = "parent-token-with-at-least-thirty-two-characters";

describe("client-tab bridge authorization", () => {
  it("accepts the secret from its parent frame and ignores other senders", async () => {
    const browserWindow = new HappyWindow({ url: "http://127.0.0.1:17654/client/" });
    const unrelatedWindow = new HappyWindow({ url: "http://unrelated.test/" });
    const authorizationPromise = receiveBridgeAuthorization(browserWindow as unknown as Window, 100);

    browserWindow.dispatchEvent(
      new browserWindow.MessageEvent("message", {
        data: {
          type: BRIDGE_AUTH_MESSAGE_TYPE,
          token: "unrelated-token-with-at-least-thirty-two-characters",
          protocolVersion: 4,
          pluginVersion: CLIENT_TAB_PLUGIN_VERSION,
        },
        source: unrelatedWindow,
      }),
    );
    browserWindow.dispatchEvent(
      new browserWindow.MessageEvent("message", {
        data: {
          type: BRIDGE_AUTH_MESSAGE_TYPE,
          token: expectedToken,
          protocolVersion: 4,
          pluginVersion: CLIENT_TAB_PLUGIN_VERSION,
        },
        source: browserWindow.parent,
      }),
    );

    await expect(authorizationPromise).resolves.toEqual({
      token: expectedToken,
      protocolVersion: 4,
      pluginVersion: CLIENT_TAB_PLUGIN_VERSION,
    });
    expect(browserWindow.location.search).toBe("");
    await Promise.all([browserWindow.happyDOM.close(), unrelatedWindow.happyDOM.close()]);
  });
});
