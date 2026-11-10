import {validXLPMethodReading, XLP_CLASS_METHOD} from './us-etf-xlp-method';
import preferredApprovals from '../../data/us-etf-preferred-estimate-approvals.json';
import quarterlySessions from '../../data/us-etf-quarterly-sessions.json';
/** Only dated, prepared observations are public. Raw inputs stay in the writer. */
export const US_SECTOR_ETFS = [
  ['XLK', '信息技术'], ['XLF', '金融'], ['XLV', '医疗保健'], ['XLY', '可选消费'],
  ['XLP', '必需消费'], ['XLC', '通信服务'], ['XLI', '工业'], ['XLE', '能源'],
  ['XLB', '原材料'], ['XLU', '公用事业'], ['XLRE', '房地产'],
] as const;
export const ETF_METHOD_VERSION = 'common-equity-harmonic-v1';
export const ETF_OPERATING_METHOD = 'common-equity-harmonic-operating-revenue-v2';
export const ETF_OPERATING_REVENUE = 'operating_revenue_v2';
export const ETF_MIN_COVERAGE = 0.98;
export type ETFCode = typeof US_SECTOR_ETFS[number][0];
export interface QuarterlyETFHistory {
  valuationMethodVersion?: typeof ETF_OPERATING_METHOD; revenueDefinition?: typeof ETF_OPERATING_REVENUE;
  frequency: 'quarterly'; scope: 'reported_recast_and_reviewed_scope_estimates'; currentExcluded: true;
  method: 'midrank-prior-quarter-observations-v1'; sourceSeriesId: 'sec_nport_quarterly'; maximumWindowYears: 10;
  evaluatedAt: string; sampleCount: number; windowStart: string | null; windowEnd: string | null; spanQuarters: number;
  minimumSamples: 20; minimumSpanQuarters: 20; status: 'available' | 'current_missing' | 'insufficient_samples' | 'insufficient_span';
  missingQuarterCount: number; withoutOfficialProForma: { sampleCount: number; percentile: number | null };
}
export interface PreferredPBEstimate {
  methodId: 'common-equity-harmonic-preferred-value-estimate-v1' | 'common-equity-harmonic-annual-event-revenue-estimate-v1'; basis: 'common_estimate' | 'latest_complete_annual_event_proforma_revenue_fallback'; value: number; percentile: null; historyStatus: 'no_method_matched_history'; coverage: number; strictKnownCoverage: number; estimatedCoverage: number; preferredValueBasis?: 'par' | 'redemption'; annualRevenueEnd?: string; proofHash: string;
}
export interface ETFMetric {
  estimate?: PreferredPBEstimate;
  value: number | null;
  percentile: number | null;
  quarterlyHistory?: QuarterlyETFHistory;
  coverage: number;
  verifiedCoverage: number;
  count: number;
  missingWeight: number;
  excludedWeight: number;
}
export interface ETFValuation {
  code: ETFCode;
  name: string;
  date: string;
  asOf: string;
  availableAt: string;
  availableDate: string;
  latestPriceMarketSession?: string;
  pricingBasis: 'unadjusted_close' | 'portfolio_fair_value_per_share';
  qualityFlags?: { sharesOver90Days: number; corporateActionsUnreviewed: number; shareClassesUnreviewed: number; comparableRevenue: number; eventReconstructedShares: number; eventProForma: number };
  methodVersion: typeof ETF_METHOD_VERSION | typeof ETF_OPERATING_METHOD | typeof XLP_CLASS_METHOD;
  revenueDefinition?: typeof ETF_OPERATING_REVENUE;
  scope: 'covered_holdings';
  estimated?: true; capitalizationBasis?: string; comparisonKey?: string; rankEligible?: false;
  sourceComparison?: { sourceConflict: boolean; observedAt: string; alternateSourceValues: { pb: number | null; ps: number | null }; deltaPercent: { pb: number | null; ps: number | null } };
  pb: ETFMetric;
  ps: ETFMetric;
}
export function validETFDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
const weight = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1.000001;
/** June XLK counted parent-only ACN capital as all-common. Retain original
 * audit metadata but suppress values and derivatives until separately repaired. */
