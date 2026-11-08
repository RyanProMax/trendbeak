# US sector ETF quarterly maintenance

The published values are dated quarterly portfolio-mark estimates. The HTTP reader never fetches sources, recalculates history or inflates source evidence. New filings do not become market-close quotes.

## Existing daily workflow

The US primary run of `daily-sync.yml` checks the Select Sector SPDR Trust's SEC submissions index. No new schedule, account, credential or paid provider is required. Catch-up quote jobs do not multiply this quarterly check.

`scripts/us-etf-quarterly-job.mjs` reads one bounded current index and at most 44 original NPORT XML documents across at most two new quarters. It verifies the original `genInfo/seriesId` and `repPdDate`. Premium Income funds and unknown series are not substitutes. A denial, rate limit, malformed response or excessive window stops acquisition, with no alternate route or retry. The current published values remain unchanged.

The review artifact distinguishes raw SEC acceptance times from conservative public availability. Late submissions or filing dates after acceptance use at least the next midnight after the official filing date, never the earlier acceptance as publication. It preserves source URLs, SHA-256 and raw XML. Its status is explicitly pending financial-scope, common-equity and corporate-action review. The daily job does not invent issuer financial data or approve its own candidates. The artifact lasts seven days; approved evidence must be preserved in the reviewed release before publication.

## Audited append gate

`data/us-etf-approved-releases.json` is an explicit reviewed-code allowlist, initially empty. Each entry identifies a repository-local gzip input file under `data/us-etf-reviewed/`, compressed and expanded SHA-256, exact expanded byte count, audited quarter date, audit artifact SHA-256 and completed common-equity/corporate-action review. Do not populate it from an upstream claim of approval.

Only after source and event review, add the immutable input file and its entry in the normal reviewed release. The controlled writer verifies both hashes and the expansion bound, then reruns the calculation and quality gates. A release can append one strictly newer quarter per ETF. It must retain the pre-append backup and use atomic compare-and-swap. A same-date input never revises an observation through the scheduler, even if its source or numbers differ. Corrections require the separate exact-hash repair command and publication review.

Run a read-only database rehearsal using an absolute unused output directory:

`node scripts/us-etf-quarterly-job.mjs --remote --output /absolute/private/review-directory`

`--write` only permits approved appends; it cannot approve a candidate or remove an API safety hold. The existing account configuration is required, and logs do not print tokens or source bodies.

## Real history and evidence

Backfill is explicit and separate from daily appends. It accepts at most 44 genuine inputs per invocation, keeps real missing quarters empty, preserves the current latest input and refuses to overwrite an existing point. Gzip provenance preserves complete source JSON with a hash and exact decompressed size. Every controlled write verifies retained compressed evidence. Corruption, excessive expansion or a checkpoint above 1.5 MB aborts the batch.

Quarterly ranks use strictly earlier, already public, comparable observations of the same ETF and metric. Current values are excluded. The fixed gate requires at least 20 prior valid quarters and at least 20 quarters between the earliest and latest sample, within at most ten calendar years. The output reports actual N and dates, not a claim of complete ten-year history or statistical confidence. No interpolation or current-constituent backfill is allowed. The separately reviewed history release enables only XLU PS in the v4 response. Other ETF histories and historical PB remain unavailable. A read-back proof binds each approved date and exact prepared reading to the actual checkpoint version. After an audited append, refresh those proofs through the normal reviewed deployment; the scheduler cannot remove the output hold itself. Older clients receive the pre-history compatibility projection with no ranks.
