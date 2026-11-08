// Explicit local-input migration. No source fetching, table creation or overview writes.
import{readFile,writeFile,stat,mkdir,rm}from'node:fs/promises';
import{pathToFileURL}from'node:url';
import{isAbsolute}from'node:path';
import{connectD1}from'./d1-client.mjs';
import{VALUATIONS}from'./overview-job.mjs';
import{validateEfundsCheckpoint,valuationReading,initializeEfunds}from'./efunds-valuations.mjs';
export async function initializeValuationHistory({db,directory,today,dryRun=true,backup}){
 const candidates=[],prior=[];
 for(const[code]of VALUATIONS){
  const file=`${directory}/valuation-${code}-state.json`;if((await stat(file)).size>350000)throw Error('Checkpoint byte cap');
  const c=validateEfundsCheckpoint(JSON.parse(await readFile(file,'utf8')),today);
  if(c.code!==code||!c.sourceStart||!c.history)throw Error('Verified full-source preparation required');
  const rawFile=`${directory}/${code}.json`;if((await stat(rawFile)).size>8*1024*1024)throw Error('Full-source byte cap');
  const raw=JSON.parse(await readFile(rawFile,'utf8')),canonical=initializeEfunds({code,name:c.name,url:`https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_${code}.json`},raw,c.etag,today).checkpoint;
  if(JSON.stringify(canonical)!==JSON.stringify(c))throw Error('Candidate differs from saved full-source preparation: '+code);
  const key='valuation/'+code,result=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
  if(!result.success||result.results.length!==1)throw Error('Existing valuation key required: '+key);
  const row=result.results[0],old=validateEfundsCheckpoint(JSON.parse(row.payload),today),dates=new Map(c.rows.map(r=>[r[0],r]));
  for(const r of old.rows){const next=dates.get(r[0]);if(!next||r[1]!==next[1]||r[2]!==next[2])throw Error('Source inconsistency at '+code+' '+r[0]);}
  // Preserve established display identity; never change the latest published reading.
  c.name=old.name;for(const r of Object.values(c.history))r.name=old.name;
  if(JSON.stringify(valuationReading(c))!==JSON.stringify(valuationReading(old)))throw Error('Latest reading changed: '+code);
  const payload=JSON.stringify(c);if(Buffer.byteLength(payload)>350000)throw Error('Checkpoint byte cap');
  prior.push({key,...row});candidates.push({key,payload,updated_at:row.updated_at,bytes:Buffer.byteLength(payload),dates:Object.keys(c.history).length});
 }
 const report={dryRun,keys:candidates.length,bytes:candidates.reduce((n,r)=>n+r.bytes,0),rows:candidates.map(({key,bytes,dates})=>({key,bytes,dates})),writes:0};
 if(dryRun)return report;
 if(!backup||!isAbsolute(backup))throw Error('Private absolute backup required');
 await writeFile(backup,JSON.stringify(prior),{mode:0o600,flag:'wx'});
 const stamp=new Date(Math.max(Date.now(),...prior.map(r=>Date.parse(r.updated_at)+1))).toISOString();
 // Materialize the entire CAS guard before any mutation, then publish all twelve
 // existing rows in a single SQLite statement or change none of them.
 const guard=candidates.map(()=>'(key=? AND updated_at=?)').join(' OR '),cases=candidates.map(()=>'WHEN ? THEN ?').join(' ');
 const sql=`WITH approved AS MATERIALIZED (SELECT key FROM market_snapshot WHERE ${guard}) UPDATE market_snapshot SET payload=CASE key ${cases} END,updated_at=? WHERE key IN (SELECT key FROM approved) AND (SELECT COUNT(*) FROM approved)=?`;
 const params=[...candidates.flatMap(r=>[r.key,r.updated_at]),...candidates.flatMap(r=>[r.key,r.payload]),stamp,candidates.length];
 const out=await db.prepare(sql).bind(...params).run();if(!out.success||out.meta.changes!==candidates.length)throw Error('Atomic CAS not confirmed; inspect state before retry');
 return{...report,writes:out.meta.changes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+k);args.splice(i,2);return v;},directory=get('--input'),backup=get('--backup'),today=get('--today')??new Date().toISOString().slice(0,10),remote=args.includes('--remote'),dryRun=!args.includes('--write');
 if(!directory||args.some(a=>!['--remote','--write'].includes(a)))throw Error('Use --input DIR [--today DATE] [--remote] [--write --backup PRIVATE_FILE]');
 const lock='/tmp/trendbeak-daily-writer.lock';await mkdir(lock,{mode:0o700});let c;try{c=await connectD1(remote);console.log(JSON.stringify(await initializeValuationHistory({db:c.db,directory,today,dryRun,backup})));}finally{await c?.close();await rm(lock,{recursive:true});}
}
