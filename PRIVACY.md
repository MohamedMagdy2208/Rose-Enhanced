# Privacy

Rose Enhanced has no telemetry and no advertising SDKs.

Collection data, profiles, favorites, diagnostics, and paired-device metadata
stay on the user's computer. LCU credentials are held only in memory and are
never written to settings or logs. Diagnostic export redacts passwords, tokens,
Riot IDs, PUUIDs, and local usernames before the user reviews the result.

The optional v2 relay receives room identifiers, timing metadata, public keys,
device names, message sizes, IP metadata, and encrypted payloads. It cannot read
League state, mobile commands, command results, or LCU credentials. The mobile
snapshot intentionally excludes Riot IDs, PUUIDs, account cache keys, chat,
social data, local paths, diagnostics, and the full collection.

Champion performance stores aggregate per-champion results only. Raw match
payloads and player identifiers are discarded after in-memory aggregation.
Rune recommendation requests contain no player identity or match history. An
optional private-feed bearer token remains in the Electron main process.
