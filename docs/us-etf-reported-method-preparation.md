# Separate reported-common estimate: offline preparation

This work is isolated from the deployed strict, conversion-value and dated-price-roll methods. It adds no route, D1 operation, schedule or release approval. Existing XLK and XLC safety holds remain in force.

## Scope and method boundary

The intended numerator uses actual ordinary shares outstanding **net of treasury**, at each retained share-count date, multiplied by the observation's price. It does not use gross shares issued, authorized shares, diluted EPS shares, unissued awards, warrants or legally preferred shares as if converted. A different ordinary class may use a listed-class price only with a separately disclosed and reviewed common-class price proxy. Splits, ADR ratios, redenominations and class changes need an explicit verified unit bridge.

PS uses reported total operating TTM revenue, without pretending that later acquisitions have a complete pro-forma year. Ordinary same-class issuance and repurchase after a dated count are a disclosed `knownCapitalLag`, not a fabricated current count or automatic missing value. Operating-perimeter comparability, capital staleness and unit validity are separate dimensions.

PB uses common book on a historical carrying-value basis. The adapter must distinguish a directly reported common-equity fact, a reconciliation from parent equity and separately reported preferred carrying value, and a fully supported historical carrying residual. Preferred capital is never implicitly zero. If the starting total includes NCI, ordinary and redeemable NCI are deducted once; a subset must not be deducted again. Treasury already reflected in book is not deducted again. Liquidation preference or an assumed conversion value does not replace carrying value. A derived result must retain its complete source-bound rollforward and its derived label.

The formal v2 review and computation contract are now hash-bound in the offline method policy. Its full method identity combines `reported_ttm_total_market_cap_v1` with `actual_issued_common_dated_carry_explicit_2026q2_v1`. Any future history is grouped by that identity and its explicit comparison key, never spliced into strict or conversion-value history. No candidate can grant itself a whole-observation approval.

The v2 data gate is `(positive eligible weight + verified nonpositive excluded weight) / full original stock weight >= 0.98`, evaluated with exact rational arithmetic. The value remains the positive subset's `c/y`. A fully verified but wholly nonpositive basket has 100% verified coverage and no positive multiple. A scope-correct nonpositive denominator does not consume an unused capital/price numerator, but its source, entity-to-holding identity and common-book scope must first be admitted. A negative value for the wrong issuer or unknown preferred/NCI scope remains missing.

## Intake already prepared

The local June 30 XLK checkpoint is retained by exact SHA-256. The intake scaffold copies all 74 original security identities, original fund weights and original fund marks. Its equity denominator is the original stock weight, 0.99927857221347. It does not renormalize only the companies whose financial inputs happen to be ready.

Every issuer link, common-capital admission, book admission and revenue admission begins empty. Legacy `verified_all_common`, generic PASS labels, old financial facts and old alternatives are not imported. Retained source references and original holding hashes allow the new source adapter to reconcile identity, mark and weight without collecting the old data again.

The NPORT basket and its fund marks became public on August 28. A June 30 result is therefore a retrospective reconstruction, even when all financial facts meet the June 30 cutoff. It must not be presented as a signal available for trading on June 30.

Future display must retain that economic date and publication lag in the existing concise status/tooltip pattern. It must not reintroduce the removed top-right component date, expose a long source list, or make a June 30 estimate silently look like the currently selected November 9 observation. This preparation does not change the UI.

## Proposed source and audit boundaries

1. **Basket root:** exact old checkpoint bytes, full 74-position inventory, original equity denominator, original source publication date and fund-mark basis.
2. **Method contract:** exact reviewed document and machine-contract hashes, versioned separately from strict or conversion-value methods.
3. **Issuer input:** source-normalized net-treasury class counts and their precision, own-class or explicitly proxied prices, dated unit bridges, reported TTM terms, and direct or derived common-book reconciliation.
4. **Metric admission:** exact issuer/field hashes and original-document/audit references. Capital, book and revenue can be admitted independently. No broad symbol exemption or inherited old approval.
5. **Mechanical calculation:** one consistent issuer ratio for all held classes; positive harmonic aggregation over original weights. Missing inputs never become zero. Observed nonpositive denominators are separately counted and never offset positive reciprocals.
6. **Audit output:** positive eligible coverage, verified input coverage, observed nonpositive coverage, missing coverage, dated capital-lag coverage, class-price-proxy coverage, operating-perimeter comparability and unresolved unit bridges. A rounded displayed percentage cannot satisfy the full-precision 98% threshold.
7. **Observation release:** remains false in this offline module, including after arithmetic passes. Complete source admission, independent reconciliation and a later explicit controlled release are separate requirements. The current arithmetic module explicitly reports that it does not perform source admission.

