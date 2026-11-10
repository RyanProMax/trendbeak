// Offline, single-security source adapter. It never approves, fetches or writes a release.
import {createHash} from 'node:crypto';
import fixed from '../data/us-etf-axon-nov6-admission.json' with {type:'json'};
import {currentBasketHash as hash,calculateCurrentBasket} from './us-etf-current-basket.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function prepareAxonNov6Candidate({previousInput,previousRegistry,manifestBytes,files,observedAt,preparedAt,now=Date.now()}){
 if(hash(previousInput)!==fixed.baselineInputSha256||hash(previousRegistry)!==fixed.baselineRegistrySha256)throw Error('Exact prior approved input and registry required');
 if(!Buffer.isBuffer(manifestBytes)||manifestBytes.length>20000||sha(manifestBytes)!==fixed.manifestSha256||!(files instanceof Map)||files.size!==fixed.files.length)throw Error('Complete fixed R2 evidence manifest required');
 let total=0;for(const entry of fixed.files){const bytes=files.get(entry.path);if(!Buffer.isBuffer(bytes)||bytes.length>4_000_000||sha(bytes)!==entry.sha256)throw Error('Original source or audit bytes changed: '+entry.path);total+=bytes.length;}if(total>6_000_000)throw Error('Evidence byte budget exceeded');
 if(!Number.isFinite(now)||!instant(observedAt)||!instant(preparedAt)||observedAt<previousInput.observedAt||observedAt>preparedAt||Date.parse(preparedAt)>now)throw Error('Actual new source review and preparation clocks required');
 const input=structuredClone(previousInput),registry=structuredClone(previousRegistry),index=input.holdings.findIndex(h=>h.securityId===fixed.eventAdmission.securityId),h=input.holdings[index],position=registry.positions[index];
 if(!h||h.symbol!=='AXON'||position?.securityId!==h.securityId||position.symbol!=='AXON'||['shares','equity','revenue'].some(f=>h[f]!==null)||Object.keys(position.financialProofs).length)throw Error('Exact originally missing AXON fields required');
 for(const field of ['shares','equity','revenue'])h[field]=structuredClone(fixed.facts[field]);
 input.observedAt=observedAt;input.preparedAt=preparedAt;
 position.financialProofs=structuredClone(fixed.financialProofs);registry.capitalEventAdmissions=[structuredClone(fixed.eventAdmission)];registry.inputSha256=hash(input);
 // This local derivation record is not an independent publication approval.
 const preparation={status:'source_bound_candidate_requires_independent_release_review',baselineInputSha256:hash(previousInput),baselineRegistrySha256:hash(previousRegistry),bundleSha256:fixed.bundleSha256,manifestSha256:fixed.manifestSha256,inputSha256:registry.inputSha256,eventAdmissionSha256:hash(fixed.eventAdmission),observedAt,preparedAt,unchangedOtherHoldings:80,changedFinancialFields:['AXON.shares','AXON.equity','AXON.revenue']};
 registry.reviewSha256=hash(preparation);
 const reconstructed=structuredClone(input);for(const field of ['shares','equity','revenue'])reconstructed.holdings[index][field]=null;reconstructed.observedAt=previousInput.observedAt;reconstructed.preparedAt=previousInput.preparedAt;
 if(hash(reconstructed)!==hash(previousInput))throw Error('Change outside the three AXON fields and actual preparation clocks');
 const result=calculateCurrentBasket(input,registry);
 return{status:'candidate_not_approved_or_published',publishable:false,input,registry,preparation,result};
}
