// Explicit controlled writer. No schedules, upstream fetching or historical keys.
import{readFile,writeFile,stat,mkdir,rm}from'node:fs/promises';import{isAbsolute}from'node:path';import{pathToFileURL}from'node:url';
import approved from'../data/us-etf-current-approved-inputs.json' with {type:'json'};
import rollbackApprovals from'../data/us-etf-current-approved-rollbacks.json' with {type:'json'};
import{currentBasketHash}from'./us-etf-current-basket.mjs';
import{prepareCurrentSnapshot,planCurrentSnapshotWrite,planCurrentSnapshotRollback,CURRENT_BASKET_KEY}from'./us-etf-current-snapshot.mjs';
import{connectD1}from'./d1-client.mjs';
/** `allowlist` injection is for independently reviewed program callers/tests.
 * CLI only imports the fixed repository file; there is no --approval option.
 */
export async function writeCurrentBasket({db,input,registry,allowlist=approved,now=Date.now(),dryRun=true,expectedOldHash,expectedNewHash,backup}){
 const prepared=prepareCurrentSnapshot({input,registry,approved:allowlist,now});
 const result=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(CURRENT_BASKET_KEY).all();
 if(!result.success||result.results.length>1)throw Error('Current baseline read failed');
 const current=result.results[0]??null;
 const plan=planCurrentSnapshotWrite({prepared,current,expectedOldHash,expectedNewHash:dryRun?(expectedNewHash??prepared.payloadSha256):expectedNewHash,now});
 const report={key:CURRENT_BASKET_KEY,dryRun,noop:plan.noop,inputSha256:prepared.inputSha256,registrySha256:prepared.registrySha256,newHash:prepared.payloadSha256,preparedReadingSha256:prepared.preparedReadingSha256,version:plan.version,writes:0,sourceCalls:0};
 if(dryRun||plan.noop)return report;
 if(!backup||!isAbsolute(backup))throw Error('Exclusive absolute backup required');
 await writeFile(backup,JSON.stringify({key:CURRENT_BASKET_KEY,prior:current,oldHash:expectedOldHash,newHash:prepared.payloadSha256,newPayload:prepared.payload,version:plan.version}),{flag:'wx',mode:0o600});
 const out=await db.prepare(plan.sql).bind(...plan.bindings).run();
 if(!out.success||out.meta.changes!==1)throw Error('Current CAS not confirmed; read current key before any retry');
 const check=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(CURRENT_BASKET_KEY).all();
 if(!check.success||check.results.length!==1||check.results[0].payload!==prepared.payload||check.results[0].updated_at!==plan.version)throw Error('Current write readback uncertain; inspect before retry or approval');
 return{...report,writes:1,exactReadback:true};
}
export async function restoreCurrentBasket({db,prior,allowlist=rollbackApprovals,now=Date.now(),dryRun=true,backup}){
 const approvedRollback=allowlist.find(p=>p.backupSha256===currentBasketHash(prior)&&p.version===prior.version);
 if(!approvedRollback)throw Error('Separately approved exact rollback absent');
 const read=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(CURRENT_BASKET_KEY).all();
 if(!read.success||read.results.length!==1)throw Error('Current rollback baseline absent or uncertain');
 const current=read.results[0],plan=planCurrentSnapshotRollback({backup:prior,current,approvedRollback,now});
 const report={key:CURRENT_BASKET_KEY,dryRun,writes:0,restoresAbsence:plan.restoresAbsence,version:plan.version??null};if(dryRun)return report;
 if(!backup||!isAbsolute(backup))throw Error('Exclusive rollback recovery backup required');
 await writeFile(backup,JSON.stringify({key:CURRENT_BASKET_KEY,current,prior}),{flag:'wx',mode:0o600});
 const out=await db.prepare(plan.sql).bind(...plan.bindings).run();if(!out.success||out.meta.changes!==1)throw Error('Rollback uncertain; inspect before retry');
 const check=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(CURRENT_BASKET_KEY).all();
 if(!check.success||(plan.restoresAbsence?check.results.length!==0:check.results.length!==1||check.results[0].payload!==prior.prior.payload||check.results[0].updated_at!==plan.version))throw Error('Rollback readback uncertain');
 return{...report,writes:1,exactReadback:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+k);args.splice(i,2);return v;};
 const file=get('--file'),registryFile=get('--registry'),backup=get('--backup'),old=get('--expected-old-hash'),expectedNewHash=get('--expected-new-hash'),remote=args.includes('--remote'),dryRun=!args.includes('--write');
 if(!file||!registryFile||old===undefined||args.some(a=>!['--remote','--write'].includes(a)))throw Error('Use --file INPUT --registry REGISTRY --expected-old-hash HASH|absent [--expected-new-hash HASH --backup PATH --write] [--remote]');
 if((await stat(file)).size>2_000_000||(await stat(registryFile)).size>500_000)throw Error('Bounded input and registry required');
 const input=JSON.parse(await readFile(file,'utf8')),registry=JSON.parse(await readFile(registryFile,'utf8')),lock='/tmp/trendbeak-daily-writer.lock';await mkdir(lock,{mode:0o700});let connection;
 try{connection=await connectD1(remote);console.log(JSON.stringify(await writeCurrentBasket({db:connection.db,input,registry,now:Date.now(),dryRun,expectedOldHash:old==='absent'?null:old,expectedNewHash,backup})));}
 finally{await connection?.close();await rm(lock,{recursive:true});}
}
