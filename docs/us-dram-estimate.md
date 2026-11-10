# DRAM holdings estimate

The memory theme uses DRAM (SEC series S000102337) as an explicitly labelled ETF holdings proxy, independently of the held STXWSML official index. No STXWSML record is replaced. SOX, SPX and CPQ retain exact observation-date reads.

The current independently reviewed method is `dram-conditional-equity-risk-v2.0.0-ncsrs-fed-reference`. The original `scripts/dram_model.py` v1 kernel and NPORT evidence remain frozen; the new N-CSRS snapshot is not an amendment or numerical continuation of NPORT. It computes equity-risk PB/PS, not official fund/accounting/index multiples. Common equity plus explicitly assumed one-times TRS notionals form exposure; money funds, Treasury and swap MTM are not double counted. Each metric needs every required issuer input. There is no coverage threshold, renormalization or percentile. The offline projection uses the authenticated reviewed model package, never a parallel valuation formula.

The imported input must be source-bound, with locally verified file hashes. The reviewed input hash and exact canonical prepared JSON (source, real/synthetic identity, assumption metadata hash, method, values and dates) must enter `data/us-dram-approved-inputs.json` before a write. The list admits only the reviewed June 30 N-CSRS/Fed v2 baseline, with September 3 availability; other inputs require separate review. The archived MU-only v1 baseline has null PB and PS and cannot publish; the v2 entrypoint rejects that old source. Synthetic values remain tests only.

Preparation is offline and dry-run by default:

```
node scripts/us-dram-estimate-import.mjs --file /absolute/reviewed-input.json --sources /absolute/extracted-package --source-base ai-theme-backfill-20261110 --assumptions /absolute/reviewed-assumptions.json
```

A future explicitly approved write adds `--write --backup /absolute/private-backup.json` and, for the existing remote database, `--remote`. The writer takes the existing writer lock, makes an exclusive backup, uses payload/version CAS and verifies byte readback. No schedule is added. A completed metric cannot change implicitly when another metric becomes available.

Storage is one existing `market_snapshot` row at `valuation/US/holdings/DRAM/NCSRS-FED-v2`, bounded to forty real quarterly observations / 64 KiB. No daily copies are created. Native bounded D1 SQL selects only the latest knowable prepared quarter and returns that single observation (at most 16 KiB), plus its duplicate-quarter count. The HTTP reader checks only that observation against exact admission; complete checkpoint validation remains in the controlled writer. PB and PS publication gates are independent. A later incomplete quarter does not erase the previous complete quarter. Date-only availability does not establish availability at the session open. The real economic date remains visible, with input availability and the conditional swap assumption in the detail popup. Price date is separate but equals economic date under this frozen method; new date repricing needs separately reviewed inputs/methodology, not relabeling.

The website's `estimates` array is independent of official `rows`; empty admission causes no extra database read. A DRAM read failure cannot hide the other theme readings. No source requests, financial reconstruction, percentile computation or source initialization occur during page/API requests.

Material conditions are retained as reviewed assumption codes with fund/issuer scope and issuer names. The separate metadata file binds its exact input hash, retains the source review context, and is itself hashed into admission. Unknown codes or missing core fund conditions fail closed. New issuer conditions cannot silently become a generic TRS-only statement. Existing quarter identity and already-complete metrics cannot change during a PS supplement; reviewed condition additions are allowed, removals are not.

Isolation tests call the shared guarded persistence function with explicitly synthetic identity in in-memory SQLite. Production preparation and the CLI accept only source-bound real inputs, and the production reader rejects synthetic identity. Tests exercise actual guarded SQL, exclusive backup, CAS conflict, lost write response, exact readback, duplicate/conflicting quarters, input/projection tampering and no blind retry after uncertainty.

Preparation bounds are 2 MiB input, 1 MiB private reviewed assumption metadata, 512 source bindings, 16 MiB per source file and 128 MiB summed per binding (repeated bindings count again). Paths must resolve inside the source root, including symlink resolution. The final source package measures 399 bindings / 110,338,455 summed bytes, with a 13,959,022-byte largest file. Its 543,604-byte input and 620,691-byte private metadata remain offline; the public observation limit remains 16 KiB.

For a package whose bound paths are relative to a nested directory, `--sources` is the package safety boundary and optional `--source-base PACKAGE_SUBDIRECTORY` is the path-resolution base. Both the base and every resolved source must stay inside the package, including symlinks. This preserves the exact six-company input hashes while allowing its verified sibling evidence directories; it does not allow arbitrary parent traversal.

## Current source and use scope

The June 30, 2026 stock and TRS schedules are from the SEC N-CSRS accession 0001133228-26-012187, filed September 3, and are labelled Unaudited. That qualification is distinct from the Phison and Macronix qualified interim reviews. Federal Reserve Board H.10 June 30 New York noon exchange rates use the July 6 vintage; they are an external financial-normalization reference, not actual fund FX or a certified simultaneous market close. Both baseline metrics become knowable on September 3 at date precision only.

Coverage means the twelve disclosed stock/TRS reference issuers, not reconciliation of the summary holdings count or every asset. The k=1 risk-sleeve PB/PS are 7.464437349220805 and 8.753046322694541; NAV-normalized multiples are different and are not displayed. This is an active ETF proxy, not an index tracking value, official ETF valuation, current quote or percentile.

Only independently computed aggregate values, necessary dates, scoped condition codes and original concise explanations are projected publicly. Raw statements, extracted tables, source paths, source bindings, historical audit mappings and structured private review objects stay outside D1/API/UI. Current and historical condition mappings remain distinct. Grouped display preserves the current 52 active conditions, including PS-only cases; it does not publish the source research text. New source usability does not release any STOXX collection or publication hold.

The prepared source is `sec_ncsrs_fed_conditional_holdings`, with exact source version `DRAM_20260630_NCSRS_000113322826012187_FED_H10_20260706_v1`. Offline execution authenticates the pinned delivery manifest and all 356 payload files before importing the separately frozen package modules. The private package retains its relative directory tree; it is not copied into the public application bundle.
