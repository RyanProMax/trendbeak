# trendbeak repository rules

## Minimal data storage

- Design database tables around current, demonstrated requirements. Keep only fields needed to identify, read, deduplicate, or revise the data; do not reserve speculative fields.
- Every stored sentiment score must identify its source. Preserve the distinction between the score publisher, the acquisition channel, and our own algorithm; a CNN mirror must never be described as a direct CNN fetch.
- Keep source descriptions in a fixed code mapping when a separate table or repeated metadata is unnecessary. Use one `sentiment_daily` table with `market`, `date`, `source`, `score`, and `updated_at`, keyed by `(market, date, source)`.
- Do not add audit, batch, version, or source dictionary tables without a concrete requirement. `updated_at` records the latest actual score change, not the source observation time or a confirmed close.
- Historical seeds only fill missing keys. Source-specific updates may revise that source's scores; never merge different sources into one series or overwrite newer values with a repeated seed.
- Store only real, dated, validated observations. Leave missing dates empty; never interpolate, fabricate, or substitute experimental algorithm output for published data.
- Page and API reads use our database and expendable snapshots. Upstream synchronization runs separately; cache eviction or an upstream failure must not erase stored history.

## Reader-facing quality

- Reader-facing copy must contain only information that helps a reader understand the market, the evidence, or the data state.
- Never expose implementation or debugging terms in the website UI, metadata intended for readers, or market labels. This includes `API Skill`, internal provider or operation IDs, agent/model names, schema or contract names, pipeline stages, debug flags, and internal scoring terminology.
- Do not add helper prose that merely explains the page structure or the generation process.
- Prefer integrating related information into the component where it is used. Do not create a separate section that makes readers jump back to the corresponding signal when the status or result can live inside that signal.
- All dates and timestamps shown to readers must use localized, human-readable formatting. Never render raw ISO timestamps.

## UI acceptance

- Every reader-facing UI change requires screenshots at 1440px desktop and 390px mobile widths.
- Screenshot review must cover the full page and all expanded core-signal states, not only the top of the page.
- Expanded content must have no clipped text, hidden overflow, horizontal page overflow, or off-canvas cards. Mobile layouts must present complete content without requiring a horizontal swipe inside an analysis card.
- Historical navigation must remain visually subordinate to current market data and analysis.
- Do not approve or commit a UI change until automated layout checks and visual screenshot review both pass.
