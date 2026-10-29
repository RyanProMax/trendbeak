import { ArrowLeft, RotateCw } from "lucide-react";
import type { Instrument, MarketState } from "../market-types";
import { number, tone, displayDate } from "../lib/market-format";

export type ViewState = MarketState & {
  loading?: boolean;
  pendingInstrument?: Instrument;
  failedInstrument?: Instrument;
};
export default function MarketCard({ state, date, reset, retry }: {
  state: ViewState; date?: string; reset: () => void; retry: () => void;
}) {
  const { instrument, snapshot, loading, error, pendingInstrument, failedInstrument } = state;
  const marketName = instrument.market === "CN" ? "A 股" : "美股";
  const quoteDate = date ?? snapshot?.asOf;
  const reading = quoteDate ? snapshot?.history[quoteDate] : undefined;
  const closed = snapshot?.days.find((day) => day.date === quoteDate)?.status === "closed";
  const session = closed ? "休市" : !reading ? "无交易数据" : quoteDate === snapshot?.asOf && snapshot?.session === "trading" ? "盘中" : "收盘";
  const switching = !!pendingInstrument && pendingInstrument.symbol !== instrument.symbol;
  return <section className={`market-card${instrument.kind === "stock" ? " stock-selected" : ""}${switching ? " is-switching" : ""}`}
    data-market={instrument.market} aria-label={`${marketName}市场信号`} aria-busy={loading || undefined}>
    {switching && <div className="market-loading" role="status"><span className="sr-only">正在切换至{pendingInstrument.name}</span></div>}
    <div className="market-content">
      <div className="market-top"><div className="market-title"><h3>{marketName}</h3><div className="quote-top"><div className="instrument-name">{instrument.name}{instrument.kind === "stock" && <span>{instrument.code}</span>}</div></div></div></div>
      {snapshot ? <>
        <div className="quote-row"><div className="quote">{number(reading?.price ?? null)}</div>
          <div className={`quote-change ${tone(reading?.change ?? null)}`}>{number(reading?.change ?? null, 2, true)}{reading?.change != null ? "%" : ""}</div>
          {instrument.kind === "stock" && <button className="back-market" onClick={reset}><ArrowLeft size={13} />返回大盘</button>}
        </div>
        <div className="quote-session"><time dateTime={quoteDate}>{displayDate(quoteDate!)}</time><span> · {session}</span></div>
        {error && <div className="market-refresh-error" role="status">{failedInstrument && failedInstrument.symbol !== instrument.symbol ? `暂未载入${failedInstrument.name}` : "更新暂不可用，显示上次行情"}<button onClick={retry} aria-label={`重试${marketName}行情`}><RotateCw size={14} /></button></div>}
      </> : <div className="market-empty" role="status"><span>{loading ? "正在读取行情…" : "行情暂不可用"}</span>{!loading && <button onClick={retry}><RotateCw size={14} />重试</button>}</div>}
    </div>
  </section>;
}
