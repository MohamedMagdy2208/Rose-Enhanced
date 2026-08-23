import { describe, expect, it } from "vitest";
import {
  remoteTokenFromProtocols,
  remoteWebSocketProtocol,
  remoteWebSocketProtocols,
} from "./websocket-auth";

describe("remote WebSocket authentication", () => {
  it("keeps access tokens out of WebSocket URLs", () => {
    expect(remoteWebSocketProtocols("token_123-abc")).toEqual([
      remoteWebSocketProtocol,
      "rose-enhanced-auth.token_123-abc",
    ]);
  });

  it.each([
    ["rose-enhanced-v1, rose-enhanced-auth.token_123-abc", "token_123-abc"],
    ["rose-enhanced-v1", null],
    [null, null],
  ])("extracts the access token from %s", (header, expected) => {
    expect(remoteTokenFromProtocols(header)).toBe(expected);
  });
});
