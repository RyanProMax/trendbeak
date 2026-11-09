import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,stat,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {dailyJobPlan,runMacDailyJob,observationLag,executeStep,ACCOUNT,validateBusinessOutput} from '../scripts/mac-daily-job.mjs';
const at='2026-11-09T13:00:00.000Z';
const success=step=>({code:0,stdout:JSON.stringify({market:step.id.split('-')[0],...(step.id.endsWith('core')?{date:'2026-11-06',upstreamCalls:0}:{completedSession:'2026-11-06',sourceCalls:0,sourceBytes:0,computedRows:0}),skipped:'already_settled',dbWrites:0}),stderr:''});
const oauth={code:0,stdout:`You are logged in with an OAuth Token, associated with private@example.com.\nAccount ${ACCOUNT}\n- d1 (write)`,stderr:''};
const authorized=runStep=>async(step,context)=>{if(step.id==='authorization'){assert.equal(context.timeoutMs,60000);assert.equal(context.env.WRANGLER_WRITE_LOGS,'false');assert.deepEqual(step.args,['node_modules/wrangler/bin/wrangler.js','whoami']);return oauth;}return runStep(step,context);};
async function sandbox(fn){const dir=await mkdtemp(join(tmpdir(),'trendbeak-runner-test-'));try{await fn({logs:join(dir,'logs'),lock:join(dir,'lock')});}finally{await rm(dir,{recursive:true,force:true});}}
test('plan freezes one clock and uses only bounded catch-up and reviewed quarterly append',()=>{
 const plan=dailyJobPlan({at,output:'/private/quarterly'});
 assert.deepEqual(plan.map(x=>x.id),['CN-core','CN-overview','US-core','US-overview','US-quarterly']);
 for(const step of plan){assert.equal(step.args[step.args.indexOf('--at')+1],at);assert.ok(step.args.includes('--remote'));assert.ok(!step.args.includes('--initialize'));}
 for(const step of plan.slice(0,4))assert.ok(step.args.includes('--catch-up'));
 assert.ok(plan[4].args.includes('--write'));
 assert.equal(dailyJobPlan({at,skipQuarterly:true}).length,4);
 assert.throws(()=>dailyJobPlan({at:'bad',skipQuarterly:true}));
});
test('runner serializes independent jobs, retains failure, and creates private durable logs',()=>sandbox(async options=>{
 let active=0;const calls=[];
 const summary=await runMacDailyJob({...options,at,skipQuarterly:true,runStep:authorized(async(step,context)=>{
  assert.equal(active++,0);calls.push(step.id);assert.equal(context.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);assert.equal(context.env.CLOUDFLARE_API_TOKEN,undefined);assert.equal(context.timeoutMs,180000);
  await new Promise(resolve=>setTimeout(resolve,2));active--;return step.id==='CN-core'?{code:1,stdout:'',stderr:'provider denied'}:success(step);
 })});
 assert.equal(summary.ok,false);assert.equal(calls.length,4);assert.equal(summary.results[2].status,'completed');
 assert.equal((await stat(summary.runDirectory)).mode&0o777,0o700);
 assert.equal((await stat(join(summary.runDirectory,'CN-core.stderr.log'))).mode&0o777,0o600);
 assert.equal(await readFile(join(summary.runDirectory,'CN-core.stderr.log'),'utf8'),'provider denied');
 await assert.rejects(stat(options.lock),{code:'ENOENT'});
}));
test('existing lock prevents all children and is never removed by the losing invocation',()=>sandbox(async options=>{
 await mkdir(options.lock);let called=false;
 await assert.rejects(runMacDailyJob({...options,at,runStep:async()=>{called=true;return success(step);}}),{code:'EEXIST'});
 assert.equal(called,false);assert.ok((await stat(options.lock)).isDirectory());
}));
test('quarterly failure is marked before execution and never retried that UTC day',()=>sandbox(async options=>{
 let attempts=0;const runStep=async step=>{if(step.id==='US-quarterly'){attempts++;const marker=JSON.parse(await readFile(join(options.logs,'quarterly-attempt-2026-11-09.json'),'utf8'));assert.equal(marker.status,'started');return {code:1,stdout:'',stderr:'SEC denied'};}return success(step);};
 assert.equal((await runMacDailyJob({...options,at,runStep:authorized(runStep)})).ok,false);
 const second=await runMacDailyJob({...options,at,runStep:authorized(runStep)});assert.equal(attempts,1);assert.equal(second.ok,false);assert.equal(second.results.at(-1).reason,'already_attempted_utc_day');
}));
test('reported stale source dates are failures even when child exits zero',()=>sandbox(async options=>{
 const report={completedSession:'2026-11-06',sourceDates:{indices:'2026-11-06',activity:'2026-11-05',valuations:{HSI:'2026-11-06'}}};
 assert.equal(observationLag(report),true);
 const summary=await runMacDailyJob({...options,at,skipQuarterly:true,runStep:authorized(async()=>({code:0,stdout:JSON.stringify(report),stderr:''}))});
 assert.equal(summary.ok,false);assert.equal(summary.results[0].observationLag,true);
}));
test('child process has a hard timeout without retry',{skip:process.platform==='win32'},async()=>{
 const result=await executeStep({args:['-e','setInterval(()=>{},1000)']},{cwd:process.cwd(),env:process.env,timeoutMs:40});
 assert.equal(result.timedOut,true);assert.notEqual(result.code,0);
});

