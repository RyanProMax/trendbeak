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


## Additional sector releases

Preparation supports any of the fixed eleven sector ETFs, but each historical import remains one independently reviewed fund with at most 44 input quarters and exact old/new checkpoint hashes. Only the explicitly reviewed release can add observations; general code support does not approve another sector's data. The current published dataset is still the separately audited XLU history until a new bundle passes its own checks.

The immutable publication manifest permits at most 41 approved dates per fund (451 total), bounded to 2 MB. Source checkpoints retain their complete histories; this publication cap never silently truncates stored evidence. The server indexes the manifest once, selects at most one eligible proof per fund and sends at most eleven proofs to D1, using fifteen fixed parameters. D1 still selects the latest publicly available observation before checking its exact version and reading. An unapproved newer observation or a latest null cannot fall back to an older approved value. The small selected-proof cache is bounded to 32 dates.

A current-point repair on a fund with history must explicitly retain `sourceSeriesId=sec_nport_quarterly` and the portfolio-mark pricing basis. It validates retained compressed provenance and recomputes prepared ranks with the same strict-prior 20-sample/5-year policy. A missing current value keeps its percentile null even when old samples qualify. Changed methods or source families need a separately reviewed migration, not a repair. Refresh all dated proofs for the affected fund after every confirmed checkpoint revision. Existing other-fund payloads and proofs stay unchanged.

The all-sector history consumer uses `quarterly-sectors-v5` and a new client cache version. The deployed v4 format retains its XLU-only historical metadata contract; other funds keep valid multiples but no quarterly rank fields. v3 and earlier remain rank-free and do not expose pre-feature historical dates. All history formats select the newest released observation before exact proof checks, including when it is null or unapproved.

## Explicit revenue-method transition

The original `common-equity-harmonic-v1` observations remain unchanged. The independently reviewed XLE operating-revenue series uses `methodVersion=common-equity-harmonic-operating-revenue-v2` and `revenueDefinition=operating_revenue_v2` on every input, checkpoint and prepared reading. Each present revenue fact must additionally carry `definition=operating_revenue_v2`. This definition includes ordinary operating sales, including purchased-product resale, and excludes identified non-operating other income. It is an audited data classification, not a tag-name inference. Existing corporate-event, financial-scope and missing-data gates remain in force.

If an input carries alternate holdings values, its comparison must explicitly identify the same method and revenue definition. A v1 alternate or historical observation cannot be reused in the v2 ranking population. Quarterly metadata also binds the valuation method and definition. Appends reject a checkpoint, input batch or existing reading with a different method. The daily scheduler has no method-transition permission.

A separately reviewed single-current XLE transition can use the repair command's explicit `--method-migration` switch, with the same exact old/new SHA checks, exclusive backup and atomic CAS. It accepts only v1 to operating-v2 and only when no historical population has yet been attached. A multi-period migration requires a separately designed and reviewed operation. The old bytes remain in the backup; they are never relabelled. First admit the newly audited same-scope current observation, then append independently reviewed v2 history. A current null still has no rank. Rollback requires the exact published hash and version, as for other repairs.

v5 accepts the new method. Older response formats select the latest available observation and then omit an unsupported-method row, without falling back to older v1 data or relabelling v2 as v1. XLU and all other v1 records keep their current values and publication proofs. No operating-v2 data is admitted by these code changes alone.