export function holdXLKCommonCapital(row: ETFValuation): ETFValuation {
  if (row.code !== 'XLK' || row.date !== '2026-06-30' || row.methodVersion !== ETF_METHOD_VERSION) return row;
  const result = { ...row, pb: { ...row.pb, value: null, percentile: null }, ps: { ...row.ps, value: null, percentile: null } };
  for (const metric of [result.pb, result.ps]) { delete metric.estimate; delete metric.quarterlyHistory; }
  delete result.sourceComparison;
  return result;
}
/** June XLC paired parent-only CHTR/TKO capital with consolidated revenue.
 * Parent common-book PB is independent; suppress only PS and its derivatives. */
export function holdXLCParentCapitalPS(row: ETFValuation): ETFValuation {
  if (row.code !== 'XLC' || row.date !== '2026-06-30' || row.methodVersion !== ETF_METHOD_VERSION) return row;
  const ps = { ...row.ps, value: null, percentile: null };
  delete ps.estimate; delete ps.quarterlyHistory;
  return { ...row, ps, ...(row.sourceComparison ? { sourceComparison: {
    ...row.sourceComparison,
    alternateSourceValues: { ...row.sourceComparison.alternateSourceValues, ps: null },
    deltaPercent: { ...row.sourceComparison.deltaPercent, ps: null }
  } } : {}) };
}
const instant = (v: unknown): v is string => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const eastern = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit' });
export function validETFValuation(row: any, selectedDate: string): row is ETFValuation {
  if(row?.methodVersion===XLP_CLASS_METHOD)return validXLPMethodReading(row,selectedDate);
  if (!row || !validETFDate(selectedDate) || !validETFDate(row.date) || row.date > selectedDate || !US_SECTOR_ETFS.some(([code, name]) => code === row.code && name === row.name) || !(row.methodVersion === ETF_METHOD_VERSION && row.revenueDefinition === undefined || row.code === 'XLE' && row.methodVersion === ETF_OPERATING_METHOD && row.revenueDefinition === ETF_OPERATING_REVENUE) || row.scope !== 'covered_holdings' || !['unadjusted_close', 'portfolio_fair_value_per_share'].includes(row.pricingBasis) || !instant(row.asOf) || !instant(row.availableAt) || Date.parse(row.availableAt) < Date.parse(row.asOf) || Date.parse(row.availableAt) < Date.parse(row.date)) return false;
  const at = Object.fromEntries(eastern.formatToParts(new Date(row.asOf)).map(p => [p.type, p.value]));
  const exceptions: Record<string, string> = quarterlySessions.exceptions;
  const financialDate = row.pricingBasis === 'portfolio_fair_value_per_share' ? exceptions[row.date] ?? row.date : row.date;
  if (row.pricingBasis === 'portfolio_fair_value_per_share' && ([0, 6].includes(new Date(row.date + 'T12:00:00Z').getUTCDay()) && !exceptions[row.date] || (row.latestPriceMarketSession ?? row.date) !== financialDate)) return false;
  if (`${at.year}-${at.month}-${at.day}` !== financialDate || `${at.hour}:${at.minute}:${at.second}` !== '16:00:00') return false;
  const release = Object.fromEntries(eastern.formatToParts(new Date(row.availableAt)).map(p => [p.type, p.value]));
  let availableDate = `${release.year}-${release.month}-${release.day}`;
  if (`${release.hour}:${release.minute}:${release.second}` > '16:00:00') availableDate = new Date(Date.parse(availableDate) + 86400000).toISOString().slice(0, 10);
  if (row.availableDate !== availableDate || availableDate > selectedDate || row.pricingBasis === 'unadjusted_close' && row.date !== selectedDate || row.pricingBasis === 'portfolio_fair_value_per_share' && !['03-31', '06-30', '09-30', '12-31'].includes(row.date.slice(5))) return false;
  if (!row.qualityFlags || Object.keys(row.qualityFlags).some(k => !['sharesOver90Days', 'corporateActionsUnreviewed', 'shareClassesUnreviewed', 'comparableRevenue', 'eventReconstructedShares', 'eventProForma'].includes(k)) || ![row.qualityFlags.sharesOver90Days, row.qualityFlags.corporateActionsUnreviewed, row.qualityFlags.shareClassesUnreviewed, row.qualityFlags.comparableRevenue, row.qualityFlags.eventReconstructedShares, row.qualityFlags.eventProForma].every(v => Number.isInteger(v) && v >= 0 && v <= 600)) return false;
  if (row.qualityFlags.comparableRevenue > (row.code === 'XLU' && row.date === '2021-12-31' ? 2 : 1) || row.qualityFlags.comparableRevenue > 0 && !(row.code === 'XLC' || row.code === 'XLE' && row.methodVersion === ETF_OPERATING_METHOD && row.date === '2021-03-31' || row.code === 'XLU' && ['2021-06-30', '2021-09-30', '2021-12-31', '2022-03-31', '2022-06-30'].includes(row.date))) return false;
  if (row.qualityFlags.eventReconstructedShares > (row.code === 'XLY' ? 2 : ['XLF', 'XLB', 'XLK'].includes(row.code) || row.code === 'XLU' && row.date === '2020-12-31' || row.code === 'XLE' && (row.date === '2019-09-30' || row.methodVersion === ETF_OPERATING_METHOD && row.date === '2025-12-31') ? 1 : 0)) return false;
  if (row.qualityFlags.eventProForma > (row.code === 'XLI' ? 2 : row.code === 'XLE' ? 1 : 0)) return false;
  if (row.sourceComparison) {
    const c=row.sourceComparison;
    if (typeof c.sourceConflict !== 'boolean' || !instant(c.observedAt) || Date.parse(c.observedAt)<Date.parse(row.asOf)) return false;
    for (const m of ['pb','ps'] as const) {
      const a=c.alternateSourceValues?.[m],d=c.deltaPercent?.[m];
      if (a!==null && (typeof a!=='number'||!Number.isFinite(a)||a<=0)) return false;
      const expected=a!==null&&row[m]?.value!=null?(a/row[m].value-1)*100:null;
      if (expected===null ? d!==null : typeof d!=='number'||!Number.isFinite(d)||Math.abs(d-expected)>1e-8) return false;
    }
  }
  if (row.ps?.estimate !== undefined) {
    const e=row.ps.estimate,approval=preferredApprovals.find(a=>a.code===row.code&&a.date===row.date);
    if (!approval || row.code!=='XLE' || row.methodVersion!==ETF_OPERATING_METHOD || row.pricingBasis!=='portfolio_fair_value_per_share' || row.ps.value!==null || row.ps.percentile!==null || e.methodId!=='common-equity-harmonic-annual-event-revenue-estimate-v1' || e.basis!=='latest_complete_annual_event_proforma_revenue_fallback' || e.proofHash!==approval.proofHash || e.percentile!==null || e.historyStatus!=='no_method_matched_history' || typeof e.value!=='number' || !Number.isFinite(e.value) || e.value<=0 || !weight(e.coverage) || e.coverage<ETF_MIN_COVERAGE || !weight(e.strictKnownCoverage) || Math.abs(e.strictKnownCoverage-row.ps.verifiedCoverage)>1e-12 || !weight(e.estimatedCoverage) || Math.abs(e.coverage-e.strictKnownCoverage-e.estimatedCoverage)>1e-12 || e.annualRevenueEnd!=='2025-12-31' || Object.keys(e).some(k=>!['methodId','basis','value','percentile','historyStatus','coverage','strictKnownCoverage','estimatedCoverage','annualRevenueEnd','proofHash'].includes(k))) return false;
  }
  if (row.pb?.estimate !== undefined) {
    const e=row.pb.estimate,approval=preferredApprovals.find(a=>a.code===row.code&&a.date===row.date);
    if (!approval || row.methodVersion!==ETF_METHOD_VERSION || row.pricingBasis!=='portfolio_fair_value_per_share' || row.pb.value!==null || row.pb.percentile!==null || e.methodId!=='common-equity-harmonic-preferred-value-estimate-v1' || e.basis!=='common_estimate' || e.proofHash!==approval.proofHash || e.percentile!==null || e.historyStatus!=='no_method_matched_history' || typeof e.value!=='number' || !Number.isFinite(e.value) || e.value<=0 || !weight(e.coverage) || e.coverage<ETF_MIN_COVERAGE || !weight(e.strictKnownCoverage) || Math.abs(e.strictKnownCoverage-row.pb.verifiedCoverage)>1e-12 || !weight(e.estimatedCoverage) || Math.abs(e.coverage-e.strictKnownCoverage-e.estimatedCoverage)>1e-12 || e.preferredValueBasis!==(row.code==='XLB'?'par':'redemption') || Object.keys(e).some(k=>!['methodId','basis','value','percentile','historyStatus','coverage','strictKnownCoverage','estimatedCoverage','preferredValueBasis','proofHash'].includes(k))) return false;
  }
  return [row.pb, row.ps].every(m => m && validHistory(m, row) && weight(m.coverage) && weight(m.verifiedCoverage) && weight(m.missingWeight) && weight(m.excludedWeight) && m.coverage + m.missingWeight + m.excludedWeight <= 1.000001 && Number.isInteger(m.count) && m.count >= 0 && m.count <= 600 && (m.value === null || typeof m.value === 'number' && Number.isFinite(m.value) && m.value > 0 && m.verifiedCoverage >= ETF_MIN_COVERAGE && m.count > 0));
}

