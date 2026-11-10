// Offline intake only. No production reader, writer, credentials or network imports.
// Legacy financial facts and legacy admission labels never enter this candidate.
import {createHash} from 'node:crypto';

export const REPORTED_CANDIDATE_SCHEMA = 'us-etf-reported-candidate-v1';
export const MIN_REPORTED_COVERAGE = .98;
const hashPattern = /^[a-f0-9]{64}$/;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function reportedCanonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (finite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(reportedCanonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + reportedCanonical(value[key])).join(',') + '}';
  }
  throw Error('Only finite explicit JSON values can be hashed');
}

export function reportedHash(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : reportedCanonical(value)).digest('hex');
}

/** The root is supplied by the independently checked local checkpoint inventory.
 * This is an intake scaffold, not a reviewed method or an approved observation. */
export function reportedBasketSkeleton(bytes, root) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 1_800_000 || !root || !hashPattern.test(root.checkpointSha256) || reportedHash(bytes) !== root.checkpointSha256) throw Error('Exact bounded cached checkpoint required');
  if (root.code !== 'XLK' || root.date !== '2026-06-30') throw Error('Only the requested June 30 XLK intake is supported');
  const checkpoint = JSON.parse(bytes), input = checkpoint.latest?.input;
  if (checkpoint.code !== root.code || input?.code !== root.code || input.date !== root.date || input.holdingsAsOf !== root.date || input.pricingBasis !== 'portfolio_fair_value_per_share' || !instant(input.cutoff) || !instant(input.availableAt) || Date.parse(input.availableAt) < Date.parse(input.cutoff)) throw Error('Cached basket identity or time mismatch');
  if (!Array.isArray(input.holdings) || !input.holdings.length || input.holdings.length > 600 || !finite(input.stockWeight) || input.stockWeight <= 0 || input.stockWeight > 1) throw Error('Complete original equity inventory required');
  const provenance = checkpoint.provenance?.[root.date];
  if (!Array.isArray(provenance) || !provenance.length || provenance.length > 2400) throw Error('Cached source inventory required');
  const sources = new Map();
  for (const source of provenance) {
    if (!source || typeof source.id !== 'string' || sources.has(source.id) || typeof source.url !== 'string' || !source.url.startsWith('https://')) throw Error('Unique explicit source identities required');
    sources.set(source.id, source);
  }
  if (!sources.has(input.holdingsSource)) throw Error('Original holdings source missing');
  const securityIds = new Set(), symbols = new Set(), usedSources = new Set([input.holdingsSource]);
  let originalWeight = 0;
  const positions = input.holdings.map(holding => {
    if (typeof holding.securityId !== 'string' || !holding.securityId || securityIds.has(holding.securityId) || typeof holding.symbol !== 'string' || !holding.symbol || symbols.has(holding.symbol) || !finite(holding.weight) || holding.weight <= 0 || holding.weight > input.stockWeight) throw Error('Unique security and original positive weight required');
    securityIds.add(holding.securityId); symbols.add(holding.symbol); originalWeight += holding.weight;
    const price = holding.price;
    if (!price || !finite(price.value) || price.value <= 0 || !day(price.asOf) || price.asOf !== root.date || price.currency !== 'USD' || price.basis !== 'portfolio_fair_value_per_share' || !instant(price.availableAt) || Date.parse(price.availableAt) > Date.parse(input.availableAt) || Date.parse(price.availableAt) < Date.parse(root.date) || !sources.has(price.source)) throw Error('Original dated fund mark required');
    usedSources.add(price.source);
    return {
      securityId: holding.securityId,
      symbol: holding.symbol,
      issuerId: null,
      originalHoldingSha256: reportedHash(holding),
      originalFundWeight: holding.weight,
      normalizedEquityWeight: holding.weight / input.stockWeight,
      fundMark: structuredClone(price),
      capitalAdmission: null,
      bookAdmission: null,
      revenueAdmission: null,
    };
  });
  if (Math.abs(originalWeight - input.stockWeight) > 1e-8) throw Error('Partial or renormalized inventory cannot replace the full stock-weight denominator');
  return {
    schema: REPORTED_CANDIDATE_SCHEMA,
    status: 'awaiting_separate_reported_method_admissions',
    code: root.code,
    date: root.date,
    financialCutoff: new Date(input.cutoff).toISOString(),
    holdingsAvailableAt: new Date(input.availableAt).toISOString(),
    pricingBasis: input.pricingBasis,
    holdingsTiming: 'retrospective_disclosure_not_available_at_financial_cutoff',
    originalStockWeight: input.stockWeight,
    legacyCheckpointSha256: root.checkpointSha256,
    legacyBasketInputSha256: reportedHash(input),
    holdingsSource: input.holdingsSource,
    sources: [...usedSources].map(id => structuredClone(sources.get(id))),
    positions,
    issuers: [],
    methodContractSha256: null,
    admissionRegistrySha256: null,
    rankEligible: false,
    publishable: false,
  };
}
