// Explicit preparation only. Reuse our durable CN history; never fetch a source.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'vite';
import {connectD1} from './d1-client.mjs';
const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);if(i<0)return;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('Missing '+name);args.splice(i,2);return value;}
const file=option('--file'),backup=option('--backup'),remote=args.includes('--remote'),dryRun=args.includes('--dry-run');
if(!file||args.some(a=>!['--remote','--dry-run'].includes(a))||!dryRun&&!backup)throw Error('Usage: overview-import.mjs --file reviewed-view.json [--dry-run] [--remote] [--backup ABSOLUTE_PRIVATE_PATH]');
if((await stat(file)).size>150000)throw Error('Reviewed view exceeds 150 KB');
const input=JSON.parse(await readFile(file,'utf8'));
const connection=await connectD1(remote),vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});
try{
 const db=connection.db,key='CN/000300.SS',r=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=?').bind(key).all();
 if(!r.success||r.results.length!==1)throw Error('Existing CN benchmark required');
 const row=r.results[0],previous=JSON.parse(row.payload),now=Date.now();
 const {prepareChinaBenchmark,mergeReviewedOverview}=await vite.ssrLoadModule('/src/server/china-overview.ts');
 const initialized=await prepareChinaBenchmark(db,previous,[],!previous.overviewState);
 const payload=mergeReviewedOverview(initialized.payload,input);
 const {attachHTTP}=await vite.ssrLoadModule('/src/server/market-http.ts');
 const ready=await attachHTTP(db,{key,payload,text:'',bytes:0,processed:0},now);
 let writes=0;
 if(!dryRun&&ready.text!==row.payload){
  if(!backup.startsWith('/'))throw Error('Backup requires an absolute private path');
  await writeFile(backup,JSON.stringify({key,...row}),{flag:'wx',mode:0o600});
  const {writeMarketState}=await vite.ssrLoadModule('/src/server/market-sync.ts');
  await writeMarketState(db,ready,row.updated_at,now);writes=1;
 }
 console.log(JSON.stringify({key,remote,dryRun,dbWrites:writes,upstreamCalls:0,quoteDate:previous.view.asOf,quoteFetchedAt:previous.view.fetchedAt,overviewComputedRows:initialized.processed,overviewDates:Object.keys(payload.view.chinaOverview.history).length,valuationRows:payload.view.chinaOverview.valuations?.rows.length??0,responseBytes:Buffer.byteLength(ready.payload.http.body),rowBytes:ready.bytes,previousVersion:row.updated_at}));
}finally{await vite.close();await connection.close();}
