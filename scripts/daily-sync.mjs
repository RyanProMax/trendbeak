import{mkdir,rm}from'node:fs/promises';
import{join}from'node:path';
import{tmpdir}from'node:os';
import{createServer}from'vite';
import{connectD1}from'./d1-client.mjs';
import{readSentimentTail}from'./sentiment-tail.mjs';
const args=process.argv.slice(2),at=args.indexOf('--at'),time=at>=0?args.splice(at,2)[1]:undefined,now=time===undefined?Date.now():Date.parse(time),i=args.indexOf('--market'),market=args[i+1],remote=args.includes('--remote'),dryRun=args.includes('--dry-run'),catchUp=args.includes('--catch-up');
if(at>=0&&!time||!Number.isFinite(now)||time!==undefined&&(!time.endsWith('Z')||now>Date.now()+60000)||i!==0||!['CN','US'].includes(market)||args.slice(2).some(a=>!['--remote','--dry-run','--catch-up'].includes(a)))throw Error('Usage: daily-sync.mjs --market CN|US [--remote] [--dry-run] [--catch-up] [--at UTC_TIME]');
const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});let connection,locked=false;const lock=join(tmpdir(),'trendbeak-daily-writer.lock');
try{
 const job=await vite.ssrLoadModule('/src/server/daily-sync.ts'),{readerDate}=await vite.ssrLoadModule('/src/server/market-clock.ts');
 job.dailyPlan(market,now);
  try{await mkdir(lock,{mode:0o700});locked=true;}catch(error){if(error.code==='EEXIST')throw Error('Daily writer lock exists; inspect the running or interrupted job before retrying');throw error;}
  connection=await connectD1(remote);
  const [sync,source]=await Promise.all([vite.ssrLoadModule('/src/server/market-sync.ts'),vite.ssrLoadModule('/src/server/market-data.ts')]);
  let upstreamCalls=0;
  const result=await job.runDailyMarket({db:connection.db,market,now,dryRun,catchUp,readSentiment:(source,from,to)=>readSentimentTail(source,from,to,async(...input)=>{upstreamCalls++;return fetch(...input);},readerDate(now,market)),async readQuote(symbol,previous){const url=sync.syncURL(market,symbol,'sync',previous.calculation.bars.at(-1).date,now),raw=await (async()=>{upstreamCalls++;return source.fetchJson(url);})();return{quote:market==='CN'?source.parseTencent(raw,symbol,now,true):source.parseYahoo(raw,symbol,now,true),split:!!Object.keys(raw.chart?.result?.[0]?.events?.splits??{}).length};}});
  console.log(JSON.stringify({...result,upstreamCalls}));
}finally{await connection?.close();await vite.close();if(locked)await rm(lock,{recursive:true});}
