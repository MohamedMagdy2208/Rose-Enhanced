# Rose Enhanced

Rose Enhanced is a privacy-first Windows companion for League of Legends. It
combines collection visibility, read-only loot tracking, opt-in champion-select
automation, an optional League client tab, and user-installed companion-tool
integration in one maintainable application.

> [!WARNING]
> The League Client API is unsupported and can change without notice. Riot's
> Terms of Service restrict unauthorized automation. Rose Enhanced is not
> endorsed by Riot Games, automation is disabled by default, and users proceed
> at their own risk.

## Current scope

- Secure Electron desktop and tray host.
- Local League Client API discovery and event subscriptions.
- Champion, skin, chroma, ownership, and read-only loot catalog.
- Profile-based auto-accept, timed pick/ban, summoner spell, and rune support.
- Hybrid React interface: focused match-time pages inside Rose, with administration in the desktop app.
- Detection and launching of user-installed Rose and Deceive applications.
- Optional encrypted mobile PWA with queue controls, ready checks, live champion select, loadout choices, device revocation, and an opaque Cloudflare relay.
- Recent high-elo/pro rune recommendations from an approved versioned feed, plus private per-champion performance analytics from local match history.

## Hybrid application boundary

The League surface is an authenticated view backed by the separate desktop and
tray process. It does not hold LCU credentials or start its own automation
engine.

| Inside Rose in the League client | Desktop application only |
| --- | --- |
| Overview, Collection, Automation status, ARAM, quick toggles, confirmations | Profile and timing editing, risk acknowledgement, execution-mode changes |
| Owned-skin selection and match-time controls | Rose/Deceive integration, Connection Doctor, plugin repair, diagnostics |
| An **Open desktop app** handoff | Mobile pairing, device management, and advanced settings |

The loopback bridge enforces this split with a command allowlist; hiding a
desktop-only control in React is not the security boundary. The same desktop
process owns settings, LCU access, collection cache, automation, and the audit
timeline for both surfaces.

The mobile workspaces remain isolated from the core desktop build:
`apps/mobile` contains the installable PWA, `packages/remote` contains the
directional ECDH/HKDF/AES-GCM channel, and `apps/relay` contains the opaque
Cloudflare Durable Object router. Pairing and device management are implemented
but unavailable until the relay, PWA URL, and desktop relay secret are
configured.

The phone receives a compact, identity-free live snapshot instead of the full
desktop collection. It can start or stop matchmaking for the existing lobby,
answer a ready check, follow both teams and bans, hover or lock the active local
action, and change spells, rune pages, or owned skins. Every request waits for a
desktop result; stale or invalid actions are rejected before an LCU write.

Rose Enhanced does **not** unlock skins, inject into the game process, bypass
Vanguard, read game memory, mutate loot, or expose a raw remote LCU proxy.

## Runes and champion performance

The shared **Runes & Performance** page is available in both the desktop app
and the Rose client tab. It combines two deliberately separate data paths:

- Rune recommendations come from a configured HTTPS feed that aggregates
  recent high-elo, professional, and combined samples. The UI displays patch,
  role, sample size, pick rate, win rate, freshness, and provider provenance.
- Champion performance is calculated locally from up to the most recent 100
  completed matches exposed by the signed-in League client. It includes
  wins/losses, K/D/A, KDA, CS and CS/minute, kill participation, champion
  damage, vision, and a role-aware 0–100 execution score.

Raw match documents, PUUIDs, Riot IDs, and summoner IDs are not written to the
analytics cache. Only aggregate champion statistics are retained under a
one-way account key. Applying an online recommendation creates or updates only
a `Rose Enhanced · ...` rune page and never deletes a user-created page.

For public distribution, host the feed behind a backend with a Riot production
key instead of embedding that key in Electron. Set
`ROSE_ENHANCED_BUILD_DATA_URL` and, for a private feed,
`ROSE_ENHANCED_BUILD_DATA_TOKEN`. The exact v1 feed schema and aggregation
requirements are documented in [docs/RUNE_DATA_FEED.md](docs/RUNE_DATA_FEED.md).

## Development

Requirements:

- Windows 10/11 x64
- Node.js 22 or newer
- npm 11 or newer
- League of Legends for live integration testing

```powershell
npm install
npm start
```

Run the verification suite:

```powershell
npm run typecheck
npm test
npm run build
```

