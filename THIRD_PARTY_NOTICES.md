# Third-party notices

The [SummonerKit Source-Available License](LICENSE) applies only to original
SummonerKit material authored by Mohamed Magdy. It does not relicense or
restrict third-party material. Preserve each component's license and notice
when a release includes that component.

## Referenced projects

SummonerKit is a fresh implementation. The following projects informed
product research or integration boundaries; their source is not copied into
SummonerKit unless explicitly stated below:

- Rose — <https://github.com/Alban1911/Rose>
- LeagueAutoAccept — <https://github.com/sweetriverfish/LeagueAutoAccept>
- Mimic — <https://github.com/molenzwiebel/mimic>
- Pengu Loader — <https://github.com/PenguLoader/PenguLoader>

Their licenses, copyright notices, names, and trademarks remain with their
respective owners.

## Pengu Loader build input

The Pengu Loader checkout is fetched by `scripts/fetch-pengu.ps1` at a pinned
commit and is intentionally not committed to this repository. Pengu Loader is
MIT licensed. If a release distributes a built loader, its original MIT
license and copyright notice must be distributed with that loader. The
SummonerKit license does not replace the Pengu Loader license.

## External applications

- Deceive — <https://github.com/molenzwiebel/deceive>
- lol-auto-accept — <https://github.com/jasonwu1994/lol-auto-accept>

No source or binary from these applications is incorporated into SummonerKit.
The desktop app may detect and launch a user-installed Deceive executable as
an independent process. Those applications remain separately licensed and
supported.

## npm and platform dependencies

Electron, React, TypeScript, npm packages, and other platform dependencies
retain their upstream licenses. A release that redistributes bundled
dependencies must preserve the notices required by those licenses. Dependency
license metadata is available from the lockfile and the package distributions.

## Riot Games and League assets

League of Legends, Riot Games, and related game assets, names, and trademarks
are property of Riot Games, Inc. Local game assets are displayed only while
the installed client provides them. SummonerKit is not endorsed by or
affiliated with Riot Games.
