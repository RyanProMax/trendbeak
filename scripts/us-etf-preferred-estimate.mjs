import {createHash} from 'node:crypto';
import approvals from '../data/us-etf-preferred-estimate-approvals.json' with {type:'json'};
export const ANNUAL_ESTIMATE_METHOD='common-equity-harmonic-annual-event-revenue-estimate-v1';
export const PREFERRED_ESTIMATE_METHOD='common-equity-harmonic-preferred-value-estimate-v1';
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
export const canonicalInputHash=x=>createHash('sha256').update(JSON.stringify(sorted(x))).digest('hex');
/** Exact reviewed PB sibling only. The strict result and all PS bytes stay intact. */
export function applyPreferredEstimate(input,result,totals){
 if(input.metricOverlays===undefined)return result;
 if(input.metricOverlays?.[0]?.schema==='metric_annual_revenue_estimate_overlay_v1')return applyAnnualEstimate(input,result,totals);
 const list=input.metricOverlays;
 if(!Array.isArray(list)||list.length!==1)throw Error('One explicitly approved preferred PB overlay required');
 const o=list[0],approval=approvals.find(a=>a.code===input.code&&a.date===input.date);
 const {metricOverlays,...base}=input;
 if(!approval||canonicalInputHash(o)!==approval.overlaySHA256||canonicalInputHash(base)!==approval.baselineSHA256)throw Error('Preferred estimate proof or strict baseline differs from exact approval');
 if(o.metric!=='pb'||o.valuationDate!==input.date||o.availableAt!==result.reading.availableAt||o.estimatedPB.rank!==null||o.estimatedPB.percentile!==null||result.reading.pb.value!==null||input.methodVersion!==undefined||result.reading.methodVersion!=='common-equity-harmonic-v1')throw Error('Preferred overlay cannot change method, date, rank or strict available PB');
 const e=o.estimatedPB,a=e.adjustments[0],h=input.holdings.find(h=>h.symbol===a.symbol&&h.securityId===a.securityId);
 if(!h||h.equity!==null||h.capitalizationComponents||h.price.value*h.shares.value!==Number(a.issuerCommonMarketCapUSD)||h.weight!==Number(a.fundPortfolioWeight)||Date.parse(a.financialAvailableAt)>Date.parse(input.cutoff))throw Error('Preferred estimate target, capital or financial time mismatch');
 const common=Number(a.reportedParentEquityUSD)-Number(a.preferredDeductionUSD);
 if(common!==Number(a.estimatedCommonBookUSD)||common<=0)throw Error('Preferred estimate deduction does not reconcile');
 const weight=totals.pb.weight+h.weight,reciprocal=totals.pb.reciprocal+h.weight*common/Number(a.issuerCommonMarketCapUSD),coverage=(weight+totals.pb.excluded.reduce((n,h)=>n+h.weight,0))/(input.stockWeight??1),value=weight/reciprocal;
 if(!Number.isFinite(value)||value<=0||coverage<.98||Math.abs(value-Number(e.value))>1e-10||Math.abs(coverage-Number(e.dataCoverageWithEstimate))>1e-12)throw Error('Preferred estimate aggregate differs from reviewed arithmetic');
 return {...result,reading:{...result.reading,pb:{...result.reading.pb,estimate:{methodId:PREFERRED_ESTIMATE_METHOD,basis:'common_estimate',value,percentile:null,historyStatus:'no_method_matched_history',coverage,strictKnownCoverage:result.reading.pb.verifiedCoverage,estimatedCoverage:Number(e.estimatedCoverage),preferredValueBasis:a.preferredValueBasis,proofHash:approval.proofHash}}}};
}

function applyAnnualEstimate(input,result,totals){
 const {metricOverlays,...base}=input,o=metricOverlays?.[0],approval=approvals.find(a=>a.code===input.code&&a.date===input.date);
 if(metricOverlays.length!==1||!approval||canonicalInputHash(o)!==approval.overlaySHA256||canonicalInputHash(base)!==approval.baselineSHA256)throw Error('Annual revenue estimate proof or strict baseline differs from exact approval');
 if(input.code!=='XLE'||input.date!=='2026-06-30'||input.methodVersion!=='common-equity-harmonic-operating-revenue-v2'||result.reading.ps.value!==null||o.metric!=='ps'||o.availableAt!==result.reading.availableAt||o.estimatedPS.rank!==null||o.estimatedPS.percentile!==null)throw Error('Annual estimate cannot replace strict TTM or change method, date or rank');
 const e=o.estimatedPS,a=e.adjustments[0],h=input.holdings.find(h=>h.symbol==='DVN'&&h.securityId===a.securityId);
 if(!h||h.revenue!==null||h.capitalizationComponents||canonicalInputHash(h.price)!==canonicalInputHash(a.price)||canonicalInputHash(h.shares)!==canonicalInputHash(a.shares)||Date.parse(a.financialAvailableAt)>Date.parse(input.cutoff)||a.annualRevenueUSD!=='24785000000'||a.revenueStart!=='2025-01-01'||a.revenueEnd!=='2025-12-31'||a.notTTMAtValuationDate!==true)throw Error('Exact reviewed Devon annual denominator and capital required');
 const weight=totals.ps.weight+h.weight,value=weight/(totals.ps.reciprocal+h.weight*Number(a.annualRevenueUSD)/(h.price.value*h.shares.value)),coverage=(weight+totals.ps.excluded.reduce((n,h)=>n+h.weight,0))/(input.stockWeight??1);
 if(!Number.isFinite(value)||value<=0||coverage<.98||Math.abs(value-Number(e.value))>1e-10||Math.abs(coverage-Number(e.dataCoverageWithEstimate))>1e-12)throw Error('Annual estimate differs from reviewed arithmetic');
 return {...result,reading:{...result.reading,ps:{...result.reading.ps,estimate:{methodId:ANNUAL_ESTIMATE_METHOD,basis:'latest_complete_annual_event_proforma_revenue_fallback',value,percentile:null,historyStatus:'no_method_matched_history',coverage,strictKnownCoverage:result.reading.ps.verifiedCoverage,estimatedCoverage:Number(e.estimatedCoverage),annualRevenueEnd:a.revenueEnd,proofHash:approval.proofHash}}}};
}
