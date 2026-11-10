/** A separately named, retrospective reported-common estimate. Never a legacy
 * strict row, current ETF valuation, or historical percentile observation. */
export const REPORTED_ETF_METHOD='reported_ttm_total_market_cap_v1';
export const REPORTED_ETF_SCOPE='actual_issued_common_dated_carry_explicit_2026q2_v1';
export type ReportedRiskCoverage={known:number;unknown:number};
export type ReportedETFMetric={value:number|null;verifiedCoverage:number;verifiedCoverageExact:{numerator:string;denominator:string};positiveCoverage:number;nonpositiveCoverage:number;missingCoverage:number;risks:{capitalLag:ReportedRiskCoverage;bookScopeLag:ReportedRiskCoverage;incomePerimeterLag:ReportedRiskCoverage};rank:null;percentile:null};
export type ReportedETFReading={code:'XLK';methodVersion:typeof REPORTED_ETF_METHOD;scopeRevision:typeof REPORTED_ETF_SCOPE;economicDate:string;holdingsAsOf:string;publicAvailableAt:string;financialCutoff:string;preparedAt:string;estimated:true;retrospectiveReconstruction:true;isCurrentFundHoldings:false;isCurrentFundNAV:false;historicalRankEligible:false;mayRepresentContemporaneousTradableSignal:false;pricingBasis:'retrospective_nport_fair_value';sourceDateRanges:{capital:{first:string;last:string};book:{first:string;last:string};revenue:{first:string;last:string}};metrics:{pb:ReportedETFMetric;ps:ReportedETFMetric}};
const day=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const instant=(x:unknown):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const weight=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const decimalInteger=(x:unknown):x is string=>typeof x==='string'&&/^\d{1,80}$/.test(x);
export function validReportedETFReading(value:unknown):value is ReportedETFReading{
 try{
  const r=value as ReportedETFReading;
  if(!r||r.code!=='XLK'||r.methodVersion!==REPORTED_ETF_METHOD||r.scopeRevision!==REPORTED_ETF_SCOPE||r.economicDate!=='2026-06-30'||r.holdingsAsOf!==r.economicDate||r.publicAvailableAt!=='2026-08-28T16:30:53.000Z'||r.financialCutoff!=='2026-06-30T20:00:00.000Z'||!instant(r.preparedAt)||r.preparedAt<r.publicAvailableAt||r.estimated!==true||r.retrospectiveReconstruction!==true||r.isCurrentFundHoldings!==false||r.isCurrentFundNAV!==false||r.historicalRankEligible!==false||r.mayRepresentContemporaneousTradableSignal!==false||r.pricingBasis!=='retrospective_nport_fair_value')return false;
  for(const k of ['capital','book','revenue']as const){const range=r.sourceDateRanges?.[k];if(!range||!day(range.first)||!day(range.last)||range.first>range.last||range.last>r.economicDate)return false;}
  for(const k of ['pb','ps']as const){
   const m=r.metrics?.[k],q=m?.verifiedCoverageExact;
   if(!m||!q||!decimalInteger(q.numerator)||!decimalInteger(q.denominator)||BigInt(q.denominator)<=0n||BigInt(q.numerator)>BigInt(q.denominator)||!weight(m.verifiedCoverage)||!weight(m.positiveCoverage)||!weight(m.nonpositiveCoverage)||!weight(m.missingCoverage)||Math.abs(m.positiveCoverage+m.nonpositiveCoverage-m.verifiedCoverage)>1e-12||Math.abs(m.verifiedCoverage+m.missingCoverage-1)>1e-12||Math.abs(Number(q.numerator)/Number(q.denominator)-m.verifiedCoverage)>1e-12||m.rank!==null||m.percentile!==null)return false;
   const gate=BigInt(q.numerator)*100n>=BigInt(q.denominator)*98n;
   if(m.value!==null&&(!Number.isFinite(m.value)||m.value<=0||!gate||m.positiveCoverage<=0))return false;
   for(const name of ['capitalLag','bookScopeLag','incomePerimeterLag']as const){const risk=m.risks?.[name];if(!risk||!weight(risk.known)||!weight(risk.unknown)||risk.known+risk.unknown>1+1e-12)return false;}
  }
  // A released reading cannot be an empty incomplete point. Individual metrics
  // may remain null, including known nonpositive or independently missing data.
  return r.metrics.pb.value!==null||r.metrics.ps.value!==null;
 }catch{return false;}
}
export function reportedETFForView(value:unknown,view:{mode:'latest'|'historical';date:string},now=Date.now()):ReportedETFReading|null{
 if(!view||!['latest','historical'].includes(view.mode)||!day(view.date)||!Number.isFinite(now)||!validReportedETFReading(value)||Date.parse(value.preparedAt)>now||Date.parse(value.publicAvailableAt)>now)return null;
 if(view.mode==='historical')return value.economicDate===view.date?value:null;
 const today=new Date(now).toISOString().slice(0,10);
 return value.economicDate<=view.date&&view.date<=today?value:null;
}
