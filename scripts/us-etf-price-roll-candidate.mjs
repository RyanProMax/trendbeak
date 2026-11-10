// Offline source-backed candidate preparation only. No network or storage write.
// The command which eventually publishes still uses the separate exact reviewed
// input/registry allowlist. A source-gate hash is not a publication review.
import policy from '../data/us-etf-price-roll-policy.json' with {type:'json'};
import axon from '../data/us-etf-axon-nov6-admission.json' with {type:'json'};
import {currentBasketHash as hash} from './us-etf-current-basket.mjs';
import {prepareCurrentEstimateBasket} from './us-etf-current-estimate.mjs';
import {validatePriceRoll,PRICE_ROLL_METHOD} from './us-etf-price-roll-validation.mjs';
export function buildValidatedPriceRollCandidate(previous,delta,{now=Date.now()}={}){
 const validated=validatePriceRoll(previous,delta,policy,{now}),input=structuredClone(previous.input),registry=structuredClone(previous.registry);
 Object.assign(input,{methodVersion:PRICE_ROLL_METHOD,priceDate:delta.date,cutoff:validated.session.closeAt,verifiedSettledSession:delta.date,sessionEvidenceSha256:hash(validated.session),observedAt:delta.observedAt,preparedAt:delta.preparedAt,financialAnchorCutoff:policy.anchorCutoff,anchorInputSha256:policy.root.inputSha256,sourceGateSha256:validated.proofSha256});
 const prices=new Map(validated.prices.map(p=>[p.securityId,p]));
 const evidence=new Map(validated.proof.issuers.map(e=>[e.securityId,e]));
 for(const h of input.holdings){
  h.price=structuredClone(prices.get(h.securityId));h.corporateActionsCheckedThrough=delta.date;
  h.corporateActionEvidenceSha256=hash({prior:h.corporateActionEvidenceSha256,window:evidence.get(h.securityId),sourceReviewSha256:validated.proof.sourceReviewSha256,sourceGateSha256:validated.proofSha256});
  h.corporateActionReviewObservedAt=policy.sourceReviews.find(r=>r.date===delta.date).reviewedAt;
  // Do not alter originalHeldShares, quantityAdjustment, actual fact dates,
  // missingness or class proofs merely because the session has advanced.
  for(const m of validated.missingFields.filter(m=>m.securityId===h.securityId))h[m.field]=null;
 }
 const admission={priceDate:delta.date,cutoff:validated.session.closeAt,inputSha256:hash(input),anchorInputSha256:policy.root.inputSha256,anchorRegistrySha256:policy.root.registrySha256,sourceReviewSha256:validated.proof.sourceReviewSha256,sourceGateSha256:validated.proofSha256,axonCapitalAdmission:{priceDate:delta.date,cutoff:validated.session.closeAt,anchorEventAdmissionSha256:hash(axon.eventAdmission),sourceReviewSha256:validated.proof.sourceReviewSha256,scope:'dated_reported_shares_estimate_after_independent_new_window_review'}};
 Object.assign(registry,{methodVersion:PRICE_ROLL_METHOD,inputSha256:hash(input),priceDate:delta.date,priceRollAdmission:admission,reviewSha256:hash({status:'mechanical_preparation_not_independent_publication_review',sourceGateSha256:validated.proofSha256,inputSha256:hash(input)})});
 const basket=prepareCurrentEstimateBasket(input);
 return{schema:'validated-fixed-basket-price-roll-candidate-v1',status:'pending_independent_calculation_and_publication_review',publishable:false,input,registry,sourceGate:validated.proof,priceRollAdmission:admission,inputSha256:hash(input),registrySha256:hash(registry),markedEquityValueUSD:basket.markedEquityValueUSD,missingFields:validated.missingFields,pb:null,ps:null,rank:null};
}
