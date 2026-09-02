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

### Automatic startup

New installations enable **Start with Windows**, **Open when League connects**,
and **Open when Rose starts**. The engine launches hidden in the tray whenever
you sign in. Its lockfile monitor connects when League starts, while the Rose
monitor can reveal the desktop when it detects that separate application.
Existing installations retain their saved Windows and League choices. The same
switches are available from **Setup**, **Overview**, and the SummonerKit tray
icon under **Startup**.

These preferences only start or reveal SummonerKit. They never launch Rose,
the League client, or the game process. Turn off either reveal switch for a
tray-only workflow. League and Rose detection work while the SummonerKit engine
is already running, so keep **Start with Windows** enabled for a hands-free
sign-in flow.

## Install or repair the League client tab

The in-client surface requires Pengu Loader. SummonerKit reuses Rose's Pengu
runtime when Rose is installed; it does not start a second loader.

1. Open **Connection Doctor** in the desktop app.
2. Find **League client tab**.
3. Choose **Repair client tab**.
4. Allow the safe League UI reload when prompted, or restart League later.

If the client tab reports that the Windows engine is stopped, choose **Start &
reconnect**. Windows opens the registered SummonerKit app link and the tab
retries the local bridge for up to 15 seconds. Open the installed desktop app
once before relying on this button so Windows can register the link. If Windows
blocks it, open SummonerKit from the Start menu and retry.

The same surface appears as a SummonerKit icon in League's top navigation and,
when Rose is present, as an entry inside Rose's settings. Clicking another
League navigation item closes the SummonerKit overlay and continues to that
destination.

## Feature guide

### Setup

The first desktop launch opens **Setup**. Choose **Test everything** to verify
the desktop engine, League connection, collection, client tab, online guidance, and
mobile relay independently. Optional services do not hide a working League
connection, and the page links directly to repair or configuration controls.

### Overview

Shows League connection state, current gameflow phase, collection progress,
automation status, recent audit events, and shortcuts to major pages.

After the automation risk warning has been acknowledged, each **On** or **Off**
pill in the Overview automation card is a button. Use it to change that feature
without leaving the dashboard; the same validation and audit rules as the full
Automation page still apply. When any feature is active, **Stop all** disables
every automation feature in one action.

The dashboard also provides **Online** and **Away** controls when the connected
League patch exposes its chat-profile endpoint. SummonerKit waits for League to
confirm each change. Activity-specific states such as in-game presence appear
as **League managed** rather than being mislabeled. These controls do not
simulate true Offline; that still requires launching League through a separate
presence-filtering proxy such as Deceive.

Right-click the SummonerKit icon in the Windows system tray for quick access to
**Online** and **Away**, individual automation feature checkboxes, automation
execution mode, and **Disable all automation**. The menu mirrors current app
state. Presence items are unavailable until League is connected, and automation
enable and mode items remain locked until the desktop risk acknowledgement is
complete. **Disable all automation** remains available whenever any feature is
active.

When a new League ready check starts, SummonerKit hides its desktop window and
shows a Windows notification so it cannot cover the League client. The engine
continues running in the tray for automation, the League tab, and mobile
control. Answer in League, on the client tab, or on a paired phone; double-click
the tray icon to reopen SummonerKit afterward.

### Collection

- Browse champions, skins, and chromas.
- Filter owned, unowned, loot, favorites, duplicates, expiring loot, and
  wishlist entries.
- See duplicate shards and permanents even when the skin is already owned.
- Review duplicate totals, wishlist-and-loot overlap, upcoming expiry, and
  listed essence value at a glance.
- Select an owned skin during champion select when the client reports that the
  action is valid.

Loot is read-only. SummonerKit does not craft, reroll, redeem, upgrade, or
disenchant loot.

### Coach & Builds

- Rune and completed-build recommendations use SummonerKit's published
  aggregate feed by default;
  local and private deployments can configure another approved HTTPS feed.
- The page identifies the patch, role, audience, provider, sample size, pick
  rate, and win rate supplied by that feed.
- In live champion select, **Draft intelligence** ranks up to three valid picks
  or bans and explains the profile priority, local performance, aggregate
  evidence, visible team composition, and allied intent it used. Choosing
  **Hover** remains an explicit user action.
- Build cards show item combinations and summoner-spell pairs observed together
  at match completion. They are not an in-game purchase order, and SummonerKit
  does not write item sets through an undocumented endpoint.
- Performance metrics are aggregated locally from up to 100 recent completed
  matches and include K/D/A, KDA, farm, kill participation, damage, vision, and
  a role-aware execution score.
- The page gives each recent match a report-card grade with one strength and one
  focus area, and identifies comfort, momentum, and practice candidates in the
  recent champion pool.
- Match history can show all recent games or one champion, with queue, role,
  result, and date-window filters plus a recent-form trend.
