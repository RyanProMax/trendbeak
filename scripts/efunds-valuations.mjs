// Controlled private preparation only. No D1, reader import or source approval.
import{readFile,writeFile,rename,open,unlink,stat}from'node:fs/promises';
import{pathToFileURL}from'node:url';
const SOURCE='efunds_index',MAX_FULL_BYTES=8*1024*1024,TAIL_BYTES=16384,MAX_ROWS=8000,MAX_RETAINED=2700;
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const code=c=>typeof c==='string'&&/^(?:\d{6}|HSI|HSTECH)$/.test(c);
const strong=t=>typeof t==='string'&&/^"[^"\r\n]+"$/.test(t);
const url=c=>{if(!code(c))throw Error('Invalid index code');return`https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_${c}.json`;};
const cutoff=d=>{const v=new Date(d);v.setUTCFullYear(v.getUTCFullYear()-10);return v.toISOString().slice(0,10);};
const value=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0;
function normalize(input,c,today){
 if(!Array.isArray(input)||!input.length||input.length>MAX_ROWS)throw Error('Valuation row budget exceeded or empty');let last='';
 return input.map(r=>{if(!r||r.trdCode!==c||!date(r.trdDt)||r.trdDt>today||r.trdDt<=last||!value(r.pBLf??null)||!value(r.pSTtm??null))throw Error('Invalid valuation identity, date or raw value');last=r.trdDt;return[r.trdDt,r.pBLf??null,r.pSTtm??null];});
}
function bound(a,v,upper=false){let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>>1;if(a[mid]<v||upper&&a[mid]===v)lo=mid+1;else hi=mid;}return lo;}
function change(a,v,remove){if(v===null)return;const i=bound(a,v);if(remove){if(a[i]!==v)throw Error('Invalid valuation calculation checkpoint');a.splice(i,1);}else a.splice(i,0,v);}
export function valuationReading(state){const row=state.rows.at(-1),metric=(v,a,column)=>{if(v===null)return{value:null,percentile:null};const n=a.length-1,p=n<60?null:100*(bound(a,v)+(bound(a,v,true)-bound(a,v)-1)/2)/n;return{value:v,percentile:p===null?null:Math.round(p*10000)/10000,from:state.rows.find(r=>r[column]!==null)?.[0],samples:n};};
 return{name:state.name,code:state.code,date:row[0],pb:metric(row[1],state.pb,1),ps:metric(row[2],state.ps,2)};
}
export function efundsDetail(input,expected){
 const d=input?.data;if(input?.success!==true||input.code!=='0000'||!code(expected)||d?.trdCode!==expected||typeof d.indexName!=='string'||!d.indexName.trim()||d.indexName.length>80)throw Error('Index detail identity mismatch');
 // authorizedIndex describes platform index eligibility, not HTTP availability or a redistribution licence.
 if(d.valuationPercentileJson!==url(expected))throw Error('Unrecognized official valuation URL');
 return{code:expected,name:d.indexName,url:d.valuationPercentileJson}; // Availability is not redistribution permission.
}
export function initializeEfunds(detail,input,etag,today){
 if(!date(today)||!strong(etag)||detail.url!==url(detail.code))throw Error('Invalid initialization metadata');
 const all=normalize(input,detail.code,today),rows=all.filter(r=>r[0]>=cutoff(all.at(-1)[0]));if(rows.length>MAX_RETAINED)throw Error('Retained window exceeds 2700 dates');
 const state={source:SOURCE,code:detail.code,name:detail.name,etag,rows,pb:rows.flatMap(r=>r[1]===null?[]:[r[1]]).sort((a,b)=>a-b),ps:rows.flatMap(r=>r[2]===null?[]:[r[2]]).sort((a,b)=>a-b)};
 return{checkpoint:state,reading:valuationReading(state),sampleFrom:rows[0][0],samples:{pb:Math.max(0,state.pb.length-(rows.at(-1)[1]===null?0:1)),ps:Math.max(0,state.ps.length-(rows.at(-1)[2]===null?0:1))},initializedRows:all.length};
}
/** Validate a disk-input boundary once, without sorting or rebuilding ranks. */
export function validateEfundsCheckpoint(c,today){
 if(c?.source!==SOURCE||!code(c.code)||typeof c.name!=='string'||!strong(c.etag)||!Array.isArray(c.rows)||!c.rows.length||c.rows.length>MAX_RETAINED||!date(today))throw Error('Invalid disk checkpoint');
 const counts=[new Map(),new Map()];let last='';for(const r of c.rows){if(!Array.isArray(r)||r.length!==3||!date(r[0])||r[0]<=last||r[0]>today||!value(r[1])||!value(r[2]))throw Error('Invalid checkpoint observation');last=r[0];for(let i=0;i<2;i++)if(r[i+1]!==null)counts[i].set(r[i+1],(counts[i].get(r[i+1])??0)+1);}
 for(const[i,a]of[c.pb,c.ps].entries()){if(!Array.isArray(a)||a.length>MAX_RETAINED)throw Error('Invalid sorted checkpoint');for(let j=0;j<a.length;j++){const v=a[j],n=counts[i].get(v);if(typeof v!=='number'||!Number.isFinite(v)||v<=0||j&&a[j-1]>v||!n)throw Error('Invalid sorted checkpoint');if(n===1)counts[i].delete(v);else counts[i].set(v,n-1);}if(counts[i].size)throw Error('Incomplete sorted checkpoint');}
 return c;
}
/** Scan backwards from a verified array suffix. Balanced objects and escaped
 * quotes allow the first partial row to be discarded without parsing it. */
