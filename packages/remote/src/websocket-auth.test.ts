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
      "summonerkit-auth.token_123-abc",
    ]);
  });

  it.each([
    ["summonerkit-v1, summonerkit-auth.token_123-abc", "token_123-abc"],
    ["summonerkit-v1", null],
    [null, null],
  ])("extracts the access token from %s", (header, expected) => {
    expect(remoteTokenFromProtocols(header)).toBe(expected);
  });
});
