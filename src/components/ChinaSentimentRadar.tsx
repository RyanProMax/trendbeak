import CollapsiblePanel, {usePanelVisible} from "./CollapsiblePanel";
import {useEffect,useId,useRef,useState} from 'react';
import {autoUpdate,flip,FloatingFocusManager,FloatingPortal,hide,offset,shift,size,useDismiss,useFloating,useInteractions,useRole,useTransitionStyles} from '@floating-ui/react';
import {displayDate,number} from '../lib/market-format';
import {isExchangeClosed} from '../lib/exchange-calendar';
import './market-overview.css';

import {CHINA_FACTOR_LABELS,type ChinaFactor,type ChinaFactorReading} from '../lib/china-overview';
export {CHINA_FACTOR_LABELS} from '../lib/china-overview';
export type {ChinaFactor,ChinaFactorReading} from '../lib/china-overview';
/** Render already prepared observations only. Never rank raw values or apply CN
 * market factors to US instruments; absent historical dates stay empty. */
function RadarContent({date,readings,market='CN',labels=CHINA_FACTOR_LABELS}:{date:string;readings:Record<string,ChinaFactorReading>;market?:'CN'|'US';labels?:Record<string,string>}){
 const id=useId(),[selection,setSelection]=useState<{key:string;date:string;market:string}|null>(null),keys=Object.keys(labels),closed=isExchangeClosed(date,market);
 const visible=usePanelVisible();
 useEffect(()=>{if(!visible)setSelection(null);},[visible]);
 const active=visible&&selection?.date===date&&selection.market===market?selection.key:null;
 const keyboard=useRef(false),trigger=useRef<HTMLButtonElement|null>(null);
 const {refs,floatingStyles,context,middlewareData,x}=useFloating({open:!!active,onOpenChange:open=>{if(!open)setSelection(null);},placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,
  middleware:[offset(10),flip({padding:12}),shift({padding:12}),size({padding:12,apply({availableHeight,elements}){elements.floating.style.maxHeight=`${Math.max(0,availableHeight)}px`;}}),hide()]});
 const {getFloatingProps}=useInteractions([useDismiss(context,{outsidePress:event=>!(event.target instanceof Element&&event.target.closest('.six-factor-trigger'))}),useRole(context,{role:'dialog'})]);
 const {isMounted,styles:transitionStyles}=useTransitionStyles(context,{duration:keyboard.current?0:160,initial:{opacity:0,transform:'scale(.97)'},common:({side})=>({transformOrigin:`${Math.max(16,Math.min(320,(trigger.current?.getBoundingClientRect().left??0)+(trigger.current?.offsetWidth??0)/2-(x??0)))}px ${side==='top'?'bottom':'top'}`})});
 useEffect(()=>{setSelection(null);},[date,market]);
 useEffect(()=>{if(middlewareData.hide?.referenceHidden)setSelection(null);},[middlewareData.hide?.referenceHidden]);
 const point=(index:number,score:number)=>{const a=-Math.PI/2+index*Math.PI/3;return[180+Math.cos(a)*103*score/100,144+Math.sin(a)*103*score/100];};
 const score=(key:string)=>{const r=readings[key];return !closed&&r.date===date&&r.percentile!==null&&Number.isFinite(r.percentile)&&r.percentile>=0&&r.percentile<=100?r.percentile:null;};
 const formatRaw=(key:string)=>{const r=readings[key];if(r.date!==date||r.value===null||!Number.isFinite(r.value))return key==='limitRatio'&&r.counts?`${r.counts[0]} / ${r.counts[1]}`:'—';if(key==='turnover'&&r.value>=10000)return number(r.value/10000,2)+'万亿元';return number(r.value,['fearGreed','limitRatio','relativeTurnover'].includes(key)?2:['putCall','creditSpread'].includes(key)?3:1)+r.unit;};
 const scores=keys.map(score),grid=(level:number)=>keys.map((_,i)=>point(i,level).join(',')).join(' '),reading=active?readings[active]:null;
 const raw=reading&&reading.date===date&&reading.value!==null&&Number.isFinite(reading.value)?number(reading.value)+reading.unit:'—';
 return <section className="china-sentiment" aria-label={market==='CN'?'A股市场情绪':'美股市场情绪'} >

  <svg className="six-factor-graphic" viewBox="0 0 360 288" role="img" aria-label={market==='US'?'六项风险偏好分位，刻度0至100，外侧风险偏好较高':'六项历史分位，刻度0至100'}>
   {[25,50,75,100].map(n=><polygon key={n} data-level={n} points={grid(n)} className="six-factor-grid"/>)}
   {keys.map((key,i)=><line key={key} x1="180" y1="144" x2={point(i,100)[0]} y2={point(i,100)[1]} className="six-factor-grid"/>)}
   <text x="185" y="43" className="six-factor-tick">100</text><text x="185" y="94" className="six-factor-tick">50</text><text x="185" y="145" className="six-factor-tick">0</text>
   {scores.every(s=>s!==null)&&<polygon points={scores.map((s,i)=>point(i,s!).join(',')).join(' ')} className="six-factor-area"/>}
   {keys.map((key,i)=>{const p=point(i,119);return <text key={key} x={p[0]} y={p[1]+4} textAnchor="middle" className="six-factor-label">{(market==='CN'?['恐贪','RSI','宽度','涨跌停','成交额','换手']:['恐贪','新高新低','宽度','期权比','VIX','信用利差'])[i]}</text>;})}
   {scores.map((s,i)=>s===null?null:<circle key={keys[i]} cx={point(i,s)[0]} cy={point(i,s)[1]} r="3.5" className="six-factor-point"/>)}
  </svg>
  <div className="six-factor-readings">{keys.map(key=>{const percentile=score(key);return <button key={key} type="button" className="six-factor-trigger" data-radar-axis={key} aria-expanded={active===key} aria-haspopup="dialog" aria-controls={active===key?`${id}-detail`:undefined} onClick={event=>{keyboard.current=event.detail===0;trigger.current=event.currentTarget;refs.setReference(event.currentTarget);setSelection(active===key?null:{key,date,market});}}>
   <span className="six-factor-heading"><span>{labels[key]}</span><b className="radar-value">{closed?'休市':formatRaw(key)}</b></span>
   {!closed&&<span className="six-factor-percentile"><span className="six-factor-percentile-label"><span>{market==='US'?'风险偏好分位':'历史分位'}</span><span>{percentile===null?'—':`${number(percentile,1)}%`}</span></span><span className="six-factor-track" aria-hidden="true" data-missing={percentile===null||undefined}>{percentile!==null&&<span style={{width:`${percentile}%`}}/>}</span></span>}
  </button>;})}</div>
  {isMounted&&active&&reading&&<FloatingPortal><FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={trigger}>
   <div ref={refs.setFloating} style={floatingStyles} className="six-factor-popover-positioner" {...getFloatingProps()} id={`${id}-detail`} aria-labelledby={`${id}-title`}>
    <div className="overview-detail six-factor-popover" style={transitionStyles} data-keyboard={keyboard.current||undefined}>
     <header><strong id={`${id}-title`}>{labels[active]}</strong><button type="button" className="six-factor-close" aria-label="关闭指标详情" onClick={()=>setSelection(null)}>×</button></header>
     <p>{reading.method}{reading.counts&&` 计数：${reading.counts.join(' / ')}。`}</p>
     <dl><div><dt>原值</dt><dd>{closed?'休市':raw}</dd></div><div><dt>{market==='US'?'风险偏好分位':'历史分位'}</dt><dd>{score(active)===null?'—':`${number(score(active),1)}%`}</dd></div><div><dt>样本窗口</dt><dd>{reading.period}</dd></div><div><dt>数据日期</dt><dd>{reading.date===date&&reading.value!==null?<time dateTime={reading.date}>{displayDate(reading.date,true)}</time>:'—'}</dd></div></dl>
    </div>
   </div>
  </FloatingFocusManager></FloatingPortal>}

 </section>;
}

export default function ChinaSentimentRadar(props:{date:string;readings:Record<ChinaFactor,ChinaFactorReading>}){return <MarketSentimentRadar {...props}/>;}

export function MarketSentimentRadar(props:Parameters<typeof RadarContent>[0]){return <CollapsiblePanel panelKey="sentiment" title={props.market==='US'?'美股市场情绪':'A股市场情绪'} readout={<time dateTime={props.date}>{displayDate(props.date,true)}</time>}><RadarContent {...props}/></CollapsiblePanel>;}
