# Reported-common estimate: controlled publication and reader

Status: implemented release candidate, not yet activated. Final r4 source input and independent whole-point financial review are pinned; exact code/release approval and remote publication remain separate. Current strict XLK/XLC holds and the independently published XLI price-roll remain unchanged. No schedule is added. Earlier v8 stays frozen below the gate.

## One independent series and one real dated point

Use the full methodVersion + scopeRevision pair already pinned by the pure module. Keep its comparisonKey separate from legacy strict, operating-revenue, as-converted and XLI dated-basket methods. Never reinterpret old rows or remove a legacy hold in order to show the new estimate. Rank, percentile, source alternatives and borrowed old history are null. A first approved point does not provide a historical distribution.

The June point has economicDate and holdingsAsOf 2026-06-30, NPORT publicAvailableAt 2026-08-28T16:30:53Z, original fund marks rather than November prices, and financialCutoff 2026-06-30T20:00:00Z. Each count and denominator retains its actual source date. It is a retrospective reconstruction, not a trading signal available on June 30, current fund holdings, fund NAV or a present-day share register.

For this independent method, source availability uses the exact original accepted timestamp when verified, compared with the observation close as instants. A June 30 filing accepted at 11:35Z is before the 20:00Z close. Do not truncate either timestamp to a date, move it to a fabricated next-day timestamp or confuse EDT with UTC. When exact acceptance is not established, retain a separately typed conservative next-day policy and its source basis. A later change in availability policy requires a new source-bound candidate and review. It does not silently amend the frozen v8 or existing production methods.

## Controlled writer and data layout

Reuse the existing market_snapshot(key,payload,updated_at), existing writer lock and exact-CAS/readback pattern, rather than add a table, queue, index service or schedule. A single proposed point key includes code, full method pair and economic date:

    valuation-method/US/XLK/reported_ttm_total_market_cap_v1/actual_issued_common_dated_carry_explicit_2026q2_v1/2026-06-30

The controlled payload contains the bounded normalized calculation checkpoint, exact input/method/proof-manifest/component-audit hashes and a prepared reader string. Original documents remain in the already reviewed retained evidence, with their hashes and exact locations; a hash alone is not new source approval. No original filing body, source crawl or calculation is performed by the HTTP reader.

1. Pin the complete basket and field-by-field source dispositions. Check all identities, net-treasury quantities, publication times, unit/price-class bridges, direct or derived book scope, TTM terms and all structured risk evidence. Recompute using exact original weights.
2. Require independent full-point review of the exact input, source evidence, output and release manifest. A component audit, local test PASS or computed threshold is not this release approval. A revised point uses a fresh exact review.
3. For each metric independently, verified positive plus verified nonpositive coverage must be at least 98% without rounding. Its displayed multiple additionally needs a finite positive subset c/y. Unknown fields stay missing; the other metric may remain valid. All-nonpositive can have 100% verified coverage but a null multiple. A wholly incomplete point is not published.
4. Prepare bounded bytes offline. Dry-run first; verify the precise absent/current baseline and new payload hash. Save an exclusive recoverable backup. Insert only if the key is absent, or CAS the exact previous bytes and version after a separately approved correction. Treat an uncertain write as read-and-reconcile, never blind retry.
5. Read the remote payload back byte-for-byte, hash it, verify its exact version and prepared string, then produce the static publication proof from that actual readback. Keep other snapshots untouched and verify their before/after versions as required by the release review.
6. Commit normal-main code/proof and use the existing CI/Pages path. Do not deploy an old branch or uncommitted unrelated data. Missing proof or deployment mismatch must produce null, not a fallback. Rollback restores the exact reviewed prior point or hides a newly inserted point through a prepared proof change, using the existing recovery discipline.

## Bounded read contract

Add a distinct reader/response type instead of widening validETFValuation to accept a new meaning. A proposed exact-date endpoint accepts the fixed XLK code and one validated economic date. The static manifest binds the allowed method pair, exact point key, version, payload hash and prepared reading. Initial scope is one date; no history scan, dynamic latest-query, json_each over the full checkpoint or arbitrary symbol admission.

