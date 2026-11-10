// Pure diagnostic arithmetic, deliberately independent of source admission and
// source admission. It cannot approve or publish an observation.
const abs = n => n < 0n ? -n : n;
function gcd(a, b) { for (a = abs(a), b = abs(b); b;) [a, b] = [b, a % b]; return a; }
function fraction(n, d = 1n) {
  if (d <= 0n) throw Error('Positive rational denominator required');
  const g = gcd(n, d); return {n:n / g, d:d / g};
}
const ZERO = fraction(0n), ONE = fraction(1n);
export const REPORTED_RISKS = Object.freeze(['knownCapitalLag','knownBookScopeLag','reportedPerimeterLag']);
function riskStatuses(row) {
  const result = {};
  for (const risk of REPORTED_RISKS) {
    const status = row.riskAssessment?.[risk]?.status;
    if (!['known','none','unknown'].includes(status)) throw Error('Explicit known/none/unknown risk assessment required');
    result[risk] = status;
  }
  return result;
}
const add = (a,b) => fraction(a.n*b.d + b.n*a.d, a.d*b.d);
const sub = (a,b) => fraction(a.n*b.d - b.n*a.d, a.d*b.d);
const mul = (a,b) => fraction(a.n*b.n, a.d*b.d);
function div(a,b) { if (b.n <= 0n) throw Error('Positive divisor required'); return fraction(a.n*b.d,a.d*b.n); }
const compare = (a,b) => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;

/** Exact source decimal strings only. No binary float conversion before sums or
 * coverage decisions. Size limits prevent unbounded exponent/BigInt work. */
export function reportedDecimal(value) {
  if (typeof value !== 'string' || value.length > 100) throw Error('Bounded explicit decimal string required');
  const m = value.match(/^(-?)(\d{1,60})(?:\.(\d{1,40}))?(?:[eE]([+-]?\d{1,2}))?$/);
  if (!m) throw Error('Invalid decimal amount');
  const scale = (m[3]?.length ?? 0) - Number(m[4] ?? 0);
  if (Math.abs(scale) > 60) throw Error('Decimal scale exceeds diagnostic bound');
  let n = BigInt(m[2] + (m[3] ?? '')) * (m[1] ? -1n : 1n);
  return scale < 0 ? fraction(n * 10n ** BigInt(-scale)) : fraction(n, 10n ** BigInt(scale));
}

function exact(value) { return {numerator:value.n.toString(),denominator:value.d.toString()}; }
function approximate(value) {
  if (value.n === 0n) return 0;
  // A long sum of exact issuer fractions may have large coprime integers even
  // when its final ratio is modest. Never convert those integers separately.
  const exponent = abs(value.n).toString().length - value.d.toString().length;
  const shift = 18 - exponent;
  const scaled = shift >= 0 ? value.n * 10n ** BigInt(shift) / value.d : value.n / (value.d * 10n ** BigInt(-shift));
  const n = Number(scaled.toString() + 'e' + (exponent - 18));
  if (!Number.isFinite(n)) throw Error('Nonfinite numeric diagnostic');
  return n;
}

/** `rows` must be downstream of a separate source-admission adapter. This
 * function does not accept PASS labels and does not grant field admission.
 * Missing numerator/denominator are explicit nulls; zero denominator is an
 * observed nonpositive value, never a substitute for missing input. */
