# Release guide

SummonerKit publishes Windows artifacts from GitHub Actions. Beta and release
candidate tags create GitHub prereleases. A stable tag is rejected unless the
generated Setup executable has a valid Authenticode signature.

## Prepare a release

1. Choose a semantic version, for example `0.11.0-beta.2`.
2. Update every workspace version:

   ```powershell
   npm version 0.11.0-beta.2 --workspaces --include-workspace-root --no-git-tag-version
   npm install --package-lock-only
   ```

3. Add the user-visible changes to `CHANGELOG.md`.
4. Run the release checks:

   ```powershell
   npm ci
   npm run typecheck
   npm test
   npm audit --omit=dev --audit-level=high
   npm run make
   ```

   The release workflow also verifies the public guidance feed, mobile PWA,
   and relay `/health` endpoint. Configure repository variables
   `SUMMONERKIT_MOBILE_URL` and `SUMMONERKIT_RELAY_URL` before tagging.

5. Commit the version and changelog.
6. Create and push a tag matching the desktop package version:

   ```powershell
   git tag v0.11.0-beta.2
   git push origin main
   git push origin v0.11.0-beta.2
   ```

The `Release` workflow verifies the tag, rebuilds from a clean checkout, and
publishes the Squirrel Setup executable, `RELEASES`, full NuGet package, and
portable ZIP. GitHub generates the release notes from merged changes.

## Stable release gate

Do not publish a stable `vX.Y.Z` tag until Windows code signing is configured.
The workflow checks the Setup executable with `Get-AuthenticodeSignature` and
fails instead of publishing an unsigned stable release.

After a stable release is published, installed Setup builds discover it through
Electron's `update.electronjs.org` feed. Prereleases and portable builds remain
manual downloads from GitHub Releases.

Mobile and feed deployment is documented separately in
[MOBILE_DEPLOYMENT.md](MOBILE_DEPLOYMENT.md). Do not tag a public beta while the
deployment checks are red; the desktop will truthfully show cached or
unavailable guidance, but a release should not advertise missing online
services.
