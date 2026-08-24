# Security policy

## Trust boundaries

- The Electron main process is the only component allowed to read the League
  lockfile, hold LCU credentials, access the filesystem, or start processes.
- Renderer, client-tab, and mobile code receive normalized domain data
  and a small allowlist of commands. They cannot submit arbitrary LCU paths.
- The relay routes encrypted envelopes and short-lived pairing metadata. It is
  not trusted to authorize commands and cannot decrypt command or snapshot
  contents.

## Desktop process

- The renderer is sandboxed with context isolation, Node integration disabled,
  WebSQL and webviews disabled, an in-memory session partition, a restrictive
  Content Security Policy, denied permissions, and blocked navigation/popups.
- External links are limited to the GitHub and Riot hosts used by the UI.
- The updater uses a fixed `update.electronjs.org/MohamedMagdy2208/SummonerKit`
  feed. Renderer code cannot replace the feed URL.
- Privileged IPC accepts messages only from the current top-level renderer
  frame. Runtime schemas validate commands again in the main process.
- Packaged builds disable `ELECTRON_RUN_AS_NODE`, Node options, and CLI inspect;
  enable cookie encryption and embedded ASAR integrity validation; load app code
  only from ASAR; and exclude production source maps.

## Local League bridge

- The HTTP/WebSocket bridge binds only to `127.0.0.1` and requires the exact
  loopback Host and Origin values for WebSocket upgrades.
- The installed client plugin sends its installation secret only in an
  Authorization header. WebSocket upgrades use a 30-second, one-use session in
  the subprotocol header, so credentials do not appear in request URLs.
- The League surface has a server-side command allowlist and per-connection rate
  limit. Hiding desktop-only controls in React is not the authorization layer.
- The only unauthenticated LCU proxy surface is read-only local game artwork.
  Paths must remain under `/lol-game-data/assets/`, traversal is rejected, and
  LCU responses are bounded to 64 MiB.

## Encrypted mobile control

- The desktop generates the one-time pairing secret. The secret remains in the
  QR fragment and phone memory; it is never submitted to the relay.
- The phone proves possession with an HMAC bound to its ephemeral public key,
  and the desktop rejects a missing, invalid, or substituted proof.
- The QR code pins the desktop public-key fingerprint, so the phone rejects a
  relay-substituted desktop key.
- Directional keys are derived with ECDH P-256 and HKDF-SHA-256. Messages use
  AES-256-GCM with authenticated direction and sequence fields; duplicates,
  replays, and out-of-order envelopes are rejected.
- Relay access tokens use WebSocket subprotocol headers rather than URLs. The
  relay enforces the configured PWA origin, request/message size limits, message
  rate limits, one desktop and one phone per room, and automatic room expiry.
- The desktop sends a purpose-built mobile snapshot below the relay size limit.
  It contains normalized lobby and draft state plus a minimal champion catalog;
  account keys, Riot IDs, PUUIDs, summoner IDs, logs, paths, integrations, and
  the full collection never enter the remote channel.
- Mobile commands carry unique request identifiers and complete only after the
  desktop has revalidated the current lobby or champion-select state and
  returned an encrypted result.

## Online rune data and local performance

- Online rune feeds require HTTPS outside local development, reject redirects,
  enforce a 2 MiB response limit, and pass strict versioned runtime validation.
- Feed requests contain no account identifier or match history, and an optional
  bearer token remains exclusively in the Electron main process.
- Applying recommended runes can update or create only a named SummonerKit
  page. The application never deletes a user rune page to make room.
- Local match history is reduced to aggregate champion metrics in memory. Raw
  matches and player identifiers are not stored in the analytics cache.

The relay can still observe connection timing, room identifiers, public keys,
device names, message sizes, and IP metadata. It cannot provide anonymity.

## Local secrets and diagnostics

- Packaged builds refuse to persist the client-bridge secret when Electron
  `safeStorage` is unavailable; plaintext fallback is limited to development.
- Settings and collection cache writes use temporary files followed by atomic
  replacement. Logs redact credential-like keys and strings, retain 300 lines
  in memory, and rotate the disk log at 2 MiB with one backup.
- There is no telemetry. Diagnostic export uses the same redaction layer.

## Known limitations

- The League client uses a local self-signed certificate. TLS certificate
  verification is disabled only for authenticated requests to its discovered
  `127.0.0.1` port.
- Pengu must read the installation bridge secret, so the generated plugin stores
  it under the current Windows user's local application-data directory. Malware
  already running as that user is outside this application's security boundary.
- Unsigned prerelease builds do not provide publisher identity. Stable releases
  must be code-signed.

## Reporting a vulnerability

Please open a private GitHub security advisory. Do not include League lockfiles,
LCU passwords, Riot IDs, PUUIDs, access tokens, or unredacted logs.

## Release policy

Stable Windows releases must be code-signed. Development builds are clearly
marked as unsigned and do not silently update. Update checks are user-initiated;
downloaded stable updates wait for an explicit **Restart to install** action.
Portable builds do not have Squirrel's updater and remain manual downloads.
