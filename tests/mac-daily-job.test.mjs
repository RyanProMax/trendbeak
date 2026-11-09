import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {dailyJobPlan,runMacDailyJob,observationLag,executeStep,ACCOUNT} from '../scripts/mac-daily-job.mjs';
const at='2026-11-09T13:00:00.000Z';
const success={code:0,stdout:'{}\n',stderr:''};
const oauth={code:0,stdout:`You are logged in with an OAuth Token, associated with private@example.com.\nAccount ${ACCOUNT}`,stderr:''};
const authorized=runStep=>async(step,context)=>{if(step.id==='authorization'){assert.equal(context.timeoutMs,60000);assert.deepEqual(step.args,['node_modules/wrangler/bin/wrangler.js','whoami']);return oauth;}return runStep(step,context);};
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
  await new Promise(resolve=>setTimeout(resolve,2));active--;return step.id==='CN-core'?{code:1,stdout:'',stderr:'provider denied'}:success;
 })});
 assert.equal(summary.ok,false);assert.equal(calls.length,4);assert.equal(summary.results[2].status,'completed');
 assert.equal((await stat(summary.runDirectory)).mode&0o777,0o700);
 assert.equal((await stat(join(summary.runDirectory,'CN-core.stderr.log'))).mode&0o777,0o600);
 assert.equal(await readFile(join(summary.runDirectory,'CN-core.stderr.log'),'utf8'),'provider denied');
 await assert.rejects(stat(options.lock),{code:'ENOENT'});
}));
test('existing lock prevents all children and is never removed by the losing invocation',()=>sandbox(async options=>{
 await mkdir(options.lock);let called=false;
 await assert.rejects(runMacDailyJob({...options,at,runStep:async()=>{called=true;return success;}}),{code:'EEXIST'});
 assert.equal(called,false);assert.ok((await stat(options.lock)).isDirectory());
}));
test('quarterly failure is marked before execution and never retried that UTC day',()=>sandbox(async options=>{
 let attempts=0;const runStep=async step=>{if(step.id==='US-quarterly'){attempts++;const marker=JSON.parse(await readFile(join(options.logs,'quarterly-attempt-2026-11-09.json'),'utf8'));assert.equal(marker.status,'started');return {code:1,stdout:'',stderr:'SEC denied'};}return success;};
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
 for(const authorization of [{...oauth,code:1},{...oauth,stdout:oauth.stdout.replace(ACCOUNT,'0'.repeat(32))},{...oauth,stdout:oauth.stdout.replace('OAuth Token','API Token')},{...oauth,timedOut:true}]){
  const calls=[];
  const summary=await runMacDailyJob({...options,at,runStep:async step=>{calls.push(step.id);return authorization;}});
  assert.deepEqual(calls,['authorization']);assert.equal(summary.authorizationVerified,false);assert.equal(summary.ok,false);assert.deepEqual(summary.results,[]);
  assert.doesNotMatch(JSON.stringify(summary),/private@example|OAuth Token/);
  assert.equal((await stat(join(summary.runDirectory,'authorization.stdout.log'))).mode&0o777,0o600);
 }
}));
