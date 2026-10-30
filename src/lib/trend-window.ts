import type { MarketSnapshot } from "../market-types";
import { shiftDate } from "./chart-series";
export interface TrendWindow { start: string; end: string }
export const dateDistance = (start: string,end: string) => Math.round((Date.parse(end)-Date.parse(start))/86400000);
export const windowDays = (window: TrendWindow) => dateDistance(window.start,window.end)+1;
export function historyBounds(snapshots: (MarketSnapshot | null)[]): TrendWindow | null {
 const dates = snapshots.flatMap(snapshot=>Object.keys(snapshot?.history ?? {})).sort();
 return dates.length ? { start:dates[0],end:dates.at(-1)! } : null;
}
export const minimumWindowDays = (bounds: TrendWindow) => Math.min(7,windowDays(bounds));
export function clampWindow(window: TrendWindow,bounds: TrendWindow): TrendWindow {
 const total=windowDays(bounds),length=Math.max(minimumWindowDays(bounds),Math.min(total,windowDays(window))),maxStart=shiftDate(bounds.end,1-length);
 const start=window.start<bounds.start?bounds.start:window.start>maxStart?maxStart:window.start;
 return {start,end:shiftDate(start,length-1)};
}
export function latestWindow(bounds: TrendWindow,days=365): TrendWindow {return clampWindow({start:shiftDate(bounds.end,1-days),end:bounds.end},bounds);}
export function shiftWindow(window: TrendWindow,days: number,bounds: TrendWindow): TrendWindow {return clampWindow({start:shiftDate(window.start,Math.round(days)),end:shiftDate(window.end,Math.round(days))},bounds);}
export function resizeWindow(window: TrendWindow,side: "start"|"end",date: string,bounds: TrendWindow): TrendWindow {
 const gap=minimumWindowDays(bounds)-1;
 return side==="start" ? {start:date<bounds.start?bounds.start:date>shiftDate(window.end,-gap)?shiftDate(window.end,-gap):date,end:window.end}
 : {start:window.start,end:date>bounds.end?bounds.end:date<shiftDate(window.start,gap)?shiftDate(window.start,gap):date};
}
export function jumpWindow(window: TrendWindow,date: string,bounds: TrendWindow): TrendWindow {return shiftWindow(window,dateDistance(window.start,date)-Math.floor((windowDays(window)-1)/2),bounds);}

export const TREND_WINDOW_STORAGE_KEY = "trendbeak:window:v1";
/** Only a valid explicit selection is restored; automatic defaults are not persisted. */
export function parseTrendWindow(raw: string | null): TrendWindow | null {
 if(!raw)return null;
 try {
  const value=JSON.parse(raw),valid=(date:unknown):date is string=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  return value&&valid(value.start)&&valid(value.end)&&value.start<=value.end?{start:value.start,end:value.end}:null;
 } catch { return null; }
}
