// Local coordinator only: existing bounded writers own validation and publication.
import {mkdir,chmod,writeFile,readFile,rm,mkdtemp,open} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export const ACCOUNT='fa5320378df19eb4201884ba77768cf1';
export function dailyJobPlan({at,skipQuarterly=false,output}){
 if(typeof at!=='string'||!at.endsWith('Z')||!Number.isFinite(Date.parse(at)))throw Error('A frozen UTC execution time is required');
 const steps=[];
 for(const market of ['CN','US'])for(const [kind,script] of [['core','daily-sync.mjs'],['overview','overview-job.mjs']])steps.push({id:`${market}-${kind}`,args:[`scripts/${script}`,'--market',market,'--remote','--catch-up','--at',at]});
 if(!skipQuarterly){if(!output?.startsWith('/'))throw Error('Private absolute quarterly output required');steps.push({id:'US-quarterly',args:['scripts/us-etf-quarterly-job.mjs','--remote','--write','--at',at,'--output',output]});}
 return steps;
}
export function observationLag(report){
 if(!report?.completedSession)return false;
 const dates=[report.sourceDate,...Object.values(report.sourceDates??{}).flatMap(value=>value!==null&&typeof value==='object'?Object.values(value):[value])].filter(value=>typeof value==='string');
 return dates.some(date=>date<report.completedSession);
}
const count=value=>Number.isSafeInteger(value)&&value>=0;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const counters=(value,keys)=>keys.every(key=>count(value[key]));
const valuationCodes=['000300','000905','000016','399001','399006','000922','000688','HSI','HSTECH','000906','000852','399005'];
export function validateBusinessOutput(step,stdout,at){
 const reports=[];let malformed=false;
 for(const raw of stdout.split('\n')){
  const line=raw.trim();if(!line)continue;
  try{reports.push(JSON.parse(line));}catch{if(/^[{\[]/.test(line))malformed=true;}
 }
 const r=reports[0],fail=()=>({valid:false,reports});
 if(malformed||reports.length!==1||!object(r))return fail();
 const [market,kind]=step.id.split('-');
 if(kind==='quarterly'){
  if(step.id!=='US-quarterly')return fail();
  const p=r.publication;
  if(r.checkedAt!==at||!counters(r,['candidates','sourceCalls','sourceBytes'])||!object(p)||!counters(p,['writes','sourceCalls']))return fail();
  if('skipped' in p){if(p.skipped!=='no_new_audited_quarter'||p.writes!==0||p.sourceCalls!==0)return fail();}
  else if(p.dryRun!==false||!counters(p,['checkpointBytes'])||!Array.isArray(p.changedKeys)||!p.changedKeys.every(key=>typeof key==='string'&&key.startsWith('valuation/US/'))||!Array.isArray(p.corrections)||p.corrections.length!==p.changedKeys.length||p.writes!==p.changedKeys.length||p.sourceCalls!==0||p.writes>0&&(typeof p.publicationVersion!=='string'||!Number.isFinite(Date.parse(p.publicationVersion))))return fail();
 }else{
  const target=kind==='core'?r.date:r.completedSession;
  if(r.market!==market||!date(target)||Date.parse(target)>Date.parse(at)||!count(r.dbWrites))return fail();
  if('skipped' in r){
   const keys=kind==='core'?['upstreamCalls']:['sourceCalls','sourceBytes','computedRows'];
   if(r.skipped!=='already_settled'||r.dbWrites!==0||!keys.every(key=>r[key]===0))return fail();
  }else if(kind==='core'){
   const keys=market==='CN'?['CN/000300.SS']:['US/^IXIC','US/^GSPC','US/NVDA'];
   if(r.source!==(market==='CN'?'baifenwei':'cnn_whit3rabbit')||r.dryRun!==false||!counters(r,['sentimentChanges','upstreamCalls'])||!Array.isArray(r.instruments)||r.instruments.length!==keys.length||!keys.every(key=>r.instruments.filter(i=>object(i)&&i.key===key&&count(i.computedRows)&&typeof i.snapshotChanged==='boolean').length===1))return fail();
  }else if(kind==='overview'){
   if(r.dryRun!==false||r.manualInitialization!==false||!counters(r,['sourceCalls','sourceBytes','computedRows','responseBytes','valuationRows'])||!date(r.sourceDate)||r.sourceDate>target||!Array.isArray(r.changedKeys)||!r.changedKeys.every(key=>typeof key==='string')||r.failures!==undefined&&(!Array.isArray(r.failures)||r.failures.length>0))return fail();
   if(market==='CN'&&(!object(r.sourceDates)||!date(r.sourceDates.indices)||!date(r.sourceDates.activity)||!object(r.sourceDates.valuations)||r.valuationRows!==12||!valuationCodes.every(code=>date(r.sourceDates.valuations[code]))))return fail();
   if(market==='US'&&r.valuationRows!==0)return fail();
  }else return fail();
 }
 return {valid:true,reports};
}
export function executeStep(step,{cwd,env,timeoutMs=180000}){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,step.args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',bytes=0,timedOut=false,overflow=false,error;
  const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}};
  const timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
  const collect=field=>chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){overflow=true;kill();return;}if(field==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();};
  child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  child.on('error',e=>{error=e.message;});
  child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut,overflow,...(error?{error}:{}),stdout,stderr});});
 });
}
export async function runMacDailyJob({at=new Date().toISOString(),skipQuarterly=false,logs=join(homedir(),'Library','Logs','trendbeak-sync'),lock='/tmp/trendbeak-mac-job.lock',runStep=executeStep}={}){
 // Validate before creating directories or invoking any child. CLI never accepts
 // historical clocks: catch-up chooses the latest settled session itself.
 dailyJobPlan({at,skipQuarterly:true});
 await mkdir(lock,{mode:0o700});
 let runDirectory;
 try{
  await mkdir(logs,{recursive:true,mode:0o700});await chmod(logs,0o700);
  runDirectory=await mkdtemp(join(logs,at.replaceAll(':','-')+'-'));await chmod(runDirectory,0o700);
  const env={...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(runDirectory,'wrangler.log')};
  // Use only the existing Wrangler login, never an inherited API token.
  delete env.CLOUDFLARE_API_TOKEN;delete env.CF_API_TOKEN;delete env.CLOUDFLARE_API_KEY;delete env.CF_API_KEY;
  const privateLog=await open(env.WRANGLER_LOG_PATH,'wx',0o600);await privateLog.close();
  // whoami may refresh the existing OAuth grant in place. It never requests
  // login or a new grant. Suppress Wrangler disk logging and discard identity output.
  let authorization;
  try{authorization=await runStep({id:'authorization',args:['node_modules/wrangler/bin/wrangler.js','whoami']},{cwd:root,env:{...env,WRANGLER_WRITE_LOGS:'false'},timeoutMs:60000});}
  catch{authorization={code:null,stdout:'',stderr:'Existing authorization check failed'};}
  const identity=authorization.stdout??'',d1WriteAllowed=/(?:^|\n)\s*-\s*d1\s*\(write\)/i.test(identity),authorizationVerified=d1WriteAllowed&&authorization.code===0&&!authorization.timedOut&&!authorization.overflow&&!authorization.error&&/logged in with an OAuth Token/i.test(identity)&&new RegExp(`(?<![a-f0-9])${ACCOUNT}(?![a-f0-9])`,'i').test(identity);
  await writeFile(join(runDirectory,'authorization.json'),JSON.stringify({authorizationVerified,d1WriteAllowed,reason:authorizationVerified?'Existing OAuth account verified':'Existing OAuth account could not be verified'})+'\n',{mode:0o600,flag:'wx'});
  if(!authorizationVerified){
   const summary={at,runDirectory,ok:false,authorizationVerified:false,reason:'Existing Wrangler OAuth login and expected account could not be verified; no writers started',results:[]};
   await writeFile(join(runDirectory,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600,flag:'wx'});
   return summary;
  }
  const results=[];
  for(const step of dailyJobPlan({at,skipQuarterly,output:join(runDirectory,'quarterly')})){
   let marker;
   if(step.id==='US-quarterly'){
    marker=join(logs,`quarterly-attempt-${at.slice(0,10)}.json`);
    try{await writeFile(marker,JSON.stringify({at,status:'started',runDirectory})+'\n',{mode:0o600,flag:'wx'});}
    catch(error){if(error.code!=='EEXIST')throw error;const previous=JSON.parse(await readFile(marker,'utf8'));results.push({id:step.id,status:'skipped',reason:'already_attempted_utc_day',previousStatus:previous.status,ok:previous.status==='completed'});continue;}
   }
   let result;
   try{result=await runStep(step,{cwd:root,env,timeoutMs:180000});}
   catch(error){result={code:null,error:error.message,stdout:'',stderr:''};}
   await writeFile(join(runDirectory,step.id+'.stdout.log'),result.stdout??'',{mode:0o600,flag:'wx'});
   await writeFile(join(runDirectory,step.id+'.stderr.log'),result.stderr??'',{mode:0o600,flag:'wx'});
   const {valid:reportValid,reports}=validateBusinessOutput(step,result.stdout??'',at);
   const lag=reports.some(observationLag),ok=reportValid&&result.code===0&&!result.timedOut&&!result.overflow&&!result.error&&!lag&&!reports.some(report=>report.failures?.length);
   results.push({id:step.id,ok,status:ok?'completed':'failed',exitCode:result.code,signal:result.signal??null,timedOut:!!result.timedOut,outputLimitExceeded:!!result.overflow,observationLag:lag,reportValid,...(result.error?{error:result.error}:{}),reports});
   if(marker)await writeFile(marker,JSON.stringify({at,status:ok?'completed':'failed',runDirectory})+'\n',{mode:0o600});
  }
  if(skipQuarterly)results.push({id:'US-quarterly',status:'skipped',reason:'explicit_skip',ok:true});
  const summary={at,runDirectory,authorizationVerified:true,ok:results.every(result=>result.ok),verification:'child_job_results_and_reported_source_dates_only',results};
  await writeFile(join(runDirectory,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600,flag:'wx'});
  return summary;
 }finally{await rm(lock,{recursive:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--skip-quarterly'))throw Error('Usage: node scripts/mac-daily-job.mjs [--skip-quarterly]');
  const prior=process.umask(0o077);
  try{const summary=await runMacDailyJob({skipQuarterly:args.includes('--skip-quarterly')});console.log(JSON.stringify(summary));if(!summary.ok)process.exitCode=1;}finally{process.umask(prior);}
 }catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}
