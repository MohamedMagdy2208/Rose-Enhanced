import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./pairing";

describe("mobile reconnect backoff", () => {
  it("backs off quickly and caps recovery delays", () => {
    expect([0, 1, 2, 3, 4, 8].map(reconnectDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  });
});
