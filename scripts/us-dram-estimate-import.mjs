import {readFile,writeFile,stat,mkdir,rmdir,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import approval from '../data/us-dram-approved-inputs.json' with {type:'json'};
import codes from '../data/us-dram-assumptions.json' with {type:'json'};
import {DRAM_KEY as key,DRAM_METHOD as method,DRAM_SOURCE as source,canonical,validatePrepared,validateAdmission,validateState,admitted} from '../src/lib/dram-contract.mjs';
import {connectD1} from './d1-client.mjs';
const preparedInputs=new WeakSet(),uncertain=new WeakSet();
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function prepareDRAM(inputFile,sourceRoot,assumptionsFile,sourceBase='.'){
 if(!isAbsolute(inputFile)||!isAbsolute(sourceRoot)||!assumptionsFile||!isAbsolute(assumptionsFile))throw Error('Bounded local input and assumptions required');
 const inputInfo=await stat(inputFile),metadataInfo=await stat(assumptionsFile);
 if(!inputInfo.isFile()||!metadataInfo.isFile()||inputInfo.size>2*1024*1024||metadataInfo.size>1024*1024)throw Error('Bounded local input and assumptions required');
 const raw=await readFile(inputFile),metadata=await readFile(assumptionsFile),input=JSON.parse(raw);
 if(input.datasetKind!=='real_source_bound'||!input.sourceBindings||!Object.keys(input.sourceBindings).length||Object.keys(input.sourceBindings).length>512)throw Error('Real source-bound input required');
 await verifyDRAMSources(sourceRoot,sourceBase,input.sourceBindings);
 const result=JSON.parse(execFileSync('python3',['-I','-B',fileURLToPath(new URL('./prepare-dram-estimate.py',import.meta.url)),inputFile,assumptionsFile,sourceRoot],{encoding:'utf8',timeout:120000,maxBuffer:65536}));
 if(result.inputSha256!==hash(raw)||result.assumptionsSha256!==hash(metadata))throw Error('Preparation identity mismatch');
 validatePrepared(result,codes);
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 preparedInputs.add(result);return freeze(result);
}
export async function verifyDRAMSources(sourceRoot,sourceBase,bindings){
 if(!bindings||!Object.keys(bindings).length||Object.keys(bindings).length>512)throw Error('Source binding count bound');
 if(typeof sourceBase!=='string'||isAbsolute(sourceBase))throw Error('Package-relative source base required');
 const root=await realpath(sourceRoot),base=await realpath(resolve(root,sourceBase));
 if(base!==root&&!base.startsWith(root+sep))throw Error('Source base outside package');
 let sourceBytes=0;
 for(const binding of Object.values(bindings)){
  if(!binding||typeof binding.path!=='string'||!binding.path||isAbsolute(binding.path)||typeof binding.sha256!=='string'||! /^[a-f0-9]{64}$/.test(binding.sha256))throw Error('Invalid source binding');
  const path=await realpath(resolve(base,binding.path)),info=await stat(path);sourceBytes+=info.size;
  if(!path.startsWith(root+sep)||!info.isFile()||info.size>16*1024*1024||sourceBytes>128*1024*1024||hash(await readFile(path))!==binding.sha256)throw Error('Source binding mismatch or byte bound');
 }
 return {bindings:Object.keys(bindings).length,sourceBytes};
}
export async function importDRAM(options){
 if(!preparedInputs.has(options.prepared))throw Error('Use verified offline preparation');
 return persistDRAM({...options,kind:'real_source_bound',approved:approval.entries});
}
// Shared persistence path: production supplies only real reviewed admission;
// tests retain synthetic identity in an isolated database and never use the CLI.
export async function persistDRAM({db,prepared,dryRun=true,backup,now=Date.now(),approved,kind}){
 if(!['real_source_bound','synthetic_algebra_only'].includes(kind)||!Number.isFinite(now))throw Error('Invalid persistence context');
 if(uncertain.has(prepared))throw Error('Uncertain prior write; inspect independently before retry');
 validatePrepared(prepared,codes,kind,new Date(now).toISOString().slice(0,10));validateAdmission(approved,codes,kind);
 const r=prepared.reading,complete=Object.values(r.metrics).some(m=>m.complete);
 const report={dryRun,sourceCalls:0,writes:0,inputSha256:prepared.inputSha256,complete,reading:r};
 if(dryRun)return report;
 if(!complete||!admitted(prepared,approved))throw Error('Reviewed complete metric and exact projection required before publication');
 if(!backup||!isAbsolute(backup))throw Error('Exclusive private backup required');
 const prior=await db.prepare('SELECT CASE WHEN length(CAST(payload AS BLOB))<=65536 THEN payload ELSE NULL END AS payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(key).all();
 if(!prior.success||prior.results.length>1)throw Error('Checkpoint read failed');
 const old=prior.results[0];if(old&&(!old.payload||!Number.isFinite(Date.parse(old.updated_at))))throw Error('Invalid previous checkpoint');
 const state=old?validateState(JSON.parse(old.payload),approved,codes,kind):{source,methodVersion:method,datasetKind:kind,observations:[]};
 const existing=state.observations.find(o=>o.reading.economicDate===r.economicDate);
 if(existing){
  const before=existing.reading;
  if(canonical({...before,metrics:null,assumptions:null})!==canonical({...r,metrics:null,assumptions:null})||before.assumptions.swapCoefficient!==r.assumptions.swapCoefficient||before.assumptions.items.some(item=>!r.assumptions.items.some(next=>canonical(next)===canonical(item))))throw Error('Quarter identity or assumptions revision requires separate review');
  for(const k of ['pb','ps'])if(before.metrics[k].complete&&canonical(before.metrics[k])!==canonical(r.metrics[k]))throw Error('Historical revision requires separate review');
  if(canonical(before)===canonical(r))return {...report,readbackVerified:true};
  state.observations=state.observations.filter(o=>o!==existing);
 }
 state.observations.push(prepared);state.observations.sort((a,b)=>a.reading.economicDate.localeCompare(b.reading.economicDate));
 validateState(state,approved,codes,kind);const payload=canonical(state);
 await writeFile(backup,JSON.stringify({key,...old}),{flag:'wx',mode:0o600});
 const version=new Date(Math.max(now,old?Date.parse(old.updated_at)+1:0)).toISOString();
 try{
  const write=await db.prepare(`INSERT INTO market_snapshot(key,payload,updated_at) SELECT ?,?,? WHERE (? IS NULL AND NOT EXISTS(SELECT 1 FROM market_snapshot WHERE key=?)) OR EXISTS(SELECT 1 FROM market_snapshot WHERE key=? AND payload=? AND updated_at=?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`).bind(key,payload,version,old?.updated_at??null,key,key,old?.payload??null,old?.updated_at??null).run();
  if(!write.success||write.meta.changes!==1)throw Error('CAS publication unconfirmed; inspect before retry');
  const checked=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(key).all();
  if(!checked.success||checked.results.length!==1||checked.results[0]?.payload!==payload||checked.results[0]?.updated_at!==version)throw Error('Readback unconfirmed; inspect before retry');
 }catch(error){uncertain.add(prepared);throw error;}
 return {...report,writes:1,readbackVerified:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),take=k=>{const i=args.indexOf(k);if(i<0)return;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('Missing '+k);args.splice(i,2);return value;};
 const file=take('--file'),root=take('--sources'),assumptions=take('--assumptions'),sourceBase=take('--source-base')??'.',backup=take('--backup');if(!file||!root||!assumptions||args.some(a=>!['--write','--remote'].includes(a)))throw Error('Use --file INPUT --sources SOURCE_ROOT --assumptions REVIEWED_METADATA [--source-base PACKAGE_SUBDIRECTORY] [--write --backup PRIVATE_BACKUP] [--remote]');
 const prepared=await prepareDRAM(file,root,assumptions,sourceBase),dryRun=!args.includes('--write');
 if(dryRun)console.log(JSON.stringify(await importDRAM({prepared,dryRun})));
 else {const lock=join(tmpdir(),'trendbeak-daily-writer.lock');await mkdir(lock,{mode:0o700});let connection;try{connection=await connectD1(args.includes('--remote'));console.log(JSON.stringify(await importDRAM({db:connection.db,prepared,dryRun,backup})));}finally{await connection?.close();await rmdir(lock);}}
}
