import{mkdir,rm}from'node:fs/promises';
import{join}from'node:path';
import{tmpdir}from'node:os';
import{createServer}from'vite';
import{connectD1}from'./d1-client.mjs';
import{readSentimentTail}from'./sentiment-tail.mjs';
const args=process.argv.slice(2),i=args.indexOf('--market'),market=args[i+1],remote=args.includes('--remote'),dryRun=args.includes('--dry-run');
if(i!==0||!['CN','US'].includes(market)||args.slice(2).some(a=>!['--remote','--dry-run'].includes(a)))throw Error('Usage: daily-sync.mjs --market CN|US [--remote] [--dry-run]');
const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});let connection,locked=false;const lock=join(tmpdir(),'trendbeak-daily-writer.lock');
try{
 const job=await vite.ssrLoadModule('/src/server/daily-sync.ts'),now=Date.now();
 if(!job.dailyPlan(market,now)){console.log(JSON.stringify({market,skipped:'closed_or_before_settlement',upstreamCalls:0,dbWrites:0}));}
 else{
  try{await mkdir(lock,{mode:0o700});locked=true;}catch(error){if(error.code==='EEXIST')throw Error('Daily writer lock exists; inspect the running or interrupted job before retrying');throw error;}
  connection=await connectD1(remote);
  const [sync,source]=await Promise.all([vite.ssrLoadModule('/src/server/market-sync.ts'),vite.ssrLoadModule('/src/server/market-data.ts')]);
  let upstreamCalls=0;
  const result=await job.runDailyMarket({db:connection.db,market,now,dryRun,readSentiment:(...args)=>readSentimentTail(...args,async(...input)=>{upstreamCalls++;return fetch(...input);}),async readQuote(symbol,previous){const url=sync.syncURL(market,symbol,'sync',previous.calculation.bars.at(-1).date,now),raw=await (async()=>{upstreamCalls++;return source.fetchJson(url);})();return{quote:market==='CN'?source.parseTencent(raw,symbol,now,true):source.parseYahoo(raw,symbol,now,true),split:!!Object.keys(raw.chart?.result?.[0]?.events?.splits??{}).length};}});
  console.log(JSON.stringify({...result,upstreamCalls}));
 }
}finally{await connection?.close();await vite.close();if(locked)await rm(lock,{recursive:true});}
