// Explicit reviewed correction of one existing latest ETF observation. Never a
// backfill, source acquisition, threshold override or unguarded replacement.
import {readFile,writeFile,stat,mkdir,rm} from 'node:fs/promises';
import {isAbsolute} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {calculateETF,METHOD} from './us-etf-valuations.mjs';import {connectD1} from './d1-client.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
async function prepareRepair({db,input,expectedOldHash,expectedNewHash,now,dryRun}){
 if(!Number.isFinite(now))throw Error('Invalid repair clock');
 const result=calculateETF(input);
 if(Date.parse(input.cutoff)>now||Date.parse(input.availableAt??input.cutoff)>now||Date.parse(input.sourceComparison?.observedAt)>now)throw Error('Future observation');
 if(!dryRun&&(!/^[a-f0-9]{64}$/.test(expectedOldHash??'')||!/^[a-f0-9]{64}$/.test(expectedNewHash??'')))throw Error('Exact reviewed old and new payload hashes required');
 const key='valuation/US/'+input.code,read=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
 if(!read.success||read.results.length!==1)throw Error('Existing ETF checkpoint required for repair');
 const row=read.results[0],old=JSON.parse(row.payload),oldHash=hash(row.payload);
 if(old.source!=='self_us_etf'||old.code!==input.code||old.methodVersion!==METHOD||!old.history?.[input.date]||!old.provenance?.[input.date]||old.latest?.input?.date!==input.date||Object.keys(old.history).length>366||Object.keys(old.history).sort().at(-1)!==input.date||!Number.isFinite(Date.parse(row.updated_at)))throw Error('Repair must target the existing latest prepared observation');
 const {sources,...consumed}=input;
 const next={...old,history:{...old.history,[input.date]:result.reading},provenance:{...old.provenance,[input.date]:sources},latest:{input:consumed,quality:result.quality}};
 const payload=JSON.stringify(next),newHash=hash(payload);
 if(Buffer.byteLength(payload)>1_500_000)throw Error('ETF checkpoint exceeds byte budget');
 if(expectedOldHash!==undefined&&expectedOldHash!==oldHash)throw Error('Existing ETF payload hash changed; repair refused');
 if(expectedNewHash!==undefined&&expectedNewHash!==newHash)throw Error('New ETF payload differs from reviewed repair hash');
 const report={dryRun,key,date:input.date,oldHash,newHash,oldValues:{pb:old.history[input.date].pb.value,ps:old.history[input.date].ps.value},newValues:{pb:result.reading.pb.value,ps:result.reading.ps.value},sourceCalls:0,writes:0};
 return {key,row,payload,report};
}
export async function repairETFValuations({db,repairs,now=Date.now(),dryRun=true,backup}){
 if(!Array.isArray(repairs)||!repairs.length||repairs.length>11||new Set(repairs.map(r=>r.input?.code)).size!==repairs.length)throw Error('One to eleven distinct reviewed ETF repairs required');
 const all=[];for(const repair of repairs)all.push(await prepareRepair({db,...repair,now,dryRun}));
 const changed=all.filter(p=>p.report.oldHash!==p.report.newHash),report={dryRun,corrections:all.map(p=>p.report),sourceCalls:0,writes:0};
 if(dryRun||!changed.length)return report;
 if(!backup||!isAbsolute(backup))throw Error('Exclusive private absolute backup required');
 await writeFile(backup,JSON.stringify(changed.map(p=>({key:p.key,...p.row,repair:{oldHash:p.report.oldHash,newHash:p.report.newHash}}))),{mode:0o600,flag:'wx'});
 const stamp=new Date(Math.max(now,...changed.map(p=>Date.parse(p.row.updated_at)+1))).toISOString();
 const sql=`WITH incoming(key,payload,version,previous_payload) AS (VALUES ${changed.map(()=>'(?,?,?,?)').join(',')}), approved AS MATERIALIZED (SELECT COUNT(*) AS n FROM incoming i JOIN market_snapshot s ON s.key=i.key AND s.updated_at=i.version AND s.payload=i.previous_payload) INSERT INTO market_snapshot(key,payload,updated_at) SELECT key,payload,? FROM incoming WHERE (SELECT n FROM approved)=? ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`;
 const out=await db.prepare(sql).bind(...changed.flatMap(p=>[p.key,p.payload,p.row.updated_at,p.row.payload]),stamp,changed.length).run();
 if(!out.success||out.meta.changes!==changed.length)throw Error('Atomic ETF repair not confirmed; inspect current state before retry');
 return{...report,writes:out.meta.changes,publicationVersion:stamp};
}
export async function repairETFValuation(options){
 const result=await repairETFValuations({...options,repairs:[{input:options.input,expectedOldHash:options.expectedOldHash,expectedNewHash:options.expectedNewHash}]});
 return{...result.corrections[0],writes:result.writes,...(result.publicationVersion?{publicationVersion:result.publicationVersion}:{})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),option=key=>{const i=args.indexOf(key);if(i<0)return;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+key);args.splice(i,2);return v;};
 const file=option('--file'),batch=args.includes('--batch'),backup=option('--backup'),expectedOldHash=option('--expected-old-hash'),expectedNewHash=option('--expected-new-hash'),remote=args.includes('--remote'),dryRun=!args.includes('--write');
 if(!file||batch&&(expectedOldHash||expectedNewHash)||args.some(a=>!['--remote','--write','--batch'].includes(a)))throw Error('Use --file REVIEWED_INPUT [--batch] [--remote] [--write --backup PRIVATE_BACKUP --expected-old-hash HASH --expected-new-hash HASH]');
 if((await stat(file)).size>(batch?12_000_000:2_000_000))throw Error('Repair input byte budget exceeded');
 const input=JSON.parse(await readFile(file,'utf8')),lock='/tmp/trendbeak-daily-writer.lock';await mkdir(lock,{mode:0o700});let connection;
 try{connection=await connectD1(remote);console.log(JSON.stringify(batch?await repairETFValuations({db:connection.db,repairs:input,backup,dryRun}):await repairETFValuation({db:connection.db,input,backup,expectedOldHash,expectedNewHash,dryRun})));}
 finally{await connection?.close();await rm(lock,{recursive:true});}
}
