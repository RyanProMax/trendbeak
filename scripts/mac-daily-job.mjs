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
 const dates=[report.sourceDate,...Object.values(report.sourceDates??{}).flatMap(value=>typeof value==='object'?Object.values(value):[value])].filter(value=>typeof value==='string');
 return dates.some(date=>date<report.completedSession);
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
  // login or a new grant; its account/email output stays in private logs.
  let authorization;
  try{authorization=await runStep({id:'authorization',args:['node_modules/wrangler/bin/wrangler.js','whoami']},{cwd:root,env,timeoutMs:60000});}
  catch{authorization={code:null,stdout:'',stderr:'Existing authorization check failed'};}
  await writeFile(join(runDirectory,'authorization.stdout.log'),authorization.stdout??'',{mode:0o600,flag:'wx'});
  await writeFile(join(runDirectory,'authorization.stderr.log'),authorization.stderr??'',{mode:0o600,flag:'wx'});
  const identity=authorization.stdout??'',authorizationVerified=authorization.code===0&&!authorization.timedOut&&!authorization.overflow&&!authorization.error&&/logged in with an OAuth Token/i.test(identity)&&new RegExp(`(?<![a-f0-9])${ACCOUNT}(?![a-f0-9])`,'i').test(identity);
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
   const reports=(result.stdout??'').split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
   const lag=reports.some(observationLag),ok=result.code===0&&!result.timedOut&&!result.overflow&&!result.error&&!lag&&!reports.some(report=>report.failures?.length);
   results.push({id:step.id,ok,status:ok?'completed':'failed',exitCode:result.code,signal:result.signal??null,timedOut:!!result.timedOut,outputLimitExceeded:!!result.overflow,observationLag:lag,...(result.error?{error:result.error}:{}),reports});
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
