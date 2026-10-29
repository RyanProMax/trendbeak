import { useId } from "react";
import type { MarketSnapshot, TrendRange } from "../market-types";
import { displayDate, number } from "../lib/market-format";
import { calendarForRange, chartSegments, sentimentState, shiftDate, type ChartPoint } from "../lib/chart-series";

export default function MarketTrend({ snapshot, benchmark, date, range }: {
  snapshot: MarketSnapshot; benchmark: MarketSnapshot | null; date: string; range: TrendRange;
}) {
  const id = useId();
  const start = shiftDate(date, 1 - range);
  const days = calendarForRange(snapshot, date).filter((day) => day.date >= start);
  const mood = (snapshot.sentiment?.observations ?? []).filter((point) => point.date >= start && point.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const prices = Object.entries(benchmark?.history ?? {}).filter(([day]) => day >= start && day <= date).sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => ({ date: day, value: row.price }));
  const moodSegments = chartSegments(days, mood);
  const priceSegments = chartSegments(benchmark ? calendarForRange(benchmark, date).filter((day) => day.date >= start) : days, prices);
  const allPrices = prices.map((point) => point.value);
  const low = allPrices.length ? Math.min(...allPrices) : 0;
  const high = allPrices.length ? Math.max(...allPrices) : 100;
  const padding = Math.max((high - low) * .18, high * .003, 1);
  const min = Math.max(0, low - padding), max = high + padding;
  const x = (day: string) => 32 + (Date.parse(day) - Date.parse(start)) / 86400000 / (range - 1) * 402;
  const yMood = (value: number) => 153 - value / 100 * 128;
  const yPrice = (value: number) => 153 - (value - min) / (max - min) * 128;
  const path = (points: ChartPoint[], y: (value: number) => number) => points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const lastMood = mood.at(-1), lastPrice = prices.at(-1);
  let priceLabelY = lastPrice ? yPrice(lastPrice.value) : 55;
  let moodLabelY = lastMood ? yMood(lastMood.value) : 120;
  if (Math.abs(priceLabelY - moodLabelY) < 38) {
    const firstIsPrice = priceLabelY <= moodLabelY;
    const top = Math.max(30, Math.min(107, Math.min(priceLabelY, moodLabelY)));
    priceLabelY = firstIsPrice ? top : top + 38;
    moodLabelY = firstIsPrice ? top + 38 : top;
  }
  priceLabelY = Math.min(145, priceLabelY); moodLabelY = Math.min(145, moodLabelY);
  return <div className="trend-wrap">
    <div className="chart-axis-head"><span>情绪 · 0–100</span><span>指数点位</span></div>
    <svg className="trend-chart" viewBox="0 0 584 184" role="img" aria-labelledby={`${id}-title ${id}-desc`} data-start={start} data-end={date} data-range={range} data-price-observations={prices.length} data-emotion-observations={mood.length}>
      <title id={`${id}-title`}>{`${snapshot.instrument.market === "CN" ? "A 股" : "美股"}情绪与大盘，${range} 日`}</title>
      <desc id={`${id}-desc`}>{`紫色实线表示情绪，左轴 0 至 100；深灰虚线表示${benchmark?.instrument.name ?? "大盘"}，右轴指数点位。缺失观测留空。${lastMood ? `最近情绪读数为${displayDate(lastMood.date)}，${number(lastMood.value, 1)}，${sentimentState(lastMood.value)}。` : "该时段暂无情绪数据。"}`}</desc>
      {[0, 50, 100].map((value) => <g key={value}><line x1="32" x2="434" y1={yMood(value)} y2={yMood(value)} className="chart-grid" /><text x="0" y={yMood(value) + 3} className="chart-tick">{value}</text>{prices.length > 0 && <text x="442" y={yMood(value) + 3} className="chart-tick">{number(min + (max - min) * value / 100, 0)}</text>}</g>)}
      {priceSegments.map((points, i) => <g key={`p${i}`}>{points.length > 1 && <path className="index-line" d={path(points, yPrice)} data-series="index" />}{points.length === 1 && <circle className="index-dot" cx={x(points[0].date)} cy={yPrice(points[0].value)} r="2.5" />}</g>)}
      {moodSegments.map((points, i) => <g key={`m${i}`}>{points.length > 1 && <path className="emotion-line" d={path(points, yMood)} data-series="sentiment" />}{points.length === 1 && <circle className="emotion-dot" cx={x(points[0].date)} cy={yMood(points[0].value)} r="3" data-observation={points[0].date} />}</g>)}
      {lastPrice && <><circle className="index-dot" cx={x(lastPrice.date)} cy={yPrice(lastPrice.value)} r="3" /><text className="index-end" x="496" y={priceLabelY}><tspan x="496">{benchmark!.instrument.name}</tspan><tspan x="496" dy="13">{number(lastPrice.value)}</tspan></text></>}
      {lastMood && <><circle className="emotion-dot" cx={x(lastMood.date)} cy={yMood(lastMood.value)} r="3" /><text className="emotion-end" x="496" y={moodLabelY}><tspan x="496">情绪 {number(lastMood.value, 1)}</tspan><tspan x="496" dy="13">{sentimentState(lastMood.value)}</tspan></text></>}
      {!lastMood && <text x="240" y="120" className="chart-empty" textAnchor="middle">暂无情绪数据</text>}
      {!lastPrice && <text x="240" y="65" className="chart-empty" textAnchor="middle">暂无大盘数据</text>}
      <text x="32" y="178" className="chart-tick">{displayDate(start)}</text><text x="434" y="178" textAnchor="end" className="chart-tick">{displayDate(date)}</text>
    </svg>
    {mood.length < 2 && snapshot.sentiment?.historyUnavailable ? <span className="observation-date">情绪历史暂缺{lastMood ? ` · 最近观测 ${displayDate(lastMood.date)}` : ""}</span> : lastMood && lastMood.date !== date ? <span className="observation-date">情绪最近观测：{displayDate(lastMood.date)}</span> : null}
  </div>;
}
