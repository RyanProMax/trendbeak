# trendbeak repository rules

## Minimal data storage

- Design database tables around current, demonstrated requirements. Keep only fields needed to identify, read, deduplicate, or revise the data; do not reserve speculative fields.
- Every stored sentiment score must identify its source. Preserve the distinction between the score publisher, the acquisition channel, and our own algorithm; a CNN mirror must never be described as a direct CNN fetch.
- Keep source descriptions in a fixed code mapping when a separate table or repeated metadata is unnecessary. Use one `sentiment_daily` table with `market`, `date`, `source`, `score`, and `updated_at`, keyed by `(market, date, source)`.
- Do not add audit, batch, version, or source dictionary tables without a concrete requirement. `updated_at` records the latest actual score change, not the source observation time or a confirmed close.
- Historical seeds only fill missing keys. Source-specific updates may revise that source's scores; never merge different sources into one series or overwrite newer values with a repeated seed.
- Store only real, dated, validated observations. Leave missing dates empty; never interpolate, fabricate, or substitute experimental algorithm output for published data.
- Page and API reads use our database and expendable snapshots. Upstream synchronization runs separately; cache eviction or an upstream failure must not erase stored history.

## Bounded reader work

- This is a hard constraint: page, health, and API requests must not run full historical indicator rebuilds, scheduled jobs, or unbounded upstream retries. Read only the necessary bounded fields and date range, or a bounded snapshot.
- Market readers use a durable, precomputed view and prepared HTTP body. Conditional responses inspect only the version before any body read; ordinary responses read the prepared body, without querying or projecting sentiment in the request. Refresh affected response bodies in controlled quote/sentiment update commands. Keep the actually consumed calculation checkpoint and view in one `market_snapshot(key, payload, updated_at)` row per instrument; these three fields identify, read, deduplicate and atomically revise the snapshot. Do not create extra history, audit or job tables. Expendable memory/edge caches must never be the sole price history.
- Initialization, delta fetches and indicator updates run only in explicit controlled jobs. Reuse checkpoint state for appends and recompute the affected suffix for revisions. Readers never fetch quote history, initialize an unknown instrument, or move a full rebuild to every browser visit. Missing instruments return an explicit bounded response and retain the prior available market.
- Use verified small source windows for daily updates. A source gap, uncertain price basis, split, deletion, oversized response or checkpoint limit stops the job and preserves the previous view. A deliberate bounded rebuild is separate and atomic; never silently fall back to a full source window. Revisions outside the delta window require an explicit repair/rebuild.
- First backfills and deliberate full rebuilds must be explicit, bounded operations outside server reader requests. Do not add background queues, audit tables, speculative columns, paid resources, credentials, or new permissions without an actual requirement.
- Validate external input and the complete materialized view in the controlled writer. HTTP readers retain D1-validated JSON bytes rather than parse, deep-scan and serialize every precomputed row again; verify required identity, source/date metadata and byte bounds on D1 ingestion. Prefer immutable memory byte snapshots; do not add expensive edge-body parsing or hashing to a cold reader. Bounded native SQL projection of required dated fields is allowed; historical indicator rebuilds remain outside requests. Build the empty hydration shell once; do not invoke React SSR for each page request. Trusted immutable memory snapshots use identity and age checks, without repeating whole-history validation or computation on a hit.
- Bound payload size, rows, concurrency, refresh frequency and failure backoff. Cache expiry, eviction, failure and simultaneous readers must not create an unbounded computation or retry loop. Singleflight is local to an isolate; do not claim a distributed lock where none exists.
- Health inspects existing snapshots without upstream fetching or rebuilding. Page visibility changes cannot bypass the refresh interval. Keep source-specific sentiment synchronization separate, updating only the explicit recent or requested correction window.

## Reader-facing quality

- Reader-facing copy must contain only information that helps a reader understand the market, the evidence, or the data state.
- Never expose implementation or debugging terms in the website UI, metadata intended for readers, or market labels. This includes `API Skill`, internal provider or operation IDs, agent/model names, schema or contract names, pipeline stages, debug flags, and internal scoring terminology.
- Do not add helper prose that merely explains the page structure or the generation process.
- Ordinary market views show real values and their actual dates, with neutral blanks for missing values. Keep technical failure/staleness diagnostics in logs and health output; do not add anomaly badges or repeated source caveats to ordinary readouts. Preserve source provenance in storage, APIs and the source documentation.
- Keep indicator direction/state, historical strength and raw value distinct. Do not turn radar area, volatility or volume into a buy/sell score; compute historical metrics only in controlled incremental writers.
- Prefer integrating related information into the component where it is used. Do not create a separate section that makes readers jump back to the corresponding signal when the status or result can live inside that signal.
- All dates and timestamps shown to readers must use localized, human-readable formatting. Never render raw ISO timestamps.

## UI acceptance

- Every reader-facing UI change requires screenshots at 1440px desktop and 390px mobile widths.
- Screenshot review must cover the full page and all expanded core-signal states, not only the top of the page.
- Expanded content must have no clipped text, hidden overflow, horizontal page overflow, or off-canvas cards. Mobile layouts must present complete content without requiring a horizontal swipe inside an analysis card.
- Historical navigation must remain visually subordinate to current market data and analysis.
- Do not approve or commit a UI change until automated layout checks and visual screenshot review both pass.
