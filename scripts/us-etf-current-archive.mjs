// Pure experimental archive/projection plans. No production job/route imports.
// Source documents stay external and hash-addressed; never copy raw reports here.
import {createHash} from 'node:crypto';
import {currentBasketHash as hash} from './us-etf-current-basket.mjs';
import {prepareCurrentSnapshot} from './us-etf-current-snapshot.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const bytes=s=>Buffer.byteLength(s);
const E='current-evidence/US/XLI/',O='current-observation/US/XLI/';
export const ARCHIVE_LATEST_KEY='current-archive-latest/US/XLI';
export const ARCHIVE_LIMITS=Object.freeze({totalBytes:256_000_000,totalRows:15000,observationBytes:160_000,evidenceBytes:16_000,observations:3000});
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function checkedPrepared(args){return prepareCurrentSnapshot(args);}
/** A preparation may only be archived after exact independent input approval.
 * Store financial facts and original proof bindings once by content hash; each
 * observation retains its complete dates/prices/revisions and exact references.
 */
export function prepareCurrentArchive(args){
 const prepared=checkedPrepared(args),input=structuredClone(args.input),registry=structuredClone(args.registry),objects=new Map(),refs=[];
 for(let i=0;i<input.holdings.length;i++){
  const h=input.holdings[i],p=registry.positions.find(x=>x.securityId===h.securityId);
  for(const field of ['shares','equity','revenue']){
   const payload=JSON.stringify({fact:h[field],proof:p.financialProofs?.[field]??null}),digest=sha(payload),key=E+digest;
   if(bytes(payload)>ARCHIVE_LIMITS.evidenceBytes)throw Error('Evidence reference must be compact; raw sources stay external');
   objects.set(key,{key,payload,sha256:digest});refs.push({securityId:h.securityId,field,key});h[field]=null;if(p.financialProofs&&Object.hasOwn(p.financialProofs,field))p.financialProofs[field]=null;
  }
 }
 const reading=JSON.parse(prepared.preparedReading),doc={schema:'current-basket-archive-v1',code:'XLI',priceDate:reading.priceAsOf,inputSha256:prepared.inputSha256,registrySha256:prepared.registrySha256,checkpointSha256:prepared.payloadSha256,input,registry,refs,preparedReading:prepared.preparedReading};
 const payload=JSON.stringify(doc),key=O+reading.priceAsOf+'/'+prepared.inputSha256;
 if(bytes(payload)>ARCHIVE_LIMITS.observationBytes)throw Error('Observation exceeds bounded archive budget');
 return{observation:{key,payload,sha256:sha(payload)},objects:[...objects.values()],prepared};
}
export function verifyCurrentArchive({observation,objects,approved,now=Date.now()}){
 if(!observation||typeof observation.payload!=='string'||bytes(observation.payload)>ARCHIVE_LIMITS.observationBytes||sha(observation.payload)!==observation.sha256||!Array.isArray(objects)||objects.length>243)throw Error('Invalid bounded observation');
 const d=JSON.parse(observation.payload);if(d.schema!=='current-basket-archive-v1'||d.code!=='XLI'||observation.key!==O+d.priceDate+'/'+d.inputSha256||!Array.isArray(d.refs)||d.refs.length!==243)throw Error('Archive identity mismatch');
 const m=new Map();for(const o of objects){if(!o||typeof o.payload!=='string'||bytes(o.payload)>ARCHIVE_LIMITS.evidenceBytes||o.key!==E+sha(o.payload)||o.sha256!==sha(o.payload)||m.has(o.key))throw Error('Changed or duplicate evidence object');m.set(o.key,o);}
 const seen=new Set();for(const r of d.refs){const tag=r.securityId+'/'+r.field;if(seen.has(tag)||!['shares','equity','revenue'].includes(r.field))throw Error('Duplicate field reference');seen.add(tag);const o=m.get(r.key),h=d.input.holdings.find(x=>x.securityId===r.securityId),p=d.registry.positions.find(x=>x.securityId===r.securityId);if(!o||!h||!p)throw Error('Missing retained evidence');const v=JSON.parse(o.payload);h[r.field]=v.fact;if(v.proof!==null){p.financialProofs??={};p.financialProofs[r.field]=v.proof;}}
 if(new Set(d.refs.map(r=>r.key)).size!==m.size)throw Error('Unreferenced retained evidence prohibited');
 const restored=checkedPrepared({input:d.input,registry:d.registry,approved,now});
 if(restored.inputSha256!==d.inputSha256||restored.registrySha256!==d.registrySha256||restored.payloadSha256!==d.checkpointSha256||restored.preparedReading!==d.preparedReading||JSON.parse(d.preparedReading).priceAsOf!==d.priceDate)throw Error('Archive does not reproduce approved checkpoint');
 return restored;
}
/** existing and usage must come from one controlled DB snapshot. Zero-change or
 * uncertain insert requires readback; never retry these plans blindly. */
