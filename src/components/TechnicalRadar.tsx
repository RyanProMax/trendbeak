import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MarketSnapshot } from "../market-types";
import { displayDate, number } from "../lib/market-format";
import { RADAR_STOPS, radarColor, radarFactors, radarSegments, type RadarId } from "../lib/radar-signals";

export default function TechnicalRadar({snapshot,date}:{snapshot:MarketSnapshot;date:string}) {
  const factors=useMemo(()=>radarFactors(snapshot,date),[snapshot,date]),segments=useMemo(()=>radarSegments(factors),[factors]);
  const [active,setActive]=useState<RadarId|null>(null),[width,setWidth]=useState(584),root=useRef<HTMLElement>(null),buttons=useRef<Partial<Record<RadarId,HTMLButtonElement>>>({});
  const pinned=useRef<RadarId|null>(null),suppressFocus=useRef(false),id=useId();
  useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(root.current);return()=>observer.disconnect();},[]);
  const factor=factors.find(item=>item.id===active),cx=width/2,cy=182,r=Math.max(32,Math.min(108,(width-184)/2));
  const point=(index:number,score:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [cx+Math.cos(angle)*r*score/100,cy+Math.sin(angle)*r*score/100];};
  const polygon=(score:number)=>factors.map((_,i)=>point(i,score).join(",")).join(" ");
  const complete=factors.every(item=>item.score!==null),formatted=(value:typeof factors[number])=>value.value===null?"暂无数据":`${number(value.value,value.digits,value.id==="trend"||value.id==="change")}${value.unit}`;
  const close=(restore=false)=>{const old=active;pinned.current=null;setActive(null);if(restore&&old){const target=buttons.current[old];if(target&&document.activeElement!==target){suppressFocus.current=true;target.focus({preventScroll:true});}}};
  return <section className="technical-signals radar-signals" ref={root} aria-label={`${snapshot.instrument.name}技术指标`} data-radar-date={date}
    onPointerLeave={event=>{if(event.pointerType==="mouse"&&!pinned.current&&!root.current?.contains(document.activeElement))setActive(null);}}
    onBlur={event=>{if(!root.current?.contains(event.relatedTarget)&&!pinned.current&&!root.current?.matches(":hover"))setActive(null);}}
    onKeyDown={event=>{if(event.key==="Tab")pinned.current=null;if(event.key==="Escape"&&active){event.preventDefault();event.stopPropagation();close(true);}}}>
    <div className="radar-stage">
      <svg className="radar-graphic" viewBox={`0 0 ${width} 366`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
        <title id={`${id}-title`}>四项独立技术指标</title><desc id={`${id}-desc`}>中心0偏冷或偏弱，外围100偏热或偏强。归一化仅用于绘图，不合成贪恐分或面积分数。缺失指标不画点。轴旁保留原始值与单位，可聚焦、点击或轻触查看口径。</desc>
        <defs>{[false,true].map(stroke=><radialGradient key={String(stroke)} id={`${id}-${stroke?"stroke":"fill"}`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r} colorInterpolation="sRGB">{RADAR_STOPS.map(stop=><stop key={stop.value} offset={`${stop.value}%`} stopColor={stop.color} stopOpacity={stroke?1:stop.value<35?.34:stop.value<65?.28:.32}/>)}</radialGradient>)}</defs>
        <polygon points={polygon(100)} fill="#fcfdfb"/>
        {[25,50,75,100].map(score=><polygon key={score} points={polygon(score)} fill="none" stroke={score===50?"#dce2d6":"#e9ede5"} strokeWidth={score===50?1.1:.8}/>)}
        {factors.map((item,i)=>{const [x,y]=point(i,100);return <line key={item.id} x1={cx} y1={cy} x2={x} y2={y} stroke="#e9ede5" strokeWidth=".8"/>;})}
        {segments.map((segment,index)=>segment.length>1?complete?<polygon key={index} className="radar-shape" points={segment.map(i=>point(i,factors[i].score!).join(",")).join(" ")} fill={`url(#${id}-fill)`} stroke={`url(#${id}-stroke)`} strokeWidth="2.5" strokeLinejoin="round"/>:<polyline key={index} className="radar-partial" points={segment.map(i=>point(i,factors[i].score!).join(",")).join(" ")} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.5"/>:null)}
        {factors.map((item,i)=>{if(item.score===null)return null;const [x,y]=point(i,item.score),color=radarColor(item.score);return <g key={item.id} data-radar-point={item.id} data-score={item.score}><circle cx={x} cy={y} r="8" fill={color} opacity=".12"/><circle className={`radar-point${active===item.id?" is-active":""}`} cx={x} cy={y} r={active===item.id?7:5} fill={color} stroke="#fff" strokeWidth="2.25"/></g>;})}
        <circle cx={cx} cy={cy} r="2" fill="#c2cbbb"/>
        {[0,50,100].map(score=><text key={score} x={cx+8} y={cy-r*score/100+4} className="radar-tick">{score}</text>)}
      </svg>
      {factors.map((item,i)=><button key={item.id} ref={element=>{if(element)buttons.current[item.id]=element;}} type="button" className={`radar-axis axis-${i}`} data-radar-axis={item.id} style={{"--radar-color":item.score===null?"#99a18f":radarColor(item.score),"--radar-bottom":`${cy+r+19}px`} as CSSProperties}
        aria-label={`${item.name}，原始值${formatted(item)}，查看说明`} aria-expanded={active===item.id} aria-controls={`${id}-explanation`}
        onPointerEnter={event=>{if(event.pointerType==="mouse"&&!pinned.current)setActive(item.id);}}
        onFocus={event=>{if(suppressFocus.current){suppressFocus.current=false;return;}if(!event.currentTarget.matches(":focus-visible"))return;if(!pinned.current||pinned.current===item.id)setActive(item.id);}}
        onClick={()=>{if(pinned.current===item.id)close();else{pinned.current=item.id;setActive(item.id);}}}>
        <span>{item.name}</span><b className="radar-value">{formatted(item)}</b>
      </button>)}
    </div>
    <div className={`radar-explanation-slot${factor?" is-open":""}`}>
      {factor&&<div className="radar-explanation" id={`${id}-explanation`} role="region" aria-label={`${factor.name}说明`}>
        <button className="explanation-close" type="button" aria-label="关闭指标说明" onClick={()=>close(true)}>×</button>
        <div className="radar-explanation-title"><strong>{factor.name}</strong><span>原始值 <b style={{color:factor.score===null?undefined:radarColor(factor.score)}}>{formatted(factor)}</b></span><span>图上刻度 <b style={{color:factor.score===null?undefined:radarColor(factor.score)}}>{factor.score===null?"未绘制":number(factor.score,1)}{factor.score!==null&&<small> / 100</small>}</b></span></div>
        <p>{factor.unavailable??factor.explanation}</p>
        <small>{factor.scale}；仅绘图，不合成贪恐分。</small>
        <div className="radar-source"><a href={snapshot.source.url} target="_blank" rel="noreferrer">{snapshot.source.name}</a><time dateTime={date}>{displayDate(date,true)}</time></div>
      </div>}
    </div>
  </section>;
}
