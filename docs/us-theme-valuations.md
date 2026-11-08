# US index and theme valuations

The panel covers 22 published benchmarks in three categories: AI-related industries (9), traditional industries (11), and broad benchmarks (2). The initial four examples were not a closed list. Category buttons filter the same dated result without fetching again; the selected category survives date navigation. The columns reuse CN's metric help, percentile colors, tracks, raw multiples and coverage tooltip. Source-comparison annotations are removed. The old sector endpoint and records remain available for existing clients and are never relabeled as index data.

Category controls share the panel's heading row and are centered on desktop. The compact mobile row keeps the title and controls visible without horizontal scrolling. Missing or failed readings remain neutral dashes, with no extra loading/unavailable prose or reserved status row; the table exposes its loading state through `aria-busy`.

| Display | Series | Definition / identity |
| --- | --- | --- |
| 半导体 | SOX | [PHLX Semiconductor Index](https://indexes.nasdaqomx.com/Index/Overview/SOX) |
| 存储 | STXWSML | [STOXX Global Memory Semiconductors, USD price index](https://stoxx.com/index/stxwsml/); global constituents, explicitly labeled 全球 |
| 光连接 | IUSAOTT | [Indxx US AI Optical Communication TOP 10 Index](https://www.indxx.com/index/indxx-us-ai-optical-communication-top-10-index); US-listed optical communication infrastructure companies |
| 数据中心 | IDCEIT | [Indxx US Data Center Ecosystem Index](https://www.indxx.com/index/indxx-us-data-center-ecosystem-index); US-listed data-center hardware and operators, including server/network infrastructure |
| AI 电力基建 | SOLIVEPP | [Solactive Wedbush AI Power & Infrastructure Index PR](https://legacy2.solactive.com/indices/?index=DE000SL0TM64); global scope, including electricity, electrical equipment and cooling infrastructure; [official identity and composition](https://solactive.com/announcements/70727) |
| 云计算 | CPQ | [ISE CTA Cloud Computing Index](https://indexes.nasdaqomx.com/Index/Overview/CPQ); US-listed IaaS, PaaS and SaaS companies |
| 云软件 | EMCLOUD | [BVP Nasdaq Emerging Cloud Index](https://indexes.nasdaqomx.com/Index/Overview/EMCLOUD); emerging public cloud software and services companies |
| 网络安全 | NQCYBR | [Nasdaq CTA Cybersecurity Index](https://indexes.nasdaqomx.com/Index/Overview/NQCYBR) |
| 机器人 | IBOTZ | [Indxx Global Robotics & Artificial Intelligence Thematic Index](https://www.indxx.com/index/indxx-global-robotics-artificial-intelligence-thematic-index); global, total return version |
| 银行 | BKX | [KBW Nasdaq Bank Index](https://indexes.nasdaqomx.com/Index/Overview/BKX) |
| 保险 | KIX | [KBW Nasdaq Insurance Index](https://indexes.nasdaqomx.com/Index/Overview/KIX) |
| 能源 | S5ENRS | [S&P 500 Energy](https://www.spglobal.com/spdji/en/indices/equity/sp-500-energy-sector/) |
| 公用事业 | S5UTIL | [S&P 500 Utilities](https://www.spglobal.com/spdji/en/indices/equity/sp-500-utilities-sector/) |
| 必需消费 | S5CONS | [S&P 500 Consumer Staples](https://www.spglobal.com/spdji/en/indices/equity/sp-500-consumer-staples-sector/) |
| 可选消费 | S5COND | [S&P 500 Consumer Discretionary](https://www.spglobal.com/spdji/en/indices/equity/sp-500-consumer-discretionary-sector/) |
| 医疗保健 | S5HLTH | [S&P 500 Health Care](https://www.spglobal.com/spdji/en/indices/equity/sp-500-health-care-sector/) |
| 工业 | S5INDU | [S&P 500 Industrials](https://www.spglobal.com/spdji/en/indices/equity/sp-500-industrials-sector/) |
| 原材料 | S5MATR | [S&P 500 Materials](https://www.spglobal.com/spdji/en/indices/equity/sp-500-materials-sector/) |
| 房地产 | S5RLST | [S&P 500 Real Estate](https://www.spglobal.com/spdji/en/indices/equity/sp-500-real-estate-index/) |
| 金银矿业 | XAU | [PHLX Gold/Silver Sector Index](https://indexes.nasdaqomx.com/Index/Overview/XAU); mining equities, not spot gold/silver |
| 标普500 | SPX | [S&P 500 Index](https://www.spglobal.com/spdji/en/indices/equity/sp-500/) |
| 纳斯达克100 | NDX | [Nasdaq-100 Index](https://indexes.nasdaqomx.com/Index/Overview/NDX) |

These are representative industry benchmarks, not a claim that every constituent derives its revenue from AI. Cloud software, cybersecurity and semiconductors include non-AI business. Server and cooling exposure is covered within the data-center and power/infrastructure benchmarks; neither is mislabeled as a standalone pure server or liquid-cooling index. Global memory, AI power and robotics are marked 全球 in the UI. Price, gross-return and net-return index variants are not interchangeable data sources. S&P sector ticker identities can also be cross-checked in its [official ticker reference](https://www.spglobal.com/spdji/en/documents/additional-material/spdji-tickers-etf.pdf); current provider pages confirm the industry definitions.

Adding a verified benchmark identity does not supply its valuation history. Only SOX and SPX currently have admitted PB observations; all other indices and all PS readings remain missing. Index levels, ETF holdings valuations and price backtests are never substituted for index PB/PS.

These are index identities, not DRAM/LYTE active ETF proxies. The global memory benchmark includes non-US companies. Its inception is August 31, 2026; earlier price performance is backtested and is not historical PB. The optical index has been live since June 9, 2026; its published price backtest likewise cannot substitute for valuation observations.

## Verified data as of 2026-11-08

The public [SOX](https://www.getstockcheck.com/zh/index/SOX.GI/) and [SPX](https://www.getstockcheck.com/zh/index/SPX.GI/) pages publish dated PB observations in the JSON literal passed directly to their static chart. One ordinary public GET per page acquired these series; no account, private endpoint, CAPTCHA workaround or paywall bypass was used. The saved HTML is private under `work/`, not committed or included in the client bundle. This is StockCheck's published series, not a claim of direct Nasdaq/S&P data. Its [methodology](https://www.getstockcheck.com/about.html) describes ratios calculated from financial filings and market data. No independently verified historic publication timestamps are supplied.

| Series | Actual observation | PB | Prior observations within ten years | Independently calculated PB percentile |
| --- | --- | --- | --- | --- |
| SOX | 2026-11-06 | 13.40 | 521 | 86.9482% |
| SPX | 2026-11-06 | 5.20 | 522 | 86.3985% |

The source is predominantly weekly but includes holiday-adjusted dates and an additional SPX observation on October 26, 2026. Every published date is retained as given; missing sessions are not expanded or filled. Only the last year of real observation dates is prepared for navigation (53 SOX, 54 SPX dates). An exact selected date without an observation remains blank.

Percentiles reuse the CN calculation: prior observations only, at most ten years, at least 60 valid samples, with ties weighted one-half. They intentionally need not equal the publisher's displayed percentile. PB and PS are independent. The source publishes PE and PB, **not PS**; PE is never written into PS. The coverage popup describes the span of actual observations, not daily completeness. Source values are the currently published historical series and may reflect revisions; they are not a guarantee of what a reader knew at each historical close. `observedAt` records our actual acquisition time, never an invented historical availability date.

STOXX's public memory factsheet exposes current fundamentals, but a sufficient verified PB history has not been acquired. Indxx establishes the optical theme's identity but no comparable PB/PS history was acquired. These rows remain blank. Efunds' SPX file was also checked: 201 dates with null PB/PS raw values; zero-valued percentile placeholders are not real ranks. No mixed-source gaps, quarterly-to-daily repetitions or synthetic values were used.

## Controlled preparation and publication

`scripts/us-theme-valuations.mjs` parses only saved public HTML, without executing scripts. It verifies the canonical index, maximum 256 KB page size, bounded 20-year arrays, valid unique dates/positive-or-null PB, agreement between all published windows and consistency with the latest visible value/date. It retains only eleven years of consumed observations (up to 800 points) and prepares at most 366 exact-date views in a bounded explicit backfill. The CN ranking helper supplies the identical calculation. It never fetches or writes a database.

```
node scripts/us-theme-valuations.mjs backfill SOX SAVED_HTML PRIVATE_OUTPUT RETRIEVED_AT_UTC
node scripts/us-theme-valuation-import.mjs --file SAVED_SOURCE_INPUTS_JSON
node scripts/us-theme-valuation-import.mjs --file SAVED_SOURCE_INPUTS_JSON --write --backup ABSOLUTE_PRIVATE_BACKUP
```

The import input is at most two objects `{code, html, observedAt}`. Dry-run is the default. Explicit writes validate every source first, back up prior rows exclusively, then use one guarded atomic statement. Future acquisition times, older latest dates, source changes and unapproved historical revisions/deletions fail closed. A changed retrieval timestamp or HTML nonce cannot overwrite unchanged data. `--repair` is a deliberate full repair from reviewed saved inputs, not a retry fallback. `--remote` targets the existing database only when explicitly invoked. The manual `Publish reviewed US index source` workflow publishes one reviewed SOX or SPX page per dispatch, using the existing database credential only in the writer step. It verifies the supplied page digest and bounded decompression before source validation, shares the daily writer queue and retains the pre-publication backup for seven days. It has no scheduled trigger or provider requests.

The [publisher's terms](https://www.getstockcheck.com/terms.html) restrict high-frequency/bulk automated acquisition. No continuous crawler or scheduled refresh was added; this is a bounded research backfill from two public pages, not a redistribution licence for its full database. Any recurring acquisition needs a permitted, verified incremental route rather than repeatedly downloading full historical windows. Do not silently substitute the separately licensed code/sample dataset for website data rights.

## Bounded reads

`GET /api/valuations/US/themes?date=YYYY-MM-DD` reads at most two admitted keys from the existing three-field `market_snapshot` table, independently of the larger display catalog. It projects only one prepared date and at most 4 KB per reading. Current admitted source is `stockcheck_index_pb`, method `prior-ten-years-midrank-v1`, for SOX/SPX; unsupported series/sources remain absent. The API preserves publisher/canonical URL and ranking method metadata. The stored checkpoint also retains acquisition time, source digest and consumed original observations. No new table is created.

Readers never fetch a source, scan historical observations, calculate ranks, initialize a record or fall back to legacy sector values. Frontend date caches are isolated, requests abort on date changes, late responses are ignored, refresh is bounded to five minutes and cache entries to 366 visited dates.

Tests cover source identity and window disagreement, malformed/future dates, bounds, ties, minimum samples, current exclusion, ten-year expiry, missing PS, controlled writes/no-ops, revisions, exact-date isolation and late responses. Screenshots at 1440px/390px include both themes, all core expanded signals and valuation popups. Synthetic edge-case captures are separate from screenshots of the real local preview.
