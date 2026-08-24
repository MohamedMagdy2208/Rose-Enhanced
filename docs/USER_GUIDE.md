# SummonerKit user guide

SummonerKit is a Windows companion for the standard League of Legends desktop
client. It runs locally, stays available in the system tray, and can provide a
secured view inside the League client through Pengu Loader.

> [!WARNING]
> The League Client API is unsupported and can change without notice.
> Automation is disabled by default and requires an explicit risk
> acknowledgement. SummonerKit is not endorsed by Riot Games.

## Install and start

### Windows Setup release

1. Open [GitHub Releases](https://github.com/MohamedMagdy2208/SummonerKit/releases).
2. Download `SummonerKit-win32-x64-Setup.exe` from the newest release.
3. Run the installer, then open **SummonerKit** from Windows.
4. Keep SummonerKit running in the system tray.
5. Open the League client. Open Rose first only if you use the separate Rose
   application.

The Setup build supports the in-app update channel. Unsigned beta releases are
clearly marked as prereleases; review their release notes before installing.

### Portable ZIP

Extract the ZIP and run `SummonerKit.exe`. Portable builds can use every local
feature, but they do not have Squirrel's `Update.exe`, so the app opens GitHub
Releases instead of installing an update itself.

### Source checkout

Install Node.js 22 and npm 11, then run:

```powershell
npm install
npm start
```

You can also double-click `Open SummonerKit.cmd`. It prefers an installed
release, then a packaged build, then the development host.

## Recommended startup order

1. Start **SummonerKit** and leave it in the tray.
2. Start **Rose** only if you use that separate application.
3. Start the **League client**.

SummonerKit can reconnect if League was already open. A client-tab install or
repair may reload only the League UI when the current phase is Home or Lobby.
The reload is deferred during matchmaking, ready check, champion select, and an
active game.

## Install or repair the League client tab

The in-client surface requires Pengu Loader. SummonerKit reuses Rose's Pengu
runtime when Rose is installed; it does not start a second loader.

1. Open **Connection Doctor** in the desktop app.
2. Find **League client tab**.
3. Choose **Repair client tab**.
4. Allow the safe League UI reload when prompted, or restart League later.

The same surface appears as a SummonerKit icon in League's top navigation and,
when Rose is present, as an entry inside Rose's settings. Clicking another
League navigation item closes the SummonerKit overlay and continues to that
destination.

## Feature guide

### Overview

Shows League connection state, current gameflow phase, collection progress,
automation status, recent audit events, and shortcuts to major pages.

### Collection

- Browse champions, skins, and chromas.
- Filter owned, unowned, loot, favorites, and wishlist entries.
- See duplicate shards and permanents even when the skin is already owned.
- Select an owned skin during champion select when the client reports that the
  action is valid.

Loot is read-only. SummonerKit does not craft, reroll, redeem, upgrade, or
disenchant loot.

### Runes & Performance

- Rune recommendations appear only when an approved HTTPS feed is configured.
- The page identifies the patch, role, audience, provider, sample size, pick
  rate, and win rate supplied by that feed.
- Performance metrics are aggregated locally from up to 100 recent completed
  matches and include K/D/A, KDA, farm, kill participation, damage, vision, and
  a role-aware execution score.

Applying a recommendation creates or updates only a rune page whose name starts
with `SummonerKit ·`. User-created pages are never deleted to make room.

### Automation

1. Read and acknowledge the first-use warning.
2. Start with **Dry run** to see planned actions without League writes.
3. Use **Confirm** to approve each pending action.
4. Use **Automatic** only after the profile behaves as expected.

Profiles can target queues and assigned roles with ordered picks, bans, backup
choices, spells, runes, and timing. The audit timeline records why an action
was planned, skipped, cancelled, completed, or failed. A manual champion change
cancels the matching automated action.

### ARAM

Save favorite champions, see which favorites are currently on the bench, swap
when the live session permits it, and select an owned skin. The page does not
spend rerolls automatically.

### Integrations

SummonerKit can detect and launch user-installed Rose and Deceive executables.
It does not bundle or download them. It stops only processes that it started.

### Mobile Control

Mobile pairing remains unavailable until the Cloudflare relay, mobile PWA, and
desktop relay secret are configured. After configuration:

1. Open **Mobile Control** on the desktop.
2. Create a short-lived QR pairing code.
3. Scan it with the phone and approve the connection.
4. Use the phone to control the existing lobby queue, ready check, champion
   select, spells, rune page, owned skin, and ARAM bench.

Every mobile command is encrypted, allowlisted, and revalidated on the PC.
Chat, invites, raw LCU requests, and broad social controls are not exposed.

### Connection Doctor and Diagnostics

Connection Doctor explains whether the desktop bridge, League client, client
tab, and collection are healthy. Diagnostics displays the normalized endpoint
capability map and exports a redacted JSON report for manual review.

Do not publish a diagnostic report without reviewing it first.

## Update SummonerKit

Open **Guide & Updates** in the desktop app.

- **Check for updates** checks the fixed SummonerKit GitHub release feed.
- When an installed update is ready, **Restart to install** applies it.
- No update is installed without that restart action.
- Portable and development builds use **GitHub Releases** for manual downloads.
- Prereleases remain manual; the one-click channel follows published stable
  releases.

## Troubleshooting

### The app says “Waiting for League”

- Confirm `LeagueClientUx.exe` is running, not only the Riot Client launcher.
- Open **Connection Doctor** and read the League-client detail.
- If League is installed in a nonstandard location, configure its folder in the
  desktop app or set `SUMMONERKIT_LEAGUE_PATH` for development.

### The League tab says SummonerKit is not running

- Start the desktop app and keep it in the tray.
- Confirm local security software is not blocking `127.0.0.1:17654`.
- Choose **Retry connection** in the League overlay.

### The client integration is outdated

Open **Connection Doctor**, choose **Repair client tab**, and allow a safe UI
reload or restart League. SummonerKit uses a plugin-version and protocol-version
handshake so an incompatible tab cannot silently continue.

### Collection data is empty

- Sign into League and wait for the client to reach a stable Home or Lobby
  phase.
- Choose **Refresh** on Collection.
- Check the capability map in Diagnostics. Removed LCU endpoints appear as
  unavailable instead of causing repeated writes.

## Privacy and safety

- No telemetry or advertising SDKs.
- LCU credentials stay in the Electron main process and memory.
- Logs and diagnostic exports redact credential-like values and player IDs.
- Collection cache and performance aggregates stay on this PC.
- No game-memory access, Vanguard bypass, process suspension, skin unlocking,
  loot mutation, or raw remote LCU proxy.

Read [SECURITY.md](../SECURITY.md), [PRIVACY.md](../PRIVACY.md), and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) before public distribution.

## License and ownership

Copyright © 2026 Mohamed Magdy.

SummonerKit source code is released under the [MIT License](../LICENSE).
Third-party projects and Riot Games retain their respective copyrights,
licenses, assets, and trademarks.

SummonerKit isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