export function parseValuationTail(text){
 let i=text.length-1;while(i>=0&&/\s/.test(text[i]))i--;if(text[i--]!==']')throw Error('Valuation suffix is not an array end');const rows=[];
 while(i>=0){while(i>=0&&/\s/.test(text[i]))i--;if(i<0||text[i]==='[')break;if(text[i]!=='}')throw Error('Invalid valuation suffix separator');const end=i+1;let depth=0,quoted=false,start=-1;
  for(;i>=0;i--){const c=text[i];if(c==='"'){let escapes=0;for(let k=i-1;k>=0&&text[k]==='\\';k--)escapes++;if(escapes%2===0)quoted=!quoted;continue;}if(quoted)continue;if(c==='}')depth++;if(c==='{'&&--depth===0){start=i--;break;}}
  if(start<0)break;rows.unshift(JSON.parse(text.slice(start,end)));if(rows.length>32)throw Error('Valuation suffix exceeds 32 complete rows');
  while(i>=0&&/\s/.test(text[i]))i--;if(i>=0&&text[i]===',')i--;else if(i>=0&&text[i]!=='[')throw Error('Invalid valuation row boundary');
 }
 if(!rows.length)throw Error('No complete valuation rows in suffix');return rows;
}
export function mergeEfunds(previous,input,etag,today){
 if(previous?.source!==SOURCE||!code(previous.code)||!strong(etag)||!date(today)||!Array.isArray(previous.rows)||!previous.rows.length||previous.rows.length>MAX_RETAINED||!Array.isArray(previous.pb)||!Array.isArray(previous.ps))throw Error('Invalid local valuation checkpoint');
 const incoming=normalize(input,previous.code,today);if(incoming.length>32||incoming.at(-1)[0]<previous.rows.at(-1)[0]||!incoming.some(r=>r[0]===previous.rows.at(-1)[0]))throw Error('Valuation overlap lost; explicit repair required');
 const byDate=new Map(incoming.map(r=>[r[0],r]));for(const r of previous.rows)if(r[0]>=incoming[0][0]&&r[0]<=incoming.at(-1)[0]&&!byDate.has(r[0]))throw Error('A stored observation disappeared; explicit repair required');
 const state={...previous,etag,rows:previous.rows.map(r=>[...r]),pb:[...previous.pb],ps:[...previous.ps]},positions=new Map(state.rows.map((r,i)=>[r[0],i]));let processed=0;
 const repairFrom=previous.rows.at(-5)?.[0]??previous.rows[0][0];
 for(const r of incoming){const i=positions.get(r[0]);if(i!==undefined){const old=state.rows[i];if(old[1]===r[1]&&old[2]===r[2])continue;if(r[0]<repairFrom)throw Error('Older valuation correction requires explicit bounded repair');change(state.pb,old[1],true);change(state.ps,old[2],true);state.rows[i]=r;}else{if(r[0]<previous.rows.at(-1)[0])throw Error('Historical insertion requires explicit repair');state.rows.push(r);}change(state.pb,r[1],false);change(state.ps,r[2],false);processed++;}
 const from=cutoff(state.rows.at(-1)[0]);while(state.rows[0][0]<from){const expired=state.rows.shift();change(state.pb,expired[1],true);change(state.ps,expired[2],true);}if(state.rows.length>MAX_RETAINED)throw Error('Valuation window budget exceeded');
 return{checkpoint:state,reading:valuationReading(state),processed,sampleFrom:state.rows[0][0],samples:{pb:Math.max(0,state.pb.length-(state.rows.at(-1)[1]===null?0:1)),ps:Math.max(0,state.ps.length-(state.rows.at(-1)[2]===null?0:1))}};
}
async function body(response,limit){const reader=response.body?.getReader();if(!reader)throw Error('Empty valuation response');const chunks=[];let n=0;try{for(;;){const{done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw Error('Valuation byte budget exceeded');}chunks.push(value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
export async function refreshEfunds(previous,today,read=fetch){
 if(previous?.source!==SOURCE||!strong(previous.etag)||!code(previous.code))throw Error('Existing initialization required');
 const r=await read(url(previous.code),{headers:{Range:`bytes=-${TAIL_BYTES}`,'If-None-Match':previous.etag,'Accept-Encoding':'identity'},signal:AbortSignal.timeout(12000),redirect:'error'});
 const tag=r.headers.get('etag');if(r.status===304){await r.body?.cancel();if(tag!==previous.etag)throw Error('Invalid conditional response');return{checkpoint:previous,unchanged:true,processed:0,bytes:0};}
 const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get('content-range')??'');
 if(r.status!==206||!range||!strong(tag)||![null,'identity'].includes(r.headers.get('content-encoding'))){await r.body?.cancel();throw Error(`Source HTTP ${r.status} or unverified byte range; no full fallback`);}
 const[start,end,total]=range.slice(1).map(Number),size=end-start+1;if(!Number.isSafeInteger(total)||total>MAX_FULL_BYTES||end!==total-1||start!==Math.max(0,total-TAIL_BYTES)||size<1||size>TAIL_BYTES){await r.body?.cancel();throw Error('Unexpected valuation range');}
 const text=await body(r,size);if(Buffer.byteLength(text)!==size)throw Error('Truncated valuation range');
 return{...mergeEfunds(previous,parseValuationTail(text),tag,today),unchanged:false,bytes:size};
}
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),o={};while(args.length){const k=args.shift();if(!/^--[a-z]+$/.test(k??'')||!args.length||Object.hasOwn(o,k))throw Error('Invalid options');o[k]=args.shift();}
 if(!o['--out']||Object.keys(o).some(k=>!['--out','--checkpoint','--detail','--history','--etag','--code','--today'].includes(k)))throw Error('Specify a private output and explicit inputs');
 const read=async(file,max)=>{if(!file||(await stat(file)).size>max)throw Error('Local valuation input exceeds budget');return JSON.parse(await readFile(file,'utf8'));};
 const lock=await open(o['--out']+'.lock','wx');try{
  const today=o['--today']??new Date().toISOString().slice(0,10);let result;
  if(mode==='init'){const d=efundsDetail(await read(o['--detail'],262144),o['--code']);result=initializeEfunds(d,await read(o['--history'],MAX_FULL_BYTES),o['--etag'],today);}
  else if(mode==='refresh')result=await refreshEfunds(validateEfundsCheckpoint(await read(o['--checkpoint'],1048576),today),today);
  else throw Error('Use explicit init with saved inputs, or refresh with an existing private checkpoint');
  if(result.unchanged){console.log(JSON.stringify({privateOnly:true,productionWrites:0,checkpointWritten:false,source:SOURCE,unchanged:true,processed:0,bytes:0}));return;}
  const text=JSON.stringify(result.checkpoint);let same=false;try{same=await readFile(o['--out'],'utf8')===text;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!same){await writeFile(o['--out']+'.tmp',text);await rename(o['--out']+'.tmp',o['--out']);}
  const{checkpoint,...report}=result;console.log(JSON.stringify({privateOnly:true,productionWrites:0,checkpointWritten:!same,source:SOURCE,...report}));
 }finally{await lock.close();await unlink(o['--out']+'.lock');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
