// Pure source gate for a manually reviewed fixed-basket price roll. The policy
// is trusted job configuration, never a field in the candidate or a CLI file.
// It does not write, publish, create a release approval or claim unchanged shares.
import {createHash} from 'node:crypto';
import {currentBasketHash as hash} from './us-etf-current-basket.mjs';
import {prepareCurrentSnapshot} from './us-etf-current-snapshot.mjs';
import {parseCurrentPrice} from './us-etf-current-price-candidate.mjs';
export {PRICE_ROLL_METHOD} from './us-etf-current-estimate.mjs';
import {PRICE_ROLL_METHOD} from './us-etf-current-estimate.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const H=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const age=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
const ny=t=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
const nyDay=t=>{const p=ny(t);return `${p.year}-${p.month}-${p.day}`;};
function requireThat(ok,message){if(!ok)throw Error(message);}
function boundedArray(value,count,label){requireThat(Array.isArray(value)&&value.length===count,`Complete ${label} required`);}
function sourceRecord(actual,approved,maxBytes,now){
 requireThat(actual&&approved&&typeof actual.raw==='string'&&Buffer.byteLength(actual.raw)<=maxBytes,'Bounded original source body required');
 const {raw,...meta}=actual;
 requireThat(hash(meta)===hash(approved)&&H(meta.sourceSha256)&&sha(raw)===meta.sourceSha256&&meta.status===200&&meta.bytes===Buffer.byteLength(raw)&&instant(meta.observedAt)&&Date.parse(meta.observedAt)<=now,'Original source bytes, identity and actual capture must match the trusted review');
 return raw;
}
function sourceMap(rows,key){const m=new Map(rows.map(x=>[x[key],x]));requireThat(m.size===rows.length,'Duplicate source identity');return m;}
function rootCIK(h){
 const ciks=new Set(['shares','equity','revenue'].flatMap(k=>{const u=h[k]?.sourceURL;if(!u)return [];let m;try{const p=new URL(u);m=p.hostname==='www.sec.gov'?p.pathname.match(/^\/Archives\/edgar\/data\/(\d+)\//):null;}catch{}return m?[String(Number(m[1]))]:[];}));
 requireThat(ciks.size===1,'An exact original SEC issuer identity is required');return [...ciks][0];
}
/** A finite reviewed session is required before a collector makes any request.
 * An unknown or early-close date is deliberately not inferred from weekdays. */
export function admittedPriceRollSession(date,policy,now=Date.now()){
 requireThat(policy?.schema==='fixed-basket-price-roll-policy-v1'&&policy.methodVersion===PRICE_ROLL_METHOD&&Number.isFinite(now)&&day(date),'Trusted finite price-roll policy required');
 requireThat(policy.maxAnchorAgeDays===14&&policy.maxFactAgeDays===180&&policy.displayAgeDays===7&&day(policy.anchorDate)&&policy.expiresOn===new Date(Date.parse(policy.anchorDate)+14*86400000).toISOString().slice(0,10)&&date>policy.anchorDate&&date<=policy.expiresOn,'Finite anchor policy expired or changed');
 const session=policy.sessions?.find(x=>x.date===date);
 requireThat(session&&session.kind==='normal'&&instant(session.closeAt)&&instant(session.openAt)&&H(session.calendarSha256)&&session.calendarEvidenceKind==='previously_reviewed_derived_calendar','Unreviewed or early-close session: zero source requests');
 const c=ny(session.closeAt),o=ny(session.openAt);
 requireThat(nyDay(session.closeAt)===date&&nyDay(session.openAt)===date&&`${c.hour}:${c.minute}:${c.second}`==='16:00:00'&&`${o.hour}:${o.minute}:${o.second}`==='09:30:00'&&Date.parse(session.closeAt)<=now&&![0,6].includes(new Date(date+'T12:00Z').getUTCDay()),'Normal New York session and actual settled clock required');
 return session;
}
/** Every raw source is bound to independent, code-owned source review metadata.
 * All new observed filings need explicit document-backed dispositions, including
 * post-close filings that might reveal an earlier effective structural event.
 * No hash-shaped candidate PASS, form-name shortcut or absent Yahoo split clears
 * an unresolved capital/identity event. Missing financial fields remain missing. */
export function validatePriceRoll(previous,delta,policy,{now=Date.now()}={}){
 const session=admittedPriceRollSession(delta?.date,policy,now);
 requireThat(previous&&hash(previous.input)===policy.root.inputSha256&&hash(previous.registry)===policy.root.registrySha256,'Approved anchor input/registry changed');
 const old=previous.input,prepared=prepareCurrentSnapshot({...previous,approved:[policy.root],now});
 requireThat(prepared.payloadSha256===policy.root.payloadSha256&&old.priceDate===policy.anchorDate&&old.cutoff===policy.anchorCutoff,'Exact approved anchor checkpoint required');
 requireThat(delta.fromCutoff===old.cutoff&&delta.throughCutoff===session.closeAt&&instant(delta.observedAt)&&instant(delta.preparedAt)&&delta.observedAt<=delta.preparedAt&&Date.parse(delta.preparedAt)<=now&&Date.parse(delta.observedAt)>=Date.parse(session.closeAt),'Continuous source window and actual UTC preparation clocks required');
 requireThat(delta.policy===undefined&&delta.approval===undefined&&delta.candidatePass===undefined,'Candidate cannot supply trusted policy or approval');
 const review=policy.sourceReviews?.find(r=>r.date===delta.date);
 requireThat(review&&H(review.reviewSha256)&&instant(review.reviewedAt)&&review.reviewedAt<=delta.preparedAt&&review.fromCutoff===delta.fromCutoff&&review.throughCutoff===delta.throughCutoff,'Independent source-window review is required');
 requireThat(typeof delta.calendarRaw==='string'&&Buffer.byteLength(delta.calendarRaw)<=65536,'Bounded derived calendar bytes required');
 const calendarRaw=delta.calendarRaw,calendar=JSON.parse(calendarRaw);
 requireThat(sha(calendarRaw)===session.calendarSha256&&calendar.verifiedFrom<=delta.date&&calendar.verifiedThrough>=delta.date&&!calendar.closedDates.includes(delta.date),'Exact reviewed derived calendar required; not an original calendar fetch');
 for(const [name,n]of [['prices',81],['official',81]]){boundedArray(delta[name],n,name);boundedArray(review[name],n,'reviewed '+name);}
 requireThat(Array.isArray(delta.documents)&&delta.documents.length<=128&&Array.isArray(review.documents)&&delta.documents.length===review.documents.length,'Bounded reviewed event documents required');
 const captures=[...delta.prices,...delta.official,...delta.documents].map(r=>r.observedAt);
 requireThat(captures.every(t=>instant(t)&&t<=review.reviewedAt)&&captures.slice().sort().at(-1)===delta.observedAt,'Actual completed source capture must precede review and exactly match observation time');
 const pmap=sourceMap(delta.prices,'securityId'),pr=sourceMap(review.prices,'securityId'),omap=sourceMap(delta.official,'securityId'),orr=sourceMap(review.official,'securityId');
 const documents=sourceMap(delta.documents,'sourceSha256'),documentReview=sourceMap(review.documents,'sourceSha256');
 const texts=new Map();for(const [key,d]of documents){const raw=sourceRecord(d,documentReview.get(key),8_000_000,now);texts.set(key,raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());}
 requireThat(Array.isArray(review.dispositions)&&review.dispositions.length<=128,'Bounded explicit filing dispositions required');
 const dispositions=sourceMap(review.dispositions,'accessionNumber'),seenFilings=new Set(),prices=[],issuerEvidence=[],missing=[];
 for(const h of old.holdings){
  const p=pmap.get(h.securityId),pm=pr.get(h.securityId),raw=sourceRecord(p,pm,131072,now);
  requireThat(p.symbol===h.symbol&&p.observedAt<=delta.observedAt&&Date.parse(p.observedAt)>=Date.parse(session.closeAt),'Original quote identity/capture mismatch');
  const u=new URL(p.url);requireThat(u.origin==='https://query1.finance.yahoo.com'&&u.pathname==='/v8/finance/chart/'+encodeURIComponent(h.symbol)&&u.searchParams.get('interval')==='1d'&&u.searchParams.get('events')==='splits','Reviewed original quote route required');
  const parsed=parseCurrentPrice(raw,{symbol:h.symbol,securityId:h.securityId,date:delta.date,availableAt:p.observedAt,sourceURL:p.url});
  requireThat(Object.keys(parsed.splitEvents).length===0,'A split requires an independently reviewed two-sided position bridge');
  const q=JSON.parse(raw).chart.result[0],period=q.meta?.currentTradingPeriod?.regular;
  requireThat(q.meta.exchangeTimezoneName==='America/New_York'&&period?.start*1000===Date.parse(session.openAt)&&period?.end*1000===Date.parse(session.closeAt),'Raw quote session is not the reviewed normal session');
  const oldMark=parseCurrentPrice(raw,{symbol:h.symbol,securityId:h.securityId,date:old.priceDate,availableAt:p.observedAt,sourceURL:p.url}).price;
  requireThat(oldMark.value===h.price.value,'Previously approved close revised: separate repair required');prices.push(parsed.price);
  const m=omap.get(h.securityId),mr=orr.get(h.securityId),body=sourceRecord(m,mr,1_000_000,now),doc=JSON.parse(body),cik=rootCIK(h);
  requireThat(m.symbol===h.symbol&&String(Number(m.cik))===cik&&String(Number(doc.cik))===cik&&m.url===`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`&&Array.isArray(doc.tickers)&&doc.tickers.includes(h.symbol)&&m.observedAt<=delta.observedAt&&Date.parse(m.observedAt)>=Date.parse(session.closeAt),'Official issuer identity or observation mismatch');
  const recent=doc.filings?.recent,files=doc.filings?.files;
  requireThat(recent&&Array.isArray(recent.accessionNumber)&&recent.accessionNumber.length>0&&recent.accessionNumber.length<=2000&&Object.values(recent).every(v=>Array.isArray(v)&&v.length===recent.accessionNumber.length)&&new Set(recent.accessionNumber).size===recent.accessionNumber.length,'Official recent filing arrays incomplete or duplicated');
  requireThat(Array.isArray(files)&&files.length<=128&&files.every(f=>day(f.filingFrom)&&day(f.filingTo)&&f.filingTo<old.priceDate)&&recent.filingDate.every(day)&&recent.filingDate.reduce((a,b)=>a<b?a:b)<=old.priceDate,'Filing coverage gap or unfinished archive pagination');
  const applied=[];
  for(let i=0;i<recent.accessionNumber.length;i++){
   const at=recent.acceptanceDateTime[i];requireThat(instant(at)&&Date.parse(at)<=Date.parse(m.observedAt),'Malformed/future official acceptance clock');
   if(Date.parse(at)<=Date.parse(old.cutoff))continue;
   const accession=recent.accessionNumber[i],d=dispositions.get(accession);
   requireThat(d&&d.securityId===h.securityId&&String(Number(d.cik))===cik&&d.form===recent.form[i]&&d.acceptedAt===at&&d.metadataSha256===m.sourceSha256&&!seenFilings.has(accession),'Unresolved new filing, including a post-close disclosure');
   requireThat(['no_structural_change_dated_share_estimate','financial_fields_unresolved'].includes(d.decision)&&typeof d.reason==='string'&&d.reason.length>=30&&Array.isArray(d.evidence)&&d.evidence.length>0&&d.evidence.length<=4,'Explicit bounded structural-event disposition required');
   for(const e of d.evidence){const text=texts.get(e.sourceSha256);requireThat(text&&Array.isArray(e.excerpts)&&e.excerpts.length>0&&e.excerpts.every(s=>typeof s==='string'&&s.length>=12&&text.includes(s)),'Source body does not support the trusted event-review excerpts');}
   requireThat(Array.isArray(d.missingFields)&&d.missingFields.every(f=>['shares','equity','revenue'].includes(f))&&(d.decision==='financial_fields_unresolved'||d.missingFields.length===0),'Explicit per-field unresolved financial state required');
   for(const field of d.missingFields)missing.push({securityId:h.securityId,field,reason:'new_filing_unresolved'});
   applied.push(accession);seenFilings.add(accession);
  }
  for(const field of ['shares','equity','revenue']){const f=h[field];if(f===null)missing.push({securityId:h.securityId,field,reason:'previously_missing'});else if(age(delta.date,f.asOf)>policy.maxFactAgeDays)missing.push({securityId:h.securityId,field,reason:'expired_original_fact'});}
  issuerEvidence.push({securityId:h.securityId,symbol:h.symbol,cik,sourceSha256:m.sourceSha256,observedAt:m.observedAt,fromCutoff:old.cutoff,throughCutoff:session.closeAt,accessions:applied});
 }
 requireThat(seenFilings.size===dispositions.size,'Unused or duplicated reviewed filing disposition');
 const proof={schema:'validated-fixed-basket-price-roll-source-v1',methodVersion:PRICE_ROLL_METHOD,anchorInputSha256:policy.root.inputSha256,anchorRegistrySha256:policy.root.registrySha256,anchorCutoff:policy.anchorCutoff,date:delta.date,closeAt:session.closeAt,sourceReviewSha256:review.reviewSha256,calendarEvidenceKind:session.calendarEvidenceKind,calendarSha256:session.calendarSha256,prices:prices.map(p=>({securityId:p.securityId,sourceSha256:p.sourceSha256})),issuers:issuerEvidence,missingFields:missing,observedAt:delta.observedAt,preparedAt:delta.preparedAt,sharesMeaning:'dated_actual_reported_shares_estimate_not_unchanged_or_current_outstanding'};
 return {status:'source_gate_pass_not_publication_approval',publishable:false,prices,missingFields:missing,proof,proofSha256:hash(proof),session};
}
