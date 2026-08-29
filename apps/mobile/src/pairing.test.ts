import { describe, expect, it } from "vitest";
import { reconnectDelayMs, validateRelaySocketUrl } from "./pairing";

describe("mobile reconnect backoff", () => {
  it("backs off quickly and caps recovery delays", () => {
    expect([0, 1, 2, 3, 4, 8].map(reconnectDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  });
});

describe("mobile relay endpoint validation", () => {
  it("accepts only the configured relay room socket", () => {
    expect(validateRelaySocketUrl(
      "wss://relay.example/rooms/room-12345678/socket",
      "https://relay.example/",
      "room-12345678",
    ).toString()).toBe("wss://relay.example/rooms/room-12345678/socket");
  });

  it.each([
    "wss://attacker.example/rooms/room-12345678/socket",
    "wss://relay.example/rooms/room-12345678/socket?token=leak",
    "wss://relay.example/rooms/other/socket",
  ])("rejects a redirected or malformed socket endpoint %s", (candidate) => {
    expect(() => validateRelaySocketUrl(candidate, "https://relay.example", "room-12345678")).toThrow(/unexpected WebSocket endpoint/u);
  });
});
