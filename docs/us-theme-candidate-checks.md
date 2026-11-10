# Low-frequency official theme candidates

This reviewed candidate-only implementation is enabled in the existing coordinator. Its installation and source checks are recorded separately; enabling it is not proof of a natural scheduled run or a valuation release. The existing published STOXX/ProShares checkpoints remain unchanged. A source fetch or candidate is never a valuation release, a source approval, a current-day value or evidence that natural daily refresh works.

## Minimal boundary

The existing Mac coordinator can append one serial `US-theme-candidates` child. There is no new scheduled task, daemon, timer service or database schema. Existing CN/US core, overview, quarterly behavior, authorization checks, locks and attempt markers are untouched. The integration constant is enabled after independent review. The runner preflight passes the actual enablement flag and candidate output directory, so enabling the constant cannot fail before starting the existing jobs. A test changes the constant to true in a temporary copy of the real coordinator and runs the full mocked CN/US/quarterly sequence plus a zero-network seeded candidate step without an explicit enablement override. Activation uses the existing entry and does not create another schedule or expand source access.

The child uses only three previously visible URLs:

- STOXX: https://stoxx.com/index/stxwsml/?factsheet=true
- ProShares index page: https://www.proshares.com/our-etfs/leveraged-and-inverse/skyu
- ProShares corroborating PDF: https://www.proshares.com/globalassets/proshares/fact-sheet/prosharesfactsheetskyu.pdf

It never constructs month URLs, archive URLs, alternate hosts, other ETF proxies or paid endpoints. The frozen current UTC clock comes from the same coordinator invocation. A 20-minute maximum age covers the existing serial wait (60-second authorization plus five prior 180-second children and at most 45 seconds of source requests plus 2.4 seconds of pacing), without changing their order or refreshing the frozen clock. Older or nonfinite clocks fail before requests; acquisition timestamps are checked again after each response. The source period still uses the original frozen clock, including across midnight. It has no D1 connection or production writer import, no credentials, no upload, and no mutation of the reviewed source allowlist. The explicit CLI requires `--collect`; merely importing the parser/validator performs no work. The reviewed static source policy is used only as the starting comparison baseline.

## Cadence and delayed publication

A new observation period must have ended before a source is eligible. STOXX compares against the last closed month; ProShares against the last closed quarter. A captured later actual observation stops redundant checks for that completed period, without approving it.

If the source still reports an old date, the period is NOT marked complete:

- STOXX: at most one attempt in days 1–15 and one in days 16–month-end. Thus an October observation still absent in early November may be checked once more in the second November window, then in later monthly windows.
- ProShares: at most one attempt per calendar month after a new quarter has closed. A January check still showing September does not prevent a February or March check for the December quarter.

Existing four daily invocations evaluate these rules; they do not create four daily network calls. UTC calendar windows avoid DST drift. One request maximum per STOXX attempt; two maximum per ProShares attempt. Total upper bounds while successful stale responses continue are **4 HTTP requests/calendar month, 12/calendar quarter, 48/year**. A full-year pure planning test simulates four invocations/day and verifies these limits. A missed window is not replayed repeatedly; the next existing invocation uses its actual window.

Same-date/same-values is unchanged, not another sample. A changed PDF with the same HTML value can still create a document-review requirement, but not a new valuation observation. `candidates` counts only new observation dates; `reviewItems` separately counts pending point/document reviews. No history is merged across source series. Quarterly CPQ observations cannot promise 60 prior samples within a ten-year window (about 40 quarter ends at most).

## Failure and evidence semantics

Each family persists `started` before its first request, then a complete or blocked result. A crash leaves `started`; later daily invocations make zero requests for that family until the interrupted state is reviewed. An atomic family-state file and a dedicated local lock guard overlapping direct child invocations, in addition to the existing coordinator lock. State bytes are bounded at 16 KiB and future/invalid state fails before requests.

401, 403, 429, redirects/final-URL changes, network/stream failures, oversized bodies, identity/field/precision drift, nonpositive or invalid metrics, dates after the closed period, source-date regression, and same-date conflicting values hold the affected family. Subsequent windows do not retry it or use another URL. Other independent families can complete. There is deliberately no clear-hold switch; resumption requires separate review of the exact failure and applicable access authorization. Neither a new month nor a green HTTP status elsewhere clears a hold. The persistent hold and state retain the exact attempted allowlisted URL, GET method, actual request/failure UTC timestamps, HTTP status when received, and controlled failure reason. CPQ HTML and PDF failures are separately identifiable without inference. HTTP 401 is `access_401`; timeout/abort is `request_timeout`. A fetch failure where redirect versus network cannot be distinguished remains explicitly `network_or_redirect_failure`, with null status. No failed response body, cookie, token, redirect target or arbitrary exception text is stored in this diagnostic. Later blocked job reports retain the original failure details without making another request. If the clock itself becomes invalid, a null failure timestamp is reported rather than invented.

