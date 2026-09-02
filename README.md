# SummonerKit

**A League companion by Mohamed Magdy.**

[User guide](docs/USER_GUIDE.md) · [Brand guide](docs/branding/BRAND_GUIDE.md) · [Releases](https://github.com/MohamedMagdy2208/SummonerKit/releases) · [Security](SECURITY.md) · [Source-available license](LICENSE)

SummonerKit is a privacy-first Windows companion for League of Legends. It
combines collection visibility, read-only loot tracking, opt-in champion-select
automation, an optional League client tab, and user-installed companion-tool
integration in one maintainable application.

> [!WARNING]
> The League Client API is unsupported and can change without notice. Riot's
> Terms of Service restrict unauthorized automation. SummonerKit is not
> endorsed by Riot Games, automation is disabled by default, and users proceed
> at their own risk.

> [!IMPORTANT]
> SummonerKit is source-available, not open source. The original project code,
> docs, tests, configuration, and branding may be privately evaluated and the
> official unmodified release may be run, but copying into another project,
> public forks or mirrors, redistribution, modification, and commercial use
> require written permission. Third-party components keep their own licenses.
> Read [LICENSE](LICENSE), [COPYRIGHT.md](COPYRIGHT.md), and
> [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before sharing a build.

## Current scope

- Secure Electron desktop and tray host.
- Local League Client API discovery and event subscriptions.
- Champion, skin, chroma, ownership, and read-only loot catalog.
- Profile-based auto-accept, timed pick/ban, summoner spell, and rune support.
- Hybrid React interface: focused match-time pages inside the League client, with administration in the desktop app.
- Detection and launching of user-installed Rose and Deceive applications.
- Optional encrypted mobile PWA with queue controls, ready checks, live champion select, loadout choices, device revocation, and an opaque Cloudflare relay.
- Recent aggregate runes, completed builds, draft signals, and curated patch impacts, plus private local performance coaching and report cards.
- Built-in Online and Away presence controls with live capability detection;
  true appear-offline remains part of the separate Deceive integration.
- A desktop-only Test Lab that rehearses ready-check and champion-select
  guardrails with the production decision engine and zero live LCU writes.

## Hybrid application boundary

The League surface is an authenticated SummonerKit view backed by the separate
desktop and tray process. It does not hold LCU credentials or start its own
automation engine.

| SummonerKit client tab in League | Desktop application only |
| --- | --- |
| Overview, Collection, Coach & Builds, Automation status, champion pick/ban fallback editing, ARAM, quick toggles, confirmations | Full profile details, queue/role and timing editing, risk acknowledgement, execution-mode changes |
| Owned-skin selection and match-time controls | Rose/Deceive integration, Connection Doctor, Test Lab, plugin repair, diagnostics |
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
answer a ready check, follow both teams and bans, view three explainable draft
choices and completed-build evidence, hover or lock the active local action,
and change spells, rune pages, or owned skins. Every request waits for a desktop
result; stale or invalid actions are rejected before an LCU write.

SummonerKit does **not** unlock skins, inject into the game process, bypass
Vanguard, read game memory, mutate loot, or expose a raw remote LCU proxy.

## Coach, builds, and champion performance

The shared **Coach & Builds** page is available in both the desktop app and the
League client tab. It combines deliberately separate data paths:

- Runes, completed item combinations, summoner-spell pairs, and draft signals
  come from a configured HTTPS feed of recent high-elo, professional, and
  combined samples. The UI displays patch, role, sample size, rates, freshness,
  and provider provenance.
- Champion performance is calculated locally from up to the most recent 100
  completed matches exposed by the signed-in League client. It includes
  wins/losses, K/D/A, KDA, CS and CS/minute, kill participation, champion
  damage, vision, a role-aware 0–100 execution score, per-match report cards,
  and champion-pool coaching.
- During a live draft, the coach ranks up to three currently valid choices. It
  uses configured priorities, local results, aggregate samples, visible picks,
  bans, and allied intent, and explains the evidence behind each option.
- Curated patch impacts are limited to the user's pool. When none are supplied,
  the UI reports whether the available recommendation evidence matches the
  connected client patch instead of inventing a patch summary.

Raw match documents, PUUIDs, Riot IDs, and summoner IDs are not written to the
analytics cache. It retains aggregate champion statistics and minimized,
identity-free recent-match rows for the history filters under a one-way account
key. Applying an online recommendation creates or updates only a
`SummonerKit · ...` rune page and never deletes a user-created page.
Build cards are read-only completed-match combinations, not an automatic item
purchase order. SummonerKit does not write League item sets until a documented,
non-destructive client adapter is available.

For public distribution, the included server-side publisher uses a Riot
production key and deploys anonymous aggregates beside the mobile PWA. Electron
defaults to that first-party URL; `SUMMONERKIT_BUILD_DATA_URL` can override it
for local or private deployments, with `SUMMONERKIT_BUILD_DATA_TOKEN` available
for private feeds. The schema-v2 contract, schema-v1 compatibility, and
aggregation requirements are
documented in [docs/RUNE_DATA_FEED.md](docs/RUNE_DATA_FEED.md).
The desktop exposes provider freshness, current-patch coverage, evidence counts,
and the last endpoint error instead of treating a configured URL as healthy.

## Development

Requirements:

- Windows 10/11 x64
- Node.js 22 or newer
- npm 11 or newer
- OpenSSL 3 (used only by the disposable HTTPS/WSS LCU integration test)
- League of Legends for live integration testing

```powershell
npm install
npm start
```

Run the verification suite:

```powershell
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Create Windows artifacts:

```powershell
npm run make
```

That command writes the direct x64 executable to
`apps/desktop/out/SummonerKit-win32-x64/SummonerKit.exe`, a portable ZIP to
`apps/desktop/out/make/zip/win32/x64/`, and a Windows Setup installer to
`apps/desktop/out/make/squirrel.windows/x64/SummonerKit-win32-x64-Setup.exe`.
The installer creates the normal Start Menu and desktop shortcuts. The direct
executable is useful for local testing; use the Setup installer for everyday
use and one-click updates.

Unsigned artifacts are development/prerelease builds. Stable public releases
must be code-signed and published without silent updates.

GitHub Actions runs the same checks and keeps the unsigned Squirrel installer,
portable ZIP, and update metadata as downloadable workflow artifacts.
Prerelease version tags publish those files as clearly labeled GitHub
prereleases; see
[docs/RELEASING.md](docs/RELEASING.md).

## Double-click launcher and startup order

On Windows, double-click **`Open SummonerKit.cmd`** in the repository folder.
The launcher opens an installed SummonerKit release when available, otherwise
it opens the packaged build from this checkout. For developers with dependencies
already installed, it falls back to `npm start`.

For the most reliable first setup, use this order:

1. Open **SummonerKit** with the launcher and leave it running in the tray.
2. Open the separately installed **Rose** application.
3. Start the **League client** so Pengu loads the SummonerKit tab.

New installations enable **Start with Windows**, **Open when League connects**,
and **Open when Rose starts**. The engine starts hidden in the tray at sign-in,
keeps watching for League and Rose, and reveals the desktop window when either
configured application appears. Existing installations retain their saved
Windows and League choices. All three switches are available in **Setup**, on
**Overview**, and under **Startup** in the tray menu. Turn off either reveal
switch for a tray-only workflow. SummonerKit does not start Rose, the League
client, or the game process.

After the client tab has been installed and loaded once, the exact order of the
first two applications is less important. SummonerKit must still be running
before you use the SummonerKit tab because it owns the secure local bridge and all
League connections. If League is already open during a plugin install, repair,
or update, SummonerKit asks League to reload only its UI automatically from
Home or Lobby. The reload is deferred during matchmaking, ready check, champion
select, and active games. If the client tab cannot reach the local engine, its
**Start & reconnect** button asks Windows to open the registered SummonerKit app
link and retries the bridge for up to 15 seconds. Run the installed desktop app
once to register that link. The launcher deliberately does not start Rose or
League for you.

When a ready check starts, the desktop window hides to the tray and a Windows
notification appears so SummonerKit does not cover the League client. The local
engine stays running; double-click the tray icon to reopen the desktop app.

The complete installation, feature, mobile pairing, update, and troubleshooting
walkthrough is in the [SummonerKit user guide](docs/USER_GUIDE.md).

## Updates and releases

The desktop-only **Guide & Updates** page shows the installed version and checks
the fixed SummonerKit GitHub release feed on demand. An installed Windows Setup
build downloads a published stable update and waits for the user to choose
**Restart to install**. It never installs an update silently. Portable,
development, and prerelease builds open GitHub Releases for manual installation.

The current `0.11.x` line is prerelease software. Stable releases are blocked in
CI unless their Windows Setup executable has a valid Authenticode signature.

## Mobile relay development

The relay requires a configured PWA origin and an admin secret used only by the
desktop pairing service:

```powershell
npx wrangler secret put PAIRING_ADMIN_SECRET --cwd apps/relay
npm run dev --workspace @summonerkit/relay
npm run dev --workspace @summonerkit/mobile
```

Do not commit the admin secret. The relay stores short-lived pairing metadata
and public keys, while forwarding encrypted envelopes without decrypting them.
Set `MOBILE_ORIGIN` in `apps/relay/wrangler.jsonc` to the deployed PWA origin.
After deploying, open **Mobile Control** and save the Worker URL, PWA URL, and
the same administrator secret. The secret is encrypted with Windows
`safeStorage`; environment variables remain available for unattended builds.

For a local end-to-end test, use the same secret for
`PAIRING_ADMIN_SECRET` in the Worker and
`SUMMONERKIT_RELAY_ADMIN_SECRET` in the desktop environment. Create or join a
League lobby on the PC first; mobile queue control intentionally does not create
lobbies, invite players, or expose a general LCU request interface.

On the desktop, open **Mobile Control**, choose **Create pairing code**, and
scan the displayed QR code with the phone camera. The QR contains a one-time
link that expires after three minutes and is cleared as soon as the phone is
paired. If the camera cannot scan it, use **Copy link if the camera cannot
scan** and open that private link on the phone. Never share a screenshot or
the copied link; it grants temporary access to the current desktop session.

The `relay.yml` workflow deploys the Worker when the repository contains
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and a 32-character-or-longer
`PAIRING_ADMIN_SECRET` as GitHub Actions secrets. The phone retries short-lived
WebSocket interruptions using the existing authenticated session; restarts,
revocation, or session expiry deliberately require a new QR code.
The complete secret, variable, deployment-order, and real-phone checklist is in
[docs/MOBILE_DEPLOYMENT.md](docs/MOBILE_DEPLOYMENT.md).

## Optional Pengu Loader build

The client surface uses the MIT-licensed Pengu Loader. When Rose is installed,
SummonerKit adds an entry inside Rose's existing `RE` panel and a separate
branded icon in League's top navigation. Both open the same secured client
surface and reuse the same desktop process; no second loader or backend is
started. The dedicated navigation icon remains available when Rose is absent.
The dependency is pinned but not committed into this repository:

```powershell
npm run vendor:pengu
npm run build:pengu
```

This requires Visual Studio Build Tools with MSBuild and the .NET Framework
desktop targeting tools. SummonerKit will reuse a compatible Rose/Pengu
installation when one is already present instead of launching two loaders.

Packaged builds can also repair or refresh the integration without opening the
desktop window:

```powershell
& '.\SummonerKit.exe' --install-client-surface
```

The desktop companion must remain running while the in-client surface is in
use; closing its window keeps it available in the system tray. It can be
started without opening the desktop window:

```powershell
& '.\SummonerKit.exe' --background
```

If a bridge secret is ever exposed, rotate it and refresh the installed client
surface before restarting League:

```powershell
& '.\SummonerKit.exe' --rotate-client-token
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

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md),
[NOTICE.md](NOTICE.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Copyright © 2026 Mohamed Magdy. Original SummonerKit material is covered by
the [SummonerKit Source-Available License v1.0](LICENSE). This is a
proprietary, source-available license, not an open-source license; no public
fork, reuse, redistribution, modification, or commercial deployment is
permitted without written permission.

See [COPYRIGHT.md](COPYRIGHT.md) for the ownership map and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for components that retain
their own licenses.

SummonerKit isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
