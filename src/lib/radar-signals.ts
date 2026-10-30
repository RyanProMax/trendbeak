import type { MarketSnapshot } from "../market-types";
import { isExchangeClosed } from "./exchange-calendar";
import { signalsForDate } from "./market-signals";

export type RadarId = "rsi" | "trend" | "range" | "change";
export interface RadarFactor {
  id: RadarId; name: string; value: number | null; score: number | null;
  digits: number; unit: string; explanation: string; scale: string; unavailable: string | null;
}
export const RADAR_STOPS = [
  { value: 0, color: "#3D9271" }, { value: 20, color: "#4F9D77" },
  { value: 50, color: "#B49A4D" }, { value: 80, color: "#C86C5B" }, { value: 100, color: "#C65F50" },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
/** Display coordinates only. These factors never alter the published fear/greed reading. */
export function radarFactors(snapshot: MarketSnapshot, date: string): RadarFactor[] {
  const signals = signalsForDate(snapshot, date), reading = snapshot.history[date];
  const descriptors = [
    { id: "rsi", name: "RSI 动量", digits: 1, unit: "", explanation: "Wilder 14 日；低于 30 为超卖，高于 70 为超买。", scale: "原始 RSI 直接绘图" },
    { id: "trend", name: "均线偏离", digits: 1, unit: "%", explanation: "低于 MA20 在内侧，高于均线向外。低值不直接等于超卖。", scale: "−10% → 0 · 0% → 50 · +10% → 100" },
    { id: "range", name: "52 周位置", digits: 0, unit: "%", explanation: "靠近一年低点在内侧，靠近高点在外侧；不是估值分位或超卖判断。", scale: "原始价格区间位置直接绘图" },
    { id: "change", name: "当日涨跌", digits: 2, unit: "%", explanation: "沿用热力日历的涨跌幅范围；表示当天强弱，不单独判定超卖。", scale: "−3% → 0 · 0% → 50 · +3% → 100" },
  ] as const;
  return descriptors.map(descriptor => {
    const signal = signals.find(item => item.id === descriptor.id);
    const value = descriptor.id === "change" ? reading?.change ?? null : signal?.value ?? null;
    const score = value === null ? null : clamp(descriptor.id === "trend" ? 50 + 5 * value : descriptor.id === "change" ? 50 + value / 6 * 100 : value);
    const unavailable = value === null ? descriptor.id === "change" ? isExchangeClosed(date,snapshot.instrument.market) ? "当天休市，无日涨跌观测。" : "当天无交易数据。" : signal?.unavailable ?? "当天无指标数据。" : null;
    return { ...descriptor, value, score, unavailable };
  });
}
export function radarColor(value: number): string {
  const score=clamp(value),next=RADAR_STOPS.findIndex(stop=>stop.value>=score);
  if(next<=0)return RADAR_STOPS[0].color;
  const a=RADAR_STOPS[next-1],b=RADAR_STOPS[next];if(score===b.value)return b.color;
  const t=(score-a.value)/(b.value-a.value),rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return `rgb(${rgb(a.color).map((channel,i)=>Math.round(channel+(rgb(b.color)[i]-channel)*t)).join(", ")})`;
}
/** Missing coordinates are gaps, never zero-valued vertices or a fabricated closed area. */
export function radarSegments(factors: Pick<RadarFactor,"score">[]): number[][] {
  const missing=factors.findIndex(factor=>factor.score===null);
  if(missing<0)return [factors.map((_,i)=>i)];
  const result:number[][]=[];let segment:number[]=[];
  for(let n=1;n<=factors.length;n++){const i=(missing+n)%factors.length;if(factors[i].score!==null)segment.push(i);else if(segment.length){result.push(segment);segment=[];}}
  if(segment.length)result.push(segment);return result;
}
