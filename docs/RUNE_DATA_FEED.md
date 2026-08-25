# Online guidance feed v2

SummonerKit consumes aggregated rune, completed-build, spell-pair, and draft
evidence from a backend. It does not scrape build websites and does not ship a
Riot API key inside Electron. The desktop accepts both schema v1 and v2; a v1
document supplies runes only and produces truthful empty states for coach data.

## Data pipeline responsibilities

The feed publisher should:

1. Use an approved Riot production application and keep its API key in the
   backend secret store.
2. Build the high-elo cohort from current Challenger, Grandmaster, or Master
   League data and maintain an explicit, reviewed pro-player PUUID roster.
3. Read recent ranked Match-V5 records, normally from the current patch and a
   rolling 14-day window.
4. Group rune pages, completed item combinations, summoner-spell pairs, and
   visible ally/enemy champion co-occurrences by champion, assigned role,
   queue, patch, and audience.
5. Publish only aggregate counts and rates. Never include PUUIDs, Riot IDs,
   summoner IDs, match IDs, or raw match payloads.
6. Suppress tiny samples. A practical minimum is 25 high-elo games or five pro
   games per recommendation; the publisher may use stricter thresholds.
7. Rebuild at least daily, retain previous patch data only as a clearly labeled
   fallback, and serve the document over HTTPS with a stable URL.

The `combined` audience should be calculated by the publisher, with its
weighting documented. SummonerKit does not silently merge unrelated samples
on the client.

## JSON contract

```json
{
  "schemaVersion": 2,
  "providerName": "Example approved Riot aggregation",
  "publication": {
    "generatedAt": "2026-08-25T04:17:00.000Z",
    "observationCount": 1840,
    "cohortSize": 48,
    "platforms": ["EUW1", "KR"],
    "lookbackDays": 14,
    "patches": ["26.16"]
  },
  "recommendations": [
    {
      "id": "ahri-middle-combined-26.16",
      "championId": 103,
      "role": "middle",
      "queueId": 420,
      "audience": "combined",
      "patch": "26.16",
      "primaryStyleId": 8000,
      "subStyleId": 8100,
      "selectedPerkIds": [8005, 8009, 9103, 8014, 8139, 8135, 5005, 5008, 5001],
      "sampleSize": 250,
      "winRate": 52.4,
      "pickRate": 38.2,
      "generatedAt": "2026-08-23T12:00:00.000Z"
    }
  ],
  "builds": [
    {
      "id": "build-103-middle-combined-26.16-example",
      "championId": 103,
      "role": "middle",
      "queueId": 420,
      "audience": "combined",
      "patch": "26.16",
      "itemIds": [3089, 3135, 6655],
      "spellIds": [4, 14],
      "sampleSize": 250,
      "winRate": 52.4,
      "pickRate": 38.2,
      "generatedAt": "2026-08-23T12:00:00.000Z"
    }
  ],
  "draftSignals": [
    {
      "id": "draft-103-middle-combined-26.16-example",
      "championId": 103,
      "role": "middle",
      "queueId": 420,
      "audience": "combined",
      "patch": "26.16",
      "sampleSize": 250,
      "winRate": 52.4,
      "synergyChampionIds": [64],
      "toughMatchupChampionIds": [238],
      "generatedAt": "2026-08-23T12:00:00.000Z"
    }
  ],
  "patchImpacts": [
    {
      "id": "26.16-103-0",
      "patch": "26.16",
      "championId": 103,
      "category": "buff",
      "title": "Ahri",
      "summary": "A short, human-reviewed description of the relevant change.",
      "sourceUrl": "https://www.leagueoflegends.com/en-us/news/game-updates/"
    }
  ]
}
```

Validation rules:

- `publication` records when and how the anonymous aggregate was generated.
  It contains counts and routing labels only, never player or match identifiers.
