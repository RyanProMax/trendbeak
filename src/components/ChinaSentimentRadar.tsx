import {useId,useState} from 'react';
import {displayDate,number} from '../lib/market-format';
import {isExchangeClosed} from '../lib/exchange-calendar';
import './market-overview.css';

import {CHINA_FACTOR_LABELS,type ChinaFactor,type ChinaFactorReading} from '../lib/china-overview';
export {CHINA_FACTOR_LABELS} from '../lib/china-overview';
export type {ChinaFactor,ChinaFactorReading} from '../lib/china-overview';
/** Render already prepared observations only. Never rank raw values or apply CN
 * market factors to US instruments; absent historical dates stay empty. */
export function MarketSentimentRadar({date,readings,market='CN',labels=CHINA_FACTOR_LABELS}:{date:string;readings:Record<string,ChinaFactorReading>;market?:'CN'|'US';labels?:Record<string,string>}){
 const id=useId(),[active,setActive]=useState<string|null>(null),keys=Object.keys(labels),closed=isExchangeClosed(date,market);
 const point=(index:number,score:number)=>{const a=-Math.PI/2+index*Math.PI/3;return[180+Math.cos(a)*103*score/100,144+Math.sin(a)*103*score/100];};
 const score=(key:string)=>{const r=readings[key];return !closed&&r.date===date&&r.percentile!==null&&Number.isFinite(r.percentile)&&r.percentile>=0&&r.percentile<=100?r.percentile:null;};
 const formatRaw=(key:string)=>{const r=readings[key];if(r.date!==date||r.value===null||!Number.isFinite(r.value))return key==='limitRatio'&&r.counts?`${r.counts[0]} / ${r.counts[1]}`:'—';if(key==='turnover'&&r.value>=10000)return number(r.value/10000,2)+'万亿元';return number(r.value,['fearGreed','limitRatio','relativeTurnover'].includes(key)?2:['putCall','creditSpread'].includes(key)?3:1)+r.unit;};
 const scores=keys.map(score),grid=(level:number)=>keys.map((_,i)=>point(i,level).join(',')).join(' '),reading=active?readings[active]:null;
 const raw=reading&&reading.date===date&&reading.value!==null&&Number.isFinite(reading.value)?number(reading.value)+reading.unit:'—';
 return <section className="china-sentiment" aria-label={market==='CN'?'A股市场情绪':'美股市场情绪'} onKeyDown={e=>{if(e.key==='Escape')setActive(null);}}>
  <header className="overview-heading"><h3>{market==='CN'?'A股市场情绪':'美股市场情绪'}</h3><time dateTime={date}>{displayDate(date,true)}</time></header>
  <svg className="six-factor-graphic" viewBox="0 0 360 288" role="img" aria-label={market==='US'?'六项风险偏好分位，刻度0至100，外侧风险偏好较高':'六项历史分位，刻度0至100'}>
   {[25,50,75,100].map(n=><polygon key={n} data-level={n} points={grid(n)} className="six-factor-grid"/>)}
   {keys.map((key,i)=><line key={key} x1="180" y1="144" x2={point(i,100)[0]} y2={point(i,100)[1]} className="six-factor-grid"/>)}
   <text x="185" y="43" className="six-factor-tick">100</text><text x="185" y="94" className="six-factor-tick">50</text><text x="185" y="145" className="six-factor-tick">0</text>
   {scores.every(s=>s!==null)&&<polygon points={scores.map((s,i)=>point(i,s!).join(',')).join(' ')} className="six-factor-area"/>}
   {keys.map((key,i)=>{const p=point(i,119);return <text key={key} x={p[0]} y={p[1]+4} textAnchor="middle" className="six-factor-label">{(market==='CN'?['恐贪','RSI','宽度','涨跌停','成交额','换手']:['恐贪','新高新低','宽度','期权比','VIX','信用利差'])[i]}</text>;})}
   {scores.map((s,i)=>s===null?null:<circle key={keys[i]} cx={point(i,s)[0]} cy={point(i,s)[1]} r="3.5" className="six-factor-point"/>)}
  </svg>
  <div className="six-factor-readings">{keys.map(key=><button key={key} type="button" className="six-factor-trigger" data-radar-axis={key} aria-expanded={active===key} aria-controls={`${id}-detail`} onClick={()=>setActive(active===key?null:key)}><span>{labels[key]}</span><div className="six-factor-numbers"><b className="radar-value">{closed?'休市':formatRaw(key)}</b><small>{closed?'':score(key)===null?'—':`${number(score(key),1)}%`}</small></div></button>)}</div>
  {active&&reading&&<div className="overview-detail" id={`${id}-detail`}><strong>{labels[active]}</strong><p>{reading.method}{reading.counts&&` 计数：${reading.counts.join(' / ')}。`}</p><dl><div><dt>原值</dt><dd>{closed?'休市':raw}</dd></div><div><dt>{market==='US'?'风险偏好分位':'历史分位'}</dt><dd>{score(active)===null?'—':`${number(score(active),1)}%`}</dd></div><div><dt>样本窗口</dt><dd>{reading.period}</dd></div><div><dt>数据日期</dt><dd>{reading.date===date&&reading.value!==null?<time dateTime={reading.date}>{displayDate(reading.date,true)}</time>:'—'}</dd></div></dl>{reading.source&&<a href={reading.source.url} target="_blank" rel="noreferrer">{reading.source.name}</a>}</div>}
 </section>;
}

export default function ChinaSentimentRadar(props:{date:string;readings:Record<ChinaFactor,ChinaFactorReading>}){return <MarketSentimentRadar {...props}/>;}
