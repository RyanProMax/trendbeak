// Explicit single-point job. It neither modifies legacy keys nor adds a schedule.
import{readFile,writeFile,stat,mkdir,rm}from'node:fs/promises';import{isAbsolute}from'node:path';import{pathToFileURL}from'node:url';
import{connectD1}from'./d1-client.mjs';import{reportedHash}from'./us-etf-reported-candidate.mjs';import{REPORTED_POINT_KEY}from'./us-etf-reported-point.mjs';import{prepareReportedSnapshot}from'./us-etf-reported-snapshot.mjs';
async function read(db){const r=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(REPORTED_POINT_KEY).all();if(!r.success||r.results.length>1)throw Error('Reported point baseline uncertain');return r.results[0]??null;}
export async function writeReportedPoint({db,candidateBytes,registry,approved,expectedOldHash,expectedNewHash,dryRun=true,backup,now=Date.now()}){
 const p=prepareReportedSnapshot({candidateBytes,registry,approved,now}),old=await read(db);
 if(old&&(Date.parse(old.updated_at)>now||!Number.isFinite(Date.parse(old.updated_at)))||(old===null?expectedOldHash!==null:reportedHash(old.payload)!==expectedOldHash)||expectedNewHash!==p.payloadSha256)throw Error('Exact old and new reported point hashes required');
 if(old?.payload===p.payload){const again=await read(db);if(again?.payload!==old.payload||again?.updated_at!==old.updated_at)throw Error('Reported no-op baseline drift');return {noop:true,writes:0,key:p.key,version:old.updated_at,payloadSha256:p.payloadSha256};}
 const version=new Date(Math.max(now,old?Date.parse(old.updated_at)+1:now)).toISOString(),report={noop:false,dryRun,writes:0,key:p.key,version,payloadSha256:p.payloadSha256,candidateSha256:p.candidateSha256,registrySha256:p.registrySha256,readingSha256:p.readingSha256,bytes:Buffer.byteLength(p.payload)};
 if(dryRun)return report;
 if(!backup||!isAbsolute(backup))throw Error('Exclusive absolute recovery backup required');
 await writeFile(backup,JSON.stringify({key:p.key,prior:old,oldHash:expectedOldHash,newHash:p.payloadSha256,newPayload:p.payload,version}),{flag:'wx',mode:0o600});
 const sql=old?'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?':'INSERT INTO market_snapshot(key,payload,updated_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM market_snapshot WHERE key=?)';
 const bindings=old?[p.payload,version,p.key,old.updated_at,old.payload]:[p.key,p.payload,version,p.key],result=await db.prepare(sql).bind(...bindings).run();
 if(!result.success||result.meta.changes!==1)throw Error('Reported point CAS uncertain; read without retry');
 const actual=await read(db);if(actual?.payload!==p.payload||actual.updated_at!==version)throw Error('Reported point readback uncertain');return {...report,writes:1,exactReadback:true};
}
export async function proveReportedPoint({db,candidateBytes,registry,approved,now=Date.now()}){
 const p=prepareReportedSnapshot({candidateBytes,registry,approved,now}),actual=await read(db);
 if(!actual||actual.payload!==p.payload||reportedHash(actual.payload)!==p.payloadSha256||!Number.isFinite(Date.parse(actual.updated_at))||Date.parse(actual.updated_at)>now)throw Error('Exact independently reviewed reported point absent');
 return {schema:'verified-reported-common-publication-v1',entry:{key:p.key,version:actual.updated_at,verifiedAt:new Date(now).toISOString(),payloadSha256:p.payloadSha256,candidateSha256:p.candidateSha256,sourceBundleSha256:registry.sourceBundleSha256,sourceReviewSha256:registry.sourceReviewSha256,preparedReading:p.preparedReading}};
}
export async function restoreReportedPoint({db,backup,approval,recoveryPath,dryRun=true,now=Date.now()}){
 const current=await read(db);
 if(!Number.isFinite(now)||!backup||backup.key!==REPORTED_POINT_KEY||!approval||approval.backupSha256!==reportedHash(backup)||!/^[a-f0-9]{64}$/.test(approval.reviewSha256??'')||current?.payload!==backup.newPayload||current?.updated_at!==backup.version||reportedHash(current.payload)!==backup.newHash||backup.prior&&(reportedHash(backup.prior.payload)!==backup.oldHash||!Number.isFinite(Date.parse(backup.prior.updated_at))))throw Error('Exact separately reviewed recovery required');
 if(dryRun)return {dryRun:true,writes:0};if(!recoveryPath||!isAbsolute(recoveryPath))throw Error('Exclusive recovery backup required');
 await writeFile(recoveryPath,JSON.stringify({current,backup}),{flag:'wx',mode:0o600});
 const version=new Date(Math.max(now,Date.parse(current.updated_at)+1)).toISOString(),sql=backup.prior?'UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=? AND updated_at=? AND payload=?':'DELETE FROM market_snapshot WHERE key=? AND updated_at=? AND payload=?';
 const bindings=backup.prior?[backup.prior.payload,version,REPORTED_POINT_KEY,current.updated_at,current.payload]:[REPORTED_POINT_KEY,current.updated_at,current.payload],r=await db.prepare(sql).bind(...bindings).run();
 if(!r.success||r.meta.changes!==1)throw Error('Reported recovery uncertain; inspect without retry');const after=await read(db);
 if(backup.prior?after?.payload!==backup.prior.payload||after?.updated_at!==version:after!==null)throw Error('Reported recovery readback uncertain');return {writes:1,exactReadback:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const a=process.argv.slice(2),get=k=>{const i=a.indexOf(k);if(i<0)return;const v=a[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+k);a.splice(i,2);return v;};
 const file=get('--candidate'),registryFile=get('--registry'),old=get('--expected-old-hash'),expectedNewHash=get('--expected-new-hash'),backup=get('--backup'),out=get('--proof-out'),remote=a.includes('--remote'),dryRun=!a.includes('--write');
 if(!file||!registryFile||out&&!dryRun||a.some(x=>!['--remote','--write'].includes(x))||!out&&(old===undefined||!expectedNewHash)||(await stat(file)).size>1800000||(await stat(registryFile)).size>10000)throw Error('Bounded exact candidate, registry and hashes required');
 const candidateBytes=await readFile(file),registry=JSON.parse(await readFile(registryFile)),lock='/tmp/trendbeak-daily-writer.lock';
 // Reject an unapproved source before requesting any connection or taking a lock.
 prepareReportedSnapshot({candidateBytes,registry});await mkdir(lock,{mode:0o700});let c;
 try{c=await connectD1(remote);const r=out?await proveReportedPoint({db:c.db,candidateBytes,registry}):await writeReportedPoint({db:c.db,candidateBytes,registry,expectedOldHash:old==='absent'?null:old,expectedNewHash,backup,dryRun});if(out)await writeFile(out,JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(r));}
 finally{await c?.close();await rm(lock,{recursive:true});}
}
