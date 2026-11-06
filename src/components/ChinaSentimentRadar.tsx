import {useId,useState} from 'react';
import {displayDate,number} from '../lib/market-format';
import {isExchangeClosed} from '../lib/exchange-calendar';
import './market-overview.css';

import {CHINA_FACTOR_LABELS,type ChinaFactor,type ChinaFactorReading} from '../lib/china-overview';
export {CHINA_FACTOR_LABELS} from '../lib/china-overview';
export type {ChinaFactor,ChinaFactorReading} from '../lib/china-overview';
/** Render already prepared observations only. Never rank raw values or apply CN
 * market factors to US instruments; absent historical dates stay empty. */
export default function ChinaSentimentRadar({date,readings}:{date:string;readings:Record<ChinaFactor,ChinaFactorReading>}){
 const id=useId(),[active,setActive]=useState<ChinaFactor|null>(null),keys=Object.keys(CHINA_FACTOR_LABELS) as ChinaFactor[],closed=isExchangeClosed(date,'CN');
 const point=(index:number,score:number)=>{const a=-Math.PI/2+index*Math.PI/3;return[180+Math.cos(a)*103*score/100,144+Math.sin(a)*103*score/100];};
 const score=(key:ChinaFactor)=>{const r=readings[key];return !closed&&r.date===date&&r.percentile!==null&&Number.isFinite(r.percentile)&&r.percentile>=0&&r.percentile<=100?r.percentile:null;};
 const formatRaw=(key:ChinaFactor)=>{const r=readings[key];if(r.date!==date||r.value===null||!Number.isFinite(r.value))return '—';if(key==='turnover'&&r.value>=10000)return number(r.value/10000,2)+'万亿元';return number(r.value,['fearGreed','limitRatio','relativeTurnover'].includes(key)?2:1)+r.unit;};
 const scores=keys.map(score),grid=(level:number)=>keys.map((_,i)=>point(i,level).join(',')).join(' '),reading=active?readings[active]:null;
 const raw=reading&&reading.date===date&&reading.value!==null&&Number.isFinite(reading.value)?number(reading.value)+reading.unit:'—';
 return <section className="china-sentiment" aria-label="A股市场情绪" onKeyDown={e=>{if(e.key==='Escape')setActive(null);}}>
  <header className="overview-heading"><h3>A股市场情绪</h3><time dateTime={date}>{displayDate(date,true)}</time></header>
  <svg className="six-factor-graphic" viewBox="0 0 360 288" role="img" aria-label="六项历史分位，刻度0至100">
   {[25,50,75,100].map(n=><polygon key={n} data-level={n} points={grid(n)} className="six-factor-grid"/>)}
   {keys.map((key,i)=><line key={key} x1="180" y1="144" x2={point(i,100)[0]} y2={point(i,100)[1]} className="six-factor-grid"/>)}
   <text x="185" y="43" className="six-factor-tick">100</text><text x="185" y="94" className="six-factor-tick">50</text><text x="185" y="145" className="six-factor-tick">0</text>
   {scores.every(s=>s!==null)&&<polygon points={scores.map((s,i)=>point(i,s!).join(',')).join(' ')} className="six-factor-area"/>}
   {keys.map((key,i)=>{const p=point(i,119);return <text key={key} x={p[0]} y={p[1]+4} textAnchor="middle" className="six-factor-label">{['恐贪','RSI','宽度','涨跌停','成交额','换手'][i]}</text>;})}
   {scores.map((s,i)=>s===null?null:<circle key={keys[i]} cx={point(i,s)[0]} cy={point(i,s)[1]} r="3.5" className="six-factor-point"/>)}
  </svg>
  <div className="six-factor-readings">{keys.map(key=><button key={key} type="button" className="six-factor-trigger" data-radar-axis={key} aria-expanded={active===key} aria-controls={`${id}-detail`} onClick={()=>setActive(active===key?null:key)}><span>{CHINA_FACTOR_LABELS[key]}</span><div className="six-factor-numbers"><b className="radar-value">{closed?'休市':formatRaw(key)}</b><small>{closed?'':score(key)===null?'—':`${number(score(key),1)}%`}</small></div></button>)}</div>
  {active&&reading&&<div className="overview-detail" id={`${id}-detail`}><strong>{CHINA_FACTOR_LABELS[active]}</strong><p>{reading.method}</p><dl><div><dt>原值</dt><dd>{closed?'休市':raw}</dd></div><div><dt>历史分位</dt><dd>{score(active)===null?'—':`${number(score(active),1)}%`}</dd></div><div><dt>样本窗口</dt><dd>{reading.period}</dd></div><div><dt>数据日期</dt><dd>{reading.date===date&&reading.value!==null?<time dateTime={reading.date}>{displayDate(reading.date,true)}</time>:'—'}</dd></div></dl>{reading.source&&<a href={reading.source.url} target="_blank" rel="noreferrer">{reading.source.name}</a>}</div>}
 </section>;
}
