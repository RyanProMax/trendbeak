// Controlled writer only: verified HTTP byte ranges, never a full-history fallback.
const sources={
 baifenwei:{url:'https://baifenwei.com/data/fear-greed/fear-greed-full.csv',header:'date,fear_greed_index'},
 cnn_whit3rabbit:{url:'https://raw.githubusercontent.com/whit3rabbit/fear-greed-data/main/datasets/cnn_fear_greed.csv',header:'Date,Fear Greed,Rating'},
};
export async function readSentimentTail(source,from,to,read=fetch,availableThrough=to){
 if(availableThrough<to||!/^\d{4}-\d{2}-\d{2}$/.test(availableThrough))throw Error('Invalid source date boundary');
 const config=sources[source];if(!config)throw Error('No automatic synchronization for this source');
 const part=async(range,expected)=>{
  const response=await read(config.url,{headers:{Range:range,'Accept-Encoding':'identity',...(expected?{'If-Match':expected}:{})},signal:AbortSignal.timeout(12000)});
  const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')??''),tag=response.headers.get('etag');
  if(response.status!==206||!match||!tag||tag.startsWith('W/')||expected&&tag!==expected){await response.body?.cancel();throw Error('Source did not honor the bounded, consistent range; no full download attempted');}
  const [start,end,total]=match.slice(1).map(Number),expectedSize=end-start+1;
  if(!Number.isSafeInteger(total)||total<=end||expectedSize<1||expectedSize>4096||range==='bytes=0-127'&&(start!==0||end!==127)||range==='bytes=-4096'&&(end!==total-1||start!==Math.max(0,total-4096))){await response.body?.cancel();throw Error('Unexpected source range');}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty source range');let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expectedSize){await reader.cancel();throw Error('Source exceeded byte range');}chunks.push(value);}}finally{reader.releaseLock();}
  if(size!==expectedSize)throw Error('Truncated source range');
  return{start,total,tag,text:Buffer.concat(chunks).toString('utf8')};
 };
 const head=await part('bytes=0-127');if(head.text.replace(/^\uFEFF/,'').split(/\r?\n/)[0]!==config.header)throw Error('Unknown source CSV header');
 const tail=await part('bytes=-4096',head.tag);if(tail.total!==head.total)throw Error('Source changed between ranges');
 const lines=tail.text.split(/\r?\n/);if(tail.start>0)lines.shift();else lines.shift();
 if(lines.at(-1)==='')lines.pop(); // Last line may legitimately omit its final newline.
 const rows=new Map();let prior='',anchor=false;
 for(const line of lines){const fields=line.split(','),date=fields[0],score=Number(fields[1]);
  if(fields.length!==(source==='baifenwei'?2:3)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<prior||!fields[1]?.trim()||!Number.isFinite(score)||score<0||score>100)throw Error('Invalid source tail row');
  prior=date;if(date<from)anchor=true;if(date>availableThrough)throw Error('Source date exceeds actual market date');
  if(rows.has(date)&&rows.get(date)!==score)throw Error('Conflicting source duplicate');rows.set(date,score);
 }
 if(!anchor||!rows.has(to))throw Error('Recent source window is incomplete or not ready');
 return [...rows].filter(([date])=>date>=from&&date<=to).map(([date,score])=>({date,score}));
}
