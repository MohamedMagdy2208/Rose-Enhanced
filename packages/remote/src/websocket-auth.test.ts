import { describe, expect, it } from "vitest";
import {
  remoteTokenFromProtocols,
  remoteWebSocketProtocol,
  remoteWebSocketProtocols,
} from "./websocket-auth";

describe("remote WebSocket authentication", () => {
  const token = "token_123-abc_456-def_789-ghi_012-jkl_345";

  it("keeps access tokens out of WebSocket URLs", () => {
    expect(remoteWebSocketProtocols(token)).toEqual([
      remoteWebSocketProtocol,
      `summonerkit-auth.${token}`,
    ]);
  });

  it("refuses to generate an authorization protocol for a short token", () => {
    expect(() => remoteWebSocketProtocols("short-token")).toThrow(/access token/u);
  });

  it.each([
    [`summonerkit-v1, summonerkit-auth.${token}`, token],
    ["summonerkit-v1", null],
    ["summonerkit-v1, summonerkit-auth.short", null],
    [`summonerkit-v1, summonerkit-auth.${token}, summonerkit-auth.other_token_abcdefghijklmnopqrstuvwxyz`, null],
    [null, null],
  ])("extracts the access token from %s", (header, expected) => {
    expect(remoteTokenFromProtocols(header)).toBe(expected);
  });
});
