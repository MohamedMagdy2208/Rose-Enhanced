# Mobile deployment and verification

SummonerKit Remote uses two independently deployed pieces:

- the static mobile PWA on GitHub Pages;
- the opaque WebSocket relay on Cloudflare Workers and one Durable Object per
  pairing room.

The desktop remains the only component that can talk to League. The relay sees
pairing metadata, public keys, and encrypted envelopes, but it cannot read or
execute companion commands.

## 1. GitHub repository configuration

Add these **Actions secrets** without placing their values in source:

- `RIOT_API_KEY`: the approved production key used by the aggregate publisher;
- `SUMMONERKIT_PRO_ROSTER_JSON`: optional reviewed pro PUUID roster;
- `SUMMONERKIT_PATCH_IMPACTS_JSON`: optional human-reviewed patch summaries;
- `CLOUDFLARE_API_TOKEN`: a scoped Worker deployment token;
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account identifier;
- `PAIRING_ADMIN_SECRET`: a random value containing at least 32 characters.

Add these non-secret **Actions variables**:

- `SUMMONERKIT_RELAY_URL`: the deployed Worker base URL;
- `SUMMONERKIT_MOBILE_URL`: the GitHub Pages PWA URL, including `/SummonerKit/`.

Set `MOBILE_ORIGIN` in `apps/relay/wrangler.jsonc` to the PWA origin only. For
the default Pages URL this is `https://mohamedmagdy2208.github.io`; URL paths
are not part of a browser origin.

## 2. Deploy in dependency order

1. Run **Deploy mobile PWA**. It builds the PWA, publishes the aggregate feed,
   validates the local file, deploys Pages, then validates the public URL.
2. Run **Deploy encrypted mobile relay**. It stores the Worker secret, deploys
   the Durable Object, then checks `/health` for protocol version 1. On the very
   first deployment, copy the Worker URL printed by Wrangler into the
   `SUMMONERKIT_RELAY_URL` repository variable and rerun the workflow.
3. Confirm both workflows complete their public endpoint checks before creating
   a Windows release tag.

The release workflow repeats the feed, PWA, and relay checks. A release is
blocked instead of publishing a desktop build that points at unavailable
services.

## 3. Connect the desktop

Open **Mobile Control** and enter:

- the Worker base URL;
- the PWA URL;
- the exact `PAIRING_ADMIN_SECRET` stored in Cloudflare.

Before saving, the desktop checks the relay protocol, verifies that the relay's
allowed mobile origin matches the PWA, and confirms the PWA returns HTML. The
administrator secret is saved only after those checks pass and is protected by
Electron `safeStorage` on Windows.

## 4. Pair and test a phone

1. Keep SummonerKit running in the Windows tray.
2. Create a League lobby on the PC.
3. In **Mobile Control**, create a three-minute QR code.
4. Scan it, name the phone, and accept the connection.
5. Test queue start/stop, ready check, champion hover/lock, spells, rune page,
   owned skin, and ARAM bench actions in a non-ranked environment.
6. Lock the phone screen briefly and verify that reconnect restores the latest
   encrypted snapshot.
7. Revoke the device and verify that it cannot send another command.

The phone does not create lobbies, invite players, access chat, or receive raw
LCU credentials. Desktop restart, revocation, or session expiry requires a new
QR pairing.
