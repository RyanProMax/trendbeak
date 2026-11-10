// Reviewed, sparse publisher observations only. No network or D1 in preparation.
import {createHash} from 'node:crypto';
import policy from '../data/us-theme-official-sources.json' with {type:'json'};
import rights from '../data/us-theme-rights.json' with {type:'json'};
export const officialThemeRights=rights.holds;
export const OFFICIAL_THEME_METHOD='prior-ten-years-midrank-v1';
export const officialThemePolicies=policy.series;
export const sha256=x=>createHash('sha256').update(x).digest('hex');
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const expectedHeaders=['Index','Price/earnings incl. negative','Price/earnings excl. negative','Price/book','Dividend yield (%) 3','Price/sales','Price/cash flow','','Trailing','Projected','Trailing','Projected','Trailing','Trailing','Trailing'];
export function parseSTXWSML(raw,url,observedAt,now=Date.now()){
 if(!Buffer.isBuffer(raw)||raw.length>2*1024*1024||!Number.isFinite(now)||!instant(observedAt)||Date.parse(observedAt)>now)throw Error('Invalid bounded source or observation clock');
 const u=new URL(url);if(u.origin!=='https://stoxx.com'||u.pathname!=='/index/stxwsml/'||u.hash||u.searchParams.getAll('factsheet').join()!=='true'||[...u.searchParams.keys()].some(k=>!['factsheet','d'].includes(k))||u.searchParams.getAll('d').length>1||u.searchParams.has('d')&&!/^\d{4}-\d{2}$/.test(u.searchParams.get('d')))throw Error('Unapproved STOXX URL/variant');
 const html=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 const visible=html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'');
 const tags=[...visible.matchAll(/<(?:link|meta)\b[^>]*>/gi)].map(m=>m[0]),attr=(s,k)=>new RegExp('\\b'+k+'=["\']([^"\']*)["\']','i').exec(s)?.[1];
 const canonical=tags.filter(t=>attr(t,'rel')==='canonical').map(t=>attr(t,'href')),title=tags.filter(t=>attr(t,'property')==='og:title').map(t=>attr(t,'content'));
 if(!same(canonical,['https://stoxx.com/index/stxwsml/'])||title.length!==1||!title[0]?.includes('(STXWSML) (CH1546182069)'))throw Error('STOXX identity mismatch');
 const dates=[...plain(visible).matchAll(/\(USD, Price\), all data as of ([A-Za-z]+ \d{1,2}, \d{4})/g)];
 if(dates.length!==1)throw Error('Ambiguous USD Price as-of');
 const parsed=Date.parse(dates[0][1]+' 00:00:00 GMT');if(!Number.isFinite(parsed)||new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(parsed)!==dates[0][1])throw Error('Invalid source date');const asOf=new Date(parsed).toISOString().slice(0,10);
 if(!date(asOf)||asOf<'2026-08-31'||asOf>observedAt.slice(0,10))throw Error('Pre-live or future source date');
 const sections=[...visible.matchAll(/<h3>Fundamentals<\/h3>\s*(<table\b[\s\S]*?<\/table>)/g)];if(sections.length!==1)throw Error('Ambiguous fundamentals table');const table=sections[0][1];
 const headers=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(m=>plain(m[1]));if(!same(headers,expectedHeaders))throw Error('Fundamentals column drift');
 const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c=>plain(c[1]))).filter(r=>r[0]==='STOXX Global Memory Semiconductors');if(rows.length!==1||rows[0].length!==9)throw Error('Ambiguous target row');
 const rejected=[],values={};for(const[m,col]of[['pb',5],['ps',7]]){const text=rows[0][col];if(/^\d+\.\d$/.test(text)&&Number.isFinite(Number(text))&&Number(text)>0)values[m]=Number(text);else if(/^\d+\.\d{2,}$/.test(text))throw Error('Source precision drift');else{values[m]=null;rejected.push({metric:m,raw:text,reason:['N/A','NA','-',''].includes(text)?'source-missing':'nonpositive-or-invalid-source-value'});}}
 return{date:asOf,...values,rejected};
}
export function parseCPQIndex(raw,url,observedAt,now=Date.now()){
 const canonicalUrl='https://www.proshares.com/our-etfs/leveraged-and-inverse/skyu';
 if(!Buffer.isBuffer(raw)||raw.length>512*1024||url!==canonicalUrl||!Number.isFinite(now)||!instant(observedAt)||Date.parse(observedAt)>now)throw Error('Invalid bounded index source or clock');
 const html=new TextDecoder('utf-8',{fatal:true}).decode(raw).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'');
 const canonical=[...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/gi)].map(m=>m[1]);if(!same(canonical,[canonicalUrl]))throw Error('Index canonical mismatch');
 const sections=[...html.matchAll(/<section\s+id="Index"\s*>([\s\S]*?)<\/section>/g)];if(sections.length!==1)throw Error('Exactly one labelled Index section required');const section=sections[0][1];
 if([...section.matchAll(/<h2[^>]*>\s*Index\s*<\/h2>/g)].length!==1||!plain(section).includes('ISE CTA Cloud Computing Index'))throw Error('Index identity missing');
 const dates=[...section.matchAll(/<p\s+id="index-asOfDate"[^>]*>\s*as of (\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/p>/g)];if(dates.length!==1)throw Error('Exactly one index date required');
 const d=dates[0],asOf=`${d[3]}-${d[1].padStart(2,'0')}-${d[2].padStart(2,'0')}`;if(!date(asOf)||asOf<'2011-01-01'||asOf>observedAt.slice(0,10))throw Error('Invalid index observation date');
 const pairs=[...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m=>[...m[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map(x=>plain(x[1]))).filter(r=>r.length===2);
 const pb=pairs.filter(r=>r[0]==='Price/Book Ratio'),counts=pairs.filter(r=>r[0]==='Total Number of Holdings');if(pb.length!==1||!/^\d+\.\d{2}$/.test(pb[0][1])||!Number.isFinite(Number(pb[0][1]))||Number(pb[0][1])<=0||counts.length!==1||!/^\d+$/.test(counts[0][1])||!Number.isSafeInteger(Number(counts[0][1]))||Number(counts[0][1])<1)throw Error('Invalid positive index PB or holding count');
 return{date:asOf,pb:Number(pb[0][1]),ps:null,numberOfIndexHoldings:Number(counts[0][1])};
}
function seriesFor(code){if(officialThemeRights[code])throw Error('Source permission pending');const p=officialThemePolicies.find(p=>p.code===code);if(!p)throw Error('Unapproved theme');return p;}
function sourceFor(p,o){const s=p.sources.find(s=>s.sha256===o.sourceDigest);if(!s||s.url!==o.sourceUrl||s.vintage!==o.sourceVintage||s.page!==o.sourcePage)throw Error('Unreviewed source identity');return s;}
function readings(p,observations){
 const history={};for(const o of observations){const prior=observations.filter(x=>x.date<o.date&&x.date>=`${Number(o.date.slice(0,4))-10}${o.date.slice(4)}`);
  const metric=k=>{if(o[k]===null)return{value:null,percentile:null,samples:0};const a=prior.filter(x=>x[k]!==null);return{value:o[k],percentile:null,samples:a.length,...(a.length?{from:a[0].date,through:a.at(-1).date}:{})};};
  history[o.date]={name:p.name,code:p.code,date:o.date,pb:metric('pb'),ps:metric('ps'),provenance:{source:p.source,seriesId:p.seriesId,publisher:p.publisher,url:o.sourceUrl,sourceDigest:o.sourceDigest,sourceVintage:o.sourceVintage,sourcePage:o.sourcePage,...(p.code==='CPQ'?{corroboratingEvidence:p.sources[0].corroboratingEvidence,numberOfIndexHoldings:p.sources[0].numberOfIndexHoldings}:{}),observedAt:o.observedAt,precisionDecimals:p.precisionDecimals,frequency:p.frequency,pointInTime:false,methodologyNote:p.methodologyNote}};
 }return history;
}
export function validateOfficialThemeState(state,now=Date.now()){
 if(!Number.isFinite(now))throw Error('Invalid execution clock');const p=seriesFor(state?.code);if(state.source!==p.source||state.name!==p.name||state.seriesId!==p.seriesId||state.method!==OFFICIAL_THEME_METHOD||state.reviewSha256!==p.reviewSha256||state.pointInTime!==false||state.precisionDecimals!==p.precisionDecimals||state.frequency!==p.frequency||!Array.isArray(state.observations)||!state.observations.length||state.observations.length>10||Buffer.byteLength(JSON.stringify(state))>32768)throw Error('Invalid official checkpoint scope');
 let last='';for(const o of state.observations){const s=sourceFor(p,o);if(!date(o.date)||o.date<=last||!instant(o.observedAt)||Date.parse(o.observedAt)>now||o.date>o.observedAt.slice(0,10)||o.availability!=='original-publication-time-unverified'||!same(o.rejected,s.rejections.filter(r=>r.date===o.date))||!s.values.some(r=>same(r,[o.date,o.pb,o.ps])))throw Error('Unapproved observation');last=o.date;}
 if(!same(state.history,readings(p,state.observations)))throw Error('Prepared view does not match exact observed dates/values');return state;
}
export function prepareOfficialTheme(inputs,now=Date.now()){
 if(!Array.isArray(inputs)||!inputs.length||inputs.length>3||new Set(inputs.map(i=>i.code)).size!==1)throw Error('One bounded official series required');const p=seriesFor(inputs[0].code),byDate=new Map();
 for(const input of inputs){if(!Buffer.isBuffer(input.bytes)||input.bytes.length>4*1024*1024||!instant(input.observedAt)||Date.parse(input.observedAt)>now)throw Error('Invalid source bytes/clock');const digest=sha256(input.bytes),s=p.sources.find(s=>s.sha256===digest);if(!s||s.bytes!==input.bytes.length||s.url!==input.sourceUrl)throw Error('Original bytes are not reviewed');
  if(p.code==='CPQ'){const parsed=parseCPQIndex(input.bytes,input.sourceUrl,input.observedAt,now);if(!same([[parsed.date,parsed.pb,parsed.ps]],s.values)||parsed.numberOfIndexHoldings!==s.numberOfIndexHoldings)throw Error('Index extraction disagrees with reviewed record');for(const ref of s.corroboratingEvidence){const found=input.corroboratingEvidence?.find(e=>e.sourceUrl===ref.url);if(!found||!Buffer.isBuffer(found.bytes)||found.bytes.length!==ref.bytes||sha256(found.bytes)!==ref.sha256)throw Error('Exact corroborating index PDF required');}}
  let values=s.values;if(p.code==='STXWSML'){const parsed=parseSTXWSML(input.bytes,input.sourceUrl,input.observedAt,now);values=[[parsed.date,parsed.pb,parsed.ps]];if(!same(values,s.values))throw Error('Source extraction disagrees with reviewed record');}
  for(const[d,pb,ps]of values){const observation={date:d,pb,ps,sourceUrl:s.url,sourceDigest:digest,sourceVintage:s.vintage,sourcePage:s.page,observedAt:input.observedAt,availability:'original-publication-time-unverified',rejected:s.rejections.filter(r=>r.date===d)};const previous=byDate.get(d);if(previous){if(previous.pb!==pb||previous.ps!==ps)throw Error('Conflicting same-date source values');continue;}byDate.set(d,observation);}
 }
 const observations=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),state={source:p.source,code:p.code,name:p.name,method:OFFICIAL_THEME_METHOD,seriesId:p.seriesId,reviewSha256:p.reviewSha256,pointInTime:false,precisionDecimals:p.precisionDecimals,frequency:p.frequency,observations,history:readings(p,observations)};return validateOfficialThemeState(state,now);
}
