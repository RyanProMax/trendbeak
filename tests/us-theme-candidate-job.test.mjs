import test,{after}from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm,readFile,writeFile,stat,mkdir,readdir,copyFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
// Generic collector behavior uses an isolated, entirely synthetic permission/data fixture.
// This never changes the real rights policy, invokes the CLI, or makes network requests.
const fixtureRoot=await mkdtemp(join(tmpdir(),'collector-unit-fixture-'));after(()=>rm(fixtureRoot,{recursive:true,force:true}));await mkdir(join(fixtureRoot,'scripts'));await mkdir(join(fixtureRoot,'data'));
for(const name of ['us-theme-candidate-job.mjs','us-theme-official-valuations.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),join(fixtureRoot,'scripts',name));
const fixturePolicy=JSON.parse(await readFile(new URL('../data/us-theme-official-sources.json',import.meta.url),'utf8'));fixturePolicy.series.push({code:'STXWSML',sources:[{values:[['2026-09-30',7.6,4.3]]}]});await writeFile(join(fixtureRoot,'data/us-theme-official-sources.json'),JSON.stringify(fixturePolicy));await writeFile(join(fixtureRoot,'data/us-theme-rights.json'),JSON.stringify({schema:'synthetic-offline-test-only',holds:{}}));
const{CANDIDATE_SCHEMA,SOURCES,MAX_CLOCK_AGE_MS,MIN_REQUEST_GAP_MS,planThemeCandidates,runThemeCandidateJob,validCandidateReport,assessCPQPDF}=await import(pathToFileURL(join(fixtureRoot,'scripts/us-theme-candidate-job.mjs')).href);
import{pathToFileURL}from'node:url';
import{dailyJobPlan,validateBusinessOutput}from'../scripts/mac-daily-job.mjs';
const at='2027-01-05T10:00:00.000Z',empty=()=>({schema:CANDIDATE_SCHEMA,families:{}}),url=SOURCES.STXWSML.html;
const headers=['Index','Price/earnings incl. negative','Price/earnings excl. negative','Price/book','Dividend yield (%) 3','Price/sales','Price/cash flow','','Trailing','Projected','Trailing','Projected','Trailing','Trailing','Trailing'];
const stx=(d='December 31, 2026',pb='10.0',ps='8.8')=>`<link rel="canonical" href="https://stoxx.com/index/stxwsml/"><meta property="og:title" content="STOXX (STXWSML) (CH1546182069)"><p>(USD, Price), all data as of ${d}</p><h3>Fundamentals</h3><table><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr><tr>${['STOXX Global Memory Semiconductors','20.0','19.0','30.0','25.0',pb,'2.0',ps,'5.0'].map(v=>`<td>${v}</td>`).join('')}</tr></table>`;
const cpq=(d='12/31/2026',pb='12.15')=>`<link rel="canonical" href="${SOURCES.CPQ.html}"><section id="Index"><h2>Index</h2><p>ISE CTA Cloud Computing Index</p><p id="index-asOfDate">as of ${d}</p><li><span>Price/Book Ratio</span><span>${pb}</span></li><li><span>Total Number of Holdings</span><span>65</span></li></section>`;
const pdf=Buffer.from('%PDF-1.7\nunknown new document requiring visual review\n%%EOF');
const response=s=>new Response(s,{headers:{'content-type':'text/html','etag':'public-etag','last-modified':'public-time','set-cookie':'secret-session','authorization':'secret-token','x-secret':'private'}});
async function box(fn){const root=await mkdtemp(join(tmpdir(),'theme-candidates-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const run=(root,read,time=at)=>{let now=Date.parse(time);return runThemeCandidateJob({root,at:time,read,clock:()=>now,pause:async ms=>{now+=ms;}});};
const fullRead=async u=>response(u===url?stx():u===SOURCES.CPQ.html?cpq():pdf);
test('fixed latest-source URLs only; period and calendar-window planning has zero network',()=>{
 assert.deepEqual(Object.values(SOURCES).flatMap(s=>[s.html,...(s.pdf?[s.pdf]:[])]),[url,'https://www.proshares.com/our-etfs/leveraged-and-inverse/skyu','https://www.proshares.com/globalassets/proshares/fact-sheet/prosharesfactsheetskyu.pdf']);
 const p=planThemeCandidates(empty(),'2026-11-10T10:00:00.000Z');assert.equal(p[0].due,true);assert.equal(p[1].reason,'no_new_closed_period');assert.equal(planThemeCandidates(empty(),at).filter(x=>x.due).length,2);
 for(const time of ['bad','2027-01-05T10:00:00Z',null])assert.throws(()=>planThemeCandidates(empty(),time));
});
test('unknown source evidence is saved privately as unapproved candidates, with no production channel',()=>box(async root=>{
 const calls=[];const report=await run(root,async(u,options)=>{calls.push(u);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert(!('Authorization'in options.headers));return fullRead(u);});
 assert.equal(calls.length,3);assert.equal(report.candidates,2);assert.equal(report.productionWrites,0);assert.equal(report.sourceApprovalsAdded,0);assert(validCandidateReport(report,at));assert.equal(report.families[1].crosscheck,'visual_review_required');
 const candidate=JSON.parse(await readFile(join(report.runDirectory,'CPQ-candidate.json')));assert.equal(candidate.publicationEligible,false);assert.equal(candidate.pbPercentile,null);assert.equal(candidate.psPercentile,null);assert.equal(candidate.crosscheck.requiredChecks.date,'2026-12-31');assert.equal(candidate.crosscheck.requiredChecks.pb,12.15);assert.equal(candidate.originalPublicationAt,null);
 for(const e of candidate.evidence){assert.equal((await stat(e.path)).mode&0o777,0o600);assert.deepEqual(Object.keys(e.headers),['content-type','etag','last-modified']);assert(!JSON.stringify(e).includes('secret'));}
 assert.equal((await stat(join(root,'official-theme-candidates-state.json'))).mode&0o777,0o600);
 const next=await run(root,async()=>{throw Error('must not request');},'2027-01-20T10:00:00.000Z');assert.equal(next.sourceCalls,0);assert.equal(next.candidates,0);assert(next.families.every(f=>f.status==='not_due'));
}));
test('late publications get bounded later windows, same-date unchanged values create no sample',()=>box(async root=>{
 const stale=async u=>response(u===url?stx('September 30, 2026','7.6','4.3'):u===SOURCES.CPQ.html?cpq('9/30/2026','11.15'):pdf);
 const a=await run(root,stale);assert.equal(a.candidates,0);assert(a.families.every(f=>f.status==='unchanged'));
 const b=await run(root,async()=>{throw Error('no request');},'2027-01-06T10:00:00.000Z');assert.equal(b.sourceCalls,0);
 const c=await run(root,stale,'2027-01-16T10:00:00.000Z');assert.equal(c.sourceCalls,1);assert.equal(c.candidates,0);
 const d=await run(root,fullRead,'2027-02-01T10:00:00.000Z');assert.equal(d.sourceCalls,3);assert.equal(d.candidates,2);
 const e=await run(root,async u=>{assert.equal(u,url);return response(stx());},'2027-02-16T10:00:00.000Z');assert.equal(e.sourceCalls,1);assert.equal(e.candidates,0); // January not yet reported; February second window remains available.
}));
test('403/429 and redirects become persistent holds without retry or CPQ alternate request',()=>box(async root=>{
 for(const [label,status]of [['forbidden',403],['rate',429],['redirect',302]]){const dir=join(root,label),calls=[];const a=await run(dir,async u=>{calls.push(u);return new Response('',{status});});assert.equal(calls.length,2);assert.equal(a.sourceCalls,2);assert.equal(a.failures.length,2);assert(!calls.includes(SOURCES.CPQ.pdf));
  const b=await run(dir,async()=>{throw Error('forbidden retry');},'2027-04-16T10:00:00.000Z');assert.equal(b.sourceCalls,0);assert.equal(b.failures.length,2);
 }
}));
test('one failed family never prevents the other independent source candidate',()=>box(async root=>{
 const r=await run(root,async u=>u===url?new Response('',{status:403}):fullRead(u));assert.equal(r.sourceCalls,3);assert.equal(r.failures.length,1);assert.equal(r.candidates,1);assert.equal(r.families.find(x=>x.code==='CPQ').status,'pending_review');
}));
test('field/variant drift, nonpositive values, regression and future dates retain originals and hold source',()=>box(async root=>{
 const cases=[stx().replace('USD, Price','EUR, Price'),stx().replace('Price/sales','EV/Sales'),stx('December 31, 2026','0.0'),stx('December 31, 2026','9'.repeat(400)+'.0'),stx('August 31, 2026','7.6','4.3'),stx('September 30, 2026','7.7','4.3'),stx('February 28, 2027')];
 for(let i=0;i<cases.length;i++){const dir=join(root,String(i)),r=await run(dir,async u=>u===url?response(cases[i]):fullRead(u));assert.equal(r.families[0].status,'blocked');assert.equal((await readFile(join(r.runDirectory,'STXWSML.html'),'utf8')),cases[i]);assert.equal(r.candidates,1);}
}));
test('oversized, streaming, network, content and malformed PDF failures are bounded and held',()=>box(async root=>{
 const readers=[async()=>new Response('x',{headers:{'content-length':String(5*1024*1024)}}),async()=>response('x'.repeat(2*1024*1024+1)),async()=>{throw Error('external opaque error');},async u=>u===url?response(stx()):u===SOURCES.CPQ.html?response(cpq()):response('not a PDF')];
 for(let i=0;i<readers.length;i++){const r=await run(join(root,String(i)),readers[i]);assert(r.failures.length>=1);assert(r.sourceCalls<=3);assert.equal(r.productionWrites,0);assert(!JSON.stringify(r).includes('opaque'));}
 assert.throws(()=>assessCPQPDF(Buffer.from('%PDF-1.7 no eof'),{date:'2026-12-31',pb:12.15,ps:null}),/pdf/);
}));
test('interrupted attempt and malformed/future local state never trigger new requests',()=>box(async root=>{
 const state=empty();state.families.STXWSML={attemptAt:at,slot:'2027-01-first',status:'started',lastObservation:{date:'2026-09-30',pb:7.6,ps:4.3},reason:null};await writeFile(join(root,'official-theme-candidates-state.json'),JSON.stringify(state));
 const r=await run(root,async u=>{assert.notEqual(u,url);return fullRead(u);});assert.equal(r.families[0].reason,'interrupted_attempt_requires_review');assert.equal(r.sourceCalls,2);
 state.families.STXWSML.attemptAt='2028-01-01T00:00:00.000Z';await writeFile(join(root,'official-theme-candidates-state.json'),JSON.stringify(state));let calls=0;await assert.rejects(()=>run(root,async()=>{calls++;}),/state/);assert.equal(calls,0);
}));
test('an existing candidate lock is never removed by another invocation',()=>box(async root=>{
 const lock=join(root,'official-theme-candidates.lock');await mkdir(lock);await assert.rejects(()=>run(root,fullRead),{code:'EEXIST'});assert((await stat(lock)).isDirectory());
}));
test('explicit frozen acquisition clock cannot drift, be nonfinite or look ahead',()=>box(async root=>{
 for(const value of [NaN,Infinity,Date.parse(at)-1,Date.parse(at)+MAX_CLOCK_AGE_MS+1]){let calls=0;await assert.rejects(()=>runThemeCandidateJob({root:join(root,String(value)),at,read:async()=>{calls++;return fullRead(url);},clock:()=>value}),/clock/);assert.equal(calls,0);}
 let delayedNow=Date.parse(at)+1005000;const delayed=await runThemeCandidateJob({root:join(root,'serial-delay'),at,read:fullRead,clock:()=>delayedNow,pause:async ms=>{delayedNow+=ms;}});assert.equal(delayed.candidates,2);assert.equal(delayed.sourceCalls,3);assert(validCandidateReport(delayed,at));
}));
test('Mac integration can be explicitly disabled, is isolated to existing job result and cannot self-claim publication',()=>box(async root=>{
 assert.equal(dailyJobPlan({at,skipQuarterly:true,themeCandidates:false}).length,4);const plan=dailyJobPlan({at,skipQuarterly:true,themeCandidates:true,candidateOutput:root}),step=plan.at(-1);assert.equal(step.id,'US-theme-candidates');assert(step.args.includes('--collect'));assert(!step.args.includes('--remote'));assert(!step.args.includes('--write'));
 const report=await run(root,fullRead);assert(validateBusinessOutput(step,JSON.stringify(report),at).valid);
 for(const change of [r=>r.productionWrites=1,r=>r.sourceApprovalsAdded=1,r=>r.sourceCalls=4,r=>r.candidates=3,r=>r.families[0].sourceDate='2099-01-01',r=>r.families[0].publicationEligible=true,r=>r.schema='approved',r=>r.families.pop()]){const bad=structuredClone(report);change(bad);assert.equal(validateBusinessOutput(step,JSON.stringify(bad),at).valid,false);}
}));


test('four daily invocations do not exceed 4 requests/month or 12/quarter while reports remain late',()=>{
 const state=empty(),perMonth={},perQuarter={};let total=0;
 for(let day=Date.parse('2027-01-01T00:00:00Z');day<Date.parse('2028-01-01T00:00:00Z');day+=86400000)for(const hour of [4,7,15,22]){
  const time=new Date(day+hour*3600000).toISOString();for(const p of planThemeCandidates(state,time))if(p.due){const n=p.code==='CPQ'?2:1,month=time.slice(0,7),quarter=time.slice(0,4)+'Q'+Math.ceil(Number(time.slice(5,7))/3);total+=n;perMonth[month]=(perMonth[month]??0)+n;perQuarter[quarter]=(perQuarter[quarter]??0)+n;state.families[p.code]={attemptAt:time,slot:p.slot,status:'complete',lastObservation:p.baseline,reason:null};}
 }
 assert.equal(total,48);assert(Object.values(perMonth).every(n=>n===4));assert(Object.values(perQuarter).every(n=>n===12));
});


test('persistent failures retain exact allowlisted request identity, UTC and status without response secrets',()=>box(async root=>{
 const cases=[
  {name:'first-stx-403',code:'STXWSML',url,read:async u=>u===url?new Response('private-error-body',{status:403,headers:{'set-cookie':'secret-cookie'}}):fullRead(u),reason:'access_403',status:403},
  {name:'cpq-html-403',code:'CPQ',url:SOURCES.CPQ.html,read:async u=>u===SOURCES.CPQ.html?new Response('private-error-body',{status:403}):fullRead(u),reason:'access_403',status:403},
  {name:'cpq-second-pdf-403',code:'CPQ',url:SOURCES.CPQ.pdf,read:async u=>u===SOURCES.CPQ.pdf?new Response('private-error-body',{status:403}):fullRead(u),reason:'access_403',status:403},
  {name:'unauthorized',code:'STXWSML',url,read:async u=>u===url?new Response('private-error-body',{status:401}):fullRead(u),reason:'access_401',status:401},
  {name:'timeout',code:'STXWSML',url,read:async u=>{if(u===url)throw new DOMException('secret-timeout-message','TimeoutError');return fullRead(u);},reason:'request_timeout',status:null},
  {name:'redirect-status',code:'STXWSML',url,read:async u=>u===url?new Response('private-error-body',{status:302,headers:{location:'https://not-allowed.invalid/?token=secret'}}):fullRead(u),reason:'redirect_refused',status:302},
  {name:'redirect-fetch-error',code:'STXWSML',url,read:async u=>{if(u===url)throw new TypeError('secret redirect detail');return fullRead(u);},reason:'network_or_redirect_failure',status:null},
 ];
 for(const c of cases){let tick=0;const dir=join(root,c.name),r=await runThemeCandidateJob({root:dir,at,read:c.read,clock:()=>Date.parse(at)+tick++,pause:async ms=>{tick+=ms;}}),held=JSON.parse(await readFile(join(r.runDirectory,c.code+'-hold.json'))),state=JSON.parse(await readFile(join(dir,'official-theme-candidates-state.json')));
  assert.equal(held.attemptedUrl,c.url);assert.equal(held.method,'GET');assert.equal(held.httpStatus,c.status);assert.equal(held.reason,c.reason);assert(Date.parse(held.requestedAt)>=Date.parse(at));assert(Date.parse(held.failedAt)>=Date.parse(held.requestedAt));assert.deepEqual(state.families[c.code].lastFailure,r.failures.find(f=>f.code===c.code)&&Object.fromEntries(Object.entries(r.failures.find(f=>f.code===c.code)).filter(([k])=>k!=='code')));
  assert(!JSON.stringify(held).includes('private-error-body'));assert(!JSON.stringify(held).includes('secret'));
  const calls=[],again=await run(dir,async u=>{calls.push(u);return fullRead(u);},'2027-04-16T10:00:00.000Z');assert(!calls.some(u=>[SOURCES[c.code].html,SOURCES[c.code].pdf].includes(u)));const failure=again.failures.find(f=>f.code===c.code);assert.equal(failure.attemptedUrl,c.url);assert.equal(failure.httpStatus,c.status);assert.equal(failure.reason,c.reason);assert.equal(failure.failedAt,held.failedAt);
  state.families[c.code].lastFailure.attemptedUrl='https://unapproved.invalid/?token=secret';await writeFile(join(dir,'official-theme-candidates-state.json'),JSON.stringify(state));let attempted=0;await assert.rejects(()=>run(dir,async()=>{attempted++;},'2027-04-17T10:00:00.000Z'),/state/);assert.equal(attempted,0);
 }
}));


test('all actual requests are separated by at least 1.2 seconds after the prior request finishes',()=>box(async root=>{
 let now=Date.parse(at);const events=[],r=await runThemeCandidateJob({root,at,clock:()=>now,pause:async ms=>{assert(ms>0&&ms<=MIN_REQUEST_GAP_MS);events.push({type:'pause',ms});now+=ms;},read:async u=>{events.push({type:'request',url:u,at:now});now+=400;const result=await fullRead(u);events.push({type:'finished',at:now});return result;}});
 assert.equal(MIN_REQUEST_GAP_MS,1200);assert.equal(r.sourceCalls,3);assert.equal(r.candidates,2);assert.deepEqual(events.filter(e=>e.type==='request').map(e=>e.url),[url,SOURCES.CPQ.html,SOURCES.CPQ.pdf]);assert.deepEqual(events.filter(e=>e.type==='pause').map(e=>e.ms),[1200,1200]);const requests=events.filter(e=>e.type==='request'),finished=events.filter(e=>e.type==='finished');assert(requests.slice(1).every((e,i)=>e.at-finished[i].at>=1200));
}));

test('a denied HTML never waits for or requests its PDF; persistent holds wait and request zero times',()=>box(async root=>{
 let now=Date.parse(at);const events=[],r=await runThemeCandidateJob({root,at,clock:()=>now,pause:async ms=>{events.push(['pause',ms]);now+=ms;},read:async u=>{events.push(['request',u]);return new Response('not retained',{status:403});}});
 assert.deepEqual(events,[['request',url],['pause',1200],['request',SOURCES.CPQ.html]]);assert.equal(r.failures.length,2);assert.equal(r.sourceCalls,2);assert(!events.some(e=>e[1]===SOURCES.CPQ.pdf));
 const again=await runThemeCandidateJob({root,at:'2027-04-16T10:00:00.000Z',clock:()=>Date.parse('2027-04-16T10:00:00.000Z'),pause:async()=>assert.fail('blocked source must not wait'),read:async()=>assert.fail('blocked source must not request')});assert.equal(again.sourceCalls,0);assert.equal(again.failures.length,2);
}));

test('an injected pause that does not advance time cannot bypass the minimum request gap',()=>box(async root=>{
 let calls=0,waits=0;const r=await runThemeCandidateJob({root,at,clock:()=>Date.parse(at),pause:async ms=>{assert.equal(ms,1200);waits++;},read:async u=>{calls++;return fullRead(u);}});assert.equal(calls,1);assert.equal(waits,1);assert.equal(r.sourceCalls,1);assert.equal(r.failures[0].reason,'request_interval_not_met');assert.equal(r.failures[0].attemptedUrl,null);
}));


test('actual enabled coordinator constant preserves all existing jobs and reaches zero-network candidate bootstrap',()=>box(async root=>{
 const target=join(root,'enabled-copy');await mkdir(join(target,'scripts'),{recursive:true});await mkdir(join(target,'data'),{recursive:true});
 for(const name of ['scripts/us-theme-candidate-job.mjs','scripts/us-theme-official-valuations.mjs','data/us-theme-official-sources.json','data/us-theme-rights.json'])await copyFile(new URL('../'+name,import.meta.url),join(target,name));
 const original=await readFile(new URL('../scripts/mac-daily-job.mjs',import.meta.url),'utf8');assert.equal([...original.matchAll(/const THEME_CANDIDATE_CHECKS_ENABLED=(?:false|true);/g)].length,1);const enabled=original.replace(/const THEME_CANDIDATE_CHECKS_ENABLED=(?:false|true);/,'const THEME_CANDIDATE_CHECKS_ENABLED=true;');await writeFile(join(target,'scripts/mac-daily-job.mjs'),enabled);const module=await import(pathToFileURL(join(target,'scripts/mac-daily-job.mjs')).href);
 const time='2026-11-10T10:00:00.000Z',logs=join(root,'logs'),candidateRoot=join(logs,'theme-candidates');await mkdir(candidateRoot,{recursive:true});await writeFile(join(candidateRoot,'official-theme-candidates-state.json'),JSON.stringify({schema:CANDIDATE_SCHEMA,families:{STXWSML:{attemptAt:'2026-11-10T08:30:53.075Z',slot:'2026-11-first',status:'complete',lastObservation:{date:'2026-09-30',pb:7.6,ps:4.3},reason:null}}}));
 const calls=[];const summary=await module.runMacDailyJob({at:time,logs,lock:join(root,'job.lock'),runStep:async step=>{calls.push(step.id);let r;
  if(step.id==='authorization')return{code:0,stdout:`You are logged in with an OAuth Token.\nAccount ${module.ACCOUNT}\n- d1 (write)`,stderr:''};
  if(step.id==='US-theme-candidates'){assert.equal(step.args[step.args.indexOf('--output')+1],candidateRoot);r=await runThemeCandidateJob({at:time,root:candidateRoot,clock:()=>Date.parse(time),pause:async()=>assert.fail('seeded no-op must not wait'),read:async()=>assert.fail('seeded no-op must not request')});assert.equal(r.sourceCalls,0);}
  else if(step.id==='US-quarterly')r={checkedAt:time,candidates:0,sourceCalls:0,sourceBytes:0,publication:{writes:0,skipped:'no_new_audited_quarter',sourceCalls:0}};
  else r={market:step.id.split('-')[0],...(step.id.endsWith('core')?{date:'2026-11-09',upstreamCalls:0}:{completedSession:'2026-11-09',sourceCalls:0,sourceBytes:0,computedRows:0}),skipped:'already_settled',dbWrites:0};
  return{code:0,stdout:JSON.stringify(r),stderr:''};
 }});assert.equal(summary.ok,true);assert.deepEqual(calls,['authorization','CN-core','CN-overview','US-core','US-overview','US-quarterly','US-theme-candidates']);assert(summary.results.every(r=>r.ok));assert.equal(summary.results.at(-1).reports[0].sourceCalls,0);
}));


test('real rights policy is an expected hold, never queries STOXX and leaves CPQ due with strict HTTP failures',()=>box(async root=>{
 const real=await import('../scripts/us-theme-candidate-job.mjs');
 for(const status of [200,401,403,429]){let now=Date.parse(at);const calls=[];const r=await real.runThemeCandidateJob({root:join(root,String(status)),at,clock:()=>now,pause:async ms=>{now+=ms;},read:async u=>{assert.notEqual(u,SOURCES.STXWSML.html);calls.push(u);return status===200?fullRead(u):new Response('not retained',{status});}});assert(real.validCandidateReport(r,at));const held=r.families.find(f=>f.code==='STXWSML');assert.equal(held.status,'held');assert.equal(held.reason,'source_permission_pending');assert.equal(held.sourceDate,null);assert.equal(held.rightsHold.termsUrl,'https://stoxx.com/legal/stoxx-conditions-of-use/');assert.equal(held.httpStatus,undefined);
  assert.deepEqual(calls,status===200?[SOURCES.CPQ.html,SOURCES.CPQ.pdf]:[SOURCES.CPQ.html]);assert.equal(r.failures.length,status===200?0:1);if(status!==200)assert.equal(r.failures[0].reason,'access_'+status);assert.equal(r.productionWrites,0);
 }
}));