export function planCurrentArchiveInsert({archive,existing,usage,approved,now=Date.now()}){
 verifyCurrentArchive({...archive,approved,now});
 if(!Array.isArray(existing)||!usage||!['bytes','rows','observations'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0))throw Error('Bounded storage usage snapshot required');
 const m=new Map(existing.map(r=>[r.key,r]));if(m.size!==existing.length)throw Error('Duplicate stored key');
 if(usage.rows<existing.length||usage.bytes<existing.reduce((n,r)=>n+bytes(r.payload),0))throw Error('Usage undercounts supplied stored rows');
 const rows=[...archive.objects,archive.observation],newRows=[];
 for(const row of rows){const old=m.get(row.key);if(old&&old.payload!==row.payload)throw Error('Immutable archive collision or tampering');if(!old)newRows.push(row);}
 const deltaBytes=newRows.reduce((n,r)=>n+bytes(r.payload),0),deltaObservations=m.has(archive.observation.key)?0:1;
 if(usage.bytes+deltaBytes>ARCHIVE_LIMITS.totalBytes||usage.rows+newRows.length>ARCHIVE_LIMITS.totalRows||usage.observations+deltaObservations>ARCHIVE_LIMITS.observations)throw Error('Archive budget exhausted; explicit retention review required');
 return{noop:newRows.length===0,addedBytes:deltaBytes,statements:newRows.map(r=>({key:r.key,expectedHash:r.sha256,sql:'INSERT INTO market_snapshot(key,payload,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM market_snapshot WHERE key=?)',bindings:[r.key,r.payload,new Date(now).toISOString(),r.key]}))};
}
export function planArchivedLatest({archive,readbackRows,approved,current,expectedOldHash,expectedObservationHash,now=Date.now()}){
 if(!Array.isArray(readbackRows))throw Error('Full persisted archive readback required');
 const persisted=new Map(readbackRows.map(r=>[r.key,r]));if(persisted.size!==readbackRows.length)throw Error('Duplicate readback');
 for(const row of [...archive.objects,archive.observation])if(persisted.get(row.key)?.payload!==row.payload)throw Error('Incomplete or changed persisted archive');
 const p=verifyCurrentArchive({...archive,approved,now});
 if(!isHash(expectedObservationHash)||expectedObservationHash!==archive.observation.sha256)throw Error('Exact archive readback hash required');
 const r=JSON.parse(p.preparedReading),payload=JSON.stringify({source:'approved_current_archive_projection_v1',observationKey:archive.observation.key,observationSha256:archive.observation.sha256,checkpointSha256:p.payloadSha256,preparedReading:p.preparedReading});
 if(current===null?expectedOldHash!==null:!current||sha(current.payload)!==expectedOldHash||!Number.isFinite(Date.parse(current.updated_at))||Date.parse(current.updated_at)>now||bytes(current.payload)>8192)throw Error('Exact latest baseline required');
 if(current?.payload===payload)return{noop:true,key:ARCHIVE_LATEST_KEY,version:current.updated_at,writes:0};
 if(current){const old=JSON.parse(current.payload),b=JSON.parse(old.preparedReading);if(old.source!=='approved_current_archive_projection_v1'||!/^\d{4}-\d{2}-\d{2}$/.test(b.priceAsOf)||!Number.isFinite(Date.parse(b.preparedAt))||!Number.isFinite(Date.parse(b.observedAt))||b.priceAsOf>r.priceAsOf||Date.parse(b.preparedAt)>Date.parse(r.preparedAt)||Date.parse(b.observedAt)>Date.parse(r.observedAt))throw Error('Stale projection; explicit rollback required');}
 const version=new Date(Math.max(now,current?Date.parse(current.updated_at)+1:now)).toISOString();
 return{noop:false,key:ARCHIVE_LATEST_KEY,payload,sha256:sha(payload),version,sql:current?'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?':'INSERT INTO market_snapshot(key,payload,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM market_snapshot WHERE key=?)',bindings:current?[payload,version,ARCHIVE_LATEST_KEY,current.updated_at,current.payload]:[ARCHIVE_LATEST_KEY,payload,version,ARCHIVE_LATEST_KEY]};
}
/** Separate deliberately approved rollback of the projection only. Immutable
 * observations/evidence remain intact. Executor must save recovery bytes first,
 * execute once and read back; uncertain results are never retry instructions. */
export function planArchivedLatestRollback({backup,current,approval,now=Date.now()}){
 if(!backup||backup.key!==ARCHIVE_LATEST_KEY||!approval||approval.backupSha256!==hash(backup)||!isHash(approval.reviewSha256)||!current||current.payload!==backup.published?.payload||current.updated_at!==backup.published?.updated_at||!Number.isFinite(Date.parse(current.updated_at))||!Number.isFinite(now)||Date.parse(current.updated_at)>now)throw Error('Exact independently approved projection rollback required');
 const next=JSON.parse(current.payload);if(next.source!=='approved_current_archive_projection_v1')throw Error('Invalid projection source');
 if(backup.prior===null)return{key:ARCHIVE_LATEST_KEY,restoresAbsence:true,sql:'DELETE FROM market_snapshot WHERE key=? AND updated_at=? AND payload=?',bindings:[ARCHIVE_LATEST_KEY,current.updated_at,current.payload]};
 const old=backup.prior;if(!old||typeof old.payload!=='string'||bytes(old.payload)>8192||!Number.isFinite(Date.parse(old.updated_at))||Date.parse(old.updated_at)>Date.parse(current.updated_at)||JSON.parse(old.payload).source!=='approved_current_archive_projection_v1')throw Error('Invalid prior projection');
 const version=new Date(Math.max(now,Date.parse(current.updated_at)+1)).toISOString();
 return{key:ARCHIVE_LATEST_KEY,restoresAbsence:false,version,sql:'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?',bindings:[old.payload,version,ARCHIVE_LATEST_KEY,current.updated_at,current.payload]};
}
