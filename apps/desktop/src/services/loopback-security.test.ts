import { describe, expect, it } from "vitest";
import {
  allowedLoopbackOrigin,
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
    ["rose-enhanced-v1, rose-enhanced-session.abc123", "abc123"],
    ["rose-enhanced-v1", null],
    [undefined, null],
  ])("extracts a one-use session from %s", (header, expected) => {
    expect(bridgeSessionFromProtocols(header)).toBe(expected);
  });

  it("encodes a session as a valid WebSocket subprotocol token", () => {
    expect(bridgeSessionProtocol("abc_123-def")).toBe("rose-enhanced-session.abc_123-def");
  });
});