function validHistory(metric: ETFMetric, row: ETFValuation): boolean {
  const h = metric.quarterlyHistory;
  if (!h) return metric.percentile === null;
  if (row.methodVersion === ETF_OPERATING_METHOD ? h.valuationMethodVersion !== ETF_OPERATING_METHOD || h.revenueDefinition !== ETF_OPERATING_REVENUE : h.valuationMethodVersion !== undefined || h.revenueDefinition !== undefined) return false;
  const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 40;
  const rank = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const quarter = (v: unknown): v is string => validETFDate(v) && /^\d{4}-(03-31|06-30|09-30|12-31)$/.test(v);
  const index = (v: string) => Number(v.slice(0,4))*4 + Number(v.slice(5,7))/3 - 1;
  if (row.pricingBasis !== 'portfolio_fair_value_per_share' || h.frequency !== 'quarterly' || h.scope !== 'reported_recast_and_reviewed_scope_estimates' || h.currentExcluded !== true || h.method !== 'midrank-prior-quarter-observations-v1' || h.sourceSeriesId !== 'sec_nport_quarterly' || h.maximumWindowYears !== 10 || h.evaluatedAt !== row.asOf || h.minimumSamples !== 20 || h.minimumSpanQuarters !== 20 || !count(h.sampleCount) || !count(h.missingQuarterCount) || h.sampleCount + h.missingQuarterCount > 40 || !count(h.spanQuarters)) return false;
  if (h.sampleCount === 0 ? h.windowStart !== null || h.windowEnd !== null || h.spanQuarters !== 0 : !quarter(h.windowStart) || !quarter(h.windowEnd) || h.windowStart > h.windowEnd || h.windowEnd >= row.date || index(row.date)-index(h.windowStart)>40 || index(h.windowEnd)-index(h.windowStart)!==h.spanQuarters) return false;
  const status = metric.value === null ? 'current_missing' : h.sampleCount < 20 ? 'insufficient_samples' : h.spanQuarters < 20 ? 'insufficient_span' : 'available';
  if (h.status !== status || (status === 'available' ? !rank(metric.percentile) : metric.percentile !== null)) return false;
  const s = h.withoutOfficialProForma;
  return !!s && count(s.sampleCount) && s.sampleCount <= h.sampleCount && (s.percentile === null || status === 'available' && s.sampleCount >= 20 && rank(s.percentile));
}
