// Controlled job only. SEC discoveries prepare review candidates, never valuations.
// An approved release manifest is reviewed repository code, not upstream metadata.
import {readFile,writeFile,mkdir,rm,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,sep,isAbsolute} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {spawnSync} from 'node:child_process';
import {connectD1} from './d1-client.mjs';import {importETFValuations} from './us-etf-valuation-import.mjs';
export const NPORT_SERIES=Object.freeze({XLC:'S000062095',XLY:'S000006408',XLP:'S000006409',XLU:'S000006416',XLF:'S000006411',XLE:'S000006410',XLV:'S000006412',XLB:'S000006414',XLRE:'S000051152',XLI:'S000006413'});
export const NPORT_INDEX='https://data.sec.gov/submissions/CIK0001064641.json';
const sha=v=>createHash('sha256').update(v).digest('hex'),date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const instant=v=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const eastern=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function publicAvailability(acceptedAt,filed){
 const local=Object.fromEntries(eastern.formatToParts(new Date(acceptedAt)).map(x=>[x.type,x.value])),acceptedDate=`${local.year}-${local.month}-${local.day}`;
 if(filed<acceptedDate)throw Error('Filing date precedes acceptance');
 if(filed===acceptedDate&&`${local.hour}:${local.minute}`<='17:30')return acceptedAt;
 const next=new Date(Date.parse(filed)+86400000).toISOString().slice(0,10);
 for(const hour of[4,5]){const candidate=next+'T0'+hour+':00:00.000Z',parts=Object.fromEntries(eastern.formatToParts(new Date(candidate)).map(x=>[x.type,x.value]));if(`${parts.year}-${parts.month}-${parts.day}`===next&&parts.hour==='00')return new Date(Math.max(Date.parse(acceptedAt),Date.parse(candidate))).toISOString();}
 throw Error('Cannot resolve conservative public disclosure time');
}
export function nportIndexRows(raw,now){
 if(!Number.isFinite(now)||String(raw?.cik).replace(/^0+/,'')!=='1064641')throw Error('Unexpected NPORT registrant');
 const r=raw.filings?.recent,keys=['accessionNumber','form','reportDate','filingDate','acceptanceDateTime','primaryDocument'];
 if(!r||!Array.isArray(r.accessionNumber)||r.accessionNumber.length>2000||keys.some(k=>!Array.isArray(r[k])||r[k].length!==r.accessionNumber.length))throw Error('Bounded SEC recent-filing columns required');
 const rows=[],seen=new Set();for(let i=0;i<r.form.length;i++){
  if(!['NPORT-P','NPORT-P/A'].includes(r.form[i]))continue;
  const accession=r.accessionNumber[i],reportDate=r.reportDate[i],acceptedAt=r.acceptanceDateTime[i],filed=r.filingDate[i];
  if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||seen.has(accession)||!date(reportDate)||!date(filed)||!instant(acceptedAt)||Date.parse(acceptedAt)<Date.parse(reportDate)||Date.parse(acceptedAt)>now||!/(^|\/)primary_doc\.xml$/.test(r.primaryDocument[i]))throw Error('Unverified NPORT filing identity or disclosure timestamp');
  seen.add(accession);const availableAt=publicAvailability(acceptedAt,filed);if(Date.parse(availableAt)>now)continue;rows.push({accession,form:r.form[i],reportDate,filed,acceptedAt,availableAt,availabilityBasis:'conservative_public_disclosure_pending_review',url:`https://www.sec.gov/Archives/edgar/data/1064641/${accession.replaceAll('-','')}/primary_doc.xml`});
 }return rows;
}
export function parseNPORTIdentity(raw){
 if(Buffer.byteLength(raw)>2_000_000)throw Error('NPORT XML byte limit');
 const run=spawnSync(process.platform==='win32'?'python':'python3',[fileURLToPath(new URL('./us-etf-nport-identity.py',import.meta.url))],{input:raw,encoding:'utf8',timeout:10000,maxBuffer:16384});
 if(run.error||run.status!==0)throw Error('Original NPORT XML identity invalid');
 const identity=JSON.parse(run.stdout);if(!/^S\d{9}$/.test(identity.seriesId)||!date(identity.reportDate))throw Error('Original NPORT XML identity invalid');return identity;
}
async function readBounded(url,limit,read,userAgent){
 const response=await read(url,{headers:{'User-Agent':userAgent,Accept:'application/json,application/xml,text/xml'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){await response.body?.cancel();throw Error(`SEC source HTTP ${response.status}; no retry or alternate path`);}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('SEC response byte limit');}
 const reader=response.body?.getReader();if(!reader)throw Error('Missing SEC response body');let size=0;const chunks=[];try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('SEC response byte limit');chunks.push(Buffer.from(part.value));}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}return Buffer.concat(chunks);
}
export async function prepareNPORTCandidates({latestDates,now=Date.now(),read=fetch,save=async()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),userAgent='Trendbeak research https://trendbeak.com'}){
 if(!Number.isFinite(now)||Object.keys(latestDates).length!==Object.keys(NPORT_SERIES).length||Object.keys(NPORT_SERIES).some(code=>!date(latestDates[code])))throw Error('All active existing dated ETF checkpoints required');
 let calls=0,bytes=0;const get=async(url,limit)=>{calls++;const raw=await readBounded(url,limit,read,userAgent);bytes+=raw.length;if(bytes>24_000_000)throw Error('SEC candidate aggregate byte limit');return raw;};
 const index=await get(NPORT_INDEX,2_000_000),all=nportIndexRows(JSON.parse(index.toString('utf8')),now),oldest=Object.values(latestDates).sort()[0],recent=all.filter(r=>r.reportDate>oldest);
 if(recent.length>44||recent.some(r=>Date.parse(r.reportDate)-Date.parse(oldest)>200*86400000))throw Error('NPORT gap exceeds two-quarter candidate window; explicit recovery required');
 const candidates=[],ignored=[];for(const row of recent){await pause(1000);const raw=await get(row.url,2_000_000),identity=parseNPORTIdentity(raw);if(identity.reportDate!==row.reportDate)throw Error('NPORT report period differs from SEC index');const code=Object.keys(NPORT_SERIES).find(c=>NPORT_SERIES[c]===identity.seriesId);if(!code){ignored.push({accession:row.accession,seriesId:identity.seriesId,reason:'not_target_series'});continue;}if(row.reportDate<=latestDates[code]){ignored.push({accession:row.accession,code,reason:'already_published_period_manual_repair_only'});continue;}
  const candidate={...row,code,seriesId:identity.seriesId,rawSha256:sha(raw),rawBytes:raw.length,rawFile:row.accession+'.xml',status:'requires_financial_scope_equity_and_corporate_action_review'};await save(candidate.rawFile,raw);candidates.push(candidate);
 }
 const report={checkedAt:new Date(now).toISOString(),source:NPORT_INDEX,indexSha256:sha(index),latestDates,candidates,ignored,sourceCalls:calls,sourceBytes:bytes,valuationWrites:0};await save('candidates.json',JSON.stringify(report,null,2));return report;
}
export async function readApprovedQuarterlyInputs(root,manifest){
 if(!Array.isArray(manifest)||manifest.length>44)throw Error('Bounded reviewed release manifest required');
 const inputs=[],seen=new Set();let expandedTotal=0;for(const e of manifest){
  if(!e||e.status!=='approved'||e.corporateActionsReviewed!==true||e.commonEquityReviewed!==true||!/^data\/us-etf-reviewed\/[a-zA-Z0-9._-]+\.json\.gz$/.test(e.file??'')||!/^([a-f0-9]{64})$/.test(e.sha256??'')||!/^([a-f0-9]{64})$/.test(e.expandedSha256??'')||!/^([a-f0-9]{64})$/.test(e.auditSha256??'')||!Number.isInteger(e.expandedBytes)||e.expandedBytes<2||e.expandedBytes>12_000_000||!date(e.date))throw Error('Explicit reviewed release, event/equity audit and exact hashes required');
  expandedTotal+=e.expandedBytes;if(expandedTotal>12_000_000)throw Error('Approved release aggregate byte limit');
  const path=await realpath(resolve(root,e.file)),base=await realpath(root);if(!path.startsWith(base+sep)|| (await stat(path)).size>2_000_000)throw Error('Approved input path or byte limit');
  const zipped=await readFile(path);if(sha(zipped)!==e.sha256)throw Error('Approved input hash mismatch');const raw=gunzipSync(zipped,{maxOutputLength:e.expandedBytes});if(raw.length!==e.expandedBytes||sha(raw)!==e.expandedSha256)throw Error('Approved expanded input integrity mismatch');const batch=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!Array.isArray(batch)||!batch.length||batch.length>11)throw Error('Approved quarterly batch limit');for(const input of batch){const id=input.code+'/'+input.date;if(seen.has(id)||!Object.hasOwn(NPORT_SERIES,input.code)||input.date!==e.date||input.pricingBasis!=='portfolio_fair_value_per_share')throw Error('Approved input identity mismatch');seen.add(id);inputs.push(input);if(inputs.length>44)throw Error('Approved input count limit');}
 }return inputs;
}
export async function appendApprovedQuarterlyInputs({db,inputs,latestDates,now,dryRun=true,backup}){
 // Same-date changes, including audited corrections, require the separate hash-bound
 // repair command. A scheduled release can only append a strictly newer quarter.
 const next=inputs.filter(x=>x.date>latestDates[x.code]);
 if(next.length>11||new Set(next.map(x=>x.code)).size!==next.length)throw Error('Daily append is one new quarter per fund; explicit backfill required');
 if(!next.length)return{writes:0,skipped:'no_new_audited_quarter',sourceCalls:0};
 return importETFValuations({db,inputs:next,now,dryRun,backup});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+k);args.splice(i,2);return v;},out=option('--output'),at=option('--at'),now=at?Date.parse(at):Date.now(),remote=args.includes('--remote'),dryRun=!args.includes('--write');
 if(!out||!isAbsolute(out)||!Number.isFinite(now)||at&&(!at.endsWith('Z')||now>Date.now()+60000)||args.some(a=>!['--remote','--write'].includes(a)))throw Error('Use --output PRIVATE_ABSOLUTE_DIRECTORY [--at UTC_TIME] [--remote] [--write]');
 const lock='/tmp/trendbeak-daily-writer.lock';await mkdir(lock,{mode:0o700});let connection;
 try{await mkdir(out,{mode:0o700});connection=await connectD1(remote);const keys=Object.keys(NPORT_SERIES).map(c=>'valuation/US/'+c),r=await connection.db.prepare(`SELECT key,json_extract(payload,'$.latest.input.date') AS date FROM market_snapshot WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();if(!r.success||r.results.length!==keys.length)throw Error('Existing quarterly checkpoints required');const latestDates=Object.fromEntries(r.results.map(x=>[x.key.slice(13),x.date]));
  const manifest=JSON.parse(await readFile(new URL('../data/us-etf-approved-releases.json',import.meta.url),'utf8')),inputs=await readApprovedQuarterlyInputs(resolve(dirname(fileURLToPath(import.meta.url)),'..'),manifest);
  const report=await prepareNPORTCandidates({latestDates,now,save:(name,raw)=>writeFile(resolve(out,name),raw,{mode:0o600,flag:'wx'})});
  const publication=await appendApprovedQuarterlyInputs({db:connection.db,inputs,latestDates,now,dryRun,backup:resolve(out,'before-append.json')});console.log(JSON.stringify({checkedAt:report.checkedAt,candidates:report.candidates.length,sourceCalls:report.sourceCalls,sourceBytes:report.sourceBytes,publication}));
 }finally{await connection?.close();await rm(lock,{recursive:true});}
}
