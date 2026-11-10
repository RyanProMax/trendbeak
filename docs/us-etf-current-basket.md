# XLI disclosed-equity basket reconstruction

This is a separate current estimate, not a quarterly backfill or the fund's actual current NAV/holdings. The first release revalues all 81 original June 30, 2026 disclosed positions at their November 6 unadjusted closes. Holdings quantities come from original NPORT balances, not a price/weight inversion. Current cash, liabilities and fund trading after June are unknown.

- Storage key: `current-estimate/US/XLI`. Never write `valuation/US/*`.
- Prices retain actual collection timestamps; financial sources must be available by November 6 at 16:00 New York time. Observation and preparation use real UTC instants, distinct from price date.
- Positive PB/PS reciprocal aggregation is independently weighted by the repriced original equity basket. Known nonpositive common equity is excluded, not unknown. Unknown weight of 2% or more hides that metric.
- AXON was missing in the first release; its separately reviewed November 6 completion is described below. HON PS remains missing. DE PS uses an explicitly approved segment-external-revenue estimate. AOS capitalization uses an explicitly approved one-for-one conversion-value estimate. Neither exception is relabelled as the ordinary reported method.
- Every included financial field is bound to exact fact, candidate, raw-source and independent-review hashes. Fixed approved-input hashes come from repository configuration, never the submitted input.
- No rank, percentile, source comparison, or historical-series membership. Historical selection requires the exact price date. The latest view can retain the actual reviewed price date for at most seven calendar days; it does not relabel it to the selected market date.

## Dated AXON completion

The separate offline adapter verifies all 22 fixed R2 source and audit files before constructing a candidate. Only AXON's actual October 30 common shares, September 30 common equity and reported TTM operating revenue change. All other 80 holdings, every price, fund-held quantity and original field-review timestamp stay unchanged. New observation/preparation timestamps describe this later completion, not a fresh review of the entire basket.

Class-scope proof comes from the original full 10-Q common-capital audit. The Skydio contract audit separately establishes that the announced stock consideration was not issued at the November 5 cash closing. The fixed event admission binds that finding to the exact typed shares fact and November 6 cutoff. Neither proof substitutes for the other. The 10-Q's `availableAtType=policyDerived10QavailableAt` marks the November 6 06:00 New York EDGAR policy boundary, not an observed exact dissemination timestamp; its evidence hash remains attached to each fact.

Any nonempty AXON financial field requires the complete exact admission, whether identified by ticker or security ID. It cannot be reused for another day with a generic new registry. The research next-day adapter clears all three fields and requests fresh capital-event review. The original all-empty baseline remains valid. An offline candidate and its preparation-record hash are not publication approval: independent review, the fixed release allowlist, exact CAS, readback proof and deployment are still required.

## Controlled release

1. Independently review the complete input, registry, prepared reading and expected payload hash. Confirm deployment baseline and preserve all eleven existing historical payloads/versions.
2. Deploy the compatible reader/UI with an empty current-publication manifest. Existing quarterly publications remain unchanged.
3. Run `us-etf-current-job.mjs` first as dry-run, then with explicit expected old hash (or `absent`), reviewed new hash and exclusive private backup. A first write has an absence guard. Updates use both old version and full old payload. Same bytes produce no write or version change. Older preparation/observation timestamps are rejected even for the same price date.
4. Run `us-etf-current-publication-proof.mjs` read-only. It verifies the complete stored SHA, reproduces the full checkpoint from consumed input under the fixed allowlist, then binds the actual row version and exact small reading.
5. Independently verify that proof before updating the separate current-publication manifest and deploying it. Check current UI and confirm all eleven historical blobs/versions are unchanged.

An uncertain write requires readback before retry. A deliberate rollback needs a separate approval bound to the complete private backup and exact live version/hash, plus a fresh recovery backup. It restores the old exact blob, or the originally absent key, with payload/version CAS. Never use a normal update to replay an older release. Withdraw the current-publication proof before rollback; a restored blob requires new readback approval before exposure.

The HTTP reader makes one bounded read of only the prepared reading, gated by exact approved version and bytes. It does not fetch sources, reconstruct holdings, parse source reports, or scan history. The reader never returns the source registry or financial evidence.

This is not an automatic daily valuation pipeline. Any new price date needs independently collected prices, contemporary facts and event checks, reviewed inputs, and an explicit versioned contract update. Preserve old real observations; never change their labels or relax historical availability gates.