- `role`: `top`, `jungle`, `middle`, `bottom`, `utility`, or `aram`.
- `audience`: `high-elo`, `pro`, or `combined`.
- `selectedPerkIds`: exactly nine current perk identifiers, including shards.
- `itemIds`: at least two positive item identifiers observed together at match
  completion; the list does not claim purchase order.
- `spellIds`: exactly two positive summoner-spell identifiers.
- `synergyChampionIds` and `toughMatchupChampionIds`: at most eight positive
  champion identifiers derived from aggregate visible draft co-occurrence.
- `category`: `buff`, `nerf`, `adjustment`, `item`, `rune`, or `system`.
- `sourceUrl`: an HTTPS URL or `null`.
- Rates are percentages from 0 through 100.
- `generatedAt` is an ISO-8601 timestamp.
- IDs are stable and unique within each collection.
- The desktop caps runes and builds at 5,000 entries, draft signals at 2,000,
  and patch impacts at 500 entries.
- The entire response must be no larger than 2 MiB.

Configure the desktop consumer with:

```text
SUMMONERKIT_BUILD_DATA_URL=https://data.example.com/runes-v1.json
SUMMONERKIT_BUILD_DATA_TOKEN=optional-private-feed-token
```

The bearer token is optional. It is read only by the Electron main process and
is never sent to the renderer, League client tab, or mobile snapshot.

## Included publisher

`apps/data-publisher` implements the first-party aggregation pipeline. It reads
current ranked ladder cohorts and recent Match-V5 documents, reduces them to
anonymous observations in memory, and writes the schema-v2 aggregate feed.
Raw match documents, match IDs, PUUIDs, Riot IDs, and summoner IDs never appear
in its output.

For local testing, set `RIOT_API_KEY` in the process environment and run:

```powershell
$env:RIOT_API_KEY = "your-development-key"
npm run data:publish
Remove-Item Env:RIOT_API_KEY
```

The publisher validates its own output before writing it. Repeat the same
release gate against either a file or the deployed HTTPS endpoint:

```powershell
npm run verify-feed --workspace @summonerkit/data-publisher -- apps/mobile/dist/data/runes-v1.json
npm run verify-feed --workspace @summonerkit/data-publisher -- https://mohamedmagdy2208.github.io/SummonerKit/data/runes-v1.json
```

Verification fails for empty or stale evidence, duplicate IDs, unsupported
schema values, oversized output, invalid rates, or any identity/credential
field such as PUUID, Riot ID, summoner ID, match ID, or access token.

The development key expires daily. Public scheduled publishing requires a
persistent approved Riot key stored as a GitHub Actions secret named
`RIOT_API_KEY`. Optional configuration includes `RIOT_PLATFORMS`,
`RIOT_MAX_PLAYERS_PER_PLATFORM`, `RIOT_MATCHES_PER_PLAYER`, and
`RIOT_LOOKBACK_DAYS`. A reviewed pro roster can be supplied as the secret
`SUMMONERKIT_PRO_ROSTER_JSON` using this shape:

```json
[{ "puuid": "server-side-only", "regionalRoute": "EUROPE" }]
```

Optional human-reviewed patch metadata can be supplied as
`SUMMONERKIT_PATCH_IMPACTS_JSON`. Entries with invalid categories or missing
patch, title, or summary values are ignored; non-HTTPS source URLs are removed:

```json
[{ "patch": "26.16", "championId": 103, "category": "buff", "title": "Ahri", "summary": "Short reviewed summary.", "sourceUrl": "https://www.leagueoflegends.com/" }]
```

The checked-in workflow publishes the feed beside the mobile PWA at
`/data/runes-v1.json`. The filename remains stable for deployed clients even
though the document now uses schema v2. The desktop release should set
`SUMMONERKIT_BUILD_DATA_URL` to that HTTPS address during packaging.

The workflow intentionally fails when `RIOT_API_KEY` is missing. This prevents
a successful-looking deployment that leaves every online recommendation empty.
Development keys expire daily and are suitable only for local prototypes; a
public deployment requires a registered production application.
