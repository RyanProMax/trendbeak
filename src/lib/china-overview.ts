import type{MarketSnapshot}from'../market-types';
export const CHINA_FACTOR_LABELS={fearGreed:'恐惧贪婪指数',rsi:'RSI',breadth:'市场宽度',limitRatio:'涨跌停比',turnover:'沪深指数成交额',relativeTurnover:'深成相对换手率'}as const;
export type ChinaFactor=keyof typeof CHINA_FACTOR_LABELS;
export const CHINA_FACTORS=Object.keys(CHINA_FACTOR_LABELS)as ChinaFactor[];
export const FACTOR_METHODS:Record<ChinaFactor,{unit:string;method:string}>={
 fearGreed:{unit:'',method:'百分位发布的恐贪得分；历史位置采用独立分位规则。'},
 rsi:{unit:'',method:'沪深300收盘价的Wilder RSI14。'},
 breadth:{unit:'%',method:'开盘红上涨家数÷（上涨＋下跌＋平盘家数）。采用来源统计池，范围未披露，不等同原乐咕统计池。'},
 limitRatio:{unit:'倍',method:'开盘红报告的涨停家数÷跌停家数；来源统计池范围未披露，跌停为0时比值不定义，保留原始家数。'},
 turnover:{unit:'亿元',method:'上证指数000001与深证成指399001的同日成交额合计。'},
 relativeTurnover:{unit:'倍',method:'深证成指399001当日换手率÷此前60个完整交易日的平均换手率，不含当日。'},
};
export const OVERVIEW_SOURCES={
 baifenwei:{name:'百分位',url:'https://baifenwei.com/indicator/fear-greed/'},
 self_csi300_rsi14_tencent:{name:'沪深300 RSI14 · 腾讯行情',url:'https://gu.qq.com/sh000300'},
 eastmoney_index:{name:'东方财富指数行情',url:'https://quote.eastmoney.com/'},
 self_szse_turnover60_eastmoney:{name:'深成相对换手 · 东方财富行情',url:'https://quote.eastmoney.com/sz399001.html'},
 futu_opend:{name:'富途行情',url:'https://openapi.futunn.com/futu-api-doc/quote/get-valuation-detail.html'},
 self_kph_activity:{name:'开盘红计数 · 独立比例',url:'https://www.kaipanhong.com/'},
 self_legu_activity:{name:'乐咕计数 · 独立比例',url:'https://legulegu.com/stockdata/market-activity'},
 efunds_index:{name:'易方达平台 · 独立分位',url:'https://www.etf.com.cn/'},
}as const;
export type OverviewSource=keyof typeof OVERVIEW_SOURCES;
export type FactorCell=[value:number|null,percentile:number|null,samples:number,counts?:number[]];
export interface IndexValuation{name:string;code:string;date:string;pb:{value:number|null;percentile:number|null;from?:string;samples?:number};ps:{value:number|null;percentile:number|null;from?:string;samples?:number}}
export interface ChinaOverview{
 sourceIds:Partial<Record<ChinaFactor,OverviewSource>>;
 history:Record<string,Partial<Record<ChinaFactor,FactorCell>>>;
 valuations?:{sourceId:OverviewSource;period:string;rows:IndexValuation[]};
}
export interface ChinaFactorReading{date:string;value:number|null;unit:string;percentile:number|null;period:string;source:{name:string;url:string}|null;method:string;counts?:number[]}
/** A partial preparation must not replace the currently useful market signals.
 * Check only the six latest cells; historical navigation may still contain gaps. */
