import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { Market, MarketSnapshot, TrendRange } from "../market-types";
import { chartSegments, calendarForRange, shiftDate, snapTrendRange, TREND_RANGES } from "../lib/chart-series";
import { chartPath } from "../lib/chart-path";
import { displayDate } from "../lib/market-format";

export default function TrendRangeControl({ end, range, benchmarks, onChange }: {
  end: string; range: TrendRange; benchmarks: Record<Market, MarketSnapshot | null>; onChange: (range: TrendRange) => void;
}) {
  const track = useRef<HTMLDivElement>(null), [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  const start = shiftDate(end, -364), position = (days: number) => (365 - days) / 364 * 100;
  const previews = useMemo(() => (["CN", "US"] as const).map((market, row) => {
    const snapshot = benchmarks[market]; if (!snapshot) return [];
    const points = Object.entries(snapshot.history).filter(([date]) => date >= start && date <= end).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: value.price }));
    if (!points.length) return [];
    const values = points.map((point) => point.value), min = Math.min(...values), max = Math.max(...values);
    const x = (date: string) => (Date.parse(date) - Date.parse(start)) / 86400000 / 364 * 1000;
    const y = (value: number) => 18 + row * 22 - (value - min) / Math.max(1, max - min) * 14;
    return chartSegments(calendarForRange(snapshot, end), points).map((segment) => ({ path: chartPath(segment, x, y), single: segment.length === 1, x: x(segment[0].date), y: y(segment[0].value) }));
  }), [benchmarks, end, start]);
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = track.current!.getBoundingClientRect();
    onChange(snapTrendRange(365 - Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 364));
  };
  return <div className="trend-range-control" role="group" aria-label="两市趋势范围">
    <div className="navigator-caption"><span>两市 · 近 {range} 日</span><span>{displayDate(shiftDate(end, 1 - range), true)} — {displayDate(end, true)}</span></div>
    <div className={`navigator-track${dragging ? " is-dragging" : ""}`} ref={track} role="slider" tabIndex={0} aria-label="拖动选择趋势范围" aria-valuemin={30} aria-valuemax={365} aria-valuenow={range} aria-valuetext={`最近 ${range} 自然日，共 30、90、180、365 四档`} aria-describedby="trend-range-help"
      onPointerDown={(event) => { if (event.button !== 0) return; gesture.current = { x: event.clientX, y: event.clientY, vertical: false }; event.currentTarget.setPointerCapture(event.pointerId); if (event.pointerType === "mouse") { setDragging(true); fromPointer(event); } }}
      onPointerMove={(event) => { const current = gesture.current; if (!current) return; const dx = Math.abs(event.clientX - current.x), dy = Math.abs(event.clientY - current.y); if (dy > Math.max(10, dx)) current.vertical = true; if (!current.vertical && (event.pointerType === "mouse" || dx > 5)) { setDragging(true); fromPointer(event); } }}
      onPointerUp={(event) => { if (gesture.current && !gesture.current.vertical) fromPointer(event); gesture.current = null; setDragging(false); }} onPointerCancel={() => { gesture.current = null; setDragging(false); }}
      onKeyDown={(event) => { const index = TREND_RANGES.indexOf(range); const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? 1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? -1 : 0; if (direction || event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(event.key === "Home" ? 365 : event.key === "End" ? 30 : TREND_RANGES[Math.max(0, Math.min(3, index + direction))]); } }}>
      <svg className="navigator-preview" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">{previews.flatMap((segments, index) => segments.map((segment, i) => segment.single ? <circle key={`${index}-${i}`} cx={segment.x} cy={segment.y} r="1" /> : <path key={`${index}-${i}`} d={segment.path} vectorEffect="non-scaling-stroke" />))}</svg>
      <span className="navigator-window" style={{ left: `${position(range)}%` }}><span className="navigator-handle" /><span className="navigator-end" /></span>
    </div>
    <div className="navigator-stops">{[365, 180, 90, 30].map((days) => <button key={days} type="button" aria-pressed={range === days} onClick={() => onChange(days as TrendRange)} style={{ left: `${position(days)}%` }}>{days} 日</button>)}</div>
    <span className="sr-only" id="trend-range-help">两市共用范围。拖动左边界吸附四档；左方向键扩大，右方向键缩小，Home 为 365 日，End 为 30 日。</span>
  </div>;
}
