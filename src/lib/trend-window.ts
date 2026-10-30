import type { MarketSnapshot } from "../market-types";
import { shiftDate } from "./chart-series";
export interface TrendWindow { start: string; end: string }
export const MAX_WINDOW_DAYS=365;
export const dateDistance=(start:string,end:string)=>Math.round((Date.parse(end)-Date.parse(start))/86400000);
export const windowDays=(window:TrendWindow)=>dateDistance(window.start,window.end)+1;
const yearBounds=(bounds:TrendWindow):TrendWindow=>({start:bounds.start>shiftDate(bounds.end,1-MAX_WINDOW_DAYS)?bounds.start:shiftDate(bounds.end,1-MAX_WINDOW_DAYS),end:bounds.end});
export function historyBounds(snapshots:(MarketSnapshot|null)[]):TrendWindow|null {
 const dates=snapshots.flatMap(snapshot=>Object.keys(snapshot?.history??{})).sort();
 return dates.length?yearBounds({start:dates[0],end:dates.at(-1)!}):null;
}
export const minimumWindowDays=(bounds:TrendWindow)=>Math.min(7,windowDays(yearBounds(bounds)));
export function clampWindow(window:TrendWindow,rawBounds:TrendWindow):TrendWindow {
 const bounds=yearBounds(rawBounds),total=windowDays(bounds),length=Math.max(minimumWindowDays(bounds),Math.min(total,MAX_WINDOW_DAYS,windowDays(window))),maxStart=shiftDate(bounds.end,1-length);
 const start=window.start<bounds.start?bounds.start:window.start>maxStart?maxStart:window.start;
 return {start,end:shiftDate(start,length-1)};
}
export function latestWindow(bounds:TrendWindow,days=365):TrendWindow{return clampWindow({start:shiftDate(bounds.end,1-days),end:bounds.end},bounds);}
export function shiftWindow(window:TrendWindow,days:number,bounds:TrendWindow):TrendWindow{return clampWindow({start:shiftDate(window.start,Math.round(days)),end:shiftDate(window.end,Math.round(days))},bounds);}
export function resizeWindow(window:TrendWindow,side:"start"|"end",date:string,rawBounds:TrendWindow):TrendWindow {
 const bounds=yearBounds(rawBounds),value=clampWindow(window,bounds),gap=minimumWindowDays(bounds)-1;
 return side==="start"?{start:date<bounds.start?bounds.start:date>shiftDate(value.end,-gap)?shiftDate(value.end,-gap):date,end:value.end}
 :{start:value.start,end:date>bounds.end?bounds.end:date<shiftDate(value.start,gap)?shiftDate(value.start,gap):date};
}
export function jumpWindow(window:TrendWindow,date:string,bounds:TrendWindow):TrendWindow {const value=clampWindow(window,bounds);return shiftWindow(value,dateDistance(value.start,date)-Math.floor((windowDays(value)-1)/2),bounds);}
export const TREND_WINDOW_STORAGE_KEY="trendbeak:window:v2",LEGACY_TREND_WINDOW_STORAGE_KEY="trendbeak:window:v1";
export function parseTrendWindow(raw:string|null):TrendWindow|null {
 if(!raw)return null;
 try{const value=JSON.parse(raw),valid=(date:unknown):date is string=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 return value&&valid(value.start)&&valid(value.end)&&value.start<=value.end?{start:value.start,end:value.end}:null;}catch{return null;}
}
type WindowStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export function persistTrendWindow(storage:WindowStorage|null,value:TrendWindow,bounds:TrendWindow):TrendWindow {
 const normalized=clampWindow(value,bounds);try{if(storage){storage.setItem(TREND_WINDOW_STORAGE_KEY,JSON.stringify(normalized));storage.removeItem(LEGACY_TREND_WINDOW_STORAGE_KEY);}}catch{/* Optional storage cannot prevent the hard cap. */}return normalized;
}
export function restoreTrendWindow(storage:WindowStorage|null,bounds:TrendWindow|null):TrendWindow|null {
 try{const value=parseTrendWindow(storage?.getItem(TREND_WINDOW_STORAGE_KEY)??null)??parseTrendWindow(storage?.getItem(LEGACY_TREND_WINDOW_STORAGE_KEY)??null);
 return value&&bounds?persistTrendWindow(storage,value,bounds):value;}catch{return null;}
}
