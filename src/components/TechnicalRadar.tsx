import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { autoUpdate, FloatingPortal, useDismiss, useFloating, useInteractions, type Middleware } from "@floating-ui/react";
import type { MarketSnapshot } from "../market-types";
import { number } from "../lib/market-format";
import { RADAR_STOPS, radarColor, radarFactors, radarSegments, radarHitArea, type RadarId } from "../lib/radar-signals";

export default function TechnicalRadar({snapshot,date}:{snapshot:MarketSnapshot;date:string}) {
  const factors=useMemo(()=>radarFactors(snapshot,date),[snapshot,date]),segments=useMemo(()=>radarSegments(factors),[factors]);
  const [active,setActive]=useState<RadarId|null>(null),[width,setWidth]=useState(584),root=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement|null>(null),pinned=useRef<RadarId|null>(null),suppressFocus=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),id=useId();
  const cancelClose=()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(root.current);return()=>{observer.disconnect();cancelClose();};},[]);
  const factor=factors.find(item=>item.id===active),cx=width/2,cy=182,r=Math.max(32,Math.min(108,(width-184)/2));
  const point=(index:number,score:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [cx+Math.cos(angle)*r*score/100,cy+Math.sin(angle)*r*score/100];};
  const coordinates=factors.map((item,i)=>item.score===null?null:point(i,item.score) as [number,number]);
  const polygon=(score:number)=>factors.map((_,i)=>point(i,score).join(",")).join(" ");
  const complete=factors.every(item=>item.score!==null),formatted=(value:typeof factors[number])=>value.value===null?"暂无数据":`${number(value.value,value.digits,value.id==="trend"||value.id==="change")}${value.unit}`;
  const close=(restore=false)=>{cancelClose();const target=trigger.current;pinned.current=null;setActive(null);if(restore&&target&&document.activeElement!==target){suppressFocus.current=true;target.focus({preventScroll:true});}};
  // Prefer a free corner near the inspected axis; narrow layouts flip outside the
  // diagram. Keep the entire diamond and every raw-value label unobscured.
  const avoid:Middleware={name:"radarAvoid",options:{active,width},fn:({rects,elements})=>{
    const box=stage.current!.getBoundingClientRect(),bounds=root.current!.getBoundingClientRect(),w=rects.floating.width,h=rects.floating.height;
    const scale=box.width/width,centerX=box.left+cx*scale,centerY=box.top+cy,radius=r*scale;
    const labels=[...root.current!.querySelectorAll(".radar-axis")].map(e=>e.getBoundingClientRect()),anchor=elements.reference.getBoundingClientRect(),ax=anchor.x+anchor.width/2,ay=anchor.y+anchor.height/2;
    const left=Math.max(12,bounds.left),right=Math.min(window.innerWidth-12,bounds.right),clampX=(x:number)=>Math.max(left,Math.min(right-w,x)),mid=clampX(ax-w/2);
    const index=Math.max(0,factors.findIndex(item=>item.id===active));
    const corners=[{x:left,y:box.top},{x:right-w,y:box.top},{x:right-w,y:box.bottom-h},{x:left,y:box.bottom-h}];
    const above={x:mid,y:box.top-h-12},below={x:mid,y:Math.max(centerY+radius,...labels.map(l=>l.bottom))+8};
    const neighbors=[...document.querySelectorAll(".chart-hit-area,.chart-axis-head span,.analysis-heading h3")].map(e=>e.getBoundingClientRect());
    const candidates=[corners[index],index<2?above:below,...corners.filter((_,i)=>i!==index),index<2?below:above];
    const scored=candidates.map((p,i)=>{
      const dx=Math.max(p.x-centerX,0,centerX-p.x-w),dy=Math.max(p.y-centerY,0,centerY-p.y-h);
      const collision=dx+dy<radius+8||[...labels,...neighbors].some(l=>p.x<l.right+6&&p.x+w>l.left-6&&p.y<l.bottom+6&&p.y+h>l.top-6);
      const overflow=Math.max(0,12-p.y)+Math.max(0,p.y+h-window.innerHeight+12)+Math.max(0,left-p.x)+Math.max(0,p.x+w-right);
      return {...p,cost:Number(collision)*1e6+overflow*1e4+i};
    }).sort((a,b)=>a.cost-b.cost);
    const best=scored[0];return {x:best.x,y:best.y,data:{anchorX:ax,anchorY:ay}};
  }};
  const {refs,floatingStyles,context,isPositioned}=useFloating({open:!!factor,onOpenChange:open=>{if(!open)close();},strategy:"fixed",middleware:[avoid],whileElementsMounted:autoUpdate});
  const dismiss=useDismiss(context),{getFloatingProps}=useInteractions([dismiss]);
  const activate=(item:RadarId,element:HTMLButtonElement)=>{cancelClose();trigger.current=element;refs.setReference(element);setActive(item);};
  const leave=()=>{cancelClose();if(!pinned.current)timer.current=setTimeout(()=>{if(!root.current?.querySelector(":focus-visible")&&!refs.floating.current?.contains(document.activeElement))setActive(null);},180);};
  const interaction=(item:RadarId)=>({
    onPointerEnter:(event:React.PointerEvent<HTMLButtonElement>)=>{if(event.pointerType==="mouse"){if(pinned.current!==item)pinned.current=null;activate(item,event.currentTarget);}},
    onPointerLeave:(event:React.PointerEvent<HTMLButtonElement>)=>{if(event.pointerType==="mouse")leave();},
    onFocus:(event:React.FocusEvent<HTMLButtonElement>)=>{if(suppressFocus.current){suppressFocus.current=false;return;}if(event.currentTarget.matches(":focus-visible")){pinned.current=null;activate(item,event.currentTarget);}},
    onClick:(event:React.MouseEvent<HTMLButtonElement>)=>{if(pinned.current===item)close();else{pinned.current=item;activate(item,event.currentTarget);}},
    "aria-expanded":active===item,"aria-controls":`${id}-explanation`
  });
  return <section className="technical-signals radar-signals" ref={root} aria-label={`${snapshot.instrument.name}技术指标`} data-radar-date={date}
    onBlur={event=>{if(!root.current?.contains(event.relatedTarget)&&!refs.floating.current?.contains(event.relatedTarget)&&!pinned.current)leave();}}
    onKeyDown={event=>{if(event.key==="Tab")pinned.current=null;if(event.key==="Escape"&&active){event.preventDefault();event.stopPropagation();close(true);}}}>
    <div className="radar-stage" ref={stage}>
      <svg className="radar-graphic" viewBox={`0 0 ${width} 366`} role="img" aria-label="四项独立技术指标" aria-describedby={`${id}-desc`}>
        <desc id={`${id}-desc`}>中心0偏冷或偏弱，外围100偏热或偏强。归一化仅用于绘图，不合成贪恐分或面积分数。缺失指标不画点。轴旁保留原始值与单位，可聚焦、点击或轻触数据点及指标查看口径。</desc>
        <defs>{[false,true].map(stroke=><radialGradient key={String(stroke)} id={`${id}-${stroke?"stroke":"fill"}`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r} colorInterpolation="sRGB">{RADAR_STOPS.map(stop=><stop key={stop.value} offset={`${stop.value}%`} stopColor={stop.color} stopOpacity={stroke?1:stop.value<35?.34:stop.value<65?.28:.32}/>)}</radialGradient>)}</defs>
        <polygon points={polygon(100)} fill="#fcfdfb"/>
        {[25,50,75,100].map(score=><polygon key={score} points={polygon(score)} fill="none" stroke={score===50?"#dce2d6":"#e9ede5"} strokeWidth={score===50?1.1:.8}/>)}
        {factors.map((item,i)=>{const [x,y]=point(i,100);return <line key={item.id} x1={cx} y1={cy} x2={x} y2={y} stroke="#e9ede5" strokeWidth=".8"/>;})}
        {segments.map((segment,index)=>segment.length>1?complete?<polygon key={index} className="radar-shape" points={segment.map(i=>point(i,factors[i].score!).join(",")).join(" ")} fill={`url(#${id}-fill)`} stroke={`url(#${id}-stroke)`} strokeWidth="2.5" strokeLinejoin="round"/>:<polyline key={index} className="radar-partial" points={segment.map(i=>point(i,factors[i].score!).join(",")).join(" ")} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.5"/>:null)}
        {factors.map((item,i)=>{if(item.score===null)return null;const [x,y]=point(i,item.score),color=radarColor(item.score);return <g key={item.id} data-radar-point={item.id} data-score={item.score}><circle className="radar-halo" cx={x} cy={y} r={active===item.id?12:8} fill={color} opacity={active===item.id?.22:.12}/><circle className={`radar-point${active===item.id?" is-active":""}`} cx={x} cy={y} r={active===item.id?7:5} fill={color} stroke="#fff" strokeWidth="2.25"/></g>;})}
        <circle cx={cx} cy={cy} r="2" fill="#c2cbbb"/>
        {[0,50,100].map(score=><text key={score} x={cx+8} y={cy-r*score/100+4} className="radar-tick">{score}</text>)}
      </svg>
      {factors.map((item,i)=><button key={item.id} type="button" className={`radar-axis axis-${i}`} data-radar-axis={item.id} style={{"--radar-color":item.score===null?"#99a18f":radarColor(item.score),"--radar-bottom":`${cy+r+19}px`} as CSSProperties}
        aria-label={`${item.name}，原始值${formatted(item)}，查看说明`} {...interaction(item.id)}>
        <span>{item.name}</span><b className="radar-value">{formatted(item)}</b>
      </button>)}
      {factors.map((item,i)=>{if(item.score===null)return null;const [x,y]=point(i,item.score);return <button key={item.id} type="button" className="radar-point-target" data-radar-hit={item.id} style={{left:`${x/width*100}%`,top:y,clipPath:radarHitArea(i,coordinates)}} aria-label={`${item.name}数据点，原始值${formatted(item)}`} {...interaction(item.id)}/>;})}
    </div>
    {factor&&<FloatingPortal><div className="radar-explanation" id={`${id}-explanation`} role="dialog" aria-label={`${factor.name}说明`} data-radar-factor={factor.id} ref={refs.setFloating} style={{...floatingStyles,visibility:isPositioned?"visible":"hidden"}} {...getFloatingProps({onPointerEnter:cancelClose,onPointerLeave:leave,onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();close(true);}}})}>
      <button className="explanation-close" type="button" aria-label="关闭指标说明" onClick={()=>close(true)}>×</button>
      <div className="radar-explanation-title"><strong><a href={snapshot.source.url} target="_blank" rel="noreferrer" aria-label={`${factor.name}，来源${snapshot.source.name}`}>{factor.name}</a></strong><b style={{color:factor.score===null?undefined:radarColor(factor.score)}}>{formatted(factor)}</b></div>
      <p>{factor.unavailable??factor.explanation}</p>
      <small>{factor.scale}</small>
    </div></FloatingPortal>}
  </section>;
}