test('authorization fails closed for expired, wrong-account or non-OAuth identity without leaking output',()=>sandbox(async options=>{
 for(const authorization of [{...oauth,stdout:oauth.stdout.replace('d1 (write)','d1 (read)')},{...oauth,code:1},{...oauth,stdout:oauth.stdout.replace(ACCOUNT,'0'.repeat(32))},{...oauth,stdout:oauth.stdout.replace('OAuth Token','API Token')},{...oauth,timedOut:true}]){
  const calls=[];
  const summary=await runMacDailyJob({...options,at,runStep:async step=>{calls.push(step.id);return authorization;}});
  assert.deepEqual(calls,['authorization']);assert.equal(summary.authorizationVerified,false);assert.equal(summary.ok,false);assert.deepEqual(summary.results,[]);
  assert.doesNotMatch(JSON.stringify(summary),/private@example|OAuth Token/);
  assert.equal((await stat(join(summary.runDirectory,'authorization.json'))).mode&0o777,0o600);
  for(const file of await readdir(summary.runDirectory))assert.doesNotMatch(await readFile(join(summary.runDirectory,file),'utf8'),/private@example|OAuth Token/);
  assert.equal(await readFile(join(summary.runDirectory,'wrangler.log'),'utf8'),'');
 }
}));
const cnValuations=Object.fromEntries(['000300','000905','000016','399001','399006','000922','000688','HSI','HSTECH','000906','000852','399005'].map(code=>[code,'2026-11-06']));
const variants=[];
for(const market of ['CN','US']){
 for(const kind of ['core','overview'])variants.push([{id:`${market}-${kind}`},JSON.parse(success({id:`${market}-${kind}`}).stdout)]);
 variants.push([{id:`${market}-core`},{market,date:'2026-11-06',source:market==='CN'?'baifenwei':'cnn_whit3rabbit',dryRun:false,sentimentChanges:1,dbWrites:2,upstreamCalls:2,instruments:(market==='CN'?['CN/000300.SS']:['US/^IXIC','US/^GSPC','US/NVDA']).map(key=>({key,computedRows:1,snapshotChanged:true}))}]);
 variants.push([{id:`${market}-overview`},{market,completedSession:'2026-11-06',dryRun:false,manualInitialization:false,sourceCalls:1,sourceBytes:10,computedRows:1,dbWrites:2,changedKeys:['overview/'+market],responseBytes:100,sourceDate:'2026-11-06',valuationRows:market==='CN'?12:0,...(market==='CN'?{sourceDates:{indices:'2026-11-06',activity:'2026-11-06',valuations:cnValuations}}:{})}]);
}
variants.push([{id:'US-quarterly'},{checkedAt:at,candidates:0,sourceCalls:1,sourceBytes:100,publication:{writes:0,skipped:'no_new_audited_quarter',sourceCalls:0}}]);
variants.push([{id:'US-quarterly'},{checkedAt:at,candidates:1,sourceCalls:2,sourceBytes:100,publication:{dryRun:false,sourceCalls:0,changedKeys:['valuation/US/XLK'],corrections:[{key:'valuation/US/XLK',oldHash:null,newHash:'a'.repeat(64)}],checkpointBytes:100,writes:1,publicationVersion:at}}]);
test('every actual CLI success variant requires exactly one complete matching business report',()=>{
 for(const [step,report] of variants){
  const text=JSON.stringify(report);
  assert.equal(validateBusinessOutput(step,`Vite diagnostic\n${text}\n`,at).valid,true,step.id);
  for(const bad of ['', '{}','null','[]','42',text+'\n{}',text+'\n{broken',text+'\nnull'])assert.equal(validateBusinessOutput(step,bad,at).valid,false,`${step.id}: ${bad}`);
  for(const key of Object.keys(report)){
   const missing={...report};delete missing[key];
   // Core return contract includes every declared field; optional overview
   // sourceDates exists only for CN, while all other listed fields are required.
   assert.equal(validateBusinessOutput(step,JSON.stringify(missing),at).valid,false,`${step.id} missing ${key}`);
  }
  const bad={...report,...(step.id.endsWith('quarterly')?{checkedAt:'2000-01-01T00:00:00.000Z'}:{market:'XX'})};
  assert.equal(validateBusinessOutput(step,JSON.stringify(bad),at).valid,false);
 }
});
test('empty code-zero business outputs fail closed in the runner',()=>sandbox(async options=>{
 const summary=await runMacDailyJob({...options,at,skipQuarterly:true,runStep:authorized(async()=>({code:0,stdout:'',stderr:''}))});
 assert.equal(summary.ok,false);assert.ok(summary.results.slice(0,4).every(result=>result.reportValid===false));
}));
test('malformed nested dates fail without interrupting independent markets',()=>sandbox(async options=>{
 const calls=[];
 const summary=await runMacDailyJob({...options,at,skipQuarterly:true,runStep:authorized(async step=>{
  calls.push(step.id);
  return step.id==='CN-overview'?{code:0,stdout:JSON.stringify({completedSession:'2026-11-09',sourceDates:{valuations:null}}),stderr:''}:success(step);
 })});
 assert.equal(calls.length,4);assert.equal(summary.results[1].reportValid,false);assert.equal(summary.results[2].ok,true);assert.equal(summary.ok,false);
}));
