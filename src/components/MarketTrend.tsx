import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import type { MarketSnapshot, TrendRange } from "../market-types";
import { displayDate, displayUpdate, number } from "../lib/market-format";
import { sentimentState, shiftDate, trendReading, trendSeries } from "../lib/chart-series";
import type { TrendWindow } from "../lib/trend-window";
import TrendScene from "./TrendScene";
import { sentimentColor } from "../lib/brand-palette";

export default function MarketTrend({snapshot,benchmark,bounds,windowEnd,selectedDate,hoveredDate,range,visible,onHoverDate,onSelectDate,canSelectDate}:{
 snapshot:MarketSnapshot;benchmark:MarketSnapshot|null;bounds:TrendWindow;windowEnd:string;selectedDate:string;hoveredDate:string|null;range:TrendRange;
 visible:{mood:boolean;index:boolean};onHoverDate:(date:string|null)=>void;onSelectDate:(date:string)=>void;canSelectDate:(date:string)=>boolean;
}) {
 const id=useId(),container=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),hit=useRef<SVGRectElement>(null),suppressFocus=useRef(false);
 const [width,setWidth]=useState(584),[open,setOpen]=useState(false),gesture=useRef<{x:number;y:number;vertical:boolean}|null>(null);
 useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)));observer.observe(container.current);return()=>observer.disconnect();},[]);
 const series=useMemo(()=>trendSeries(snapshot,benchmark,windowEnd,range),[snapshot,benchmark,windowEnd,range]),{start,mood,prices}=series;
 const left=34,right=Math.max(left+90,width-124),top=24,bottom=184,values=prices.map(p=>p.value),low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):100;
 const padding=Math.max((high-low)*.18,high*.003,1),min=Math.max(0,low-padding),max=high+padding;
 const x=(date:string)=>left+(Date.parse(date)-Date.parse(start))/86400000/Math.max(1,range-1)*(right-left),yMood=(value:number)=>bottom-value/100*(bottom-top),yPrice=(value:number)=>bottom-(value-min)/(max-min)*(bottom-top);
 const inWindow=(date:string)=>date>=start&&date<=windowEnd,activeDate=hoveredDate&&inWindow(hoveredDate)?hoveredDate:inWindow(selectedDate)?selectedDate:null,active=activeDate?trendReading(snapshot,benchmark,activeDate):null;
 const lastMood=mood.at(-1),lastPrice=prices.at(-1);let priceLabelY=lastPrice?yPrice(lastPrice.value):55,moodLabelY=lastMood?yMood(lastMood.value):120;
 if(Math.abs(priceLabelY-moodLabelY)<24){const first=priceLabelY<=moodLabelY,base=Math.max(top+12,Math.min(bottom-42,Math.min(priceLabelY,moodLabelY)));priceLabelY=first?base:base+26;moodLabelY=first?base+26:base;}
 priceLabelY=Math.max(top+12,Math.min(bottom-10,priceLabelY));moodLabelY=Math.max(top+12,Math.min(bottom-10,moodLabelY));
 const inspect=(date:string)=>{onHoverDate(date);setOpen(true);},close=(restore=false)=>{setOpen(false);onHoverDate(null);if(restore&&hit.current&&document.activeElement!==hit.current){suppressFocus.current=true;hit.current.focus({preventScroll:true});}};
 const pointerDate=(event:PointerEvent<SVGRectElement>)=>{const rect=svg.current!.getBoundingClientRect(),local=(event.clientX-rect.left)/rect.width*width;return shiftDate(start,Math.round(Math.max(0,Math.min(1,(local-left)/(right-left)))*(range-1)));};
 const priceText=active?.price===null?active.closed?"休市":"无数据":number(active?.price??null),marketName=snapshot.instrument.market==="CN"?"A股":"美股";
 const valueText=active?`${displayDate(active.date,true)}，情绪 ${active.mood===null?"无观测":number(active.mood,1)}，${benchmark?.instrument.name??"大盘"} ${priceText}`:"所选日期不在当前窗口";
 return <div className="trend-wrap" ref={container}>
  <div className="chart-axis-head"><span>{visible.mood?"情绪 · 0–100":""}</span><span>{visible.index?"指数点位":""}</span></div>
  <svg ref={svg} className="trend-chart interactive-trend" viewBox={`0 0 ${width} 250`} role="group" aria-label={`${marketName}情绪与大盘，${range}日`} aria-describedby={`${id}-desc`} data-start={start} data-end={windowEnd} data-range={range} data-price-observations={prices.length} data-emotion-observations={mood.length} data-active-date={activeDate??""} data-price-min={min} data-price-max={max}>
   <desc id={`${id}-desc`}>情绪实线按分值由绿经金到红，左轴0至100；深灰大盘实线使用右轴点位。窗口不随选日改变。左右键浏览日期，回车选择；缺失观测留空。读数显示在图下。</desc>
   {[0,50,100].map(value=><g key={value}><line x1={left} x2={right} y1={yMood(value)} y2={yMood(value)} className="chart-grid"/>{visible.mood&&<text x="0" y={yMood(value)+3} className="chart-tick">{value}</text>}{visible.index&&prices.length>0&&<text x={right+7} y={yMood(value)+3} className="chart-tick">{number(min+(max-min)*value/100,0)}</text>}</g>)}
   <TrendScene snapshot={snapshot} benchmark={benchmark} bounds={bounds} end={windowEnd} range={range} left={left} right={right} top={top} bottom={bottom} min={min} max={max} visible={visible} id={id}/>
   {visible.index&&lastPrice&&<><circle className="index-dot" cx={x(lastPrice.date)} cy={yPrice(lastPrice.value)} r="2.5"/><text className="index-end" x={width-4} y={priceLabelY+4} textAnchor="end" role="img" aria-label={`${benchmark!.instrument.name} ${number(lastPrice.value)}，${displayDate(lastPrice.date,true)}`} data-label-date={lastPrice.date}>{number(lastPrice.value)}</text></>}
   {visible.mood&&lastMood&&<><circle className="emotion-dot" fill={sentimentColor(lastMood.value)} cx={x(lastMood.date)} cy={yMood(lastMood.value)} r="2.5"/><text className="emotion-end" fill={sentimentColor(lastMood.value)} x={width-4} y={moodLabelY+4} textAnchor="end" role="img" aria-label={`情绪 ${number(lastMood.value,1)}，${displayDate(lastMood.date,true)}，${sentimentState(lastMood.value)}`} data-label-date={lastMood.date}>{number(lastMood.value,1)}</text></>}
   {visible.index&&!lastPrice&&<text x={(left+right)/2} y="65" className="chart-empty" textAnchor="middle">暂无大盘数据</text>}{!visible.mood&&!visible.index&&<text x={(left+right)/2} y="95" className="chart-empty" textAnchor="middle">图例已隐藏</text>}
   {active&&<g className="chart-active" pointerEvents="none"><line x1={x(active.date)} x2={x(active.date)} y1={top} y2={bottom} className="chart-crosshair"/>{visible.mood&&active.mood!==null&&<circle cx={x(active.date)} cy={yMood(active.mood)} r="3.5" className="emotion-active" fill={sentimentColor(active.mood)}/>} {visible.index&&active.price!==null&&<circle cx={x(active.date)} cy={yPrice(active.price)} r="4" className="index-active"/>}<text x={Math.max(left+22,Math.min(right-22,x(active.date)))} y="207" textAnchor="middle" className="chart-active-date">{displayDate(active.date)}</text></g>}
   <text x={left} y="237" className="chart-tick">{displayDate(start)}</text><text x={right} y="237" textAnchor="end" className="chart-tick">{displayDate(windowEnd)}</text>
   <rect ref={hit} className="chart-hit-area" x={left} y={top} width={right-left} height={bottom-top} fill="transparent" tabIndex={0} role="slider" aria-label={`${marketName}趋势日期`} aria-valuemin={0} aria-valuemax={range-1} aria-valuenow={activeDate?(Date.parse(activeDate)-Date.parse(start))/86400000:range-1} aria-valuetext={valueText} aria-describedby={open?`${id}-readout`:undefined}
    onPointerDown={event=>{if(event.button!==0)return;gesture.current={x:event.clientX,y:event.clientY,vertical:false};event.currentTarget.setPointerCapture(event.pointerId);inspect(pointerDate(event));}}
    onPointerMove={event=>{if(gesture.current&&Math.abs(event.clientY-gesture.current.y)>Math.max(10,Math.abs(event.clientX-gesture.current.x)))gesture.current.vertical=true;if(!gesture.current?.vertical&&(event.pointerType==="mouse"||gesture.current))inspect(pointerDate(event));}}
    onPointerUp={event=>{if(!gesture.current)return;const date=pointerDate(event);if(!gesture.current.vertical){inspect(date);if(canSelectDate(date))onSelectDate(date);}else close();gesture.current=null;}}
    onPointerCancel={()=>{gesture.current=null;close();}}
    onPointerLeave={event=>{if(event.pointerType==="mouse"&&!gesture.current&&document.activeElement!==event.currentTarget)close();}}
    onFocus={()=>{if(suppressFocus.current){suppressFocus.current=false;return;}inspect(activeDate??windowEnd);}}
    onBlur={event=>{if(!container.current?.contains(event.relatedTarget))close();}}
    onKeyDown={event=>{const current=activeDate??windowEnd,jump=event.key==="ArrowLeft"?-1:event.key==="ArrowRight"?1:0;if(jump||event.key==="Home"||event.key==="End"){event.preventDefault();inspect(event.key==="Home"?start:event.key==="End"?windowEnd:shiftDate(current,Math.max((Date.parse(start)-Date.parse(current))/86400000,Math.min((Date.parse(windowEnd)-Date.parse(current))/86400000,jump))));}else if(event.key==="Enter"||event.key===" "){event.preventDefault();if(canSelectDate(current))onSelectDate(current);}else if(event.key==="Escape"){event.preventDefault();close(true);}}}/>
   <rect className="chart-focus-ring" x={left-4} y={top-4} width={right-left+8} height={bottom-top+8} rx="4" fill="none" stroke={`url(#${id}-focus)`} pointerEvents="none"/>
  </svg>
  <div className="chart-readout-slot">{open&&active&&<div className="chart-readout" id={`${id}-readout`} role="group" aria-label={`${marketName}趋势读数`}>{visible.mood&&<span><i className="readout-mood"/>情绪 <b style={{color:active.mood===null?undefined:sentimentColor(active.mood)}}>{active.mood===null?"无观测":number(active.mood,1)}</b></span>}{visible.index&&<span><i className="readout-index"/>{benchmark?.instrument.name??"大盘"} <b>{priceText}</b></span>}<button type="button" className="explanation-close" aria-label={`关闭${marketName}趋势读数`} onClick={()=>close(true)}>×</button></div>}</div>
  <div className="trend-status" aria-live="polite">{[!inWindow(selectedDate)?`${displayDate(selectedDate)}不在当前 ${range} 日窗口`:"",benchmark?.freshness?.state==="stale"&&benchmark.instrument.symbol!==snapshot.instrument.symbol?`大盘暂未更新 · 最近更新${displayUpdate(benchmark.freshness.storedAt,benchmark.instrument.market)}（${benchmark.instrument.market==="CN"?"北京时间":"美东时间"}）`:""].filter(Boolean).join(" · ")}</div>
 </div>;
}
