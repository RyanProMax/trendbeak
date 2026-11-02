// Explicit scheduled/CLI writer. Never imported by HTTP readers.
import type {Market,MarketSnapshot} from '../market-types';
import {isExchangeClosed,hasExchangeCalendar} from '../lib/exchange-calendar';
import {readerDate,readerMinutes} from './market-clock';
import {prepareMarketState,writeMarketState,type MarketState} from './market-sync';
import {attachHTTP} from './market-http';
import {sentimentImportSQL,type SentimentInput} from './sentiment-import';
const symbols={CN:['000300.SS'],US:['^GSPC','NVDA']} as const;
export function dailyPlan(market:Market,now:number){
 const date=readerDate(now,market);
 if(!hasExchangeCalendar(date,market))throw Error('Exchange calendar is not available');
 if(isExchangeClosed(date,market)||readerMinutes(now,market)<(market==='CN'?16*60+30:17*60+30))return null;
 return{market,date,from:new Date(Date.parse(date)-14*86400000).toISOString().slice(0,10),source:market==='CN'?'baifenwei' as const:'cnn_whit3rabbit' as const,symbols:symbols[market]};
}
async function executeDailyMarket({db,market,now=Date.now(),readSentiment,readQuote,dryRun=false}:{db:D1Database;market:Market;now?:number;readSentiment:(source:string,from:string,to:string)=>Promise<SentimentInput[]>;readQuote:(symbol:string,previous:MarketState)=>Promise<{quote:MarketSnapshot;split?:boolean}>;dryRun?:boolean}){
 const plan=dailyPlan(market,now);if(!plan)return{market,skipped:'closed_or_before_settlement',dbWrites:0,upstreamCalls:0};
 const rows=await readSentiment(plan.source,plan.from,plan.date);
 if(!rows.length||rows.length>15||rows.at(-1)?.date!==plan.date||rows.some(r=>r.date<plan.from||r.date>plan.date||isExchangeClosed(r.date,market)))throw Error('Invalid completed-session sentiment window');
 for(let time=Date.parse(plan.from);time<=Date.parse(plan.date);time+=86400000){const date=new Date(time).toISOString().slice(0,10);if(!hasExchangeCalendar(date,market)||!isExchangeClosed(date,market)&&!rows.some(r=>r.date===date))throw Error('Recent sentiment trading date is missing; retain previous view');}
 sentimentImportSQL(market,plan.source,rows,'sync',now); // Validate complete input before any write.
 const oldScores=await db.prepare('SELECT date,score FROM sentiment_daily WHERE market=? AND source=? AND date>=? AND date<=? ORDER BY date LIMIT 16').bind(market,plan.source,plan.from,plan.date).all<{date:string;score:number}>();
 if(!oldScores.success||oldScores.results.length>15)throw Error('Sentiment correction window exceeds budget');
 const oldMap=new Map(oldScores.results.map(r=>[r.date,r.score]));
 if(oldScores.results.some(r=>!rows.some(n=>n.date===r.date)))throw Error('Source omitted a stored recent date; previous snapshot retained');
 const changed=rows.filter(r=>oldMap.get(r.date)!==r.score),timestamp=new Date(now).toISOString(),ready=[];
 // Validate and prepare every instrument before publishing any data.
 for(const symbol of plan.symbols){
  const key=`${market}/${symbol}`,r=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all<{payload:string;updated_at:string}>();
  if(!r.success||!r.results[0])throw Error('Daily jobs never initialize an unprepared instrument: '+key);
  const old=r.results[0],previous=JSON.parse(old.payload) as MarketState,{quote,split}=await readQuote(symbol,previous);
  if(quote.asOf!==plan.date||quote.session!=='closed')throw Error('Completed daily quote is not ready: '+key);
  const gap=(Date.parse(plan.date)-Date.parse(previous.view.asOf))/86400000;if(gap<0||gap>28)throw Error('Quote gap exceeds the controlled daily window');
  for(let time=Date.parse(previous.view.asOf)+86400000;time<=Date.parse(plan.date);time+=86400000){const date=new Date(time).toISOString().slice(0,10);if(!hasExchangeCalendar(date,market)||!isExchangeClosed(date,market)&&!quote.bars?.some(r=>r.date===date))throw Error('New quote trading date is missing; retain previous view');}
  let prepared=prepareMarketState(quote,'sync',previous,now,split);
  if(prepared.processed===0){prepared={...prepared,payload:previous,text:old.payload,bytes:new TextEncoder().encode(old.payload).length};}
  // Project staged source-specific changes without exposing an incomplete response.
  const overlay={
   prepare(sql:string){
    return{bind(...params:unknown[]){
     const statement=db.prepare(sql).bind(...params);
     return{async all(){
      const result=await statement.all();
      if(sql.startsWith('SELECT market,date,source,score,updated_at FROM sentiment_daily')){
       const byKey=new Map(result.results.map((r:any)=>[r.source+'/'+r.date,r]));
       for(const row of changed)byKey.set(plan.source+'/'+row.date,{market,date:row.date,source:plan.source,score:row.score,updated_at:timestamp});
       return{...result,results:[...byKey.values()].sort((a:any,b:any)=>a.source.localeCompare(b.source)||a.date.localeCompare(b.date))};
      }
      return result;
     }};
    }};
   }
  } as unknown as D1Database;
  prepared=await attachHTTP(overlay,prepared,now);ready.push({key,processed:prepared.processed,old,prepared:prepared.text===old.payload?null:prepared});
 }
 let writes=0;
 if(!dryRun){
  if(changed.length){const result=await db.prepare(sentimentImportSQL(market,plan.source,changed,'sync',now)).bind().run();if(!result.success)throw Error('Sentiment write failed; inspect state before retrying');writes+=result.meta.changes;}
  for(const row of ready)if(row.prepared){await writeMarketState(db,row.prepared,row.old.updated_at,now);writes++;}
 }
 return{market,date:plan.date,source:plan.source,dryRun,sentimentChanges:changed.length,dbWrites:writes,instruments:ready.map(r=>({key:r.key,computedRows:r.processed,snapshotChanged:!!r.prepared}))};
}

// Same-isolate guard only. The scheduled workflow provides cross-run serialization;
// the CLI also uses one local exclusive lock. CAS still protects each durable row.
const running=new WeakSet<D1Database>();
export async function runDailyMarket(options:Parameters<typeof executeDailyMarket>[0]){
 if(running.has(options.db))throw Error('Daily writer already running for this connection');
 running.add(options.db);try{return await executeDailyMarket(options);}finally{running.delete(options.db);}
}
