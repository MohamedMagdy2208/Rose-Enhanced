# Rune recommendation feed v1

Rose Enhanced consumes aggregated rune recommendations from a backend. It does
not scrape build websites and does not ship a Riot API key inside Electron.

## Data pipeline responsibilities

The feed publisher should:

1. Use an approved Riot production application and keep its API key in the
   backend secret store.
2. Build the high-elo cohort from current Challenger, Grandmaster, or Master
   League data and maintain an explicit, reviewed pro-player PUUID roster.
3. Read recent ranked Match-V5 records, normally from the current patch and a
   rolling 14-day window.
4. Group rune pages by champion, assigned role, queue, patch, and audience.
5. Publish only aggregate counts and rates. Never include PUUIDs, Riot IDs,
   summoner IDs, match IDs, or raw match payloads.
6. Suppress tiny samples. A practical minimum is 25 high-elo games or five pro
   games per recommendation; the publisher may use stricter thresholds.
7. Rebuild at least daily, retain previous patch data only as a clearly labeled
   fallback, and serve the document over HTTPS with a stable URL.

The `combined` audience should be calculated by the publisher, with its
weighting documented. Rose Enhanced does not silently merge unrelated samples
on the client.

## JSON contract

```json
{
  "schemaVersion": 1,
  "providerName": "Example approved Riot aggregation",
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
  ]
}
```

Validation rules:

- `role`: `top`, `jungle`, `middle`, `bottom`, `utility`, or `aram`.
- `audience`: `high-elo`, `pro`, or `combined`.
- `selectedPerkIds`: exactly nine current perk identifiers, including shards.
- Rates are percentages from 0 through 100.
- `generatedAt` is an ISO-8601 timestamp.
- Recommendation IDs are stable and unique within the document.
- The entire response must be no larger than 2 MiB.

Configure the desktop consumer with:

```text
ROSE_ENHANCED_BUILD_DATA_URL=https://data.example.com/runes-v1.json
ROSE_ENHANCED_BUILD_DATA_TOKEN=optional-private-feed-token
```

The bearer token is optional. It is read only by the Electron main process and
is never sent to the renderer, League client tab, or mobile snapshot.