export function reportedHarmonicArithmetic(rows, {fullEquityWeight}) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 600) throw Error('Bounded position list required');
  const total = reportedDecimal(fullEquityWeight);
  if (compare(total,ZERO) <= 0 || compare(total,ONE) > 0) throw Error('Original full equity weight required');
  const ids = new Set(), issuers = new Map(), classifications = [];
  let seen = ZERO, positive = ZERO, nonpositive = ZERO, missing = ZERO, reciprocal = ZERO;
  let commonClassPriceProxy = ZERO, unresolvedUnitBridge = ZERO;
  const risks = Object.fromEntries(REPORTED_RISKS.map(name=>[name,{known:ZERO,none:ZERO,unknown:ZERO}]));
  for (const row of rows) {
    if (!row || typeof row.securityId !== 'string' || !row.securityId || ids.has(row.securityId) || !(typeof row.issuerId === 'string' && row.issuerId || row.issuerId === null && row.identityAdmitted === false)) throw Error('Unique held security and explicit issuer identity or unresolved null required');
    ids.add(row.securityId);
    const weight = reportedDecimal(row.weight);
    if (compare(weight,ZERO) <= 0 || compare(weight,total) > 0) throw Error('Positive original weight required');
    seen = add(seen, weight);
    const capital = row.capitalization === null ? null : reportedDecimal(row.capitalization);
    const denominator = row.denominator === null ? null : reportedDecimal(row.denominator);
    for (const flag of ['identityAdmitted','denominatorAdmitted','commonClassPriceProxy','unitBridgeUnresolved']) if (typeof row[flag] !== 'boolean') throw Error('Explicit diagnostic flags required');
    const statuses = riskStatuses(row);
    const signature = JSON.stringify([capital && exact(capital), denominator && exact(denominator),row.identityAdmitted,row.denominatorAdmitted,statuses,row.commonClassPriceProxy,row.unitBridgeUnresolved]);
    // Risk assessments are distinct from ratio eligibility. Each risk partitions
    // the entire original basket; unreviewed identity/field cannot assert none.
    for (const risk of REPORTED_RISKS) {
      const status = row.identityAdmitted && row.denominatorAdmitted ? statuses[risk] : 'unknown';
      risks[risk][status] = add(risks[risk][status],weight);
    }
    if (row.issuerId !== null) {
      if (issuers.has(row.issuerId) && issuers.get(row.issuerId) !== signature) throw Error('Held classes must share one issuer capitalization and financial basis');
      issuers.set(row.issuerId,signature);
    }
    if (row.unitBridgeUnresolved) unresolvedUnitBridge = add(unresolvedUnitBridge,weight);
    if (!row.identityAdmitted || !row.denominatorAdmitted || !denominator) {
      missing = add(missing,weight);
      classifications.push({securityId:row.securityId,status:'missing',reason:!row.identityAdmitted?'identity_not_admitted':!row.denominatorAdmitted?'denominator_scope_or_source_not_admitted':'denominator_missing'});
      continue;
    }
    // A correctly bound, source-verified nonpositive denominator is a known
    // exclusion. Its classification does not consume a price/share numerator.
    // Unknown entity or common-book scope was stopped above, before this branch.
    const isNonpositive = compare(denominator,ZERO) <= 0;
    if (!isNonpositive && (!capital || row.unitBridgeUnresolved)) {
      missing = add(missing,weight);
      classifications.push({securityId:row.securityId,status:'missing',reason:row.unitBridgeUnresolved?'unit_bridge_unresolved':'capitalization_missing'});
      continue;
    }
    if (!isNonpositive && compare(capital,ZERO) <= 0) throw Error('Positive calculation needs positive capitalization');
    if (row.commonClassPriceProxy) commonClassPriceProxy = add(commonClassPriceProxy,weight);
    if (isNonpositive) {
      nonpositive = add(nonpositive,weight);
      classifications.push({securityId:row.securityId,status:'observed_nonpositive'});
      continue;
    }
    positive = add(positive,weight);
    reciprocal = add(reciprocal,mul(weight,div(denominator,capital)));
    classifications.push({securityId:row.securityId,status:'positive_eligible'});
  }
  if (compare(seen,total) > 0) throw Error('Original positions exceed the full equity denominator');
  const unrepresented = sub(total,seen); missing = add(missing,unrepresented);
  for (const risk of REPORTED_RISKS) risks[risk].unknown = add(risks[risk].unknown,unrepresented);
  const riskWeights = Object.fromEntries(REPORTED_RISKS.flatMap(name=>[[name,risks[name].known],['unknown'+name[0].toUpperCase()+name.slice(1),risks[name].unknown]]));
  const weights = {positive,verifiedNonpositive:nonpositive,verifiedInput:add(positive,nonpositive),missing,unrepresented,...riskWeights,commonClassPriceProxy,unresolvedUnitBridge};
  const coverages = Object.fromEntries(Object.entries(weights).map(([name,value]) => {
    const coverage = div(value,total);return [name,{weight:exact(value),coverage:exact(coverage),displayCoverage:approximate(coverage)}];
  }));
  const riskAssessments = Object.fromEntries(REPORTED_RISKS.map(name=>[name,{
    denominator:'full_original_equity_weight',
    complete:risks[name].unknown.n===0n,
    knownLagCoverage:risks[name].unknown.n===0n?approximate(div(risks[name].known,total)):null,
    states:Object.fromEntries(Object.entries(risks[name]).map(([status,value])=>[status,{weight:exact(value),coverage:exact(div(value,total)),displayCoverage:approximate(div(value,total))}])),
  }]));
  const multiple = compare(reciprocal,ZERO) > 0 ? div(positive,reciprocal) : null;
  return {
    schema:'reported-common-arithmetic-diagnostic-v2',
    arithmeticOnly:true,
    wholeObservationApproved:false,
    publishable:false,
    coverageGate:null,
    coverageGatePassed:null,
    coveredPositiveMultiple:multiple?approximate(multiple):null,
    coveredPositiveMultipleExact:multiple?exact(multiple):null,
    positiveWeight:exact(positive),
    weightedReciprocal:exact(reciprocal),
    coverages,
    classifications,
    riskAssessments,
    rank:null,
    percentile:null,
  };
}
