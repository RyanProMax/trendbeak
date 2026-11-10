"""Offline conditional risk-sleeve research. No I/O, network or third-party packages.

All decimal inputs are strings. All numeric outputs are Decimal until serialized.
Source adapters must authenticate input bytes; this kernel validates their contract.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date
from decimal import Decimal, localcontext

METHOD = "dram-conditional-equity-risk-v1.0.0"
SERIES = "S000102337"
ZERO = Decimal("0")


def dec(value):
    if not isinstance(value, str):
        raise ValueError("Decimal input must be a string")
    number = Decimal(value)
    if not number.is_finite():
        raise ValueError("Nonfinite Decimal input")
    return number


def day(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("Date-only contract; no inferred intraday availability")
    return date.fromisoformat(value)


def publication_issue(publication, cutoff):
    if not publication or publication.get("date") is None:
        return "publication_unknown"
    day(publication["date"])
    if publication.get("precision") != "date":
        raise ValueError("This version preserves conservative calendar-date precision")
    if cutoff and publication["date"] > cutoff:
        return "not_available_by_information_cutoff"
    return None


def latest(publications):
    if not publications or any(not p or not p.get("date") for p in publications):
        return None
    return {"date": max(p["date"] for p in publications), "precision": "date",
            "interpretation": "filing-date availability bound; not an intraday trading timestamp"}


def native_value(fact):
    if not fact.get("currency"):
        raise ValueError("Explicit source currency required")
    scale = dec(fact["unitMultiplier"])
    if scale <= 0:
        raise ValueError("Positive explicit source unit multiplier required")
    return dec(fact["amount"]) * scale


def money(fact):
    """Optional USD normalization. Same-currency B/M and R/M need no FX bridge."""
    if fact["currency"] == "USD" and dec(fact["usdPerCurrencyUnit"]) != 1:
        raise ValueError("USD must have identity FX")
    scale, fx = dec(fact["unitMultiplier"]), dec(fact["usdPerCurrencyUnit"])
    if scale <= 0 or fx <= 0 or not fact.get("conversionBasis"):
        raise ValueError("Positive explicit unit/FX conversion and basis required")
    return native_value(fact) * fx


def optional_usd(fact):
    return money(fact) if fact.get("usdPerCurrencyUnit") is not None else None


def publications(fact):
    result = [fact.get("publication")]
    for component in fact.get("components", []):
        result.extend(publications(component))
    return result


def fx_issues(fact, asof, cutoff):
    if fact["currency"] == "USD":
        return []
    result = []
    if not fact.get("fxSource") or fact.get("fxEconomicDate") != asof:
        result.append("fx_bridge_source_or_economic_date_missing")
    issue = publication_issue(fact.get("fxPublication"), cutoff)
    if issue:
        result.append("fx_" + issue)
    return result


def input_issues(fact, asof, cutoff, is_sales=False):
    if fact is None:
        return ["financial_input_missing"]
    issues = []
    end = fact.get("periodEnd")
    if not end:
        issues.append("financial_period_missing")
    else:
        day(end)
        if end > asof:
            issues.append("future_economic_period")
    start = fact.get("periodStart")
    if start:
        day(start)
        if end and start > end:
            raise ValueError("Reversed financial interval")
    if is_sales and not start:
        issues.append("revenue_period_start_missing")
    issue = publication_issue(fact.get("publication"), cutoff)
    if issue:
        issues.append(issue)
    for operand in fact.get("components", []):
        issues.extend(input_issues(operand, asof, cutoff))
    value = native_value(fact)
    if is_sales and value < 0 and fact.get("negativeRevenueReviewed") is not True:
        issues.append("negative_revenue_requires_review")
    if not fact.get("basisCompatible") or not fact.get("source"):
        issues.append("financial_basis_or_provenance_unverified")
    return sorted(set(issues))


def calculate(data, information_cutoff=None):
    """Pure calculation. Missing values stay null; PB and PS have separate gates."""
    with localcontext() as ctx:
        ctx.prec = 60
        return _calculate(data, information_cutoff)


def _calculate(data, cutoff):
    if data["methodVersion"] != METHOD or data["seriesId"] != SERIES:
        raise ValueError("Method or independent DRAM series mismatch")
    asof = data["economicAsOf"]
    day(asof)
    if cutoff:
        day(cutoff)
    positions, companies = data["positions"], data["companies"]
    ids = [p["id"] for p in positions]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate position ID; contracts must not be deduplicated by ticker")
    company_ids = [c["isin"] for c in companies]
    if len(company_ids) != len(set(company_ids)):
        raise ValueError("Duplicate company ISIN")
    by_isin = {c["isin"]: c for c in companies}
    nav = dec(data["accounting"]["navUsd"])
    assets = dec(data["accounting"]["totalAssetsUsd"])
    liabilities = dec(data["accounting"]["totalLiabilitiesUsd"])
    if nav <= 0 or assets - liabilities != nav:
        raise ValueError("Assets minus liabilities must equal positive NAV")
    equity_isins = {p["isin"] for p in positions if p["kind"] == "common_equity"}
    if equity_isins != set(by_isin):
        raise ValueError("Exactly one company row required per cash-equity reference ISIN")
    swap_ids = {p["id"] for p in positions if p["kind"] == "swap"}
    if set(data["conditionalCoefficients"]) != swap_ids:
        raise ValueError("An explicit coefficient is required for every unique swap")
    cash, quantity, exposure, company_gross = (defaultdict(lambda: ZERO) for _ in range(4))
    ledger, units, swap_rows = [], [], []
    categories = defaultdict(lambda: ZERO)
    long_exposure = short_exposure = ZERO
    for p in positions:
        value, kind = dec(p["reported"]["valueUsd"]), p["kind"]
        if p["reported"]["valueCurrency"] != "USD":
            raise ValueError("Position marks must be reported USD, not investment currency")
        categories[kind] += value
        entry = {"id": p["id"], "sourceOrdinal": p["sourceOrdinal"], "kind": kind,
                 "name": p["name"], "accountingMarkUsd": value, "equityExposureUsd": ZERO}
        amount = ZERO
        if kind == "common_equity":
            if p["reported"]["unitsCode"] != "NS":
                raise ValueError("Cash equity requires actual shares NS, never contracts NC")
            shares = dec(p["reported"]["balance"])
            if shares <= 0 or value < 0:
                raise ValueError("This version requires positive cash share quantities and nonnegative value")
            isin = p["isin"]
            cash[isin] += value
            quantity[isin] += shares
            amount = value
            units.append({"id": p["id"], "isin": isin, "reportedShares": shares,
                          "impliedUsdPerShare": value / shares,
                          "nature": "fund-reported unit mark, not certified exchange close"})
        elif kind == "swap":
            isin = p["referenceIsin"]
            if isin not in equity_isins or p["reported"]["unitsCode"] != "NC":
                raise ValueError("Swap must map by exact reference ISIN to a common equity; NC is not shares")
            if p["reported"]["notionalCurrency"] != "USD":
                raise ValueError("This version requires USD notional")
            notional = dec(p["reported"]["notionalAmount"])
            if notional < 0:
                raise ValueError("Notional magnitude must be nonnegative; sign belongs to explicit k")
            assumption = data["conditionalCoefficients"][p["id"]]
            if assumption["status"] != "conditional" or not assumption["basis"]:
                raise ValueError("Coefficient must retain explicit conditional basis")
            k = dec(assumption["k"])
            amount = k * notional
            swap_rows.append({"id": p["id"], "sourceOrdinal": p["sourceOrdinal"],
                              "referenceIsin": isin, "notionalUsd": notional, "k": k,
                              "coefficientStatus": "conditional", "coefficientBasis": assumption["basis"],
                              "accountingMarkUsd": value, "conditionalEquityExposureUsd": amount,
                              "reportedCurrentDeltaEquivalentExposure": p["reported"].get("currentDeltaEquivalentExposure"),
                              "unresolvedExposureTerms": p.get("unresolvedExposureTerms", [])})
        elif kind not in {"money_fund", "treasury"}:
            raise ValueError("Unclassified accounting position")
        if kind in {"common_equity", "swap"}:
            exposure[isin] += amount
            company_gross[isin] += abs(amount)
            entry.update(referenceIsin=isin, equityExposureUsd=amount)
            long_exposure += max(amount, ZERO)
            short_exposure += min(amount, ZERO)
        ledger.append(entry)
    net, gross = sum(exposure.values(), ZERO), sum(company_gross.values(), ZERO)
    base_publication = data.get("holdingsPublication")
    base_issue = publication_issue(base_publication, cutoff)
    rows = []
    for isin in company_ids:
        company = by_isin[isin]
        market = company.get("marketBasis")
        shared_issues = [base_issue] if base_issue else []
        market_value = market_native = market_currency = None
        if not market:
            shared_issues.append("compatible_company_market_basis_missing")
        else:
            if not market.get("basisCompatible") or not market.get("source"):
                shared_issues.append("market_class_basis_or_provenance_unverified")
            issue = publication_issue(market.get("publication"), cutoff)
            if issue:
                shared_issues.append(issue)
            if market["mode"] == "single_class_outstanding_shares_times_nport_mark":
                day(market["sharesAnchorDate"])
                if market["sharesAnchorDate"] > asof:
                    shared_issues.append("future_share_anchor")
                if market["sharesAnchorDate"] != asof and not market.get("carryIsExplicitEstimate"):
                    shared_issues.append("share_carry_not_declared")
                if market["securityRatio"] != "1" or market["shareQuantityNature"] != "actual_outstanding_anchor":
                    raise ValueError("Unsupported ADR/class ratio or diluted/issued-share denominator")
                shares = dec(market["shares"])
                if shares <= 0:
                    raise ValueError("Company outstanding shares must be positive")
                market_value = shares * (cash[isin] / quantity[isin])
                market_native, market_currency = market_value, "USD"
            elif market["mode"] == "compatible_whole_company_market_value":
                # An adapter must first audit all class quantities, prices and economic rights.
                # This branch never infers whole-company value from one held share class.
                value_fact = market["value"]
                shared_issues.extend(input_issues(value_fact, asof, cutoff))
                if value_fact["periodEnd"] != asof or not market.get("allRelevantClassesCovered"):
                    shared_issues.append("whole_company_market_scope_or_date_incomplete")
                if not market.get("classBasisEvidence") or not market.get("componentSourceBindings"):
                    shared_issues.append("whole_company_class_evidence_missing")
                market_native, market_currency = native_value(value_fact), value_fact["currency"]
                market_value = optional_usd(value_fact)
                if value_fact.get("equityScope") != market.get("equityScope"):
                    shared_issues.append("market_component_equity_scope_mismatch")
            else:
                raise ValueError("Unsupported company market basis")
            if market_native <= 0:
                shared_issues.append("nonpositive_company_market_value")
        row = {"isin": isin, "name": company["name"], "cashEquityUsd": cash[isin],
               "conditionalSwapExposureUsd": exposure[isin] - cash[isin],
               "netEquityExposureUsd": exposure[isin], "grossEquityExposureUsd": company_gross[isin],
               "required": company_gross[isin] != 0, "companyMarketValueProxyUsd": market_value,
               "companyMarketValueSourceCurrency": market_currency, "companyMarketValueSourceAmount": market_native,
               "estimatedFlags": company.get("estimatedFlags", []), "marketBasis": market}
        for metric in ("book", "sales"):
            fact = company.get(metric)
            issues = sorted(set(shared_issues + input_issues(fact, asof, cutoff, metric == "sales")))
            if fact and market:
                if not fact.get("equityScope") or fact["equityScope"] != market.get("equityScope"):
                    issues.append("numerator_market_equity_scope_mismatch")
                if fact["currency"] != market_currency and (optional_usd(fact) is None or market_value is None):
                    issues.append("currency_mismatch_requires_fx_bridge")
                elif fact["currency"] != market_currency:
                    issues.extend(fx_issues(fact, asof, cutoff))
                    if market["mode"] == "compatible_whole_company_market_value":
                        issues.extend(fx_issues(market["value"], asof, cutoff))
            usable = not issues
            value = optional_usd(fact) if fact is not None else None
            source_value = native_value(fact) if fact is not None else None
            used_publications = [base_publication, market.get("publication") if market else None]
            if market and market.get("mode") == "compatible_whole_company_market_value":
                used_publications.extend(publications(market["value"]))
            if fact:
                used_publications.extend(publications(fact))
                if market_currency and fact["currency"] != market_currency:
                    if fact["currency"] != "USD":
                        used_publications.append(fact.get("fxPublication"))
                    if market_currency != "USD":
                        used_publications.append(market["value"].get("fxPublication"))
            y = ((source_value / market_native if fact["currency"] == market_currency else value / market_value)
                 if usable else None)
            row[metric] = {"inputUsd": value, "yield": y,
                           "inputSourceCurrency": fact["currency"] if fact else None,
                           "inputSourceAmount": source_value,
                           "ratioBasis": ("same-currency numerator/market value; no FX needed" if usable and fact["currency"] == market_currency
                                          else "explicit USD FX bridge" if usable else None),
                           "syntheticContributionUsd": exposure[isin] * y if usable else None,
                           "usable": usable, "issues": issues, "sourceInput": fact,
                           "contributionKnownAt": latest(used_publications) if usable else None}
        rows.append(row)
    metrics = {}
    for metric in ("book", "sales"):
        required = [r for r in rows if r["required"]]
        missing = [r for r in required if not r[metric]["usable"]]
        known = [r for r in required if r[metric]["usable"]]
        partial = sum((r[metric]["syntheticContributionUsd"] for r in known), ZERO)
        complete = not missing and base_issue is None
        reason = ("missing_required_inputs" if not complete else
                  "long_short_requires_new_method" if short_exposure < 0 else
                  "nonpositive_aggregate_" + metric if partial <= 0 else None)
        metrics[metric] = {
            "complete": complete, "requiredCompanyCount": len(required), "knownCompanyCount": len(known),
            "missingCompanyCount": len(missing), "missingFields": [
                {"isin": r["isin"], "name": r["name"], "fields": r[metric]["issues"],
                 "netExposureUsd": r["netEquityExposureUsd"], "grossExposureUsd": r["grossEquityExposureUsd"]}
                for r in missing],
            "missingNetExposureUsd": sum((r["netEquityExposureUsd"] for r in missing), ZERO),
            "missingGrossExposureUsd": sum((r["grossEquityExposureUsd"] for r in missing), ZERO),
            "knownGrossExposureUsd": sum((r["grossEquityExposureUsd"] for r in known), ZERO),
            "knownExposureFractionOfGross": sum((r["grossEquityExposureUsd"] for r in known), ZERO) / gross if gross else None,
            "partialSyntheticContributionUsd": partial,
            "partialContributionNavYield": partial / nav,
            "partialKnownAt": latest([r[metric]["contributionKnownAt"] for r in known]),
            "partialLabel": "Known contributions only; not a complete risk-sleeve amount or yield",
            "syntheticTotalUsd": partial if complete else None,
            "riskSleeveMultiple": net / partial if reason is None else None,
            "navNormalizedMultiple": nav / partial if reason is None else None,
            "navNormalizedYield": partial / nav if complete else None,
            "nullReason": reason,
            "knownAt": latest([base_publication] + [r[metric]["contributionKnownAt"] for r in known]) if complete else None,
            "negativeInputIssuers": [{"isin": r["isin"], "inputUsd": r[metric]["inputUsd"],
                "inputSourceAmount": r[metric]["inputSourceAmount"], "inputSourceCurrency": r[metric]["inputSourceCurrency"],
                "grossExposureUsd": r["grossEquityExposureUsd"],
                "grossExposureFraction": r["grossEquityExposureUsd"] / gross if gross else None}
                for r in known if r[metric]["inputSourceAmount"] < 0]}
    row_map = {r["isin"]: r for r in rows}
    for swap in swap_rows:
        derivatives = {"dNetExposureDk": swap["notionalUsd"]}
        for metric in ("book", "sales"):
            y = row_map[swap["referenceIsin"]][metric]["yield"]
            total = metrics[metric]["syntheticTotalUsd"]
            usable_multiple = metrics[metric]["riskSleeveMultiple"] is not None
            derivatives[metric] = {
                "dSyntheticContributionDk": swap["notionalUsd"] * y if y is not None else None,
                "contributionScope": "known reference issuer only" if y is not None else "reference issuer input missing",
                "dRiskMultipleDk": swap["notionalUsd"] * (total - net * y) / total ** 2 if usable_multiple and y is not None else None,
                "dNavMultipleDk": -nav * swap["notionalUsd"] * y / total ** 2 if usable_multiple and y is not None else None}
        swap["sensitivity"] = derivatives
    marks = sum(categories.values(), ZERO)
    return {"methodVersion": METHOD, "seriesId": SERIES, "economicAsOf": asof,
            "datasetKind": data["datasetKind"], "mode": "conditional_notional_proxy",
            "holdingsPublication": base_publication,
            "holdingsPublicationEvidence": data.get("holdingsPublicationEvidence"),
            "reconstructionDate": data.get("reconstructionDate"),
            "informationCutoff": cutoff, "knownAt": latest([m["knownAt"] for m in metrics.values()])
            if all(m["complete"] for m in metrics.values()) else None,
            "status": "complete_equity_scope_conditional_nonofficial" if all(m["complete"] for m in metrics.values())
            else "partial_contributions_full_sleeve_incomplete",
            "accounting": {"totalAssetsUsd": assets, "totalLiabilitiesUsd": liabilities, "navUsd": nav,
                           "signedPositionMarksUsd": marks, "unallocatedNavAdjustmentUsd": nav - marks,
                           "adjustmentNature": "unallocated net-asset reconciliation; not identified cash",
                           "categoryMarksUsd": dict(categories), "positionCounts": dict(Counter(p["kind"] for p in positions))},
            "risk": {"netEquityExposureUsd": net, "grossEquityExposureUsd": gross,
                     "longExposureUsd": long_exposure, "shortExposureUsd": short_exposure,
                     "netEquityExposureToNav": net / nav, "grossEquityExposureToNav": gross / nav,
                     "reportedCurrentDeltaEquivalentExposureUsd": None,
                     "notionalWithUnverifiedCurrentExposureUsd": sum((s["notionalUsd"] for s in swap_rows), ZERO),
                     "currentExposureStatus": "Contract terms unresolved; k values are assumptions, not certified deltas"},
            "positions": ledger, "unitMarks": units, "companies": rows, "swaps": swap_rows,
            "metrics": metrics, "sourceBindings": data.get("sourceBindings", {}),
            "assumptions": data.get("assumptions", []),
            "scope": {"realQuarterCount": 1 if data["datasetKind"] == "real_source_bound" else 0,
                      "officialFundPB": None, "officialFundPS": None, "indexPB": None, "indexPS": None,
                      "history": None, "percentile": None, "publicationAuthorized": False,
                      "deploymentEvaluated": False, "tradableJune30Knowledge": False}}


def stress_scenarios(data):
    """Researcher-selected stresses, not confidence intervals or proven bounds."""
    rows = []
    cases = [("all_k_" + k, {key: k for key in data["conditionalCoefficients"]})
             for k in ("0", "0.5", "1", "1.5")]
    cases += [(key + "_only_k_1.5", {key: "1.5"}) for key in data["conditionalCoefficients"]]
    for label, changes in cases:
        scenario = deepcopy(data)
        for key, k in changes.items():
            scenario["conditionalCoefficients"][key]["k"] = k
        result = calculate(scenario)
        rows.append({"scenario": label, "coefficients": scenario["conditionalCoefficients"],
                     "risk": result["risk"], "metrics": result["metrics"]})
    return {"methodVersion": METHOD, "label": "Assumed coefficient stress scenarios, not confidence intervals",
            "zeroCaseMeaning": "k=0 removes swaps counterfactually; not the fund's certified minimum exposure",
            "rangeIsProvenBound": False, "scenarios": rows}


def json_ready(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return {k: json_ready(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_ready(v) for v in value]
    return value
