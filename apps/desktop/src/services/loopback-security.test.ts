import { describe, expect, it } from "vitest";
import {
  allowedLoopbackOrigin,
  bridgePortFromEnvironment,
  bridgeSessionFromProtocols,
  bridgeSessionProtocol,
  expectedLoopbackHost,
} from "./loopback-security";

describe("loopback bridge security", () => {
  it("accepts only the exact loopback host and origin", () => {
    expect(expectedLoopbackHost(17_654)).toBe("127.0.0.1:17654");
    expect(allowedLoopbackOrigin("http://127.0.0.1:17654", 17_654)).toBe(true);
    expect(allowedLoopbackOrigin("http://localhost:17654", 17_654)).toBe(false);
    expect(allowedLoopbackOrigin(undefined, 17_654)).toBe(false);
  });

  it.each([
    [undefined, 17_654],
    ["17654", 17_654],
  ])("normalizes a valid bridge port %s", (candidate, expected) => {
    expect(bridgePortFromEnvironment(candidate)).toBe(expected);
  });

  it.each(["0", "1023", "65536", "17.654", " 17654 ", "17654\n"])("rejects an unsafe bridge port %s", (candidate) => {
    expect(() => bridgePortFromEnvironment(candidate)).toThrow(/bridge.?port|BRIDGE_PORT/iu);
  });

  it.each([
    ["summonerkit-v1, summonerkit-session.abcdefghijklmnopqrstuvwxyz123456", "abcdefghijklmnopqrstuvwxyz123456"],
    ["summonerkit-v1", null],
    ["summonerkit-v1, summonerkit-session.short", null],
    ["summonerkit-v1, summonerkit-session.abcdefghijklmnopqrstuvwxyz12, summonerkit-session.other-session-id", null],
    [undefined, null],
  ])("extracts a one-use session from %s", (header, expected) => {
    expect(bridgeSessionFromProtocols(header)).toBe(expected);
  });

  it("encodes a session as a valid WebSocket subprotocol token", () => {
    expect(bridgeSessionProtocol("abc_123-def")).toBe("summonerkit-session.abc_123-def");
  });
});
