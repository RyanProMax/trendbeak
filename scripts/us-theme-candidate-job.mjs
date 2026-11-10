// Candidate evidence only. No D1, production writer, approval mutation or scheduler.
import{readFile,writeFile,mkdir,rmdir,rename,lstat}from'node:fs/promises';
import{isAbsolute,join}from'node:path';import{pathToFileURL}from'node:url';import{randomUUID}from'node:crypto';
import{parseSTXWSML,parseCPQIndex,officialThemePolicies,officialThemeRights,sha256}from'./us-theme-official-valuations.mjs';
export const CANDIDATE_SCHEMA='official-theme-candidate-check-v1';
export const SOURCES=Object.freeze({STXWSML:Object.freeze({html:'https://stoxx.com/index/stxwsml/?factsheet=true',htmlLimit:2*1024*1024}),CPQ:Object.freeze({html:'https://www.proshares.com/our-etfs/leveraged-and-inverse/skyu',htmlLimit:512*1024,pdf:'https://www.proshares.com/globalassets/proshares/fact-sheet/prosharesfactsheetskyu.pdf',pdfLimit:2*1024*1024})});
export const MAX_SOURCE_BYTES=4.5*1024*1024;
export const MIN_REQUEST_GAP_MS=1200;
// Existing serial coordinator: authorization 60s + five prior children 180s each.
export const MAX_CLOCK_AGE_MS=20*60*1000;
const codes=Object.keys(SOURCES),iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s,date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=reason=>Object.assign(new Error(reason),{candidateReason:reason});
const failureReasons=new Set(['network_or_redirect_failure','request_timeout','request_interval_not_met','redirect_refused','access_401','access_403','access_429','http_failure','response_byte_limit','missing_response_body','response_stream_failure','aggregate_byte_limit','invalid_acquisition_clock','html_identity_date_or_field_drift','observation_period_not_closed','nonpositive_or_invalid_metric','all_metrics_missing','source_date_regression','same_date_value_conflict','invalid_pdf_envelope','html_pdf_disagreement','local_evidence_or_state_failure']);
function validFailure(f,code){return f&&Object.keys(f).length===6&&['reason','attemptedUrl','method','requestedAt','httpStatus','failedAt'].every(k=>Object.hasOwn(f,k))&&failureReasons.has(f.reason)&&(f.failedAt===null||iso(f.failedAt))&&(f.httpStatus===null||Number.isInteger(f.httpStatus)&&f.httpStatus>=100&&f.httpStatus<=599)&&(f.attemptedUrl===null?f.method===null&&f.requestedAt===null&&f.httpStatus===null:[SOURCES[code].html,SOURCES[code].pdf].filter(Boolean).includes(f.attemptedUrl)&&f.method==='GET'&&iso(f.requestedAt));}
const latestApproved=code=>{const p=officialThemePolicies.find(p=>p.code===code);if(!p)return null;const rows=p.sources.flatMap(s=>s.values).sort((a,b)=>a[0].localeCompare(b[0])),r=rows.at(-1);return{date:r[0],pb:r[1],ps:r[2],...(code==='CPQ'?{numberOfIndexHoldings:p.sources[0].numberOfIndexHoldings}:{})};};
const comparable=o=>[o.date,o.pb,o.ps,...('numberOfIndexHoldings'in o?[o.numberOfIndexHoldings]:[])];
function validateObservation(o){return o&&date(o.date)&&['pb','ps'].every(k=>o[k]===null||typeof o[k]==='number'&&Number.isFinite(o[k])&&o[k]>0)&&(!('numberOfIndexHoldings'in o)||Number.isSafeInteger(o.numberOfIndexHoldings)&&o.numberOfIndexHoldings>0);}
export function validateCandidateState(state,at){
 if(!iso(at)||!state||state.schema!==CANDIDATE_SCHEMA||!state.families||Object.keys(state.families).some(k=>!codes.includes(k))||Buffer.byteLength(JSON.stringify(state))>16384)throw fail('invalid_candidate_state');
 for(const[code,s]of Object.entries(state.families))if(!s||!iso(s.attemptAt)||s.attemptAt>at||typeof s.slot!=='string'||s.slot!==slotFor(code,s.attemptAt)||!['started','complete','blocked'].includes(s.status)||!validateObservation(s.lastObservation)||s.lastObservation.date>s.attemptAt.slice(0,10)||s.reason!==null&&typeof s.reason!=='string'||s.lastFailure!==undefined&&(s.status!=='blocked'||!validFailure(s.lastFailure,code)||s.lastFailure.reason!==s.reason))throw fail('invalid_candidate_state');return state;
}
export function slotFor(code,at){if(!codes.includes(code)||!iso(at))throw fail('invalid_clock_or_source');return at.slice(0,7)+(code==='STXWSML'?(Number(at.slice(8,10))<=15?'-first':'-second'):'');}
function lastClosedPeriod(code,at){const d=new Date(at),y=d.getUTCFullYear(),m=d.getUTCMonth();return new Date(Date.UTC(y,code==='CPQ'?Math.floor(m/3)*3:m,0)).toISOString().slice(0,10);}
export function planThemeCandidates(state,at){
 validateCandidateState(state,at);
 return codes.map(code=>{const previous=state.families[code],approved=latestApproved(code),baseline=previous?.lastObservation&&(!approved||previous.lastObservation.date>approved.date)?previous.lastObservation:approved,period=lastClosedPeriod(code,at),slot=slotFor(code,at);let reason='due';
  const rightsHold=officialThemeRights[code]??(previous?.reason==='source_permission_pending'?{reason:'source_permission_pending',termsUrl:previous.rightsHold?.terms?.url,termsUpdatedDate:previous.rightsHold?.terms?.updatedDate}:null);
  if(previous?.status==='started')reason='interrupted_attempt_requires_review';
  else if(previous?.status==='blocked'&&previous.lastFailure)reason='source_hold_requires_review';
  else if(rightsHold)reason='source_permission_pending';
  else if(previous?.lastObservation&&approved&&previous.lastObservation.date===approved.date&&!same(comparable(previous.lastObservation),comparable(approved)))reason='candidate_approved_conflict_requires_review';
  else if(previous?.status==='blocked')reason='source_hold_requires_review';
  else if(!baseline)reason='missing_reviewed_baseline_requires_review';
  else if(previous?.slot===slot)reason='already_checked_window';else if(baseline.date>=period)reason='no_new_closed_period';
  return{code,slot,period,baseline,due:reason==='due',reason,...(rightsHold?{rightsHold}:{})};});
}
const safeHeaders=headers=>Object.fromEntries(['content-type','etag','last-modified'].flatMap(k=>{const v=headers.get(k);return v&&v.length<=512&&!/[\r\n]/.test(v)?[[k,v]]:[];}));
async function boundedGet(url,limit,read,onBytes,onStatus){
 let response;try{response=await read(url,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:url.endsWith('.pdf')?'application/pdf':'text/html'},signal:AbortSignal.timeout(15000)});}catch(e){throw fail(['TimeoutError','AbortError'].includes(e?.name)?'request_timeout':'network_or_redirect_failure');}
 onStatus(Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null);
 if(response.redirected||response.url&&response.url!==url||response.status>=300&&response.status<400){await response.body?.cancel();throw fail('redirect_refused');}
 if(response.status!==200){await response.body?.cancel();throw fail([401,403,429].includes(response.status)?'access_'+response.status:'http_failure');}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw fail('response_byte_limit');}
 const reader=response.body?.getReader();if(!reader)throw fail('missing_response_body');const chunks=[];let bytes=0;try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;onBytes(r.value.length);if(bytes>limit)throw fail('response_byte_limit');chunks.push(Buffer.from(r.value));}}catch(e){await reader.cancel();throw e.candidateReason?e:fail('response_stream_failure');}finally{reader.releaseLock();}
 return{raw:Buffer.concat(chunks),headers:safeHeaders(response.headers)};
}
export function assessCPQPDF(raw,htmlObservation){
 if(!Buffer.isBuffer(raw)||raw.length>SOURCES.CPQ.pdfLimit||!/^%PDF-\d\.\d/.test(raw.subarray(0,16).toString('ascii'))||!raw.subarray(-1024).toString('ascii').includes('%%EOF'))throw fail('invalid_pdf_envelope');
 const digest=sha256(raw),p=officialThemePolicies.find(p=>p.code==='CPQ'),source=p.sources.find(s=>s.corroboratingEvidence?.some(r=>r.sha256===digest&&r.bytes===raw.length));
 if(source){if(!source.values.some(r=>same(r,[htmlObservation.date,htmlObservation.pb,htmlObservation.ps]))||source.numberOfIndexHoldings!==htmlObservation.numberOfIndexHoldings)throw fail('html_pdf_disagreement');return{status:'existing_reviewed_pdf_matches',sha256:digest,reviewSha256:p.reviewSha256,publicationEligible:false};}
 return{status:'visual_review_required',sha256:digest,publicationEligible:false,requiredChecks:{documentIndexTicker:'CPQ',namedIndex:'ISE CTA Cloud Computing Index',section:'Index Characteristics',date:htmlObservation.date,pb:htmlObservation.pb,numberOfIndexHoldings:htmlObservation.numberOfIndexHoldings},note:'Unknown PDF bytes. Text extraction previously omitted key numbers; fetching a PDF is not a numeric cross-check or approval.'};
}
function classify(code,observation,baseline){
 if(code==='STXWSML'&&observation.rejected.some(r=>r.reason!=='source-missing'))throw fail('nonpositive_or_invalid_metric');
 if(observation.pb===null&&observation.ps===null)throw fail('all_metrics_missing');
 if(observation.date<baseline.date)throw fail('source_date_regression');
 if(observation.date===baseline.date){if(!same(comparable(observation),comparable(baseline)))throw fail('same_date_value_conflict');return'unchanged';}
 return'pending_review';
}
export async function runThemeCandidateJob({at,root,read,clock=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!iso(at)||!isAbsolute(root)||typeof read!=='function'||typeof clock!=='function'||typeof pause!=='function')throw fail('explicit_clock_private_root_and_reader_required');
 const current=clock();if(!Number.isFinite(current)||current<Date.parse(at)||current-Date.parse(at)>MAX_CLOCK_AGE_MS)throw fail('invalid_acquisition_clock');
 await mkdir(root,{recursive:true,mode:0o700});const lock=join(root,'official-theme-candidates.lock');await mkdir(lock,{mode:0o700});
 const statePath=join(root,'official-theme-candidates-state.json');let state;
 const persist=async()=>{validateCandidateState(state,at);const tmp=statePath+'.'+randomUUID();await writeFile(tmp,JSON.stringify(state),{flag:'wx',mode:0o600});await rename(tmp,statePath);};
 try{
  try{const st=await lstat(statePath);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)throw fail('invalid_state_file');state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={schema:CANDIDATE_SCHEMA,families:{}};}
  const plan=planThemeCandidates(state,at),runDirectory=join(root,'official-theme-candidates',at.replaceAll(':','-')+'-'+randomUUID());await mkdir(runDirectory,{recursive:true,mode:0o700});
  const report={schema:CANDIDATE_SCHEMA,mode:'candidate_only',checkedAt:at,productionWrites:0,sourceApprovalsAdded:0,sourceCalls:0,sourceBytes:0,candidates:0,reviewItems:0,runDirectory,families:[],failures:[]};
  let lastFinishedAt=null;
  const requestClock=()=>{const n=clock();if(!Number.isFinite(n)||n<Date.parse(at)||n-Date.parse(at)>MAX_CLOCK_AGE_MS)throw fail('invalid_acquisition_clock');return n;};
  const beforeRequest=async()=>{let now=requestClock();if(lastFinishedAt!==null){if(!Number.isFinite(lastFinishedAt)||now<lastFinishedAt)throw fail('invalid_acquisition_clock');const remaining=Math.max(0,lastFinishedAt+MIN_REQUEST_GAP_MS-now);if(remaining)await pause(remaining);now=requestClock();if(now-lastFinishedAt<MIN_REQUEST_GAP_MS)throw fail('request_interval_not_met');}return now;};
  for(const step of plan){const{code,baseline}=step,s=SOURCES[code];if(!step.due){const status=step.reason==='source_permission_pending'?'held':step.reason.includes('requires_review')?'blocked':'not_due';report.families.push({code,status,reason:step.reason,sourceDate:baseline?.date??null,...(status==='held'?{rightsHold:step.rightsHold}:{})});if(status==='blocked')report.failures.push({code,reason:step.reason,...state.families[code]?.lastFailure});continue;}
   state.families[code]={attemptAt:at,slot:step.slot,status:'started',lastObservation:baseline,reason:null};await persist();const evidence=[];let completedObservation=baseline,attempt=null;
   const acquire=async(url,limit,extension)=>{const requestMs=await beforeRequest();attempt={attemptedUrl:url,method:'GET',requestedAt:new Date(requestMs).toISOString(),httpStatus:null};report.sourceCalls++;let response;try{response=await boundedGet(url,limit,read,n=>{report.sourceBytes+=n;if(report.sourceBytes>MAX_SOURCE_BYTES)throw fail('aggregate_byte_limit');},status=>{attempt.httpStatus=status;});}finally{lastFinishedAt=clock();}const observedMs=lastFinishedAt;if(!Number.isFinite(observedMs)||observedMs<Date.parse(at)||observedMs-Date.parse(at)>MAX_CLOCK_AGE_MS)throw fail('invalid_acquisition_clock');const observedAt=new Date(observedMs).toISOString(),path=join(runDirectory,code+'.'+extension);await writeFile(path,response.raw,{flag:'wx',mode:0o600});const entry={url,path,sha256:sha256(response.raw),bytes:response.raw.length,observedAt,headers:response.headers};evidence.push(entry);await writeFile(join(runDirectory,code+'-evidence.json'),JSON.stringify(evidence,null,2),{mode:0o600});return{...response,observedAt};};
   try{
    const html=await acquire(s.html,s.htmlLimit,'html');let observation;try{observation=code==='STXWSML'?parseSTXWSML(html.raw,s.html,html.observedAt,Date.parse(html.observedAt)):parseCPQIndex(html.raw,s.html,html.observedAt,Date.parse(html.observedAt));}catch{throw fail('html_identity_date_or_field_drift');}
    if(observation.date>step.period)throw fail('observation_period_not_closed');
    const status=classify(code,observation,baseline);let crosscheck=null;if(code==='CPQ'){const pdf=await acquire(s.pdf,s.pdfLimit,'pdf');crosscheck=assessCPQPDF(pdf.raw,observation);}
    // Unknown digest/schema is never routed to a publisher or static allowlist.
    const reviewRequired=status==='pending_review'||crosscheck?.status==='visual_review_required';
    const candidate={schema:CANDIDATE_SCHEMA,reviewRequired,code,source:code==='CPQ'?'proshares_index_characteristics':'stoxx_factsheet_reported',status,observation,crosscheck,evidence,publicationEligible:false,pointInTime:false,originalPublicationAt:null,pbPercentile:null,psPercentile:null};
    await writeFile(join(runDirectory,code+'-candidate.json'),JSON.stringify(candidate,null,2),{flag:'wx',mode:0o600});completedObservation={date:observation.date,pb:observation.pb,ps:observation.ps,...(code==='CPQ'?{numberOfIndexHoldings:observation.numberOfIndexHoldings}:{})};
    state.families[code]={...state.families[code],status:'complete',lastObservation:completedObservation,reason:null};await persist();report.families.push({code,status,sourceDate:observation.date,crosscheck:crosscheck?.status??null,reviewRequired,publicationEligible:false});if(status==='pending_review')report.candidates++;if(reviewRequired)report.reviewItems++;
   }catch(e){const reason=failureReasons.has(e.candidateReason)?e.candidateReason:'local_evidence_or_state_failure',failedMs=clock(),failedAt=Number.isFinite(failedMs)&&Number.isFinite(new Date(failedMs).getTime())?new Date(failedMs).toISOString():null,lastFailure={reason,...(attempt??{attemptedUrl:null,method:null,requestedAt:null,httpStatus:null}),failedAt};state.families[code]={...state.families[code],status:'blocked',lastObservation:baseline,reason,lastFailure};await persist();await writeFile(join(runDirectory,code+'-hold.json'),JSON.stringify({code,...lastFailure,evidence,publicationEligible:false},null,2),{flag:'wx',mode:0o600});report.failures.push({code,...lastFailure});report.families.push({code,status:'blocked',reason,sourceDate:baseline.date});}
  }
  await writeFile(join(runDirectory,'report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});return report;
 }finally{await rmdir(lock);}
}
export function validCandidateReport(r,at){return r?.schema===CANDIDATE_SCHEMA&&r.mode==='candidate_only'&&r.checkedAt===at&&r.productionWrites===0&&r.sourceApprovalsAdded===0&&Number.isSafeInteger(r.sourceCalls)&&r.sourceCalls>=0&&r.sourceCalls<=3&&Number.isSafeInteger(r.sourceBytes)&&r.sourceBytes>=0&&r.sourceBytes<=MAX_SOURCE_BYTES&&Number.isSafeInteger(r.candidates)&&r.candidates>=0&&r.candidates<=2&&Number.isSafeInteger(r.reviewItems)&&r.reviewItems>=0&&r.reviewItems<=2&&Array.isArray(r.families)&&r.families.length===2&&codes.every(c=>r.families.filter(f=>f.code===c&&['not_due','blocked','held','unchanged','pending_review'].includes(f.status)&&f.publicationEligible!==true&&(['unchanged','pending_review'].includes(f.status)?f.publicationEligible===false&&typeof f.reviewRequired==='boolean':true)&&(f.status==='held'?f.reason==='source_permission_pending'&&f.rightsHold?.reason==='source_permission_pending'&&typeof f.rightsHold.termsUrl==='string'&&(f.sourceDate===null||date(f.sourceDate)&&f.sourceDate<=at.slice(0,10)):date(f.sourceDate)&&f.sourceDate<=at.slice(0,10))).length===1)&&Array.isArray(r.failures)&&r.failures.every(f=>codes.includes(f.code)&&typeof f.reason==='string'&&r.families.some(x=>x.code===f.code&&x.status==='blocked'))&&r.candidates===r.families.filter(f=>f.status==='pending_review').length&&r.reviewItems===r.families.filter(f=>f.reviewRequired===true).length&&r.failures.length===r.families.filter(f=>f.status==='blocked').length;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];args.splice(i,2);return v;},at=get('--at'),root=get('--output');
 if(args.length!==1||args[0]!=='--collect'||!iso(at)||Date.parse(at)>Date.now()+60000||Date.now()-Date.parse(at)>MAX_CLOCK_AGE_MS||!root||!isAbsolute(root))throw Error('Use --collect --at FROZEN_CURRENT_UTC --output PRIVATE_LOG_ROOT');
 const old=process.umask(0o077);try{const report=await runThemeCandidateJob({at,root,read:fetch});console.log(JSON.stringify(report));if(report.failures.length)process.exitCode=1;}finally{process.umask(old);}
}