Create Windows artifacts:

```powershell
npm run make
```

Unsigned artifacts are development/prerelease builds. Stable public releases
must be code-signed and published without silent updates.

GitHub Actions runs the same checks and uploads the unsigned Squirrel installer
and ZIP portable package as clearly labeled prerelease artifacts.

## Double-click launcher and startup order

On Windows, double-click **`Open Rose Enhanced.cmd`** in the repository folder.
The launcher opens an installed Rose Enhanced release when available, otherwise
it opens the packaged build from this checkout. For developers with dependencies
already installed, it falls back to `npm start`.

For the most reliable first setup, use this order:

1. Open **Rose Enhanced** with the launcher and leave it running in the tray.
2. Open the separately installed **Rose** application.
3. Start the **League client** so Rose/Pengu loads the Enhanced tab.

After the client tab has been installed and loaded once, the exact order of the
first two applications is less important. Rose Enhanced must still be running
before you use the Enhanced tab because it owns the secure local bridge and all
League connections. If League is already open during a plugin install, repair,
or update, Rose Enhanced asks League to reload only its UI automatically from
Home or Lobby. The reload is deferred during matchmaking, ready check, champion
select, and active games. The launcher deliberately does not start Rose or
League for you.

## Mobile relay development

The relay requires a configured PWA origin and an admin secret used only by the
desktop pairing service:

```powershell
npx wrangler secret put PAIRING_ADMIN_SECRET --cwd apps/relay
npm run dev --workspace @rose-enhanced/relay
npm run dev --workspace @rose-enhanced/mobile
```

Do not commit the admin secret. The relay stores short-lived pairing metadata
and public keys, while forwarding encrypted envelopes without decrypting them.
Set `MOBILE_ORIGIN` in `apps/relay/wrangler.jsonc` to the deployed PWA origin.
The desktop process requires `ROSE_ENHANCED_RELAY_URL`,
`ROSE_ENHANCED_MOBILE_URL`, and `ROSE_ENHANCED_RELAY_ADMIN_SECRET` before the
Mobile Control page enables QR pairing.

For a local end-to-end test, use the same secret for
`PAIRING_ADMIN_SECRET` in the Worker and
`ROSE_ENHANCED_RELAY_ADMIN_SECRET` in the desktop environment. Create or join a
League lobby on the PC first; mobile queue control intentionally does not create
lobbies, invite players, or expose a general LCU request interface.

## Optional Pengu Loader build

The client surface uses the MIT-licensed Pengu Loader. When Rose is installed,
Rose Enhanced adds an entry inside Rose's existing `RE` panel and a separate
branded icon in League's top navigation. Both open the same secured client
surface and reuse the same desktop process; no second loader or backend is
started. The dedicated navigation icon remains available when Rose is absent.
The dependency is pinned but not committed into this repository:

```powershell
npm run vendor:pengu
npm run build:pengu
```

This requires Visual Studio Build Tools with MSBuild and the .NET Framework
desktop targeting tools. Rose Enhanced will reuse a compatible Rose/Pengu
installation when one is already present instead of launching two loaders.

Packaged builds can also repair or refresh the integration without opening the
desktop window:

```powershell
& '.\Rose Enhanced.exe' --install-client-surface
```

The desktop companion must remain running while the in-client surface is in
use; closing its window keeps it available in the system tray. It can be
started without opening the desktop window:

```powershell
& '.\Rose Enhanced.exe' --background
```

If a bridge secret is ever exposed, rotate it and refresh the installed client
surface before restarting League:

```powershell
& '.\Rose Enhanced.exe' --rotate-client-token
```

## Privacy and safety

- No telemetry.
- No Riot credentials leave the computer.
- LCU authentication remains in the Electron main process.
- Logs are redacted before storage or export.
- Loot endpoints are read-only.
- The in-client bridge uses one-use WebSocket sessions and a server-side command allowlist.
- Mobile pairing mutually authenticates ephemeral keys without sending its QR secret to the relay.
- Mobile snapshots exclude account identifiers, collection history, diagnostics, paths, and social data.
- Mobile control is unavailable until explicitly deployed and configured; its command set remains allowlisted and every result is confirmed by the desktop.

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Rose Enhanced is released under the [MIT License](LICENSE).

Rose Enhanced is not endorsed by Riot Games and does not reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
