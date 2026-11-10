// Pure, controlled-job calculation. No historical checkpoint, reader or writer imports.
// `approval` must come from an independently reviewed deployment allowlist, never input JSON.
import {createHash} from 'node:crypto';
import {prepareCurrentEstimateBasket, CURRENT_ESTIMATE_METHOD, PRICE_ROLL_METHOD} from './us-etf-current-estimate.mjs';
import axonNov6 from '../data/us-etf-axon-nov6-admission.json' with {type:'json'};
import rollPolicy from '../data/us-etf-price-roll-policy.json' with {type:'json'};
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`:JSON.stringify(x);
export const currentBasketHash=x=>createHash('sha256').update(canonical(x)).digest('hex');
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const UNKNOWN_LIMIT=.02;
export function calculateCurrentBasket(input, approval) {
 const bytes=JSON.stringify(input);
 if(!bytes||Buffer.byteLength(bytes)>2_000_000)throw Error('Bounded current basket input required');
 if(!approval||![CURRENT_ESTIMATE_METHOD,PRICE_ROLL_METHOD].includes(input.methodVersion)||approval.methodVersion!==input.methodVersion||!validHash(approval.reviewSha256)||approval.inputSha256!==currentBasketHash(input)||approval.priceDate!==input.priceDate||approval.positionInventorySha256!==input.positionInventorySha256)throw Error('Exact independently approved current basket required');
 const isRoll=input.methodVersion===PRICE_ROLL_METHOD;
 if(isRoll){
  const a=approval.priceRollAdmission;
  if(!a||!rollPolicy.priceRollAdmissions.some(e=>currentBasketHash(e)===currentBasketHash(a))||a.inputSha256!==currentBasketHash(input)||a.priceDate!==input.priceDate||a.sourceGateSha256!==input.sourceGateSha256||a.anchorInputSha256!==rollPolicy.root.inputSha256||input.anchorInputSha256!==rollPolicy.root.inputSha256||input.financialAnchorCutoff!==rollPolicy.anchorCutoff||input.priceDate<=rollPolicy.anchorDate||input.priceDate>rollPolicy.expiresOn)throw Error('Exact independently reviewed finite price-roll admission required');
 }
 if(!Array.isArray(approval.positions)||approval.positions.length!==81||input.expectedPositionCount!==81)throw Error('Exact 81-position XLI inventory required');
 const positions=new Map(approval.positions.map(h=>[h.securityId,h]));
 if(positions.size!==81)throw Error('Unique approved inventory required');
 if(typeof input.observedAt!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(input.observedAt)||!Number.isFinite(Date.parse(input.observedAt))||Date.parse(input.observedAt)<Date.parse(input.cutoff)||Date.parse(input.observedAt)>Date.parse(input.preparedAt))throw Error('Actual zoned observation and preparation timestamps required');
 const basket=prepareCurrentEstimateBasket(input);
 if(basket.holdings.some(h=>Date.parse(h.price.availableAt)>Date.parse(input.observedAt)))throw Error('Prices must have been available at actual observation time');
 const tallies=Object.fromEntries(['pb','ps'].map(m=>[m,{includedValue:0,excludedValue:0,unknownValue:0,reciprocal:0,missing:[],excluded:[]}]));
 const completion=[];
 for(const h of basket.holdings){
  const approved=positions.get(h.securityId);
  if(!approved||approved.symbol!==h.symbol||approved.originalHeldShares!==h.originalHeldShares||!validHash(approved.identityProofSha256))throw Error('Original position identity or quantity mismatch');
  if(isRoll){
   const original=rollPolicy.anchorPositions.find(p=>p.securityId===h.securityId);
   if(!original||original.symbol!==h.symbol||original.originalHeldShares!==h.originalHeldShares||original.quantityAdjustmentSha256!==currentBasketHash(h.quantityAdjustment))throw Error('Fixed original basket identity and quantity changed');
   for(const field of ['shares','equity','revenue'])if(h[field]!==null&&(currentBasketHash(h[field])!==original.financialProofs?.[field]?.factSha256||currentBasketHash(approved.financialProofs?.[field])!==currentBasketHash(original.financialProofs[field])||Date.parse(h[field].availableAt)>Date.parse(rollPolicy.anchorCutoff)))throw Error('Dated financial anchor changed or missing fact silently restored');
  }
  // Proof binding covers the complete fact including source, dates, class scope and amount.
  for(const field of ['shares','equity','revenue'])if(h[field]!==null){
   const p=approved.financialProofs?.[field];
   if(!p||!validHash(p.reviewSha256)||p.factSha256!==currentBasketHash(h[field]))throw Error('Each present financial fact needs its exact independent proof');
  }
  if(h.shares!==null){
   if(!validHash(h.shares.classRightsProofSha256))throw Error('Issuer class-rights proof required');
   if(h.shares.scope==='one_for_one_conversion_value'){
    const e=approval.capitalExceptions?.find(e=>e.securityId===h.securityId&&e.symbol===h.symbol);
    const fixed=isRoll&&rollPolicy.capitalExceptions.find(p=>p.securityId===h.securityId&&p.symbol===h.symbol);
    if(h.symbol!=='AOS'||h.shares.value!==134_328_956||h.shares.methodVersion!=='current-one-for-one-conversion-value-estimate-v1'||!e||e.methodVersion!==h.shares.methodVersion||e.factSha256!==currentBasketHash(h.shares)||!validHash(e.reviewSha256)||(isRoll?(!fixed||currentBasketHash(e)!==currentBasketHash(fixed)):(input.priceDate!=='2026-11-06'||e.priceDate!==input.priceDate)))throw Error('Exact AOS current conversion-value exception required');
   }else if(!['single_common','all_economic_common_equal_per_share'].includes(h.shares.scope))throw Error('Issuer shares must cover all economic common interests');
   if((isRoll||input.priceDate==='2026-11-06')&&h.symbol==='AOS'&&h.shares.scope!=='one_for_one_conversion_value')throw Error('AOS conversion valuation cannot claim identical voting classes or direct class price');
  }
  if((isRoll||input.priceDate==='2026-11-06')&&h.symbol==='DE'&&h.revenue!==null&&h.revenue.definition!=='segment_external_revenue_excluding_corporate_other')throw Error('Known DE segment estimate cannot be relabelled ordinary operating revenue');
  if(h.revenue!==null&&h.revenue.definition!=='operating_revenue_v2'){
   const e=approval.revenueExceptions?.find(e=>e.securityId===h.securityId&&e.symbol===h.symbol);
   const fixed=isRoll&&rollPolicy.revenueExceptions.find(p=>p.securityId===h.securityId&&p.symbol===h.symbol);
   if(h.symbol!=='DE'||h.revenue.value!==47_720_000_000||h.revenue.definition!=='segment_external_revenue_excluding_corporate_other'||h.revenue.methodVersion!=='current-segment-external-revenue-estimate-v1'||!e||e.definition!==h.revenue.definition||e.methodVersion!==h.revenue.methodVersion||e.factSha256!==currentBasketHash(h.revenue)||!validHash(e.reviewSha256)||(isRoll?(!fixed||currentBasketHash(e)!==currentBasketHash(fixed)):(input.priceDate!=='2026-11-06'||e.priceDate!==input.priceDate)))throw Error('Exact current-only segment revenue exception required');
  }
  if((h.symbol==='AXON'||h.securityId===axonNov6.eventAdmission.securityId)&&['shares','equity','revenue'].some(field=>h[field]!==null)){
   // This admission clears one dated capital question, not future event windows.
   // Class rights, financial facts and Skydio issuance timing have separate proofs.
   const fixed=axonNov6.eventAdmission,entries=approval.capitalEventAdmissions;
   const next=approval.priceRollAdmission?.axonCapitalAdmission;
   const rollAccepted=isRoll&&next?.priceDate===input.priceDate&&next?.cutoff===input.cutoff&&next?.anchorEventAdmissionSha256===currentBasketHash(fixed)&&next?.sourceReviewSha256===approval.priceRollAdmission.sourceReviewSha256&&next?.scope==='dated_reported_shares_estimate_after_independent_new_window_review';
   if((isRoll?!rollAccepted:(input.priceDate!==fixed.priceDate||input.cutoff!==fixed.cutoff))||h.securityId!==fixed.securityId||h.symbol!==fixed.symbol||!Array.isArray(entries)||entries.length!==1||currentBasketHash(entries[0])!==currentBasketHash(fixed)||h.shares?.classRightsProofSha256!==fixed.classRightsProofSha256)throw Error('Exact November 6 AXON event admission or separately reviewed new-window admission required');
   for(const field of ['shares','equity','revenue'])if(currentBasketHash(h[field])!==axonNov6.financialProofs[field].factSha256||currentBasketHash(approved.financialProofs[field])!==currentBasketHash(axonNov6.financialProofs[field]))throw Error('AXON typed original financial fact or review changed');
  }
  if(h.symbol==='HON'&&h.revenue!==null)throw Error('Known unresolved HON revenue scope cannot be silently restored');
  const status={securityId:h.securityId,symbol:h.symbol,weight:h.weight};
  for(const [metric,field] of [['pb','equity'],['ps','revenue']]){
   const t=tallies[metric],f=h[field];
   // Verified nonpositive denominator is an explicit exclusion, not an unknown zero.
   if(f!==null&&f.value<=0){t.excludedValue+=h.valueUSD;t.excluded.push({securityId:h.securityId,reason:'known_nonpositive_'+field,weight:h.weight});status[metric]='known_nonpositive_excluded';continue;}
   if(f===null||h.shares===null){t.unknownValue+=h.valueUSD;t.missing.push({securityId:h.securityId,reason:f===null?'missing_'+field:'missing_capital',weight:h.weight});status[metric]='missing';continue;}
   const cap=h.price.value*h.shares.value,contribution=h.valueUSD*f.value/cap;
   if(!finite(cap)||cap<=0||!finite(contribution)||contribution<=0)throw Error('Invalid capitalization or reciprocal contribution');
   t.includedValue+=h.valueUSD;t.reciprocal+=contribution;status[metric]='verified_positive';
  }
  completion.push(status);
 }
 const metrics=Object.fromEntries(Object.entries(tallies).map(([m,t])=>{
  // Require strictly less than 2% unknown. Conservative rounding guard at the boundary.
  const unknown=t.unknownValue/basket.markedEquityValueUSD;
  const eligible=unknown<UNKNOWN_LIMIT-1e-12&&t.reciprocal>0;
  const value=eligible?t.includedValue/t.reciprocal:null;
  if(value!==null&&(!finite(value)||value<=0))throw Error('Invalid current estimate');
  const fieldExceptions=m==='ps'?basket.holdings.filter(h=>h.revenue!==null&&h.revenue.definition!=='operating_revenue_v2').map(h=>({symbol:h.symbol,definition:h.revenue.definition,methodVersion:h.revenue.methodVersion,weight:h.weight})):[];
  fieldExceptions.push(...basket.holdings.filter(h=>h.shares?.scope==='one_for_one_conversion_value').map(h=>({symbol:h.symbol,definition:h.shares.scope,methodVersion:h.shares.methodVersion,weight:h.weight})));
  return [m,{value,estimated:true,methodVersion:input.methodVersion,fieldExceptions,percentile:null,rank:null,sourceComparison:null,unknownWeight:unknown,verifiedCoverage:1-unknown,positiveWeight:t.includedValue/basket.markedEquityValueUSD,excludedWeight:t.excludedValue/basket.markedEquityValueUSD,missing:t.missing,excluded:t.excluded}];
 }));
 return {schema:'isolated_current_equity_basket_estimate_v1',status:'reviewed_calculation_not_published',code:'XLI',methodVersion:input.methodVersion,priceAsOf:input.priceDate,financialCutoff:isRoll?input.financialAnchorCutoff:input.cutoff,...(isRoll?{priceCloseAt:input.cutoff,financialAnchorExpiresOn:rollPolicy.expiresOn,sharesMeaning:'dated_actual_reported_shares_estimate_not_current_outstanding'}:{}),observedAt:input.observedAt,preparedAt:input.preparedAt,holdingsAsOf:input.holdingsDate,holdingsAvailableAt:input.holdingsAvailableAt,holdingsLagDays:basket.holdingsLagDays,scope:basket.scope,markedEquityValueUSD:basket.markedEquityValueUSD,isCurrentFundNAV:false,isCurrentFundHoldings:false,historicalRankEligible:false,percentile:null,metrics,completion,inputSha256:approval.inputSha256,reviewSha256:approval.reviewSha256};
}