export function hasCompleteChinaOverview(snapshot:MarketSnapshot|null|undefined):boolean{
 if(snapshot?.instrument.market!=='CN'||snapshot.instrument.symbol!=='000300.SS')return false;
 const row=snapshot.chinaOverview?.history[snapshot.asOf];
 return CHINA_FACTORS.every(id=>row?.[id]?.[0]!=null&&row[id]![1]!=null);
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const date=(v:unknown,today:string):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=today;
const source=(v:unknown):v is OverviewSource=>typeof v==='string'&&Object.hasOwn(OVERVIEW_SOURCES,v);
const rank=(v:unknown)=>v===null||finite(v)&&v>=0&&v<=100;
export function validChinaOverview(value:any,today:string):value is ChinaOverview{
 if(!value||!value.sourceIds||!value.history||Array.isArray(value.history)||Object.keys(value.sourceIds).some(k=>!CHINA_FACTORS.includes(k as ChinaFactor)||!source(value.sourceIds[k])))return false;
 const rows=Object.entries(value.history);if(rows.length>366)return false;
 for(const[d,row]of rows){if(!date(d,today)||!row||typeof row!=='object'||Array.isArray(row))return false;
  for(const[id,c]of Object.entries(row as object)as [ChinaFactor,FactorCell][]){if(!CHINA_FACTORS.includes(id)||!Array.isArray(c)||(c.length!==3&&c.length!==4)||!rank(c[1])||!Number.isInteger(c[2])||c[2]<0||c[2]>252||c[0]!==null&&!finite(c[0])||c[1]!==null&&(c[0]===null||c[2]<60)||!source(value.sourceIds[id]))return false;
   if(c[3]&&(!['breadth','limitRatio'].includes(id)||!Array.isArray(c[3])||c[3].length!==(id==='breadth'?3:2)||c[3].some(n=>!Number.isInteger(n)||n<0||n>10000)))return false;
   if(c[0]!==null&&(c[0]<0||['fearGreed','rsi','breadth'].includes(id)&&c[0]>100||['turnover','relativeTurnover'].includes(id)&&c[0]===0))return false;
  }
 }
 if(value.valuations){const v=value.valuations;if(!source(v.sourceId)||typeof v.period!=='string'||!v.period.trim()||v.period.length>80||!Array.isArray(v.rows)||v.rows.length>33)return false;const seen=new Set();for(const r of v.rows){if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>40||typeof r.code!=='string'||r.code.length>24||seen.has(r.code)||!date(r.date,today))return false;seen.add(r.code);for(const metric of[r.pb,r.ps])if(!metric||!rank(metric.percentile)||metric.value!==null&&(!finite(metric.value)||metric.value<=0)||metric.value===null&&metric.percentile!==null||metric.from!==undefined&&(!date(metric.from,today)||metric.from>r.date)||metric.samples!==undefined&&(!Number.isInteger(metric.samples)||metric.samples<0||metric.samples>2700))return false;}}
 return true;
}
/** Exact-date lookup only. Existing published fear/RSI raw values remain useful
 * before their prepared ranks exist; the browser never computes a percentile. */
export function chinaReadings(snapshot:MarketSnapshot,date:string):Record<ChinaFactor,ChinaFactorReading>{
 const overview=snapshot.instrument.market==='CN'&&snapshot.instrument.symbol==='000300.SS'?snapshot.chinaOverview:undefined;
 return Object.fromEntries(CHINA_FACTORS.map(id=>{
  const cell=overview?.history[date]?.[id],fallback=id==='fearGreed'&&snapshot.instrument.market==='CN'?snapshot.sentiment?.observations.find(p=>p.date===date)?.value:id==='rsi'&&snapshot.instrument.market==='CN'&&snapshot.instrument.symbol==='000300.SS'?snapshot.history[date]?.values.rsi:undefined;
  const sourceId=cell?overview?.sourceIds[id]:id==='fearGreed'?'baifenwei':id==='rsi'?'self_csi300_rsi14_tencent':undefined;
  return[id,{date,value:cell?cell[0]:fallback??null,percentile:cell?.[1]??null,unit:FACTOR_METHODS[id].unit,period:cell?`此前${cell[2]}个有效交易日（最多252日）`:'—',source:sourceId?OVERVIEW_SOURCES[sourceId]:null,method:FACTOR_METHODS[id].method,...(cell?.[3]?{counts:cell[3]}:{})}];
 }))as Record<ChinaFactor,ChinaFactorReading>;
}
