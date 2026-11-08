// Controlled archive executor. No source fetching, schedules or production-reader
// activation. CLI approval is code-owned, never read from the candidate payload.
import {readFile,writeFile,stat,mkdir,rm} from 'node:fs/promises';
import {isAbsolute} from 'node:path';import {pathToFileURL} from 'node:url';
import approvals from '../data/us-etf-current-approved-inputs.json' with {type:'json'};
import {prepareCurrentArchive,planCurrentArchiveInsert,planArchivedLatest,planArchivedLatestRollback,ARCHIVE_LATEST_KEY,ARCHIVE_LIMITS} from './us-etf-current-archive.mjs';
import {connectD1} from './d1-client.mjs';
const PREFIX="(key LIKE 'current-evidence/US/XLI/%' OR key LIKE 'current-observation/US/XLI/%')";
const PHYSICAL_LIMIT=450_000_000,HEADROOM=10_000_000;
async function rows(db,sql,params=[]){const r=await db.prepare(sql).bind(...params).all();if(!r.success)throw Error('Archive read failed; no retry');return r.results;}
async function usage(db){const [r]=await rows(db,`SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS bytes,COUNT(*) AS rows,COALESCE(SUM(key LIKE 'current-observation/US/XLI/%'),0) AS observations FROM market_snapshot WHERE ${PREFIX}`);return r;}
async function physical(db){const r=await db.prepare('SELECT 1 AS storage_probe').bind().all(),n=r?.meta?.size_after;if(!r.success||!Number.isSafeInteger(n)||n<0)throw Error('Physical D1 storage cannot be verified');return n;}
async function stored(db,archive){const out=[],keys=[...archive.objects,archive.observation].map(r=>r.key);for(let i=0;i<keys.length;i+=40){const chunk=keys.slice(i,i+40);out.push(...await rows(db,'SELECT key,payload,updated_at FROM market_snapshot WHERE key IN ('+chunk.map(()=>'?').join(',')+')',chunk));}return out;}

/** Caller must hold the common single-writer lock for this complete operation.
 * Immutable inserts are resumable only after a fresh explicit invocation and
 * full readback; this function never retries an uncertain operation. */
export async function executeCurrentArchive({db,input,registry,allowlist=approvals,now=Date.now(),dryRun=true,expectedOldHash,expectedObservationHash,backup,pause=()=>new Promise(r=>setTimeout(r,1000))}){
 const archive=prepareCurrentArchive({input,registry,approved:allowlist,now});
 if(expectedObservationHash!==archive.observation.sha256)throw Error('Exact approved observation hash required');
 const baseline=(await rows(db,'SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1',[ARCHIVE_LATEST_KEY]))[0]??null;
 const existing=await stored(db,archive),plan=planCurrentArchiveInsert({archive,existing,usage:await usage(db),approved:allowlist,now});
 const size=await physical(db);if(size+plan.addedBytes+HEADROOM>PHYSICAL_LIMIT)throw Error('Physical storage headroom exhausted; retention review required');
 // Validate the expected pointer before any insert, using the exact planned
 // archive bytes only as a preflight. Final projection uses real DB readback.
 planArchivedLatest({archive,readbackRows:[...archive.objects,archive.observation],approved:allowlist,current:baseline,expectedOldHash,expectedObservationHash,now});
 if(dryRun)return{dryRun:true,inserts:plan.statements.length,addedBytes:plan.addedBytes,physicalBytes:size,observationHash:archive.observation.sha256,writes:0};
 if(!backup||!isAbsolute(backup))throw Error('Exclusive absolute recovery journal required');
 await writeFile(backup,JSON.stringify({schema:'current-archive-execution-v1',prior:baseline,observationHash:archive.observation.sha256,plannedKeys:plan.statements.map(s=>s.key),now}),{flag:'wx',mode:0o600});
 let writes=0;
 for(const s of plan.statements){
  await pause();if(await physical(db)+Buffer.byteLength(s.bindings[1])+HEADROOM>PHYSICAL_LIMIT)throw Error('Physical budget changed; prior archive retained');
  // SQL guards serialize archive logical allocation even if a second executor
  // violates the local lock. Other table growth is covered by reserved headroom,
  // not advertised as a distributed physical-storage reservation.
  const sql=s.sql+` AND EXISTS (SELECT 1 FROM (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS usedBytes,COUNT(*) AS usedRows,COALESCE(SUM(key LIKE 'current-observation/US/XLI/%'),0) AS usedObservations FROM market_snapshot WHERE ${PREFIX}) WHERE usedBytes+?<=? AND usedRows+1<=? AND usedObservations+?<=?)`;
  const out=await db.prepare(sql).bind(...s.bindings,Buffer.byteLength(s.bindings[1]),ARCHIVE_LIMITS.totalBytes,ARCHIVE_LIMITS.totalRows,s.key.startsWith('current-observation/')?1:0,ARCHIVE_LIMITS.observations).run();
  if(!out.success||out.meta.changes!==1)throw Error('Archive insert uncertain or competing writer; inspect, do not retry');writes++;
 }
 const readbackRows=await stored(db,archive),current=(await rows(db,'SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1',[ARCHIVE_LATEST_KEY]))[0]??null;
 const p=planArchivedLatest({archive,readbackRows,approved:allowlist,current,expectedOldHash,expectedObservationHash,now});
 if(!p.noop){await pause();const out=await db.prepare(p.sql).bind(...p.bindings).run();if(!out.success||out.meta.changes!==1)throw Error('Latest CAS uncertain; inspect without retry');writes++;}
 const final=(await rows(db,'SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1',[ARCHIVE_LATEST_KEY]))[0];
 if(!final||(!p.noop&&(final.payload!==p.payload||final.updated_at!==p.version))||(p.noop&&(final.updated_at!==p.version||final.payload!==current.payload)))throw Error('Latest readback uncertain');
 await writeFile(backup+'.completed.json',JSON.stringify({key:ARCHIVE_LATEST_KEY,prior:baseline,published:final}),{flag:'wx',mode:0o600});
 return{dryRun:false,writes,noop:writes===0,version:final.updated_at,observationHash:archive.observation.sha256,exactReadback:true,readerActivated:false};
}
/** Explicit rollback API. No automatic failure handler calls it. The caller
 * supplies an independently reviewed exact backup hash, never candidate consent. */
