// Synthetic display stress fixture only; never admitted as valuation input.
export const singleIssuerAssumptions=[
 {code:'conditional_trs_notional',scope:'fund'},
 {code:'fund_reported_marks',scope:'fund'},
 {code:'retrospective_date_only',scope:'fund'},
 ...['shares_carried','fiscal_period_mismatch'].map(code=>({code,scope:'issuer',issuerIsin:'US5951121038',issuerName:'Micron Technology'})),
];
// Verified v2 condition identities/scopes paired with synthetic display metrics in UI tests.
export const multiIssuerAssumptions=[
 {
  "code": "conditional_trs_notional",
  "scope": "fund"
 },
 {
  "code": "fund_reported_marks",
  "scope": "fund"
 },
 {
  "code": "retrospective_date_only",
  "scope": "fund"
 },
 {
  "code": "reported_financial_precision",
  "scope": "fund"
 },
 {
  "code": "shares_carried",
  "scope": "issuer",
  "issuerIsin": "US5951121038",
  "issuerName": "Micron Technology, Inc."
 },
 {
  "code": "fiscal_period_mismatch",
  "scope": "issuer",
  "issuerIsin": "US5951121038",
  "issuerName": "Micron Technology, Inc."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "KR7000660001",
  "issuerName": "SK hynix, Inc."
 },
 {
  "code": "equal_common_preferred_participation",
  "scope": "issuer",
  "issuerIsin": "KR7005930003",
  "issuerName": "Samsung Electronics Co. Ltd."
 },
 {
  "code": "preferred_liquidation_unverified",
  "scope": "issuer",
  "issuerIsin": "KR7005930003",
  "issuerName": "Samsung Electronics Co. Ltd."
 },
 {
  "code": "extra_dividend_not_capitalized",
  "scope": "issuer",
  "issuerIsin": "KR7005930003",
  "issuerName": "Samsung Electronics Co. Ltd."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "KR7005930003",
  "issuerName": "Samsung Electronics Co. Ltd."
 },
 {
  "code": "shares_carried",
  "scope": "issuer",
  "issuerIsin": "US80004C2008",
  "issuerName": "Sandisk Corp."
 },
 {
  "code": "fiscal_period_mismatch",
  "scope": "issuer",
  "issuerIsin": "US80004C2008",
  "issuerName": "Sandisk Corp."
 },
 {
  "code": "fiscal_53_week_ttm",
  "scope": "issuer",
  "issuerIsin": "US80004C2008",
  "issuerName": "Sandisk Corp."
 },
 {
  "code": "shares_carried",
  "scope": "issuer",
  "issuerIsin": "US9581021055",
  "issuerName": "Western Digital Corp."
 },
 {
  "code": "fiscal_period_mismatch",
  "scope": "issuer",
  "issuerIsin": "US9581021055",
  "issuerName": "Western Digital Corp."
 },
 {
  "code": "fiscal_53_week_ttm",
  "scope": "issuer",
  "issuerIsin": "US9581021055",
  "issuerName": "Western Digital Corp."
 },
 {
  "code": "share_rounding_delivery",
  "scope": "issuer",
  "issuerIsin": "US9581021055",
  "issuerName": "Western Digital Corp."
 },
 {
  "code": "reported_crossholding_book",
  "scope": "issuer",
  "issuerIsin": "US9581021055",
  "issuerName": "Western Digital Corp."
 },
 {
  "code": "shares_carried",
  "scope": "issuer",
  "issuerIsin": "IE00BKVD2N49",
  "issuerName": "Seagate Technology Holdings PLC"
 },
 {
  "code": "fiscal_period_mismatch",
  "scope": "issuer",
  "issuerIsin": "IE00BKVD2N49",
  "issuerName": "Seagate Technology Holdings PLC"
 },
 {
  "code": "fiscal_53_week_ttm",
  "scope": "issuer",
  "issuerIsin": "IE00BKVD2N49",
  "issuerName": "Seagate Technology Holdings PLC"
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "JP3236330001",
  "issuerName": "Kioxia Holdings Corp."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "CNE1000030S9",
  "issuerName": "GigaDevice Semiconductor, Inc. - Class A"
 },
 {
  "code": "proportional_a_h_participation",
  "scope": "issuer",
  "issuerIsin": "CNE1000030S9",
  "issuerName": "GigaDevice Semiconductor, Inc. - Class A"
 },
 {
  "code": "pending_cancellation_economic_exclusion",
  "scope": "issuer",
  "issuerIsin": "CNE1000030S9",
  "issuerName": "GigaDevice Semiconductor, Inc. - Class A"
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "reported_rounded_ordinary_quantity",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "treasury_quantity_inference",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "locked_private_ordinary_mark",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "reported_parent_equity_convention",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "reported_consolidation_perimeter",
  "scope": "issuer",
  "issuerIsin": "TW0002408002",
  "issuerName": "Nanya Technology Corp."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "reported_rounded_ordinary_quantity",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "treasury_quantity_inference",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "reported_parent_equity_convention",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "convertible_reserve_allocation",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "reported_consolidation_perimeter",
  "scope": "issuer",
  "issuerIsin": "TW0002344009",
  "issuerName": "Winbond Electronics Corp."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "reported_rounded_ordinary_quantity",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "reported_parent_equity_convention",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "convertible_reserve_allocation",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "qualified_interim_review",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "reported_consolidation_perimeter",
  "scope": "issuer",
  "issuerIsin": "TW0008299009",
  "issuerName": "Phison Electronics Corp."
 },
 {
  "code": "external_reference_fx",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "reported_rounded_ordinary_quantity",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "reported_parent_equity_convention",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "convertible_reserve_allocation",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "qualified_interim_review",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "reported_consolidation_perimeter",
  "scope": "issuer",
  "issuerIsin": "TW0002337003",
  "issuerName": "Macronix International Co. Ltd."
 },
 {
  "code": "reference_fx_timing_mismatch",
  "scope": "fund"
 },
 {
  "code": "reported_consolidation_perimeter",
  "scope": "issuer",
  "issuerIsin": "CNE1000030S9",
  "issuerName": "GigaDevice Semiconductor, Inc. - Class A"
 }
];
