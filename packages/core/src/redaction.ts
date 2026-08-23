const sensitiveKey = /password|token|authorization|secret|puuid|riot.?id|summoner.?id/i;

function redactString(value: string): string {
  return value
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/riot:[^@\s]+/gi, "riot:[REDACTED]")
    .replace(/(--remoting-auth-token=)([^\s]+)/gi, "$1[REDACTED]")
    .replace(/(rose-enhanced-(?:auth|session)\.)([A-Za-z0-9_-]+)/gi, "$1[REDACTED]")
    .replace(/([?&#](?:token|secret|password)=)([^&\s]+)/gi, "$1[REDACTED]");
}

export function redactSensitive(value: unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitive(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
