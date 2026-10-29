import type { MarketSnapshot, Signal, TrendRange } from "../market-types";
import { calendarForRange, chartSegments, shiftDate } from "../lib/chart-series";
import { chartPath } from "../lib/chart-path";
import { displayDate, number } from "../lib/market-format";

export default function SignalHistory({ snapshot, signal, end, range }: { snapshot: MarketSnapshot; signal: Signal; end: string; range: TrendRange }) {
  const start = shiftDate(end, 1 - range), id = signal.id;
  if (id === "sentiment") return null;
  const points = Object.entries(snapshot.history).filter(([date, row]) => date >= start && date <= end && row.values[id] !== null).sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, value: row.values[id]! }));
  const segments = chartSegments(calendarForRange(snapshot, end, range).filter((day) => day.date >= start), points);
  const values = points.map((point) => point.value), low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1, margin = Math.max((high - low) * .15, .01);
  const min = low - margin, max = high + margin, x = (date: string) => 4 + (Date.parse(date) - Date.parse(start)) / 86400000 / Math.max(1,range - 1) * 252, y = (value: number) => 76 - (value - min) / (max - min) * 50;
  const selected = points.find((point) => point.date === snapshot.asOf);
  return <div className="signal-history" data-history-signal={id} data-history-points={points.length}>
    <div className="signal-history-heading"><span>{range} 日</span><span>{displayDate(snapshot.asOf)} · {selected ? `${number(selected.value, signal.digits, id === "trend")}${signal.unit}` : snapshot.asOf < start || snapshot.asOf > end ? "窗口外" : "无数据"}</span></div>
    <svg viewBox="0 0 260 102" role="img" aria-label={`${signal.name}真实历史，${range}自然日，单位${signal.unit || "指标值"}；缺失不补线`}>
      <line x1="4" x2="256" y1="79" y2="79" className="chart-grid" />
      {segments.map((points, index) => points.length > 1 ? <path key={index} d={chartPath(points, x, y)} className="technical-history-line" /> : <circle key={index} cx={x(points[0].date)} cy={y(points[0].value)} r="2" className="technical-history-dot" />)}
      {selected && <><line x1={x(selected.date)} x2={x(selected.date)} y1="23" y2="79" className="chart-crosshair" /><circle cx={x(selected.date)} cy={y(selected.value)} r="3" className="technical-history-active" /></>}
      {!points.length && <text x="130" y="55" textAnchor="middle" className="chart-empty">该窗口暂无历史</text>}
      {points.length > 0 && <><text x="4" y="15" className="chart-tick">{number(high, signal.digits)}{signal.unit}</text><text x="256" y="98" textAnchor="end" className="chart-tick">{number(low, signal.digits)}{signal.unit}</text></>}
    </svg>
    <div className="signal-history-dates"><span>{displayDate(start)}</span><span>{displayDate(end)}</span></div>
  </div>;
}
