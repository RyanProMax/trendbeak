import { memo, useMemo } from "react";
import type { MarketSnapshot, TrendRange } from "../market-types";
import { shiftDate, trendSeries } from "../lib/chart-series";
import { chartPath } from "../lib/chart-path";
import { dateDistance, windowDays, type TrendWindow } from "../lib/trend-window";
import { EMOTION_STOPS, sentimentColor } from "../lib/brand-palette";

/** Animate the viewport over fixed real paths; never interpolate observations or gaps. */
function TrendScene({ snapshot, benchmark, bounds, end, range, left, right, top, bottom, min, max, visible, id }: {
  snapshot: MarketSnapshot; benchmark: MarketSnapshot | null; bounds: TrendWindow; end: string; range: TrendRange;
  left: number; right: number; top: number; bottom: number; min: number; max: number;
  visible: { mood: boolean; index: boolean }; id: string;
}) {
  const full = useMemo(() => trendSeries(snapshot, benchmark, bounds.end, windowDays(bounds)), [snapshot, benchmark, bounds.start, bounds.end]);
  const geometry = useMemo(() => {
    const values = full.prices.map((point) => point.value);
    const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 100;
    const padding = Math.max((high - low) * .18, high * .003, 1), baseMin = Math.max(0, low - padding), baseMax = high + padding;
    const x = (date: string) => left + (Date.parse(date) - Date.parse(full.start)) / 86400000 / Math.max(1,dateDistance(full.start,full.end)) * (right - left);
    const yPrice = (value: number) => bottom - (value - baseMin) / (baseMax - baseMin) * (bottom - top);
    const yMood = (value: number) => bottom - value / 100 * (bottom - top);
    return { baseMin, baseMax,
      prices: full.priceSegments.filter((segment) => segment.length > 1).map((segment) => chartPath(segment, x, yPrice)),
      moods: full.moodSegments.filter((segment) => segment.length > 1).map((segment) => chartPath(segment, x, yMood)),
    };
  }, [full, left, right, top, bottom]);
  const scaleX = Math.max(1,dateDistance(full.start,full.end)) / Math.max(1,range - 1);
  const translateX = left * (1-scaleX) - dateDistance(full.start,shiftDate(end,1-range)) / Math.max(1,range-1) * (right-left);
  const scaleY = (geometry.baseMax - geometry.baseMin) / (max - min);
  const translateY = bottom * (1 - scaleY) - (geometry.baseMin - min) / (max - min) * (bottom - top);
  const x = (date: string) => right - (Date.parse(end) - Date.parse(date)) / 86400000 / Math.max(1,range - 1) * (right - left);
  const start = new Date(Date.parse(end) - (range - 1) * 86400000).toISOString().slice(0,10);
  const singletonMood = full.moodSegments.filter((segment) => segment.length === 1 && segment[0].date >= start && segment[0].date <= end);
  const singletonPrice = full.priceSegments.filter((segment) => segment.length === 1 && segment[0].date >= start && segment[0].date <= end);
  return <>
    <defs>
      <linearGradient id={`${id}-emotion`} gradientUnits="userSpaceOnUse" x1="0" y1={bottom} x2="0" y2={top} colorInterpolation="sRGB">
        {EMOTION_STOPS.map((stop) => <stop key={stop.value} offset={`${stop.value}%`} stopColor={stop.color} />)}
      </linearGradient>
      <linearGradient id={`${id}-focus`}><stop stopColor="#4f9d83" /><stop offset="50%" stopColor="#c8bd83" /><stop offset="100%" stopColor="#cb7774" /></linearGradient>
      <clipPath id={`${id}-plot`}><rect x={left - 2} y={top - 3} width={right - left + 4} height={bottom - top + 6} /></clipPath>
    </defs>
    <g className="trend-series" clipPath={`url(#${id}-plot)`}>
      {visible.index && <g className="trend-view index-view" style={{ transform: `matrix(${scaleX}, 0, 0, ${scaleY}, ${translateX}, ${translateY})` }}>
        {geometry.prices.map((path, i) => <path key={i} className="index-line" d={path} data-series="index" vectorEffect="non-scaling-stroke" />)}
      </g>}
      {visible.mood && <g className="trend-view emotion-view" style={{ transform: `matrix(${scaleX}, 0, 0, 1, ${translateX}, 0)` }}>
        {geometry.moods.map((path, i) => <path key={i} className="emotion-line" d={path} stroke={`url(#${id}-emotion)`} data-series="sentiment" vectorEffect="non-scaling-stroke" />)}
      </g>}
      {visible.mood && singletonMood.map(([point]) => <circle key={point.date} className="emotion-dot" cx={x(point.date)} cy={bottom - point.value / 100 * (bottom - top)} r="3" fill={sentimentColor(point.value)} data-observation={point.date} />)}
      {visible.index && singletonPrice.map(([point]) => <circle key={point.date} className="index-dot" cx={x(point.date)} cy={bottom - (point.value - min) / (max - min) * (bottom - top)} r="2.5" />)}
    </g>
  </>;
}
export default memo(TrendScene);
