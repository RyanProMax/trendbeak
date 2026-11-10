# ETF reader restoration

The production deployment at `78475c5` included the Mac synchronization migration and theme-index view but omitted seven previously reviewed ETF commits. The database retained the new exact publication proofs, so the old ETF reader rejected the rows and the current-estimate route was absent.

The restoration is based on `78475c5`, not on the older ETF branch. It integrates the reviewed changes from `22cf8f7`, `122a22f`, `78f32e9`, `2b2ee4b`, `e181f2a`, `a88b80d`, and `cacf7aa`. The current calculator, input approvals, published source proofs and historical observations are unchanged. The unpublished APA/XLE repair is excluded. No database write or new financial-data release is part of this restoration.

The existing valuation panel opens with the AI-related sector ETFs XLK, XLC, XLI and XLU. Fine-grained themes, traditional industry indices and broad benchmarks remain accessible in the same panel. The theme API and its manual reviewed-release workflow are unchanged. The Mac daily coordinator and the removal of GitHub data-update schedules are preserved.

XLI retains the exact November 6, 2026 marked disclosed-basket estimate. Its latest-view carry remains limited to seven calendar days and historical views still require an exact date. The other three ETF rows show their actual quarterly date when displayed with XLI. This restoration is not a November 9 valuation or an automated ETF daily refresh.

Release acceptance requires the full test suite, public-repository scan, bounded-reader budget checks, read-only production-database API verification, and 1440/390 light/dark screenshots including all expanded market-signal states. The integration must reach the normal main branch before production deployment, so subsequent main builds retain both the ETF reader and the Mac migration.
