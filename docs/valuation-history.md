# Exact-date index valuations

The CN table uses the selected calendar date. Latest observations remain in the existing prepared market response. Other dates use `GET /api/valuations/CN?date=YYYY-MM-DD`; a date is never relabeled with the latest valuation. Empty observations and temporary read failures are distinct states.

## Calculation and bounds

The controlled writer prepares the last 365 calendar days of actual observations for the existing 12 indices. Each PB/PS percentile uses the preceding valid observations within ten calendar years, excludes the ranked day, and uses empirical midrank for ties. A rank needs at least 60 prior observations. Raw values, actual first/last sample dates and actual sample count remain distinct. Newer indices use only their genuine available source history.

A historical ten-year window requires up to eleven years of retained raw observations. Existing checkpoints retain at most 3,000 raw dated rows, plus the current ten-year sorted rank state and the prepared historical readings. Daily updates use bounded source suffixes, incrementally update the current rank state, and recompute only the affected historical suffix. Readers never fetch providers or calculate ranks.

The history endpoint makes one fixed query over 12 existing checkpoint keys and projects only the selected prepared date. Each projected observation is capped at 4 KB. It does not retrieve the full raw/history payload, change the schema, or enlarge the main market response.

## Controlled initialization

Full-source initialization is separate from daily updates. Obtain each configured index from its existing official E Fund source with a complete HTTP 200 response, no partial range, a verified strong ETag and the existing 8 MiB per-source bound. Validate identity, dates and raw values before preparing history. Never derive missing coverage from an old, truncated checkpoint.

`scripts/valuation-history-init.mjs` consumes reviewed local checkpoint files named `valuation-CODE-state.json`. Dry-run is the default. It independently verifies the prepared history, compares every existing raw observation and requires the latest reading to remain unchanged. An explicit `--write --backup ABSOLUTE_PRIVATE_FILE` first creates an exclusive private backup, then performs one materialized compare-and-swap update of the 12 existing rows: all 12 or none. It creates no tables or keys and does not rewrite other signals or HTTP bodies. On conflict or an uncertain response, inspect existing state before retrying.

Push and verify the compatible writer before applying initialization. Afterward, read back all target rows, confirm non-target snapshots were unchanged, and verify exact dates through the endpoint before completing the release. Raw source files and backups must remain outside Git.
