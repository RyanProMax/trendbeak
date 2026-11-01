import type {Market} from '../market-types';
import {marketDate} from '../lib/market-signals';
/** Current Shanghai and post-2007 New York rules, without cold ICU formatting on
 * each HTTP isolate. Older timestamps retain the historical IANA conversion.
 * NIST: DST starts second Sunday March 02:00 EST, ends first Sunday Nov 02:00 EDT.
 * Keep the rules checked against runtime IANA in tests when timezone law changes. */
export function readerDate(time:number,market:Market):string{
 const year=new Date(time).getUTCFullYear();
 if(year<2007)return marketDate(time,market);
 let hours=8;
 if(market==='US'){
  const sunday=(month:number,n:number)=>1+(7-new Date(Date.UTC(year,month,1)).getUTCDay())%7+7*(n-1);
  const start=Date.UTC(year,2,sunday(2,2),7),end=Date.UTC(year,10,sunday(10,1),6);
  hours=time>=start&&time<end?-4:-5;
 }
 return new Date(time+hours*3600000).toISOString().slice(0,10);
}