The source worker will provide a compact normalized issuer-input and proof manifest. The adapter will consume those stable artifacts rather than reparse large original filing tables or inherit older candidate `PBAdmission` flags.

## Required counterexamples

- Incomplete inventory, duplicate or changed security identity, changed weight/mark, and source-root mismatch.
- Gross issued shares or treasury counted twice; diluted EPS or unissued instruments used as ordinary shares.
- Preferred carrying value omitted, substituted with liquidation value or deducted twice; nested NCI deducted twice; APIC-embedded NCI omitted.
- A derived common-book residual without a complete reconciled rollforward or with inconsistent dates.
- Known same-class issuance and repurchase handled asymmetrically, or a dated count silently relabeled current.
- Unresolved split, ADR ratio or class-unit change; an unreviewed ordinary-class price proxy.
- TTM terms with wrong signs, noncontiguous periods, future publication, wrong units or inconsistent operating scope.
- Duplicate held classes counted as independent issuer capital, or two held classes assigned inconsistent issuer facts.
- Missing input treated as zero, negative ratios netted against positives, and 97.999…% rounded to 98%.
- A candidate-supplied PASS, stale registry, changed fact/source hash, or a complete component set mistaken for whole-observation approval.

No complete XLK point is claimed by this preparation.

## r2 review corrections

Risk intake uses `riskAssessment.knownCapitalLag`, `riskAssessment.knownBookScopeLag` and `riskAssessment.reportedPerimeterLag`. Each is an object with `status` equal to `known`, `none` or `unknown`, explicit `evidenceRefs` and a note. Known and none require a referenced independent assessment in the pinned proof manifest. Free text stays in the original issuer inputs; it is not parsed into a status. An older `knownCapitalLag: true` disclosure survives as known. An older false or absent scope field is unknown, not evidence that no lag exists.

For each metric, each risk partitions the full original stock weight into known, explicitly assessed none and unknown. Unreviewed metric/identity and unrepresented holdings are unknown. These partitions are independent of positive-ratio eligibility and do not remove a valid dated estimate. `knownLagCoverage` is null while any unknown weight remains. The separately reported known weight is only the established portion, never a claim that the rest has no risk. Old v6 has 100% unknown book-scope and income-perimeter assessment, not 0% lag.

The pinned review root specifies PB and PS component sets separately. Each field's independent audit and original facts are checked only for that field. A revenue-only admission does not import unreviewed book, and a book-only admission does not import unreviewed revenue. Their original basket denominator stays the same. Legacy v5/v6 happen to have the same independently reviewed component set for both metrics; this coincidence is not a joint gate.

The current class invariant requires one common capitalization and financial basis across multiple held classes of an issuer. This is a deliberate boundary, not support for arbitrary multi-traded-class baskets. In particular, GOOG and GOOGL cannot each multiply its own price by all ordinary shares and pass as the same issuer capitalization. Future XLC intake needs a separately reviewed total capitalization using each listed class's own price plus explicit proxies for unlisted classes, or a distinct per-class ratio method. Direct `q/N` attribution and weighted-harmonic equality must be re-proved for the chosen price bases. Do not remove the invariant merely to admit those rows.

## Frozen v8 intake

V8 has 39 independently audited PB/PS components in the same 74-position basket. Verified input coverage is 93.12392524%; DELL's observed nonpositive common book contributes 0.69588612% to verified input but not to the positive PB reciprocal. Both publishable values remain null. PANW's known book lag and APH/PANW operating-perimeter boundaries now have explicit reviewed risk objects. Unknown is never converted into none.

The ACN net-share branch is limited to one exact independently reviewed source/date/fact: its June 4 cover count of 667,510,210 includes 55,568,101 issuer-held shares, leaving 611,942,109 external ordinary shares. It verifies the exact original proof, same date/source and subtraction. Forecast issuances, a different treasury date, double netting and simultaneous unreviewed split/netting order do not pass. This is not a general issuer exemption or a source parser.

The separate publication/reader design is in `us-etf-reported-publication-design.md`. It remains a proposal with no database or frontend change.