- The personalized patch center shows curated feed entries that affect the
  user's pool. If none are available, it shows whether rune/build evidence is
  current, stale, or missing for the connected patch.

Applying a recommendation creates or updates only a rune page whose name starts
with `SummonerKit ·`. User-created pages are never deleted to make room.

### Automation

1. Read and acknowledge the first-use warning.
2. Start with **Dry run** to see planned actions without League writes.
3. Use **Confirm** to approve each pending action.
4. Use **Automatic** only after the profile behaves as expected.

Profiles can target named queues and assigned roles with searchable ordered
picks, bans, backup choices, spells, runes, and timing. The editor previews the
next decision and reports invalid or incomplete choices before saving. The
audit timeline records why an action was planned, skipped, cancelled,
completed, or failed. A manual champion change cancels the matching automated
action.

For each pick and ban plan, add the primary champion first and then add backups
in the order they should be tried. At your active action SummonerKit skips
champions that are already picked, banned, unavailable, or protected by a
teammate's intent. If an automated hover becomes invalid before lock-in, the
engine revalidates the plan and moves to the next backup. The audit entry names
the chosen champion and explains every earlier choice it skipped.

The ordered champion plan can be edited from **Automation** in either the
desktop app or the Rose client tab. Queue, role, spells, runes, timing, risk
acknowledgement, and execution-mode changes remain desktop-only.

### Test Lab

Open **Test Lab** in the desktop app to rehearse automation without a running
League client. Choose a saved profile or the built-in unsaved demo, select a
pick or ban action, and run one of the sanitized scenarios. The timeline uses
the same pure decision engine as live automation while its isolation boundary
guarantees zero LCU writes.

Use the scenarios to confirm that a configured profile:

- selects a valid primary or explains why it chose a backup;
- protects teammate pick and ban intent;
- yields immediately after a manual champion change;
- hovers without locking when League does not provide a reliable timer; and
- safely skips when no configured choice remains.

Test Lab is a local rehearsal, not proof that a particular League patch still
supports every endpoint. Complete a non-ranked smoke test before marking a new
patch as supported.

### ARAM

Save favorite champions, see which favorites are currently on the bench, swap
when the live session permits it, and select an owned skin. The page does not
spend rerolls automatically.

### Integrations

SummonerKit can detect and launch user-installed Rose and Deceive executables.
It does not bundle or download them. It stops only processes that it started.

### Mobile Control

Mobile pairing remains unavailable until the Cloudflare relay, mobile PWA, and
desktop relay secret are configured. The repository owner can deploy the relay
with `.github/workflows/relay.yml`; it requires Cloudflare API credentials and
`PAIRING_ADMIN_SECRET` as GitHub Actions secrets. Then open **Mobile Control**,
paste the Worker and PWA URLs, and enter the same administrator secret. Windows
encrypts that secret before it is saved. After configuration:

Before saving, the desktop tests the relay health response, protocol version,
allowed PWA origin, and mobile HTML. If any address is wrong, Mobile Control
reports the specific failed check rather than showing the relay as ready. The
repository deployment checklist is in
[MOBILE_DEPLOYMENT.md](MOBILE_DEPLOYMENT.md).

1. Open **Mobile Control** on the desktop.
2. Create a short-lived QR pairing code. The desktop shows a live expiry
   countdown and clears the code when it expires or is claimed.
3. Scan it with the phone camera and approve the connection. If the camera
   cannot scan, copy the private link below the QR code and open it on the
   phone instead.
4. Use the phone to control the existing lobby queue, ready check, champion
   select, spells, rune page, owned skin, and ARAM bench. During champion select,
   the phone also shows the same three identity-free draft choices and completed
   build evidence. **Stop automation** can disable every opted-in automation
   feature, but the phone cannot enable automation or change its execution mode.
5. Optionally install the PWA and enable local queue and draft alerts.

Every mobile command is encrypted, allowlisted, and revalidated on the PC.
Chat, invites, raw LCU requests, and broad social controls are not exposed.
Temporary phone network interruptions retry automatically. A desktop restart,
revoked device, or expired session requires a fresh QR code.
Treat the QR image and copied link like a temporary password: do not post or
send them to anyone else. The phone and PC do not need to be on the same Wi-Fi
when the relay is deployed; both need an internet connection to reach it.

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

Original SummonerKit material is covered by the [SummonerKit Source-Available
License v1.0](../LICENSE). You may privately evaluate the source and run an
unmodified official release. Public forks or mirrors, copying into another
product, modification, redistribution, and commercial use require written
permission. This is not an open-source license.

Read the [copyright and ownership map](../COPYRIGHT.md) and
[third-party notices](../THIRD_PARTY_NOTICES.md). Third-party projects and Riot
Games retain their respective copyrights, licenses, assets, and trademarks.

SummonerKit isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
