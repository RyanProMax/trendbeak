// Separate current reconstruction checkpoint. Never targets valuation/US/*.
// Trusted approvals are supplied by the controlled job's reviewed code/config,
// not by an input document. This module performs no network or database writes.
import {createHash} from 'node:crypto';
import {calculateCurrentBasket,currentBasketHash} from './us-etf-current-basket.mjs';
export const CURRENT_BASKET_KEY='current-estimate/US/XLI';
const sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function prepareCurrentSnapshot({input,registry,approved,now=Date.now()}) {
 if(!Number.isFinite(now)||!registry||!Array.isArray(approved)||approved.length>8)throw Error('Bounded independently approved registry required');
 if(Buffer.byteLength(JSON.stringify(registry))>500_000)throw Error('Current registry exceeds byte bound');
 const registrySha256=currentBasketHash(registry),inputSha256=currentBasketHash(input);
 const proof=approved.find(p=>p.inputSha256===inputSha256&&p.registrySha256===registrySha256&&hash(p.reviewSha256));
 if(!proof||registry.inputSha256!==inputSha256||registry.reviewSha256!==proof.reviewSha256)throw Error('Input and registry not in fixed current-release allowlist');
 if(Date.parse(input.preparedAt)>now||Date.parse(input.observedAt)>now)throw Error('Future preparation prohibited');
 const result=calculateCurrentBasket(input,registry);
 const metrics=Object.fromEntries(['pb','ps'].map(k=>{const m=result.metrics[k];return[k,{value:m.value,estimated:true,fieldExceptions:m.fieldExceptions,unknownWeight:m.unknownWeight,verifiedCoverage:m.verifiedCoverage,excludedWeight:m.excludedWeight,percentile:null,rank:null,sourceComparison:null}]}));
 const reading={code:'XLI',methodVersion:result.methodVersion,priceAsOf:result.priceAsOf,financialCutoff:result.financialCutoff,...(result.priceCloseAt?{priceCloseAt:result.priceCloseAt,financialAnchorExpiresOn:result.financialAnchorExpiresOn,sharesMeaning:result.sharesMeaning}:{}),observedAt:result.observedAt,preparedAt:result.preparedAt,holdingsAsOf:result.holdingsAsOf,holdingsAvailableAt:result.holdingsAvailableAt,holdingsLagDays:result.holdingsLagDays,scope:result.scope,isCurrentFundNAV:false,isCurrentFundHoldings:false,historicalRankEligible:false,metrics};
 const preparedReading=JSON.stringify(reading);
 if(Buffer.byteLength(preparedReading)>4096)throw Error('Current reading exceeds byte bound');
 const checkpoint={source:'self_us_etf_current_basket',code:'XLI',methodVersion:result.methodVersion,inputSha256,registrySha256,reviewSha256:proof.reviewSha256,preparedReading,consumed:{input,registry},quality:{completion:result.completion,markedEquityValueUSD:result.markedEquityValueUSD}};
 const payload=JSON.stringify(checkpoint);
 if(Buffer.byteLength(payload)>1_800_000)throw Error('Current checkpoint exceeds byte bound');
 return{key:CURRENT_BASKET_KEY,payload,payloadSha256:sha(payload),preparedReading,preparedReadingSha256:sha(preparedReading),inputSha256,registrySha256};
}
/** Pure exact-CAS plan. Unchanged bytes preserve the existing version. The job
 * must execute this one statement and verify exactly one changed row before
 * producing publication proof; an uncertain write requires readback, not retry.
 */
