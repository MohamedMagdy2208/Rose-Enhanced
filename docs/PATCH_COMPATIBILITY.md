# Patch compatibility checklist

Run this checklist after every League client patch before marking it supported.

1. Connect, disconnect, close, and restart the League client.
2. Confirm champion and skin catalog counts against the League collection.
3. Confirm owned skins, duplicate loot, permanents, and chromas are classified.
4. Verify removed endpoints appear as unavailable capabilities.
5. Exercise ready check in an unranked test queue with automation opt-in.
6. Exercise hover, manual override, timed pick, and timed ban.
7. Confirm rune automation touches only SummonerKit-owned pages.
8. Confirm SummonerKit appears inside Rose's existing `RE` panel and through
   its separate top-navigation icon; both must reconnect without a second loader
   instance.
9. Review logs for secrets or personal identifiers.
10. Save sanitized fixtures and rerun the full automated test suite.
