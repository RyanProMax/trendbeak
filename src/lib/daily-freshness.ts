import type { Market } from '../market-types';
import { hasExchangeCalendar, isExchangeClosed } from './exchange-calendar';
import { readerDate, readerMinutes } from '../server/market-clock';

/** Daily-view policy, separate from cache TTL: require the completed session one
 * hour after the regular close (CN 16:00, NY 17:00). NY early closes deliberately
 * retain that conservative cutoff; no remote calendar or intraday SLA implied.
 * Never call a stored partial session a completed daily observation. */
export function dailySnapshotCurrent(market:Market,asOf:string,fetchedAt:string,session:string,now:number):boolean {
  const fetched=Date.parse(fetchedAt);
  if(!Number.isFinite(fetched)||fetched>now||!['closed','trading'].includes(session)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)return false;
  const today=readerDate(now,market);
  if(asOf>today||asOf>readerDate(fetched,market)||!hasExchangeCalendar(asOf,market)||isExchangeClosed(asOf,market))return false;
  let expected=today;
  if(readerMinutes(now,market)<(market==='CN'?16:17)*60)expected=new Date(Date.parse(expected)-86400000).toISOString().slice(0,10);
  for(let steps=0;steps<14;steps++){
    if(!hasExchangeCalendar(expected,market))return false;
    if(!isExchangeClosed(expected,market))return asOf>=expected&&(asOf!==expected||session==='closed');
    expected=new Date(Date.parse(expected)-86400000).toISOString().slice(0,10);
  }
  return false;
}
