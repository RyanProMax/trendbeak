import quarterlySessions from '../data/us-etf-quarterly-sessions.json' with { type: 'json' };
// Pure, bounded calculation. No fetches, inferred filings, or backfilled memberships.
export const METHOD = 'common-equity-harmonic-v1', MIN_COVERAGE = .98;
export const SECTORS = { XLK: '信息技术', XLF: '金融', XLV: '医疗保健', XLY: '可选消费', XLP: '必需消费', XLC: '通信服务', XLI: '工业', XLE: '能源', XLB: '原材料', XLU: '公用事业', XLRE: '房地产' };
const REVIEWED_SPLITS = {
  'XLB/DD': { baseValue: 405058202, baseAsOf: '2026-05-22', effectiveDate: '2026-06-24', numerator: 1, denominator: 3, availableAt: '2026-06-24T20:39:22Z' },
  'XLK/KLAC': { baseValue: 130627521, baseAsOf: '2026-04-27', effectiveDate: '2026-06-11', numerator: 10, denominator: 1, availableAt: '2026-06-12T20:05:07Z' },
  'XLY/CVNA': { baseValue: 143257677, baseAsOf: '2026-04-27', effectiveDate: '2026-05-07', numerator: 5, denominator: 1, availableAt: '2026-05-08T20:09:50Z' },
};
const finite = n => typeof n === 'number' && Number.isFinite(n);
const positive = n => finite(n) && n > 0;
const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const instant = s => typeof s === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
const eastern = s => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(s));
/** Equity basis is explicit: parent excludes NCI already, common also excludes preferred. */
export function commonEquity(fact) {
  if (!fact || !finite(fact.value) || !['common', 'parent', 'consolidated'].includes(fact.basis)) throw Error('Invalid equity basis');
  if (fact.basis !== 'consolidated' && fact.noncontrollingInterest !== undefined) throw Error('NCI would be deducted twice');
  if (fact.basis === 'common' && fact.preferredEquity !== undefined) throw Error('Preferred equity would be deducted twice');
  if (fact.basis === 'consolidated' && !finite(fact.noncontrollingInterest)) throw Error('Consolidated equity needs explicit NCI');
  if (fact.basis !== 'common' && (!finite(fact.preferredEquity) || fact.preferredEquity < 0)) throw Error('Parent equity needs explicit preferred equity');
  return fact.value - (fact.noncontrollingInterest ?? 0) - (fact.preferredEquity ?? 0);
}
export function calculateETF(input, { researchOnly = false } = {}) {
  if (!input || !Object.hasOwn(SECTORS, input.code) || !date(input.date) || !instant(input.cutoff) || input.holdingsAsOf !== input.date || !Array.isArray(input.holdings) || !input.holdings.length || input.holdings.length > 600) throw Error('Invalid ETF identity, date or holdings');
  const parts = Object.fromEntries(eastern(input.cutoff).map(p => [p.type, p.value]));
  const pricingBasis = input.pricingBasis ?? 'unadjusted_close';
  if (!['unadjusted_close', 'portfolio_fair_value_per_share'].includes(pricingBasis) && !(researchOnly && pricingBasis === 'reported_snapshot_price')) throw Error('Unrecognized pricing basis');
  if (pricingBasis === 'portfolio_fair_value_per_share' && !instant(input.availableAt)) throw Error('Quarterly publication time is required');
  const availableAt = input.availableAt ?? input.cutoff;
  if (!instant(availableAt) || Date.parse(availableAt) < Date.parse(input.cutoff) || Date.parse(availableAt) < Date.parse(input.date)) throw Error('Invalid snapshot publication time');
  if (pricingBasis === 'portfolio_fair_value_per_share' && !['03-31', '06-30', '09-30', '12-31'].includes(input.date.slice(5))) throw Error('Portfolio marks require an actual quarter end');
  const release = Object.fromEntries(eastern(availableAt).map(p => [p.type, p.value]));
  let availableDate = `${release.year}-${release.month}-${release.day}`;
  if (`${release.hour}:${release.minute}:${release.second}` > '16:00:00') availableDate = new Date(Date.parse(availableDate) + 86400000).toISOString().slice(0, 10);
  const financialDate = pricingBasis === 'portfolio_fair_value_per_share' ? quarterlySessions.exceptions[input.date] ?? input.date : input.date;
  const weekendQuarter = [0, 6].includes(new Date(input.date + 'T12:00:00Z').getUTCDay());
  if (pricingBasis === 'portfolio_fair_value_per_share' && (weekendQuarter && !quarterlySessions.exceptions[input.date] || (input.latestPriceMarketSession ?? input.date) !== financialDate)) throw Error('Explicit verified quarter-end financial session required');
  if (`${parts.year}-${parts.month}-${parts.day}` !== financialDate || `${parts.hour}:${parts.minute}:${parts.second}` !== '16:00:00') throw Error('Cutoff must be the verified financial session at 16:00 New York');
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 2400) throw Error('Source references required');
  const sources = new Map();
  const stockWeight = input.stockWeight ?? 1;
  if (!positive(stockWeight) || stockWeight > 1.000001) throw Error('Invalid original fund stock weight');
  for (const source of input.sources) {
    if (!source || typeof source.id !== 'string' || !source.id || source.id.length > 100 || sources.has(source.id) || typeof source.url !== 'string' || source.url.length > 2048 || !/^https:\/\//.test(source.url)) throw Error('Invalid source reference');
    sources.set(source.id, source);
  }
  if (!sources.has(input.holdingsSource)) throw Error('Holdings provenance required');
  const fact = (f, shares = false, mark = false, equivalent = false) => {
    if (!f || !finite(f.value) || !date(f.asOf) || f.asOf > input.date || !instant(f.availableAt) || Date.parse(f.availableAt) > Date.parse(mark ? availableAt : input.cutoff) || Date.parse(f.availableAt) < Date.parse(f.asOf) || !sources.has(f.source) || (shares ? f.unit !== 'shares' && !(equivalent && f.unit === 'common_equivalent_shares') : f.currency !== 'USD')) throw Error('Invalid, future or untraceable financial fact');
  };
  const totals = { pb: { weight: 0, reciprocal: 0, count: 0, missing: [], excluded: [] }, ps: { weight: 0, reciprocal: 0, count: 0, missing: [], excluded: [] } };
  let totalWeight = 0;
  const warnings = [];
  const symbols = new Set(), issuers = new Map();
  for (const holding of input.holdings) {
    if (!holding || typeof holding.symbol !== 'string' || !/^[A-Z0-9.\-]{1,20}$/.test(holding.symbol) || symbols.has(holding.symbol) || !positive(holding.weight) || holding.weight > 1) throw Error('Invalid or duplicate holding');
    symbols.add(holding.symbol); totalWeight += holding.weight;
    // Known May 7 merger: never let an older generic collector silently restore
    // standalone Devon capital or financials to this reviewed June snapshot.
    if (input.code === 'XLE' && input.date === '2026-06-30' && holding.symbol === 'DVN' && (holding.shares && (holding.shares.asOf < '2026-05-07' || holding.shares.basis !== 'actual_common_outstanding') || holding.equity && holding.equity.basis !== 'common_pro_forma_event_bridge' || holding.revenue != null)) throw Error('Reviewed post-merger Devon inputs required for 2026-06-30');
    if (input.code === 'XLB' && input.date === '2026-06-30' && holding.symbol === 'DD' && holding.shares && holding.shares.basis !== 'estimated_split_adjusted_last_known_common_outstanding') throw Error('Reviewed split-adjusted DuPont estimate required for 2026-06-30');
    if (input.date === '2026-06-30' && (input.code === 'XLK' && holding.symbol === 'LITE' || input.code === 'XLF' && holding.symbol === 'USB') && (holding.shares != null || holding.equity != null || holding.revenue != null || holding.capitalizationComponents?.length)) throw Error('Unresolved June corporate event requires missing inputs');
    if (input.date === '2026-06-30' && input.code === 'XLV' && holding.symbol === 'BMY' && holding.equity != null) throw Error('Unresolved Bristol Myers preferred carrying amount requires missing common equity');
    if (input.date === '2026-06-30' && input.code === 'XLF' && holding.symbol === 'PNC' && holding.equity != null && commonEquity(holding.equity) !== 57749000000) throw Error('Reviewed PNC equity must exclude full preferred capital surplus');
    if (holding.corporateActionsStatus !== undefined && !['unreviewed', 'reviewed_no_unresolved_action', 'unresolved_split', 'unresolved_spinoff', 'unresolved_other'].includes(holding.corporateActionsStatus)) throw Error('Unknown corporate action status');
    if (holding.corporateActionsStatus?.startsWith('unresolved_') && (holding.shares != null || holding.equity != null || holding.revenue != null || holding.capitalizationComponents?.length)) throw Error('Unresolved corporate action requires missing affected inputs');
    if (input.date === '2026-06-30' && input.code === 'XLY' && holding.symbol === 'CVNA' && holding.capitalizationComponents && (holding.capitalizationComponents.length !== 1 || holding.capitalizationComponents[0]?.classId !== 'A' || holding.capitalizationComponents[0]?.priceClassId !== 'A' || holding.capitalizationComponents[0]?.economicUnitFactor !== 1)) throw Error('Reviewed Carvana capitalization includes economic Class A only');
    if (input.date === '2026-06-30' && input.code === 'XLY' && holding.symbol === 'TSLA' && holding.capitalizationComponents !== undefined) throw Error('Reviewed Tesla total common shares cannot be repeated across classes');
    const warn = (reason, extra = {}) => { if (!warnings.some(w => w.symbol === holding.symbol && w.reason === reason)) warnings.push({ symbol: holding.symbol, reason, ...extra }); };
    if (holding.shareClassStatus !== 'verified_all_common') warn('share_class_review_incomplete');
    const mark = (metric, kind, reason) => totals[metric][kind].push({ symbol: holding.symbol, weight: holding.weight, reason });
    const capital = (p, s, sameClass = true, equivalenceSource) => {
      const reconstructed = input.code === 'XLF' && holding.symbol === 'V' && holding.capitalizationComponents && sources.has(equivalenceSource) && s?.basis === 'event_reconstructed_common_equivalent';
      const spec = input.date === '2026-06-30' ? REVIEWED_SPLITS[input.code + '/' + holding.symbol] : undefined;
      if (spec && s && s.basis !== 'estimated_split_adjusted_last_known_common_outstanding') throw Error('Reviewed split-adjusted common share basis required');
      const splitAdjusted = !!spec && s?.basis === 'estimated_split_adjusted_last_known_common_outstanding';
      const actualSplitAdjusted = input.code === 'XLU' && input.date === '2020-12-31' && holding.symbol === 'NEE' && s?.basis === 'split_adjusted_actual_common_outstanding';
      if (actualSplitAdjusted) {
        const a=s.splitAdjustment;
        if (s.asOf !== '2020-09-30' || s.value !== 489768531 * 4 || !sources.has(s.source) || !a || a.baseValue !== 489768531 || a.baseAsOf !== s.asOf || a.effectiveDate !== '2020-10-26' || a.numerator !== 4 || a.denominator !== 1 || !sources.has(a.source) || Date.parse(s.availableAt) < Date.parse('2020-10-27T00:00:00-04:00')) throw Error('Exact reviewed NextEra 2020 split basis required');
        warn('split_adjusted_actual_common_share_basis');
      }
      if (splitAdjusted) {
        const a=s.splitAdjustment;
        if (!a || Object.entries(spec).some(([k,v]) => k !== 'availableAt' && a[k] !== v) || s.asOf !== spec.baseAsOf || Math.abs(s.value - spec.baseValue * spec.numerator / spec.denominator) > .000001 || !sources.has(s.source) || !sources.has(a.source) || Date.parse(s.availableAt) < Date.parse(spec.availableAt)) throw Error('Exact reviewed split event bridge required');
        warn('split_adjusted_common_share_estimate');
      }
      const tesla = input.code === 'XLY' && input.date === '2026-06-30' && holding.symbol === 'TSLA';
      if (tesla && s && s.basis !== 'estimated_event_adjusted_last_known_common_outstanding') throw Error('Reviewed Tesla share event bridge required');
      const eventAdjusted = tesla && s?.basis === 'estimated_event_adjusted_last_known_common_outstanding';
      if (eventAdjusted) {
        const a=s.eventAdjustment;
        if (!a || a.baseValue !== 3755723871 || a.baseAsOf !== '2026-04-16' || s.asOf !== a.baseAsOf || !Array.isArray(a.additions) || a.additions.length !== 1 || !Array.isArray(a.subtractions) || a.subtractions.length !== 1) throw Error('Exact reviewed Tesla event components required');
        for (const [event,value,day] of [[a.additions[0],286428773,'2026-06-16'],[a.subtractions[0],96000000,'2026-04-21']]) {
          if (!event || event.value !== value || event.date !== day || !instant(event.availableAt) || Date.parse(event.availableAt) < Date.parse('2026-06-17T20:55:05Z') || Date.parse(event.availableAt) > Date.parse(input.cutoff) || Date.parse(event.availableAt) > Date.parse(s.availableAt) || !sources.has(event.source)) throw Error('Invalid or unavailable Tesla event evidence');
        }
        if (s.value !== a.baseValue + a.additions[0].value - a.subtractions[0].value) throw Error('Tesla event shares must reconcile exactly once');
        warn('event_adjusted_common_share_estimate');
      }
      if (p != null) fact(p, false, pricingBasis !== 'unadjusted_close');
      if (s != null) {
        fact(s, true, false, reconstructed);
        if (reconstructed) warn('event_reconstructed_common_equivalent');
        const age = (Date.parse(input.date) - Date.parse(s.asOf)) / 86400000;
        if (age > 180) throw Error('Actual shares are older than 180 days');
        if (age > 90) warn('shares_older_than_90_days', { ageDays: age });
        if (holding.corporateActionsStatus?.startsWith('unresolved_')) throw Error('Unresolved corporate action');
        if (holding.corporateActionsCheckedThrough !== input.date) warn('corporate_action_review_incomplete');
      }
      if (p == null || s == null) return null;
      if (!positive(p.value) || p.asOf !== input.date || p.basis !== pricingBasis || !positive(s.value) || (s.basis !== 'actual_common_outstanding' && !reconstructed && !splitAdjusted && !eventAdjusted && !actualSplitAdjusted) || !s.shareBasis || !p.shareBasis || sameClass && p.shareBasis !== s.shareBasis) throw Error('Price and actual common shares must have matching split/share basis');
      const cap = p.value * s.value;
      if (!positive(cap)) throw Error('Invalid market capitalization');
      return cap;
    };
    let marketCap = null;
    if (holding.capitalizationComponents !== undefined) {
      const components = holding.capitalizationComponents;
      if (!Array.isArray(components) || !components.length || components.length > 8 || holding.capitalizationScope !== 'all_common_classes' || holding.shareClassStatus !== 'verified_all_common' || typeof holding.issuerId !== 'string' || !holding.issuerId || holding.issuerId.length > 80) throw Error('Complete reviewed issuer capitalization required');
      const classes = new Set(); let complete = true, sum = 0;
      for (const c of [...components].sort((a, b) => String(a.classId).localeCompare(String(b.classId)))) {
        if (!c || typeof c.classId !== 'string' || !c.classId || c.classId.length > 40 || classes.has(c.classId) || typeof c.priceClassId !== 'string' || !c.priceClassId) throw Error('Invalid or duplicate common class');
        classes.add(c.classId);
        const same = c.classId === c.priceClassId, factor = c.economicUnitFactor ?? 1;
        if (!positive(factor) || factor > 1000000 || same && factor !== 1 || !same && !sources.has(c.economicEquivalenceSource)) throw Error('Actual class price needs factor one; proxy needs verified economic equivalence');
        const cap = capital(c.price, c.shares, same, c.economicEquivalenceSource);
        if (cap === null) complete = false; else sum += cap * factor;
      }
      if (complete) { if (!positive(sum)) throw Error('Invalid total issuer capitalization'); marketCap = sum; }
    } else {
      marketCap = capital(holding.price, holding.shares);
      if (!['verified_all_common', 'single_common_class_assumed_from_standard_issuer_fact'].includes(holding.shareClassStatus) || holding.shares?.scope === 'class_only') marketCap = null;
    }
    // Validate present facts even when another input is missing. Never hide a bad record.
    let equity = null, revenue = null;
    if (holding.equity != null) {
      fact(holding.equity);
      const eventBridge = (input.code === 'XLI' && ['HONA', 'FDXF'].includes(holding.symbol) || input.code === 'XLE' && holding.symbol === 'DVN') && holding.equity.basis === 'common_pro_forma_event_bridge';
      if (eventBridge) warn('event_pro_forma_fundamentals');
      equity = commonEquity(eventBridge ? { ...holding.equity, basis: 'common' } : holding.equity);
    }
    if (holding.revenue != null) {
      fact(holding.revenue);
      const historicalComparable = input.code === 'XLU' && (holding.symbol === 'DTE' && input.date === '2021-12-31' || holding.symbol === 'EXC' && ['2022-03-31', '2022-06-30'].includes(input.date) || holding.symbol === 'PPL' && ['2021-06-30', '2021-09-30', '2021-12-31'].includes(input.date));
      const comparable = (input.code === 'XLC' && holding.symbol === 'CMCSA' || historicalComparable) && holding.revenue.basis === 'ttm_pro_forma_comparable';
      const carveOut = input.code === 'XLI' && ['HONA', 'FDXF'].includes(holding.symbol) && holding.revenue.basis === 'ttm_carve_out_reported';
      if (holding.revenue.basis !== 'ttm' && !comparable && !carveOut) throw Error('Revenue must use a reported or narrowly reviewed comparable / carve-out twelve-month basis');
      if (carveOut) warn('event_pro_forma_fundamentals');
      if (comparable) warn('comparable_revenue_basis');
      revenue = holding.revenue.value;
    }
    if (holding.issuerId) {
      const signature = JSON.stringify([marketCap, equity, revenue, holding.equity?.asOf, holding.revenue?.asOf]);
      if (issuers.has(holding.issuerId) && issuers.get(holding.issuerId) !== signature) throw Error('One issuer must use one shared capitalization and financial basis');
      issuers.set(holding.issuerId, signature);
    }
    // Repeated classes of one issuer share exactly one ratio. The two weighted
    // reciprocal terms are algebraically the merged issuer weight, not two companies.
    for (const [metric, denominator] of [['pb', equity], ['ps', revenue]]) {
      if (denominator !== null && denominator <= 0) { mark(metric, 'excluded', metric === 'pb' ? 'nonpositive_common_equity' : 'nonpositive_revenue'); continue; }
      if (marketCap === null || denominator === null) { mark(metric, 'missing', marketCap === null ? 'missing_market_cap' : 'missing_fundamental'); continue; }
      const ratio = marketCap / denominator;
      if (!positive(ratio)) throw Error('Invalid individual multiple');
      const t = totals[metric]; t.weight += holding.weight; t.reciprocal += holding.weight / ratio; t.count++;
    }
  }
  if (totalWeight > stockWeight + .000001 || totalWeight < .5) throw Error('Holdings weights must be original fund fractions, not percentages or partial normalized weights');
  const metrics = Object.fromEntries(Object.entries(totals).map(([metric, t]) => [metric, {
    value: (t.weight + t.excluded.reduce((n, h) => n + h.weight, 0)) / stockWeight >= MIN_COVERAGE && positive(t.reciprocal) ? t.weight / t.reciprocal : null,
    percentile: null, coverage: t.weight, verifiedCoverage: (t.weight + t.excluded.reduce((n, h) => n + h.weight, 0)) / stockWeight, count: t.count,
    missingWeight: t.missing.reduce((n, h) => n + h.weight, 0) + Math.max(0, stockWeight - totalWeight),
    excludedWeight: t.excluded.reduce((n, h) => n + h.weight, 0),
  }]));
  let sourceComparison;
  if (input.sourceComparison !== undefined) {
    const c = input.sourceComparison;
    if (!c || c.date !== input.date || !sources.has(c.source) || !instant(c.observedAt) || Date.parse(c.observedAt) < Date.parse(input.cutoff) || c.sourceConflict !== undefined && typeof c.sourceConflict !== 'boolean') throw Error('Invalid same-date source comparison');
    const alternateSourceValues = {}, deltaPercent = {};
    for (const metric of ['pb', 'ps']) {
      const value = c.alternateSourceValues?.[metric], coverage = c.alternateCoverage?.[metric];
      if (value !== null && !positive(value) || !finite(coverage) || coverage < 0 || coverage > 1.000001) throw Error('Invalid alternate source value or coverage');
      alternateSourceValues[metric] = coverage >= MIN_COVERAGE ? value : null;
      deltaPercent[metric] = alternateSourceValues[metric] !== null && metrics[metric].value !== null ? (alternateSourceValues[metric] / metrics[metric].value - 1) * 100 : null;
    }
    sourceComparison = { sourceConflict: c.sourceConflict ?? true, observedAt: c.observedAt, alternateSourceValues, deltaPercent };
  }
  return {
    reading: { code: input.code, name: SECTORS[input.code], date: input.date, asOf: input.cutoff, availableAt, availableDate, pricingBasis, ...(input.latestPriceMarketSession !== undefined ? { latestPriceMarketSession: financialDate } : {}), qualityFlags: { sharesOver90Days: warnings.filter(w => w.reason === 'shares_older_than_90_days').length, corporateActionsUnreviewed: warnings.filter(w => w.reason === 'corporate_action_review_incomplete').length, shareClassesUnreviewed: warnings.filter(w => w.reason === 'share_class_review_incomplete').length, comparableRevenue: warnings.filter(w => w.reason === 'comparable_revenue_basis').length, eventReconstructedShares: warnings.filter(w => ['event_reconstructed_common_equivalent', 'split_adjusted_common_share_estimate', 'event_adjusted_common_share_estimate', 'split_adjusted_actual_common_share_basis'].includes(w.reason)).length, eventProForma: warnings.filter(w => w.reason === 'event_pro_forma_fundamentals').length }, methodVersion: METHOD, scope: 'covered_holdings', ...metrics, ...(sourceComparison ? { sourceComparison } : {}) },
    quality: { warnings, stockWeight, shareAgeDays: Object.fromEntries(input.holdings.filter(h => h.shares).map(h => [h.symbol, (Date.parse(input.date) - Date.parse(h.shares.asOf)) / 86400000])), holdingsWeight: totalWeight, minimumCoverage: MIN_COVERAGE, missing: { pb: totals.pb.missing, ps: totals.ps.missing }, excluded: { pb: totals.pb.excluded, ps: totals.ps.excluded } },
    sources: input.sources,
  };
}