Before each permitted request after the first, the child enforces at least 1.2 seconds since the previous request finished, including the CPQ HTML-to-PDF boundary and transitions between independent families. It waits only the remaining gap and verifies the clock again before dispatch. At most two such pauses (2.4 seconds total) occur per invocation; this is an in-process delay, not a new scheduled task or retry. A denied HTML never enters its PDF acquisition and therefore does not wait for that resource. A persistent blocked/not-due family causes no request and no pacing wait. The next independent family can still run in the same fixed order. Tests inject clock and pause, with no real delay or source request.

Per response: 15-second abort bound; STOXX HTML <=2 MiB, ProShares HTML <=512 KiB, PDF <=2 MiB. One invocation has at most 3 requests and 4.5 MiB retained successful sources, within the existing 180-second child bound. Received bytes are counted even for a streaming rejection; crossing a budget is a failed report, never a hidden retry. Per month the successful raw-body cap is 6.5 MiB (two STOXX checks plus one two-file ProShares check), not 4.5 MiB.

Original successful bounded bodies are saved before parsing, with SHA-256, actual acquisition time, exact URL, byte count and only content-type/etag/last-modified headers. Cookies, authorization, arbitrary headers and external error text are not copied into report metadata. Raw body files and local state/report files are private; originals are not rewritten. A fresh per-run directory prevents overwriting earlier evidence. No automatic evidence deletion is added. Acquisition time remains distinct from unknown original historical publication time.

## ProShares cross-check limitation

HTML is parsed only inside the labelled Index section, using its own observation date, PB and index holding count. It never uses fund holdings dates, leverage, ETF balance sheet ratios, CPQNTR performance rows, PE or EV/Sales as PS.

The existing exact PDF hash can reuse its independently reviewed CPQ ticker, named index, Index Characteristics date, PB and holding-count evidence. A changed HTML date/value/count against that known PDF is a disagreement and blocks the family.

Unknown PDF bytes are saved but cannot receive an automatic cross-check PASS. The previously inspected PDF's key numeric fields were not reliably available through text extraction. The candidate therefore requires visual independent confirmation of document ticker CPQ, named index, Index Characteristics section, actual date, PB and holding count. A PDF signature/envelope check only rejects malformed content; it does not verify these facts. All candidates, including exact-old-PDF matches, have `publicationEligible:false`. Unknown-source bytes never enter the static reviewed list or the existing production import function.

## Existing job results

The child emits one validated JSON report with its frozen clock, source calls/bytes, two family dispositions, actual source dates, pending review count, zero production writes and zero added approvals. Blocked families remain explicit failures with a nonzero CLI exit; the existing coordinator retains those reports while continuing independent jobs. A successful candidate collection means evidence is available for review, not market data is published or all monthly/quarterly sources are current. Unchanged/not-due results make no publication claims.

## Protect the actual Mac checkout

The active Mac has prior uncommitted authorization-diagnostic changes in its coordinator, documentation and tests, plus the approved XLK retirement patch. Do not overwrite it with the newer main coordinator. The review bundle includes a separate exact-source integration patch against that active coordinator's frozen SHA and preserves its `inspectAuthorization` logic. The reviewed candidate preserves the original authorization diagnostics. Existing coordinator tests are also run with the candidate branch disabled to isolate the prior CN/US/quarterly scope; a separate full-run test exercises the actual enabled constant.

Future installation needs a fresh exact-file comparison, backup and no active job/lock. Only the reviewed integration hunks and new candidate module/parser/static baseline dependencies may be installed; protected dirty changes, schedules, credentials, attempt markers and retirement guards must remain intact. Installation acceptance must record the exact enabled bytes, preserved files and candidate-only result.

## Reviewed initial-state proposal

The already-held current STOXX factsheet was successfully retrieved from the exact fixed URL at `2026-11-10T08:30:53.075395+00:00` according to the original source manifest. Its 830256 bytes have SHA-256 `c41caae9d04b25bc3e1e1e60cd74b240dca2c1012c87628c8d54c3902f8439c5` and report September 30 PB9.0/PS8.4. This can count as the November first window's existing manual evidence, avoiding another request merely to verify installation.

The review bundle proposes one exact initial state labelled `manual-evidence-bootstrap`, preserving that original timestamp, exact URL, bytes, source digest, manifest digest and reviewed-policy identity. The state's window time is the same instant normalized to JavaScript millisecond precision; it is not a claimed collector execution. CPQ needs no synthetic entry because its already-reviewed September 30 point is the latest closed quarter. The November first-window replay performs zero source requests and zero waits; the November second window remains eligible for STOXX if no later evidence exists.

This is a reviewed one-time seed artifact, not an automatic source-approval or bootstrap API. Future authorized installation must verify its exact bytes and the active checkout/locks, exclusively create the state with mode0600 only if absent, and preserve the seed plus original manifest as evidence. An existing state, even empty or blocked, must never be overwritten. The installation record must distinguish copying this reviewed evidence from performing a fresh source acquisition.