Use one parameterized query for that exact key/version and the prevalidated prepared string, following src/server/us-etf-current-response.ts. Return the retained prepared bytes, not a freshly projected source tree. Validate the static manifest once at module load. Unknown date, missing proof, wrong method, readback drift or revoked release returns data:null. Keep the existing strict endpoint and all compatibility formats unchanged. Add a separate bounded cache key/version for this response, never reuse the strict row cache.

The public reading needs only the full method identity, economic date, publication date, retrospective/estimated flags, source-date ranges, per-metric value and positive/nonpositive/verified/missing coverage, risk known/unknown summary and null rank. Keep the prepared string at a measured small bound (initial target 4 KiB). Full source lists and audit machinery are not reader-facing content. If the final minimal reading exceeds the bound, reduce redundant fields rather than silently expanding request work.

## Date selection and display

Do not restore the removed component-wide top-right date. Reuse the existing estimate/status and accessible tooltip pattern in USSectorETFValuations.tsx; separate its response type and state from strict rows and XLI current estimates.

- For an exact historical selection, request that economic date only. Selecting November 9 must not silently carry a June 30 value as a November observation.
- If the current overview intentionally includes the latest approved low-frequency point, read its date from the static release manifest and label the row with a small inline status such as “披露持仓估算 · 6月30日”. This is not a second top-right component date. The actual economic date must be visible before a reader mistakes the value for the heatmap date.
- A short tooltip can say “按2026年6月30日持仓与基金期末价格估算；持仓于8月28日公开。已核实覆盖 XX%，未核实部分不计入。沿用披露日期的股数和报表，无同口径历史分位。” Adapt wording for negative-book exclusions so verified coverage is not mistaken for positive-ratio coverage or current accuracy.
- If using only the existing “估算” badge, the surrounding state must already make the different observation date clear. A tooltip alone must not contradict a visible same-day label. On date change, clear stale values and tooltip state while loading. Missing data shows a neutral blank.

The current single-class XLK intake does not prove arbitrary multiple-traded-class capitalization. Keep the common issuer-capital signature gate. XLC GOOG/GOOGL requires separately reviewed class-price aggregation or a new per-class method before reuse.

## Acceptance before any integration release

- Independent exact arithmetic/property tests, >=98 and just-below98, observed nonpositive, missing and per-field cases; no self-approval through fixture metadata.
- Source timing before/at/after close, exact acceptance versus typed fallback, time-zone/DST boundary, late amendments and retrospective NPORT disclosure.
- Exact new/old method cache separation, stale old cached value rejected, strict holds unchanged, no old percentile or alternate leak.
- One bounded read, no upstream requests/calculation, no automatic initialization on a missing date, SQL/manifest/version/readback mismatch fails closed.
- Exact-date June 30, November 9 mismatch, missing date and explicit latest-point states, including mobile touch/keyboard tooltip use.
- Full-page and every expanded core-signal view at 1440px and 390px, light and dark, automated no-overflow checks and manual screenshot review. No UI commit before these pass.
- Actual normal-main deployment and permitted readback evidence only after the final approved point. Do not retry previously denied public URLs or sources to obtain a proof.

## Implemented bounded proof chain

The final source root is dab579516f7ffbfe85b872267306ff786eedc5d573d289e99abdbdafe31d21b1, with independent source review dc568d532b91271c18356888d20dd5fc3e0b5868ff7c4a56f016548d775dc11f. The normalized candidate keeps 15 exact artifacts in a single bounded gzip archive, including the actual HPE/LITE/MCHP historical-carrying proof JSON and final risk addendum. Raw filing bodies are not copied into this compact archive. Their identities and audit meaning remain in the already reviewed source manifest.

The offline candidate replays every artifact and remains publishable:false. An exact separately reviewed registry, whose hash is in checked-in approval roots, is required to seal it. The controlled writer computes all hashes, preserves the previous row, and performs one exact key/payload/version CAS with byte-identical readback. Only a successful readback creates the static publication proof. The reader matches the exact candidate/source/source-review identities, prepared bytes and storage version in one bounded query. It does not recompute cryptographic hashes or accounting on HTTP requests.

The real candidate integration tests use SQLite with the same D1 SQL and explicit CAS/readback failure injection. They are not remote production write evidence. The local UI preview serves this exact candidate through the real reader against isolated memory storage; existing market data is read-only. Production approval and publication data remain empty until parent independent release approval.
