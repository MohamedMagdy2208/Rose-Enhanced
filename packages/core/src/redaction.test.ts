import { describe, expect, it } from "vitest";
import { redactSensitive } from "./redaction";

describe("redactSensitive", () => {
  it("redacts sensitive keys and authorization strings", () => {
    expect(
      redactSensitive({
        password: "secret",
        nested: { puuid: "personal", privateKey: "key-material", sessionId: "one-use-session", message: "Basic dXNlcjpwYXNz" },
      }),
    ).toEqual({
      password: "[REDACTED]",
      nested: { puuid: "[REDACTED]", privateKey: "[REDACTED]", sessionId: "[REDACTED]", message: "Basic [REDACTED]" },
    });
  });

  it.each([
    ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature", "Authorization: Bearer [REDACTED]"],
    ["wss://relay/socket#secret=pairing-secret", "wss://relay/socket#secret=[REDACTED]"],
    ["https://relay/socket?access_token=pairing-secret&api_key=build-secret", "https://relay/socket?access_token=[REDACTED]&api_key=[REDACTED]"],
    ["summonerkit-auth.token_123-abc", "summonerkit-auth.[REDACTED]"],
  ])("redacts secrets embedded in log text", (source, expected) => {
    expect(redactSensitive(source)).toBe(expected);
  });
});
