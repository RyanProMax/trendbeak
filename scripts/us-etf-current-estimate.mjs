// Controlled-writer preparation only. Not wired to the historical importer or HTTP.
// Never relabel stale holdings as a current observation or assume current cash/NAV.
export const CURRENT_ESTIMATE_METHOD = 'latest-public-holdings-marked-equity-basket-v1';
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
const instant = x => typeof x === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const age = (a,b) => (Date.parse(a)-Date.parse(b))/86400000;
/** This is a source/basket readiness gate, NOT a publishable ETF PB/PS reading.
 * Callers must supply all original positions including currently unpriced ones;
 * a missing price stops reweighting instead of silently deleting that holding.
 */
export function prepareCurrentEstimateBasket(input) {
 if (!input || input.code !== 'XLI' || input.methodVersion !== CURRENT_ESTIMATE_METHOD || !day(input.priceDate) || !day(input.holdingsDate) || input.holdingsDate > input.priceDate || !instant(input.cutoff) || !instant(input.preparedAt) || Date.parse(input.preparedAt)<Date.parse(input.cutoff) || !instant(input.holdingsAvailableAt) || Date.parse(input.holdingsAvailableAt)>Date.parse(input.cutoff) || Date.parse(input.holdingsAvailableAt)<Date.parse(input.holdingsDate)) throw Error('Explicit current-estimate identity and available holdings required');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(input.cutoff)).map(p=>[p.type,p.value]));
 if (`${parts.year}-${parts.month}-${parts.day}`!==input.priceDate || `${parts.hour}:${parts.minute}:${parts.second}`!=='16:00:00' || input.verifiedSettledSession!==input.priceDate || !sha(input.sessionEvidenceSha256) || [0,6].includes(new Date(input.priceDate+'T12:00:00Z').getUTCDay())) throw Error('Verified settled same-day close required');
 if (!sha(input.holdingsSourceSha256) || !sha(input.positionInventorySha256) || !Array.isArray(input.holdings) || !input.holdings.length || input.holdings.length>600 || input.expectedPositionCount!==input.holdings.length) throw Error('Complete bounded original position inventory required');
 const seen=new Set(), rows=[];
 for(const h of input.holdings){
  if(!h || typeof h.securityId!=='string'||!h.securityId||seen.has(h.securityId)||!positive(h.originalHeldShares)||h.corporateActionsCheckedThrough!==input.priceDate||!sha(h.corporateActionEvidenceSha256)) throw Error('Unique original positions and current corporate-action review required');
  seen.add(h.securityId);
  const a=h.quantityAdjustment;
  if(!a||!positive(a.factor)||!sha(a.evidenceSha256)||!instant(a.availableAt)||Date.parse(a.availableAt)>Date.parse(input.cutoff)||!['reviewed_unchanged','reviewed_split_adjustment'].includes(a.basis)||a.basis==='reviewed_unchanged'&&a.factor!==1) throw Error('Explicit reviewed quantity basis required; mergers and spinoffs need a separate position bridge');
  const p=h.price;
  if(!p||!positive(p.value)||p.currency!=='USD'||p.date!==input.priceDate||p.basis!=='unadjusted_close'||p.securityId!==h.securityId||!instant(p.availableAt)||Date.parse(p.availableAt)<Date.parse(input.cutoff)||Date.parse(p.availableAt)>Date.parse(input.preparedAt)||!sha(p.sourceSha256)) throw Error('Every position needs a same-date same-class verified close');
  // Closing prices may be published just after close. Financial facts may not.
  const missing=[];
  for(const field of ['shares','equity','revenue']){
   const f=h[field];if(f===null){missing.push(field);continue;}
   if(!f||typeof f.value!=='number'||!Number.isFinite(f.value)||!day(f.asOf)||f.asOf>input.priceDate||!instant(f.availableAt)||Date.parse(f.availableAt)>Date.parse(input.cutoff)||Date.parse(f.availableAt)<Date.parse(f.asOf)||!sha(f.sourceSha256)||age(input.priceDate,f.asOf)>180) throw Error('Missing, future, stale or untraceable current financial fact');
   if(field==='shares'&&(!positive(f.value)||f.basis!=='actual_common_outstanding'))throw Error('Actual common shares required; no EPS weighted-share substitution');
   if(field==='equity'&&f.basis!=='common')throw Error('Verified common equity required');
   if(field==='revenue'&&f.basis!=='ttm')throw Error('Reported same-scope TTM required; no annualization');
  }
  const heldShares=h.originalHeldShares*a.factor,valueUSD=heldShares*p.value;
  if(!positive(valueUSD))throw Error('Invalid marked holding value');
  rows.push({...h,heldShares,valueUSD,missingFinancialFields:missing});
 }
 const total=rows.reduce((s,r)=>s+r.valueUSD,0);if(!positive(total))throw Error('Invalid marked basket total');
 return {status:'prepared_basket_not_publishable_valuation',code:input.code,methodVersion:CURRENT_ESTIMATE_METHOD,priceDate:input.priceDate,cutoff:input.cutoff,holdingsDate:input.holdingsDate,holdingsAvailableAt:input.holdingsAvailableAt,holdingsLagDays:age(input.priceDate,input.holdingsDate),scope:'marked_disclosed_equity_basket_excludes_unknown_current_cash_and_liabilities',markedEquityValueUSD:total,holdings:rows.map(r=>({...r,weight:r.valueUSD/total})),pb:null,ps:null,percentile:null};
}
