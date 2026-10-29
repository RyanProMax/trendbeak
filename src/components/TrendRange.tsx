import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Market, MarketSnapshot } from "../market-types";
import { chartSegments, calendarForRange, shiftDate } from "../lib/chart-series";
import { dateDistance, jumpWindow, latestWindow, minimumWindowDays, resizeWindow, shiftWindow, windowDays, type TrendWindow } from "../lib/trend-window";
import { chartPath } from "../lib/chart-path";
import { displayDate } from "../lib/market-format";

type Mode = "start" | "end" | "move" | "track";
export default function TrendRangeControl({ bounds, value, benchmarks, onChange, onDragging }: {
 bounds: TrendWindow; value: TrendWindow; benchmarks: Record<Market,MarketSnapshot|null>; onChange:(window:TrendWindow)=>void; onDragging:(active:boolean)=>void;
}) {
 const help=useId(),track=useRef<HTMLDivElement>(null),[dragging,setDragging]=useState(false),frame=useRef<number|null>(null),queued=useRef<TrendWindow|null>(null);
 const gesture=useRef<{x:number;y:number;mode:Mode;window:TrendWindow;bounds:TrendWindow;active:boolean;vertical:boolean;span:number;pixels:number}|null>(null);
 const total=Math.max(1,dateDistance(bounds.start,bounds.end)),startIndex=dateDistance(bounds.start,value.start),endIndex=dateDistance(bounds.start,value.end),span=endIndex-startIndex,days=windowDays(value),minimum=minimumWindowDays(bounds);
 const position=(index:number)=>`calc(28px + ${index/total*100}% - ${index/total*56}px)`;
 const previews=useMemo(()=>(["CN","US"] as const).map((market,row)=>{
  const snapshot=benchmarks[market];if(!snapshot)return [];
  const points=Object.entries(snapshot.history).filter(([date])=>date>=bounds.start&&date<=bounds.end).sort(([a],[b])=>a.localeCompare(b)).map(([date,r])=>({date,value:r.price}));if(!points.length)return [];
  const values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values);
  const x=(date:string)=>dateDistance(bounds.start,date)/Math.max(1,dateDistance(bounds.start,bounds.end))*1000,y=(v:number)=>18+row*22-(v-min)/Math.max(1,max-min)*14;
  return chartSegments(calendarForRange(snapshot,bounds.end,windowDays(bounds)),points).map(segment=>({path:chartPath(segment,x,y),single:segment.length===1,x:x(segment[0].date),y:y(segment[0].value)}));
 }),[benchmarks,bounds.start,bounds.end]);
 const publish=(next:TrendWindow,immediate=false)=>{queued.current=next;if(immediate){if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;onChange(next);queued.current=null;}else if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;if(queued.current)onChange(queued.current);queued.current=null;});};
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
 const begin=(event:PointerEvent<HTMLDivElement>,mode:Mode)=>{if(event.button!==0)return;event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const rect=track.current!.getBoundingClientRect();gesture.current={x:event.clientX,y:event.clientY,mode,window:value,bounds,active:false,vertical:false,span:dateDistance(bounds.start,bounds.end),pixels:Math.max(1,rect.width-56)};};
 const move=(event:PointerEvent<HTMLDivElement>)=>{
  const g=gesture.current;if(!g)return;const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.active&&Math.abs(dy)>Math.max(8,Math.abs(dx))){g.vertical=true;return;}
  if(g.vertical||(!g.active&&(Math.abs(dx)<5||Math.abs(dx)<Math.abs(dy))))return;
  if(!g.active){g.active=true;setDragging(true);onDragging(true);}
  const delta=Math.round(dx/g.pixels*g.span);
  publish(g.mode==="start"||g.mode==="end"?resizeWindow(g.window,g.mode,shiftDate(g.window[g.mode],delta),g.bounds):shiftWindow(g.window,delta,g.bounds));
 };
 const finish=(event:PointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g)return;
  if(!g.vertical&&!g.active&&g.mode==="track"){const rect=track.current!.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(event.clientX-rect.left-28)/Math.max(1,rect.width-56)));publish(jumpWindow(g.window,shiftDate(g.bounds.start,Math.round(fraction*g.span)),g.bounds),true);}
  else if(queued.current)publish(queued.current,true);
  gesture.current=null;setDragging(false);onDragging(false);
 };
 const cancel=()=>{if(queued.current)publish(queued.current,true);gesture.current=null;setDragging(false);onDragging(false);};
 const key=(event:KeyboardEvent<HTMLDivElement>,mode:Exclude<Mode,"track">)=>{
  let delta=event.key==="ArrowLeft"||event.key==="ArrowDown"?-1:event.key==="ArrowRight"||event.key==="ArrowUp"?1:event.key==="PageUp"?-30:event.key==="PageDown"?30:0;
  if(event.shiftKey&&Math.abs(delta)===1)delta*=7;
  if(!delta&&event.key!=="Home"&&event.key!=="End")return;event.preventDefault();event.stopPropagation();
  let next:TrendWindow;
  if(mode==="move")next=shiftWindow(value,event.key==="Home"?-total:event.key==="End"?total:delta,bounds);
  else next=resizeWindow(value,mode,event.key==="Home"?(mode==="start"?bounds.start:shiftDate(value.start,minimum-1)):event.key==="End"?(mode==="end"?bounds.end:shiftDate(value.end,1-minimum)):shiftDate(value[mode],delta),bounds);
  publish(next,true);
 };
 return <div className="trend-range-control" role="group" aria-label="两市趋势范围" data-min={bounds.start} data-max={bounds.end} data-start={value.start} data-end={value.end}>
  <div className="navigator-caption"><span>两市 · {days} 日</span><span>{displayDate(value.start,true)} — {displayDate(value.end,true)}</span></div>
  <div className={`navigator-track${dragging?" is-dragging":""}`} ref={track} onPointerDown={e=>begin(e,"track")} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel}>
   <svg className="navigator-preview" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">{previews.flatMap((segments,row)=>segments.map((s,i)=>s.single?<circle key={`${row}-${i}`} cx={s.x} cy={s.y} r="1"/>:<path key={`${row}-${i}`} d={s.path} vectorEffect="non-scaling-stroke"/>))}</svg>
   <div className="navigator-window" style={{left:position(startIndex),right:`calc(28px + ${(1-endIndex/total)*100}% - ${(1-endIndex/total)*56}px)`}} role="slider" tabIndex={0} aria-label="移动趋势区间" aria-valuemin={0} aria-valuemax={Math.max(0,total-span)} aria-valuenow={startIndex} aria-valuetext={`${displayDate(value.start,true)}至${displayDate(value.end,true)}，${days}日`} aria-describedby={help} onPointerDown={e=>begin(e,"move")} onKeyDown={e=>key(e,"move")}><span className="navigator-pan-grip" aria-hidden="true" /></div>
   <div className="navigator-thumb navigator-start" style={{left:position(startIndex)}} role="slider" tabIndex={0} aria-label="趋势起始日期" aria-valuemin={0} aria-valuemax={Math.max(0,endIndex-minimum+1)} aria-valuenow={startIndex} aria-valuetext={displayDate(value.start,true)} aria-describedby={help} onPointerDown={e=>begin(e,"start")} onKeyDown={e=>key(e,"start")}/>
   <div className="navigator-thumb navigator-finish" style={{left:position(endIndex)}} role="slider" tabIndex={0} aria-label="趋势结束日期" aria-valuemin={Math.min(total,startIndex+minimum-1)} aria-valuemax={total} aria-valuenow={endIndex} aria-valuetext={displayDate(value.end,true)} aria-describedby={help} onPointerDown={e=>begin(e,"end")} onKeyDown={e=>key(e,"end")}/>
  </div>
  <div className="navigator-stops">{[365,180,90,30].map(count=><button key={count} type="button" aria-pressed={days===count&&value.end===bounds.end} title={`最近${count}日`} onClick={()=>publish(latestWindow(bounds,count),true)}>{count} 日</button>)}</div>
  <span className="sr-only" id={help}>拖动两端调整日期，拖动选区或下方握柄平移，点击轨道跳转。最少{minimum}自然日。方向键调整一天，Shift配合方向键调整七天，PageUp和PageDown调整三十天，Home和End到边界。快捷日期范围以最新观测为终点。</span>
 </div>;
}