export function planCurrentSnapshotWrite({prepared,current,expectedOldHash,expectedNewHash,now=Date.now()}) {
 if(!prepared||prepared.key!==CURRENT_BASKET_KEY||typeof prepared.payload!=='string'||Buffer.byteLength(prepared.payload)>1_800_000||!hash(expectedNewHash)||sha(prepared.payload)!==expectedNewHash||prepared.payloadSha256!==expectedNewHash||!Number.isFinite(now))throw Error('Exact reviewed new current checkpoint required');
 const p=JSON.parse(prepared.payload);
 const reading=JSON.parse(p.preparedReading);
 if(p.source!=='self_us_etf_current_basket'||p.code!=='XLI'||Object.hasOwn(p,'history')||typeof p.preparedReading!=='string'||Buffer.byteLength(p.preparedReading)>4096||!Number.isFinite(Date.parse(reading.preparedAt))||Date.parse(reading.preparedAt)>now)throw Error('Current checkpoint identity mismatch');
 if(current!==null&&(!current||typeof current.payload!=='string'||!Number.isFinite(Date.parse(current.updated_at))||sha(current.payload)!==expectedOldHash))throw Error('Existing current checkpoint changed');
 if(current===null&&expectedOldHash!==null)throw Error('First current publication requires explicit absent baseline');
 if(current?.payload===prepared.payload)return{key:CURRENT_BASKET_KEY,noop:true,version:current.updated_at,writes:0};
 const version=new Date(Math.max(now,current?Date.parse(current.updated_at)+1:now)).toISOString();
 if(current){const before=JSON.parse(current.payload);if(before.source!=='self_us_etf_current_basket'||before.code!=='XLI')throw Error('Wrong baseline source');const prev=JSON.parse(before.preparedReading),next=JSON.parse(p.preparedReading);if(prev.priceAsOf>next.priceAsOf||Date.parse(prev.preparedAt)>Date.parse(next.preparedAt)||Date.parse(prev.observedAt)>Date.parse(next.observedAt))throw Error('Stale release cannot roll current reconstruction backwards; use a separately approved rollback');}
 return{key:CURRENT_BASKET_KEY,noop:false,version,backup:current?{key:CURRENT_BASKET_KEY,...current,oldHash:expectedOldHash,newHash:expectedNewHash}:null,sql:current?'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?':'INSERT INTO market_snapshot(key,payload,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM market_snapshot WHERE key=?)',bindings:current?[prepared.payload,version,CURRENT_BASKET_KEY,current.updated_at,current.payload]:[CURRENT_BASKET_KEY,prepared.payload,version,CURRENT_BASKET_KEY]};
}

/** Deliberate rollback is not a normal current job. Its separate approval binds
 * the complete private backup and the exact new publication version. */
export function planCurrentSnapshotRollback({backup,current,approvedRollback,now=Date.now()}){
 if(!backup||backup.key!==CURRENT_BASKET_KEY||!current||!approvedRollback||!hash(approvedRollback.reviewSha256)||approvedRollback.backupSha256!==currentBasketHash(backup)||approvedRollback.version!==backup.version||!Number.isFinite(now)||!Number.isFinite(Date.parse(backup.version))||Date.parse(backup.version)>now||current.updated_at!==backup.version||sha(current.payload)!==backup.newHash||sha(backup.newPayload)!==backup.newHash)throw Error('Exact separately approved current rollback required');
 const next=JSON.parse(current.payload);if(next.source!=='self_us_etf_current_basket'||next.code!=='XLI')throw Error('Wrong rollback target');
 if(backup.prior===null){if(backup.oldHash!==null)throw Error('Invalid absent backup');return{key:CURRENT_BASKET_KEY,restoresAbsence:true,sql:'DELETE FROM market_snapshot WHERE key=? AND updated_at=? AND payload=?',bindings:[CURRENT_BASKET_KEY,current.updated_at,current.payload]};}
 if(!backup.prior||sha(backup.prior.payload)!==backup.oldHash||!Number.isFinite(Date.parse(backup.prior.updated_at)))throw Error('Changed original backup');
 const old=JSON.parse(backup.prior.payload);if(old.source!=='self_us_etf_current_basket'||old.code!=='XLI'||Object.hasOwn(old,'history'))throw Error('Invalid original checkpoint');
 const version=new Date(Math.max(now,Date.parse(current.updated_at)+1)).toISOString();
 return{key:CURRENT_BASKET_KEY,restoresAbsence:false,version,sql:'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?',bindings:[backup.prior.payload,version,CURRENT_BASKET_KEY,current.updated_at,current.payload]};
}
