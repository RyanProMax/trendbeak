import type { Market } from '../market-types';
import { hasExchangeCalendar, isExchangeClosed } from './exchange-calendar';
import { readerDate, readerMinutes } from '../server/market-clock';

/** Readiness follows the configured daily writer, independently of cache TTL:
 * CN 16:37 Shanghai runs have until 17:00; US 03:37 UTC runs have until
 * 03:50 UTC on the following calendar day (22:50/23:50 NY). Do not declare a
 * missing daily snapshot before its scheduled publication window has elapsed.
 * Real acquisition timestamps and closed-session validation stay unchanged. */
export function dailySnapshotCurrent(market:Market,asOf:string,fetchedAt:string,session:string,now:number):boolean {
  const fetched=Date.parse(fetchedAt);
  if(!Number.isFinite(fetched)||fetched>now||!['closed','trading'].includes(session)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)return false;
  const today=readerDate(now,market);
  if(asOf>today||asOf>readerDate(fetched,market)||!hasExchangeCalendar(asOf,market)||isExchangeClosed(asOf,market))return false;
  let expected=market==='US'?new Date(now-(3*60+50)*60000-86400000).toISOString().slice(0,10):today;
  if(market==='CN'&&readerMinutes(now,market)<17*60)expected=new Date(Date.parse(expected)-86400000).toISOString().slice(0,10);
  for(let steps=0;steps<14;steps++){
    if(!hasExchangeCalendar(expected,market))return false;
    if(!isExchangeClosed(expected,market))return asOf>=expected&&(asOf!==expected||session==='closed');
    expected=new Date(Date.parse(expected)-86400000).toISOString().slice(0,10);
  }
  return false;
}
