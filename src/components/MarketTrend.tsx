import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { autoUpdate, FloatingPortal, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import type { MarketSnapshot, TrendRange } from "../market-types";
import { displayDate, number } from "../lib/market-format";
import { sentimentState, shiftDate, trendReading, trendSeries } from "../lib/chart-series";
import TrendScene from "./TrendScene";
import { sentimentColor } from "../lib/brand-palette";

export default function MarketTrend({ snapshot, benchmark, windowEnd, selectedDate, hoveredDate, range, visible, onHoverDate, onSelectDate, canSelectDate }: {
  snapshot: MarketSnapshot; benchmark: MarketSnapshot | null; windowEnd: string; selectedDate: string; hoveredDate: string | null; range: TrendRange;
  visible: { mood: boolean; index: boolean }; onHoverDate: (date: string | null) => void; onSelectDate: (date: string) => void; canSelectDate: (date: string) => boolean;
}) {
  const id = useId(), container = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(584), [open, setOpen] = useState(false);
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  useEffect(() => { if (!container.current) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width))); observer.observe(container.current); return () => observer.disconnect(); }, []);
  const series = useMemo(() => trendSeries(snapshot, benchmark, windowEnd, range), [snapshot, benchmark, windowEnd, range]);
  const { start, mood, prices } = series;
  const left = 32, right = Math.max(left + 90, width - 112), top = 20, bottom = 170;
  const values = prices.map((point) => point.value), low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 100;
  const padding = Math.max((high - low) * .18, high * .003, 1), min = Math.max(0, low - padding), max = high + padding;
  const x = (date: string) => left + (Date.parse(date) - Date.parse(start)) / 86400000 / (range - 1) * (right - left);
  const yMood = (value: number) => bottom - value / 100 * (bottom - top);
  const yPrice = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const inWindow = (date: string) => date >= start && date <= windowEnd;
  const activeDate = hoveredDate && inWindow(hoveredDate) ? hoveredDate : inWindow(selectedDate) ? selectedDate : null;
  const active = activeDate ? trendReading(snapshot, benchmark, activeDate) : null;
  const lastMood = mood.at(-1), lastPrice = prices.at(-1);
  let priceLabelY = lastPrice ? yPrice(lastPrice.value) : 55, moodLabelY = lastMood ? yMood(lastMood.value) : 120;
  if (Math.abs(priceLabelY - moodLabelY) < 42) { const priceFirst = priceLabelY <= moodLabelY; const base = Math.max(32, Math.min(115, Math.min(priceLabelY, moodLabelY))); priceLabelY = priceFirst ? base : base + 42; moodLabelY = priceFirst ? base + 42 : base; }
  priceLabelY = Math.max(32, Math.min(158, priceLabelY)); moodLabelY = Math.max(32, Math.min(151, moodLabelY));
  const tooltipWidth = Math.max(118, Math.min(220, right - left - 8));
  const { refs, floatingStyles, context } = useFloating({ open: open && !!active, onOpenChange: (next) => { setOpen(next); if (!next) onHoverDate(null); }, strategy: "fixed", placement: "top", middleware: [offset(10), shift({ padding: 12 })], whileElementsMounted: autoUpdate });
  const setSvgReference = useCallback((element: SVGSVGElement | null) => { svg.current = element; refs.setReference(element); }, [refs.setReference]);
  const dismiss = useDismiss(context), { getFloatingProps } = useInteractions([dismiss]);
  const positionTooltip = (date: string) => {
    const element = svg.current; if (!element) return;
    refs.setPositionReference({ contextElement: element, getBoundingClientRect: () => {
      const rect = element.getBoundingClientRect(), plotRight = Math.max(left + 90, rect.width - 112);
      const position = left + (Date.parse(date) - Date.parse(start)) / 86400000 / (range - 1) * (plotRight - left);
      const at = Math.max(left + tooltipWidth / 2, Math.min(plotRight - tooltipWidth / 2, position));
      return DOMRect.fromRect({ x: rect.left + at, y: rect.top + bottom, width: 0, height: 0 });
    } });
  };
  const inspect = (date: string) => { onHoverDate(date); setOpen(true); positionTooltip(date); };
  const pointerDate = (event: PointerEvent<SVGRectElement>) => {
    const rect = svg.current!.getBoundingClientRect(), local = (event.clientX - rect.left) / rect.width * width;
    return shiftDate(start, Math.round(Math.max(0, Math.min(1, (local - left) / (right - left))) * (range - 1)));
  };
  const valueText = active ? `${displayDate(active.date, true)}，情绪 ${active.mood === null ? "无观测" : number(active.mood, 1)}，${benchmark?.instrument.name ?? "大盘"} ${active.price === null ? active.closed ? "休市" : "无数据" : number(active.price)}` : "所选日期不在当前窗口";
  return <div className="trend-wrap" ref={container}>
    <div className="chart-axis-head"><span>{visible.mood ? "情绪 · 0–100" : ""}</span><span>{visible.index ? "指数点位" : ""}</span></div>
    <svg ref={setSvgReference} className="trend-chart interactive-trend" viewBox={`0 0 ${width} 218`} role="group" aria-labelledby={`${id}-title ${id}-desc`} data-start={start} data-end={windowEnd} data-range={range} data-price-observations={prices.length} data-emotion-observations={mood.length} data-active-date={activeDate ?? ""} data-price-min={min} data-price-max={max}>
      <title id={`${id}-title`}>{`${snapshot.instrument.market === "CN" ? "A 股" : "美股"}情绪与大盘，${range} 日`}</title>
      <desc id={`${id}-desc`}>情绪实线按分值从柔绿经金色到珊瑚红，低于20为绿、高于80为红，左轴0至100；深灰实线为大盘，右轴指数点位。窗口不随选日改变。左右键浏览日期，回车选择；缺失观测留空。</desc>
      {[0, 50, 100].map((value) => <g key={value}><line x1={left} x2={right} y1={yMood(value)} y2={yMood(value)} className="chart-grid" />{visible.mood && <text x="0" y={yMood(value) + 3} className="chart-tick">{value}</text>}{visible.index && prices.length > 0 && <text x={right + 7} y={yMood(value) + 3} className="chart-tick">{number(min + (max - min) * value / 100, 0)}</text>}</g>)}
      <TrendScene snapshot={snapshot} benchmark={benchmark} end={windowEnd} range={range} left={left} right={right} top={top} bottom={bottom} min={min} max={max} visible={visible} id={id} />
      {visible.index && lastPrice && <><circle className="index-dot" cx={x(lastPrice.date)} cy={yPrice(lastPrice.value)} r="2.5" /><text className="index-end" x={right + 58} y={priceLabelY}><tspan x={right + 58}>{benchmark!.instrument.name}</tspan><tspan x={right + 58} dy="14">{number(lastPrice.value)}</tspan></text></>}
      {visible.mood && lastMood && <><circle className="emotion-dot" fill={sentimentColor(lastMood.value)} cx={x(lastMood.date)} cy={yMood(lastMood.value)} r="2.5" /><text className="emotion-end" fill={lastMood ? sentimentColor(lastMood.value) : undefined} x={right + 58} y={moodLabelY}><tspan x={right + 58}>情绪 {number(lastMood.value, 1)}</tspan><tspan x={right + 58} dy="14">{sentimentState(lastMood.value)}</tspan></text></>}
      {visible.mood && !lastMood && <text x={(left + right) / 2} y="123" className="chart-empty" textAnchor="middle">暂无情绪数据</text>}
      {visible.index && !lastPrice && <text x={(left + right) / 2} y="65" className="chart-empty" textAnchor="middle">暂无大盘数据</text>}
      {!visible.mood && !visible.index && <text x={(left + right) / 2} y="95" className="chart-empty" textAnchor="middle">图例已隐藏</text>}
      {active && <g className="chart-active" pointerEvents="none"><line x1={x(active.date)} x2={x(active.date)} y1={top} y2={bottom} className="chart-crosshair" />{visible.mood && active.mood !== null && <circle cx={x(active.date)} cy={yMood(active.mood)} r="3.5" className="emotion-active" fill={sentimentColor(active.mood)} />}{visible.index && active.price !== null && <circle cx={x(active.date)} cy={yPrice(active.price)} r="4" className="index-active" />}<text x={Math.max(left + 22, Math.min(right - 22, x(active.date)))} y="189" textAnchor="middle" className="chart-active-date">{displayDate(active.date)}</text></g>}
      <text x={left} y="211" className="chart-tick">{displayDate(start)}</text><text x={right} y="211" textAnchor="end" className="chart-tick">{displayDate(windowEnd)}</text>
      <rect className="chart-hit-area" x={left} y={top} width={right - left} height={bottom - top} fill="transparent" tabIndex={0} role="slider" aria-label={`${snapshot.instrument.market === "CN" ? "A股" : "美股"}趋势日期`} aria-valuemin={0} aria-valuemax={range - 1} aria-valuenow={activeDate ? (Date.parse(activeDate) - Date.parse(start)) / 86400000 : range - 1} aria-valuetext={valueText}
        onPointerDown={(event) => { if (event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY, vertical: false }; event.currentTarget.setPointerCapture(event.pointerId); inspect(pointerDate(event)); }}
        onPointerMove={(event) => { if (gesture.current && Math.abs(event.clientY - gesture.current.y) > Math.max(10, Math.abs(event.clientX - gesture.current.x))) gesture.current.vertical = true; if (!gesture.current?.vertical && (event.pointerType === "mouse" || gesture.current)) inspect(pointerDate(event)); }}
        onPointerUp={(event) => { if (!gesture.current) return; const date = pointerDate(event); if (!gesture.current.vertical) { inspect(date); if (canSelectDate(date)) onSelectDate(date); } gesture.current = null; }}
        onPointerCancel={() => { gesture.current = null; setOpen(false); onHoverDate(null); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse" && !gesture.current) { setOpen(false); onHoverDate(null); } }}
        onFocus={() => inspect(activeDate ?? windowEnd)} onBlur={() => { setOpen(false); onHoverDate(null); }}
        onKeyDown={(event) => { const current = activeDate ?? windowEnd; const jump = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0; if (jump || event.key === "Home" || event.key === "End") { event.preventDefault(); inspect(event.key === "Home" ? start : event.key === "End" ? windowEnd : shiftDate(current, Math.max((Date.parse(start) - Date.parse(current)) / 86400000, Math.min((Date.parse(windowEnd) - Date.parse(current)) / 86400000, jump)))); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (canSelectDate(current)) onSelectDate(current); } }} />
      <rect className="chart-focus-ring" x={left - 4} y={top - 4} width={right - left + 8} height={bottom - top + 8} rx="4" fill="none" stroke={`url(#${id}-focus)`} pointerEvents="none" />
    </svg>
    <div className="trend-status" aria-live="polite">{!inWindow(selectedDate) ? `${displayDate(selectedDate)}不在当前 ${range} 日窗口` : mood.length < 2 && snapshot.sentiment?.historyUnavailable ? `情绪历史暂缺${lastMood ? ` · 最近观测 ${displayDate(lastMood.date)}` : ""}` : lastMood && lastMood.date !== windowEnd ? `情绪最近观测 ${displayDate(lastMood.date)}` : ""}</div>
    {open && active && <FloatingPortal><div className="chart-tooltip" ref={refs.setFloating} style={{ ...floatingStyles, width: tooltipWidth }} {...getFloatingProps({ role: "tooltip" })}><time dateTime={active.date}>{displayDate(active.date, true)}</time>{visible.mood && <div><span className="emotion-key">情绪</span><strong style={active.mood === null ? undefined : { color: sentimentColor(active.mood) }}>{active.mood === null ? "无观测" : number(active.mood, 1)}</strong></div>}{visible.index && <div><span>{benchmark?.instrument.name ?? "大盘"}</span><strong>{active.price === null ? active.closed ? "休市" : "无数据" : number(active.price)}</strong></div>}</div></FloatingPortal>}
  </div>;
}
