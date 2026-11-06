// Controlled writers only. A delayed invocation must not lose the prior close.
import type {Market} from '../market-types';
import {hasExchangeCalendar,isExchangeClosed} from '../lib/exchange-calendar';
import {readerDate,readerMinutes} from './market-clock';

export function completedSession(market:Market,now:number):string{
 if(!Number.isFinite(now))throw Error('Invalid synchronization time');
 let date=readerDate(now,market);
 if(!hasExchangeCalendar(date,market))throw Error('Exchange calendar is not available');
 if(readerMinutes(now,market)<(market==='CN'?990:1050))date=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
 for(let n=0;n<14;n++){
  if(!hasExchangeCalendar(date,market))throw Error('Exchange calendar is not available');
  if(!isExchangeClosed(date,market))return date;
  date=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
 }
 throw Error('No completed session within the bounded calendar window');
}
