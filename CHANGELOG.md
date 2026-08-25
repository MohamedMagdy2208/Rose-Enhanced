# Changelog

All notable user-visible changes are recorded here. Versions follow Semantic
Versioning while the project is in prerelease.

## [0.11.0-beta.1] - 2026-08-25

### Added

- First-class online-guidance health with provider, schema, publication age,
  anonymous observation counts, champion coverage, current-patch coverage, and
  truthful cache or endpoint errors in Coach & Builds and Diagnostics.
- Publisher-side validation that blocks empty, stale, oversized, duplicated,
  malformed, or identity-bearing guidance output before it reaches users.
- Relay protocol `/health` endpoint and desktop verification of the relay,
  allowed mobile origin, and PWA shell before mobile configuration is saved.
- Mobile evidence-freshness status and a complete production deployment and
  real-phone verification checklist.
- Post-deployment smoke tests for the GitHub Pages feed, Cloudflare relay, PWA,
  and Windows release workflow.

### Changed

- Public PWA deployment now requires a configured Riot publisher key instead of
  silently shipping without online runes and builds.
- The aggregate schema-v2 feed now includes anonymous publication metadata for
  cohort size, platform coverage, lookback window, patches, and observations.
- Client-tab plugin version advanced to 0.11.0 so existing installations can
  detect and repair the updated Coach & Builds surface.

[0.11.0-beta.1]: https://github.com/MohamedMagdy2208/SummonerKit/releases/tag/v0.11.0-beta.1

## [0.10.0-beta.1] - 2026-08-24

### Added

- Filterable overall and champion-specific match history with role, queue,
  result, period, and recent-form visualization.
- First-party server-side Riot rune aggregation publisher with anonymous output
  and scheduled GitHub Pages delivery.
- Searchable champion pick/ban priorities, named queue selection, accessible
  reordering, validation, and profile preview.
- Desktop first-run Setup page with unified health checks and client-tab repair.
- Collection intelligence for duplicate loot, wishlist overlap, upcoming
  expiry, and listed essence value.
- Desktop mobile-relay configuration protected by Windows credential
  encryption, plus a Cloudflare deployment workflow.
- Installable mobile controls with local queue/draft notifications and
  authenticated reconnect recovery.
- Dependabot ownership rules and SHA-256 release checksums.
- Capability-detected Online and Away presence controls shared by the desktop
  dashboard and League client tab.
- Ordered primary and backup pick/ban plans editable from both desktop and the
  Rose client tab through a narrow local-only command.
- Clickable automation On/Off controls on Overview and synchronized Windows tray
  shortcuts for presence, automation features, execution mode, and disabling
  every automation feature at once.
- Coach & Builds workspace with three explainable live-draft choices, aggregate
  completed builds and spell pairs, post-game report cards, champion-pool
  coaching, personalized patch readiness, and a compact mobile coach view.
- Schema-v2 anonymous guidance publisher output for builds, ally/enemy draft
  co-occurrence signals, and optional curated patch-impact records, while the
  desktop remains compatible with schema-v1 rune feeds.

### Changed

- SummonerKit now defaults to its published first-party rune feed while still
  allowing a private HTTPS override.
- Performance privacy documentation now describes identity-free recent-match
  rows in addition to per-champion aggregates.
- The packaged desktop renderer now uses a private, traversal-checked
  `summonerkit://` protocol with Electron's extra `file://` privileges disabled.
- Unknown League-managed presence values remain visible as managed states and
  are never mislabeled as true Offline.
- Champion-select automation now revalidates an existing hover, switches to the
  next backup when needed, protects teammate pick intents, and records named
  fallback reasons in the audit timeline.

[0.10.0-beta.1]: https://github.com/MohamedMagdy2208/SummonerKit/releases/tag/v0.10.0-beta.1

## [0.9.0-beta.1] - 2026-08-24

### Added

- SummonerKit branding and original desktop, tray, League-tab, and mobile icon.
- Guide & Updates page with manual update checks and explicit restart-to-install.
- Complete end-user and maintainer release guides.
- Tag-driven GitHub prereleases containing installer, portable, and Squirrel
  update artifacts.

### Changed

- Copyright and package authorship now identify Mohamed Magdy.
- Existing local settings and caches migrate from the previous Rose Enhanced
  application-data directory.
- The legacy Rose Enhanced Pengu plugin is replaced by the SummonerKit client
  surface during repair.

[0.9.0-beta.1]: https://github.com/MohamedMagdy2208/SummonerKit/releases/tag/v0.9.0-beta.1
