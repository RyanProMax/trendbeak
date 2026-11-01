import type {Market} from '../market-types';
import {marketDate} from '../lib/market-signals';
/** Current Shanghai and post-2007 New York rules, without cold ICU formatting on
 * each HTTP isolate. Older timestamps retain the historical IANA conversion.
 * NIST: DST starts second Sunday March 02:00 EST, ends first Sunday Nov 02:00 EDT.
 * Keep the rules checked against runtime IANA in tests when timezone law changes. */
function offset(time:number,market:Market):number{
 const year=new Date(time).getUTCFullYear();
 let hours=8;
 if(market==='US'){
  const sunday=(month:number,n:number)=>1+(7-new Date(Date.UTC(year,month,1)).getUTCDay())%7+7*(n-1);
  const start=Date.UTC(year,2,sunday(2,2),7),end=Date.UTC(year,10,sunday(10,1),6);
  hours=time>=start&&time<end?-4:-5;
 }
 return hours;
}
export function readerDate(time:number,market:Market):string{
 if(new Date(time).getUTCFullYear()<2007)return marketDate(time,market);
 return new Date(time+offset(time,market)*3600000).toISOString().slice(0,10);
}
export function readerMinutes(time:number,market:Market):number{
 if(new Date(time).getUTCFullYear()<2007){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:market==='CN'?'Asia/Shanghai':'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time);
  return Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value);
 }
 const local=new Date(time+offset(time,market)*3600000);
 return local.getUTCHours()*60+local.getUTCMinutes();
}