export async function rollbackCurrentArchive({db,backup,approval,recoveryPath,now=Date.now(),dryRun=true}){
 const current=(await rows(db,'SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1',[ARCHIVE_LATEST_KEY]))[0]??null;
 const plan=planArchivedLatestRollback({backup,current,approval,now});
 if(dryRun)return{dryRun:true,writes:0,restoresAbsence:plan.restoresAbsence};
 if(!recoveryPath||!isAbsolute(recoveryPath))throw Error('Exclusive recovery file required');
 await writeFile(recoveryPath,JSON.stringify({backup,current,approval,now}),{flag:'wx',mode:0o600});
 const out=await db.prepare(plan.sql).bind(...plan.bindings).run();if(!out.success||out.meta.changes!==1)throw Error('Rollback uncertain; inspect without retry');
 const after=(await rows(db,'SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1',[ARCHIVE_LATEST_KEY]))[0]??null;
 if(plan.restoresAbsence?after!==null:!after||after.payload!==backup.prior.payload||after.updated_at!==plan.version)throw Error('Rollback readback uncertain');
 return{writes:1,exactReadback:true,restoresAbsence:plan.restoresAbsence,retainedImmutableEvidence:true};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);if(i<0)return;const v=a[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+k);a.splice(i,2);return v;};
 const file=get('--file'),registryFile=get('--registry'),backup=get('--backup'),old=get('--expected-old-hash'),expectedObservationHash=get('--expected-observation-hash'),remote=a.includes('--remote'),dryRun=!a.includes('--write');
 if(!file||!registryFile||old===undefined||!expectedObservationHash||a.some(x=>!['--remote','--write'].includes(x)))throw Error('Require file, registry, expected-old-hash (or absent), expected-observation-hash; write requires backup');
 if((await stat(file)).size>2_000_000||(await stat(registryFile)).size>500_000)throw Error('Oversized input');
 const input=JSON.parse(await readFile(file,'utf8')),registry=JSON.parse(await readFile(registryFile,'utf8')),lock='/tmp/trendbeak-daily-writer.lock';await mkdir(lock,{mode:0o700});let c;
 try{c=await connectD1(remote);console.log(JSON.stringify(await executeCurrentArchive({db:c.db,input,registry,dryRun,expectedOldHash:old==='absent'?null:old,expectedObservationHash,backup})));}finally{await c?.close();await rm(lock,{recursive:true});}
}
