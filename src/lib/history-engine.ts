import type { DailyBar, HistoricalReading, RadarMetric, TechnicalValues } from "../market-types";
import { bollingerWidth, bollingerDetails, relativeVolume, historicalRank } from "./radar-metrics";

interface State { gain: number | null; loss: number | null; fast: number | null; slow: number | null }
export interface HistoryState { bars: DailyBar[]; rows: HistoricalReading[]; states: State[]; trading: boolean; processed: number }
const mean = (values: number[]) => values.reduce((a,b)=>a+b,0)/values.length;
const same = (a: DailyBar,b: DailyBar) => a.date===b.date && a.open===b.open && a.high===b.high && a.low===b.low && a.close===b.close && a.volume===b.volume;
/** Browser/offline only. A revision invalidates its suffix (including recursive RSI/EMA).
 * Appends reuse the prefix; a formerly live last bar is finalized before adding a day. */
export function updateHistory(bars: DailyBar[], trading=false, old?: HistoryState): HistoryState {
  let start=0;
  if(old) { while(start<bars.length && start<old.bars.length && same(bars[start],old.bars[start]))start++;
    if(start===bars.length && start===old.bars.length && trading===old.trading)return {...old,processed:0};
    if(old.trading || old.trading!==trading)start=Math.min(start,Math.max(0,Math.min(old.bars.length,bars.length)-1)); }
  if(trading)start=Math.min(start,Math.max(0,bars.length-1));
  const rows=old?.rows.slice(0,start)??[], states=old?.states.slice(0,start)??[];
  const closes=bars.map(b=>b.close), ranks={ema:[] as number[],volatility:[] as number[],activity:[] as number[]};
  for(const id of ["ema","volatility","activity"] as const) {
    for(let j=start-1;j>=0&&ranks[id].length<252;j--) { const value=rows[j].radar?.[id].value;if(typeof value==='number')ranks[id].unshift(value); }
  }
  for(let i=start;i<bars.length;i++) {
    const b=bars[i], prev=states[i-1]; let gain:number|null=null,loss:number|null=null;
    if(i===14) { gain=0;loss=0;for(let j=1;j<=14;j++){const d=closes[j]-closes[j-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}gain/=14;loss/=14; }
    else if(i>14) { const d=b.close-closes[i-1];gain=(prev.gain!*13+Math.max(0,d))/14;loss=(prev.loss!*13+Math.max(0,-d))/14; }
    const ema=(period:number,previous:number|null|undefined)=>i<period-1?null:i===period-1?mean(closes.slice(0,period)):previous!+2/(period+1)*(b.close-previous!);
    const fast=ema(20,prev?.fast),slow=ema(60,prev?.slow); states.push({gain,loss,fast,slow});
    const cutoff=new Date(Date.parse(b.date)-364*86400000).toISOString().slice(0,10);
    let range:HistoricalReading['range']=null;
    if(bars[0].date<=cutoff){let low=Infinity,high=-Infinity;for(let j=i;j>=0&&bars[j].date>=cutoff;j--){low=Math.min(low,bars[j].low);high=Math.max(high,bars[j].high);}range={low,high};}
    const volume=relativeVolume(bars.slice(Math.max(0,i-20),i+1));
    const values:TechnicalValues={rsi:gain===null?null:gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss!),trend:i<19?null:(b.close/mean(closes.slice(i-19,i+1))-1)*100,volume,range:range?(range.high===range.low?50:(b.close-range.low)/(range.high-range.low)*100):null};
    const metric=(id:keyof typeof ranks,value:number|null):RadarMetric=>{const result={value,...historicalRank(value,ranks[id]),asOf:b.date};if(value!==null){ranks[id].push(value);if(ranks[id].length>252)ranks[id].shift();}return result;};
    const rawEMA=fast===null||slow===null?null:(fast/slow-1)*100,strength=historicalRank(rawEMA===null?null:Math.abs(rawEMA),ranks.ema.map(Math.abs)).score;
    const radar={version:1 as const,ema:{...metric('ema',rawEMA),strength},bollinger:bollingerDetails(closes.slice(Math.max(0,i-20),i+1)),volatility:metric('volatility',bollingerWidth(closes.slice(Math.max(0,i-19),i+1))),activity:metric('activity',volume)};
    const previous=rows[i-1]?.values??{rsi:null,trend:null,volume:null,range:null};
    const live=trading&&i===bars.length-1;
    if(live)radar.activity=i?{...rows[i-1].radar!.activity}:{value:null,score:null,samples:0,asOf:b.date};
    rows.push({price:b.close,change:i?(b.close/closes[i-1]-1)*100:null,values:{...values,volume:live?null:volume},previous:{...previous},range,radar});
  }
  return {bars:bars.slice(),rows,states,trading,processed:bars.length-start};
}
