import type { MarketSnapshot } from "../market-types";
import { isExchangeClosed } from "./exchange-calendar";
import { signalsForDate } from "./market-signals";

export type RadarId = "rsi" | "ema" | "volatility" | "activity";
export interface RadarFactor {
  id: RadarId; name: string; value: number | null; score: number | null; asOf: string;
  digits: number; unit: string; explanation: string; scale: string; unavailable: string | null; status: string; strengthLabel: string | null; position?: number | null;
}
export const RADAR_STOPS = [
  { value: 0, color: "#3D9271" }, { value: 20, color: "#4F9D77" },
  { value: 50, color: "#B49A4D" }, { value: 80, color: "#C86C5B" }, { value: 100, color: "#C65F50" },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const direction=(value:number|null|undefined,up:string,down:string)=>value==null?"—":Math.abs(value)<1e-10?"持平":value>0?up:down;
/** Descriptive page rules, not a probability or trading recommendation. */
export function bandPositionState(position:number|null|undefined) {
 if(position==null)return "—";
 return position<0?"低于下轨":position===0?"位于下轨":position<=20?"靠近下轨":position<50?"中轨下方":position===50?"位于中轨":position<80?"中轨上方":position<100?"靠近上轨":position===100?"位于上轨":"高于上轨";
}
/** Four different technical dimensions; no weights, combined score or claim of statistical independence. */
export function radarFactors(snapshot: MarketSnapshot, date: string): RadarFactor[] {
  const stock = snapshot.instrument.kind === "stock";
  const expectedSource = !stock ? "" : snapshot.instrument.market === "CN" ? `https://gu.qq.com/${snapshot.instrument.symbol.endsWith('.SS') ? 'sh' : 'sz'}${snapshot.instrument.symbol.slice(0, 6)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(snapshot.instrument.symbol)}/history/`;
  // A dated prepared row is the evidence. Never borrow a benchmark or calculate
  // indicators in the reader; the controlled writer enforces warm-up periods.
  const verified = !stock || (snapshot.technicalSource === "trendbeak_technical_v1" && snapshot.source.url === expectedSource && !isExchangeClosed(date, snapshot.instrument.market) && snapshot.days.find(day=>day.date===date)?.status !== "closed");
  const reading = verified ? snapshot.history[date] : undefined;
  const rsi = signalsForDate(snapshot, date).find(item => item.id === "rsi");
  const metrics = reading?.radar?.version === 1 ? reading.radar : null;
  const missing = isExchangeClosed(date, snapshot.instrument.market) ? "当天休市，无当日指标。" : "当天无交易数据。";
  const descriptors = [
    { id: "rsi", name: "RSI 动量", digits: 1, unit: "", explanation: "Wilder RSI14；30/70为常用观察线。" },
    { id: "ema", name: "EMA 趋势", digits: 2, unit: "%", explanation: "（EMA20/EMA60−1）×100%；零为分界。" },
    { id: "volatility", name: "布林状态", digits: 2, unit: "%", explanation: "%B＝（收盘价−下轨）/（上轨−下轨）×100%；带宽用总体标准差。20%/80%划分靠近轨道的位置。" },
    { id: "activity", name: "量能活跃", digits: 2, unit: "×", explanation: stock ? "所选交易日完整日量/前20日均量；仅表示活跃度。" : "完整日量/前20日均量；盘中取最近完整日，仅表示活跃度。" },
  ] as const;
  return descriptors.map(descriptor => {
    const stored = descriptor.id === "rsi" ? null : metrics?.[descriptor.id];
    const metric = stored && (!stock || (stored.asOf === date && Number.isInteger(stored.samples) && stored.samples >= 0 && stored.samples <= 252)) ? stored : null;
    const raw = descriptor.id === "rsi" ? stock ? reading?.values.rsi ?? null : rsi?.value ?? null : metric?.value ?? null;
    const value = raw !== null && Number.isFinite(raw) && (descriptor.id !== "rsi" || raw >= 0 && raw <= 100) && (descriptor.id !== "volatility" && descriptor.id !== "activity" || raw >= 0) ? raw : null;
    const rank = descriptor.id === "ema" ? metrics?.ema.strength ?? null : metric?.score ?? null;
    const score = descriptor.id === "rsi" ? value : value !== null && metric && metric.samples >= 60 && rank !== null && Number.isFinite(rank) && rank >= 0 && rank <= 100 ? rank : null;
    const asOf = metric?.asOf ?? date;
    const unavailable = !reading ? missing : value === null ? descriptor.id === "rsi" ? rsi?.unavailable ?? "历史日线不足15日。" : descriptor.id === "ema" ? "EMA需要至少60个交易日的日线。" : descriptor.id === "volatility" ? "布林带宽需要至少20个交易日的日线。" : "缺少最近完整日及此前20日的有效同标的成交量。" : null;
    const scale = descriptor.id==="rsi"?"RSI原值0–100。":!metric||metric.samples<60?"历史分位需60个完整日。":descriptor.id==="ema"?`绝对偏离强度 · 此前${metric.samples}日`:descriptor.id==="volatility"?`20日2σ · 近轨20/80 · ${metric.samples}日分位`:`同标的历史分位 · ${metric.samples}日`;

    const band=metrics?.bollinger,closed=isExchangeClosed(date,snapshot.instrument.market);
    const status=closed?"休市":value===null?"—":descriptor.id==="rsi"?direction(reading?.previous.rsi==null?null:value-reading.previous.rsi,"上升","下降"):descriptor.id==="ema"?direction(value,"EMA20 > EMA60","EMA20 < EMA60"):descriptor.id==="activity"?value>1?"高于均量":value<1?"低于均量":"等于均量":`${bandPositionState(band?.position)} · ${direction(band?.widthChange,"扩张","收缩")}`;
    const strengthLabel=closed||score===null||descriptor.id==="rsi"?null:`${descriptor.id==="activity"?"活跃度":descriptor.id==="volatility"?"波动强度":"分离强度"}${Math.round(score)}`;
    const explanation=descriptor.id==="volatility"?`带宽${value===null?"—":value.toFixed(2)+"%"} · ${direction(band?.middleChange,"中轨上行","中轨下行")}`:descriptor.explanation;

    return { ...descriptor, value, score, asOf, unavailable, scale,status,strengthLabel,...(descriptor.id==="volatility"?{position:value===null?null:band?.position??null}:{}), explanation };
  });
}
/** Hide an empty stock section, including dates with only an older volume reading. */
export function hasStockRadar(snapshot: MarketSnapshot, date: string): boolean {
  return snapshot.instrument.kind === "stock" && radarFactors(snapshot, date).some(factor => factor.value !== null);
}
/** Volatility/activity are direction-neutral; EMA color follows its actual sign, never its percentile. */
export function radarFactorColor(factor: Pick<RadarFactor, "id" | "value" | "score">): string {
  if (factor.value === null) return "#99a18f";
  if (factor.id === "volatility") return "#8d9475";
  if (factor.id === "activity") return "#6b8d8b";
  if (factor.id === "ema") return factor.value < 0 ? "#4F9D77" : factor.value > 0 ? "#C86C5B" : "#9b9764";
  return radarColor(factor.value);
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

/** Clip nearby touch targets at their perpendicular bisectors, so a larger
 * target never steals another real vertex. Equal coordinates share angular sectors. */
export function radarHitArea(index:number, points:([number,number]|null)[], radius=14):string {
 const origin=points[index];if(!origin)return "";
 let vertices:[number,number][]=[[-radius,-radius],[radius,-radius],[radius,radius],[-radius,radius]];
 for(let j=0;j<points.length;j++){
  const other=points[j];if(j===index||!other)continue;
  let dx=other[0]-origin[0],dy=other[1]-origin[1],boundary=(dx*dx+dy*dy)/2;
  if(boundary<1e-10){const a=-Math.PI/2+index*Math.PI/2,b=-Math.PI/2+j*Math.PI/2;dx=Math.cos(b)-Math.cos(a);dy=Math.sin(b)-Math.sin(a);boundary=0;}
  const next:[number,number][]=[],distance=(v:[number,number])=>v[0]*dx+v[1]*dy-boundary;
  for(let n=0;n<vertices.length;n++){const a=vertices[n],b=vertices[(n+1)%vertices.length],da=distance(a),db=distance(b);
   if(da<=1e-8)next.push(a);
   if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);next.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  vertices=next;
 }
 return `polygon(${vertices.map(([x,y])=>`${(x+radius)/(radius*2)*100}% ${(y+radius)/(radius*2)*100}%`).join(",")})`;
}
