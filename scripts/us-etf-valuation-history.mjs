import quarterlySessions from '../data/us-etf-quarterly-sessions.json' with { type: 'json' };
// Offline preparation only. No reader, importer or UI enables ranks until the
// comparable series and a single minimum-sample/span policy have been reviewed.
import { OPERATING_METHOD, OPERATING_REVENUE, valuationMethod, MIN_COVERAGE, SECTORS } from './us-etf-valuations.mjs';
export const QUARTERLY_RANK_METHOD = 'midrank-prior-quarter-observations-v1';
export const QUARTERLY_WINDOW_YEARS = 10;
export const DEFAULT_QUARTERLY_POLICY = Object.freeze({ minimumSamples: 20, minimumSpanQuarters: 20 });
const quarterIndex = date => {
  if (typeof date !== 'string' || !/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(date)) throw Error('A real quarter-end date is required');
  return Number(date.slice(0,4))*4 + Number(date.slice(5,7))/3 - 1;
};
const instant = value => typeof value==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const eastern = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
/** Observations must bind each prepared reading to its reviewed source series.
 * A null policy computes truthful sample metadata but never publishes a rank.
 * minSpanQuarters is the distance between first and last valid prior samples.
 */
export function prepareQuarterlyETFRanks(observations, policy = DEFAULT_QUARTERLY_POLICY) {
  if (!Array.isArray(observations) || !observations.length || observations.length>366) throw Error('One to 366 genuine observations required');
  if (policy!==null && (!policy || Object.keys(policy).some(k=>!['minimumSamples','minimumSpanQuarters'].includes(k)) || !Number.isInteger(policy.minimumSamples) || policy.minimumSamples<2 || policy.minimumSamples>40 || !Number.isInteger(policy.minimumSpanQuarters) || policy.minimumSpanQuarters<1 || policy.minimumSpanQuarters>39)) throw Error('An explicit sample and time-span policy is required');
  const dates=new Set(),first=observations[0],rows=[];
  if (typeof first?.sourceSeriesId!=='string' || !/^[a-z0-9_\-]{1,80}$/.test(first.sourceSeriesId)) throw Error('Reviewed source series identity required');
  for (const {reading:r,sourceSeriesId} of observations) {
    if (!r || sourceSeriesId!==first.sourceSeriesId || r.code!==first.reading?.code || !Object.hasOwn(SECTORS,r.code) || valuationMethod(r)!==valuationMethod(first.reading) || r.pricingBasis!=='portfolio_fair_value_per_share' || r.scope!=='covered_holdings') throw Error('Historical source, fund, method and pricing basis must be identical');
    const quarter=quarterIndex(r.date);
    if (dates.has(r.date)) throw Error('Duplicate historical quarter'); dates.add(r.date);
    if (!instant(r.asOf) || !instant(r.availableAt) || Date.parse(r.availableAt)<Date.parse(r.asOf) || Date.parse(r.availableAt)<Date.parse(r.date)) throw Error('Real financial cutoff and disclosure timestamps required');
    const time=Object.fromEntries(eastern.formatToParts(new Date(r.asOf)).map(p=>[p.type,p.value]));
    const financialDate=quarterlySessions.exceptions[r.date]??r.date;
    if ((r.latestPriceMarketSession??r.date)!==financialDate || [0,6].includes(new Date(r.date+'T12:00:00Z').getUTCDay())&&!quarterlySessions.exceptions[r.date] || `${time.year}-${time.month}-${time.day}`!==financialDate || `${time.hour}:${time.minute}:${time.second}`!=='16:00:00') throw Error('Historical cutoff must be the verified financial session at 16:00 New York');
    for (const m of ['pb','ps']) {
      const metric=r[m];
      if (!metric || !(metric.value===null || typeof metric.value==='number' && Number.isFinite(metric.value) && metric.value>0 && typeof metric.verifiedCoverage==='number' && Number.isFinite(metric.verifiedCoverage) && metric.verifiedCoverage>=MIN_COVERAGE && metric.verifiedCoverage<=1.000001)) throw Error('Only admitted finite valuation observations are allowed');
    }
    rows.push({reading:r,quarter});
  }
  rows.sort((a,b)=>a.quarter-b.quarter);
  return rows.map(({reading:r,quarter})=>{
    const preceding=rows.filter(p=>p.quarter<quarter && p.quarter>=quarter-4*QUARTERLY_WINDOW_YEARS && Date.parse(p.reading.availableAt)<=Date.parse(r.asOf));
    return {date:r.date,...Object.fromEntries(['pb','ps'].map(metric=>{
      const sample=preceding.filter(p=>p.reading[metric].value!==null),n=sample.length;
      const span=n>1?sample.at(-1).quarter-sample[0].quarter:0;
      const status=r[metric].value===null?'current_missing':policy===null?'policy_disabled':n<policy.minimumSamples?'insufficient_samples':span<policy.minimumSpanQuarters?'insufficient_span':'available';
      const below=sample.filter(p=>p.reading[metric].value<r[metric].value).length;
      const equal=sample.filter(p=>p.reading[metric].value===r[metric].value).length;
      const without=sample.filter(p=>p.reading.qualityFlags?.comparableRevenue===0),withoutN=without.length;
      const withoutSpan=withoutN>1?without.at(-1).quarter-without[0].quarter:0;
      const withoutRank=r[metric].value!==null&&policy!==null&&withoutN>=policy.minimumSamples&&withoutSpan>=policy.minimumSpanQuarters?(without.filter(p=>p.reading[metric].value<r[metric].value).length+without.filter(p=>p.reading[metric].value===r[metric].value).length/2)/withoutN*100:null;
      return [metric,{percentile:status==='available'?(below+equal/2)/n*100:null,history:{
        ...(r.methodVersion===OPERATING_METHOD?{valuationMethodVersion:OPERATING_METHOD,revenueDefinition:OPERATING_REVENUE}:{}),frequency:'quarterly',scope:'reported_recast_and_reviewed_scope_estimates',currentExcluded:true,missingQuarterCount:preceding.length-n,withoutOfficialProForma:{sampleCount:withoutN,percentile:withoutRank},method:QUARTERLY_RANK_METHOD,sourceSeriesId:first.sourceSeriesId,
        maximumWindowYears:QUARTERLY_WINDOW_YEARS,evaluatedAt:r.asOf,
        sampleCount:n,windowStart:sample[0]?.reading.date??null,windowEnd:sample.at(-1)?.reading.date??null,spanQuarters:span,
        minimumSamples:policy?.minimumSamples??null,minimumSpanQuarters:policy?.minimumSpanQuarters??null,status,
      }}];
    }))};
  });
}

/** Strip only writer-produced statistics before exact source-reading comparisons. */
export function baseETFReading(reading) {
 const result={...reading};for(const metric of['pb','ps']){const{quarterlyHistory,...plain}=result[metric];result[metric]={...plain,percentile:null};}return result;
}
/** Bounded controlled-writer preparation, shared by appends and reviewed repairs. */
export function withQuarterlyETFHistory(history) {
 const result={...history},ranks=prepareQuarterlyETFRanks(Object.values(history).map(reading=>({reading:baseETFReading(reading),sourceSeriesId:'sec_nport_quarterly'})));
 for(const rank of ranks)for(const metric of['pb','ps'])result[rank.date]={...result[rank.date],[metric]:{...result[rank.date][metric],percentile:rank[metric].percentile,quarterlyHistory:rank[metric].history}};
 return result;
}
