import {isUSBenchmark,type MarketSnapshot}from'../market-types';
import type{ChinaFactorReading}from'./china-overview';
export const US_LABELS={fearGreed:'恐惧贪婪指数',priceStrength:'新高新低',breadth:'市场宽度',putCall:'看跌看涨比',vix:'VIX 波动率',creditSpread:'信用利差'}as const;
export const US_KEYS=Object.keys(US_LABELS)as(keyof typeof US_LABELS)[];
export const US_SOURCE={name:'CNN · 社区存档',url:'https://github.com/whit3rabbit/fear-greed-data'};
export const US_METHODS=[
 'CNN恐惧贪婪指数原始总分。',
 'NYSE创52周新高与新低股票的净差比例。',
 'NYSE成交量的McClellan Volume Summation Index；不是上涨股票占比。',
 '五日平均看跌／看涨期权比；历史分位反向，较低比值对应较高风险偏好。',
 'Cboe VIX原值；历史分位反向，较低波动率对应较高风险偏好。',
 '高收益债与投资级债的收益率差；历史分位反向，较窄利差对应较高风险偏好。',
];
/** One dated observation, six raw values and six independent ranks. Equal dates
 * share the same preceding sample count. Nulls never become neutral scores. */
export type USRow=[values:number[],ranks:(number|null)[],samples:number];
export interface USOverview{sourceId:'cnn_whit3rabbit';history:Record<string,USRow>}
export function validUSOverview(v:any,today:string):v is USOverview{
 if(v?.sourceId!=='cnn_whit3rabbit'||!v.history||Array.isArray(v.history)||Object.keys(v.history).length>366)return false;
 return Object.entries(v.history).every(([d,r]:[string,any])=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=today&&Array.isArray(r)&&r.length===3&&Array.isArray(r[0])&&r[0].length===6&&r[0].every((n:any)=>typeof n==='number'&&Number.isFinite(n))&&r[0][0]>=0&&r[0][0]<=100&&r[0].slice(3).every((n:number)=>n>=0)&&Array.isArray(r[1])&&r[1].length===6&&Number.isInteger(r[2])&&r[2]>=0&&r[2]<=252&&r[1].every((n:any)=>n===null||r[2]>=60&&Number.isFinite(n)&&n>=0&&n<=100));
}
export function usReadings(snapshot:MarketSnapshot,date:string):Record<string,ChinaFactorReading>{
 const r=snapshot.instrument.market==='US'&&isUSBenchmark(snapshot.instrument.symbol)?snapshot.usOverview?.history[date]:undefined;
 const published=snapshot.sentiment?.observations.find(r=>r.date===date),report=snapshot.sentiment?.reportedObservations?.find(r=>r.date===date),fallback=published??report;
 return Object.fromEntries(US_KEYS.map((key,i)=>[key,{date,value:r?.[0][i]??(i===0?fallback?.value??null:null),percentile:r?.[1][i]??null,unit:['','%','点','倍','点','个百分点'][i],period:r?`此前${r[2]}个有效交易日（最多252日）`:'—',method:i===0&&!r&&report&&!published?'CNN同期报道读数，独立来源补录；没有同源分位。':US_METHODS[i],source:i===0&&!r&&fallback?(fallback.source??snapshot.sentiment!.source):US_SOURCE}]));
}
