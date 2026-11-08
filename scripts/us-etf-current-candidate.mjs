// Pure next-session research candidate only. No network, schedules, storage or publication imports.
import {currentBasketHash as hash} from './us-etf-current-basket.mjs';
import {prepareCurrentSnapshot} from './us-etf-current-snapshot.mjs';
import {prepareCurrentEstimateBasket} from './us-etf-current-estimate.mjs';
const H=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const fields=['shares','equity','revenue'];
/** reuseChecks are separately reviewed metadata/event findings, not permission to
 * publish. Even identical DE/AOS facts generate new date-specific review requests.
 * Changed or unresolved financial fields become null; security identity/quantity
 * uncertainty stops the complete basket instead of silently dropping a position.
 */
export function buildCurrentCandidate({previousInput,previousRegistry,approvedPrevious,session,prices,events,reuseChecks,observedAt,preparedAt,now=Date.now()}){
 for(const value of [prices,events,reuseChecks])if(Buffer.byteLength(JSON.stringify(value)??'')>1_000_000)throw Error('Bounded update metadata required; no raw source copies');
 prepareCurrentSnapshot({input:previousInput,registry:previousRegistry,approved:approvedPrevious,now});
 if(!session||session.date<=previousInput.priceDate||!instant(session.cutoff)||!H(session.sourceSha256)||!H(session.reviewSha256)||!instant(observedAt)||!instant(preparedAt)||observedAt>preparedAt||Date.parse(preparedAt)>now||Date.parse(observedAt)<Date.parse(session.cutoff))throw Error('New verified session and actual UTC clocks required');
 for(const list of [prices,events,reuseChecks])if(!Array.isArray(list)||list.length!==81||new Set(list.map(x=>x.securityId)).size!==81)throw Error('Complete unique 81-position update required');
 const pmap=new Map(prices.map(x=>[x.securityId,x])),emap=new Map(events.map(x=>[x.securityId,x])),cmap=new Map(reuseChecks.map(x=>[x.securityId,x]));
 const input=structuredClone(previousInput),pending=[],reused=[];
 Object.assign(input,{priceDate:session.date,cutoff:session.cutoff,verifiedSettledSession:session.date,sessionEvidenceSha256:session.sourceSha256,observedAt,preparedAt});
 for(const h of input.holdings){
  const p=pmap.get(h.securityId),e=emap.get(h.securityId),c=cmap.get(h.securityId),old=previousInput.holdings.find(x=>x.securityId===h.securityId),proof=previousRegistry.positions.find(x=>x.securityId===h.securityId);
  if(!p||!e||!c||e.symbol!==h.symbol||e.status!=='unchanged_security_and_quantity'||e.fromDate!==previousInput.priceDate||e.throughDate!==session.date||!H(e.sourceSha256)||!H(e.reviewSha256)||!instant(e.reviewedAt)||Date.parse(e.reviewedAt)>Date.parse(preparedAt)||Date.parse(e.reviewedAt)<Date.parse(session.cutoff))throw Error('Unresolved identity/split/spinoff requires a separately reviewed position bridge');
  h.price=structuredClone(p);h.corporateActionsCheckedThrough=session.date;h.corporateActionEvidenceSha256=hash(e);
  if(Date.parse(p.availableAt)>Date.parse(observedAt))throw Error('Price unavailable at actual observation');
  for(const field of fields){
   const check=c[field],fact=old[field];
   const unchanged=check?.status==='unchanged'&&check.checkedThrough===session.cutoff&&H(check.sourceSha256)&&H(check.reviewSha256)&&instant(check.reviewedAt)&&check.reviewedAt<=preparedAt&&Date.parse(check.reviewedAt)>=Date.parse(session.cutoff)&&check.factSha256===(fact===null?null:hash(fact));
   const fresh=fact!==null&&Date.parse(fact.availableAt)<=Date.parse(session.cutoff)&&(Date.parse(session.date)-Date.parse(fact.asOf))/86400000<=180;
   if(!unchanged||!fresh){h[field]=null;pending.push({securityId:h.securityId,field,reason:fact===null?'previously_missing':!unchanged?'changed_or_unresolved_source':'stale_fact'});continue;}
   h[field]=structuredClone(fact);reused.push({securityId:h.securityId,field,factSha256:hash(fact),originalProof:proof.financialProofs[field],updateCheckSha256:hash(check)});
   if(field==='revenue'&&fact.definition!=='operating_revenue_v2'||field==='shares'&&fact.scope==='one_for_one_conversion_value')pending.push({securityId:h.securityId,field,reason:'new_date_exception_requires_independent_review',priceDate:session.date,factSha256:hash(fact),methodVersion:fact.methodVersion});
  }
 }
 // This checks all marks, currency, dates, original balances and unchanged source
 // facts; no PB/PS is calculated or approved here. Early closes are unsupported
 // by the current calculation contract and fail closed pending a separate change.
 const basket=prepareCurrentEstimateBasket(input);
 return{schema:'current-basket-candidate-v1',status:'pending_independent_review',publishable:false,input,inputSha256:hash(input),previousInputSha256:hash(previousInput),sessionReviewSha256:session.reviewSha256,markedEquityValueUSD:basket.markedEquityValueUSD,reused,pending,pb:null,ps:null,rank:null};
}
