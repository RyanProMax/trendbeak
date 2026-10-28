import { useEffect, useState } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import type { Instrument, MarketState } from "../market-types";
import { displayDate, number, tone } from "../lib/market-format";
import { signalsForDate } from "../lib/market-signals";
import SignalMeter from "./SignalMeter";
import YearHeatmap from "./YearHeatmap";
import LatestDateButton from "./LatestDateButton";

export type ViewState = MarketState & {
  loading?: boolean;
  pendingInstrument?: Instrument;
  failedInstrument?: Instrument;
};
export default function MarketCard({
  state,
  reset,
  retry,
}: {
  state: ViewState;
  reset: () => void;
  retry: () => void;
}) {
  const {
    instrument,
    snapshot,
    loading,
    error,
    pendingInstrument,
    failedInstrument,
  } = state;
  const [selection, setSelection] = useState<{
    symbol: string;
    date: string;
  } | null>(null);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  useEffect(() => {setSelection(null);}, [instrument.symbol]);
  useEffect(() => {setPreviewDate(null);}, [instrument.symbol, snapshot?.asOf]);
  const date =
    selection?.symbol === instrument.symbol ? selection.date : snapshot?.asOf;
  const historical = !!snapshot && date !== snapshot.asOf;
  const reading = date && snapshot?.history[date];
  const headerDate = previewDate ?? date;
  const day = snapshot?.days.find((item) => item.date === headerDate);
  const session = day?.change == null
    ? day?.status === "closed"
      ? "休市"
      : "无交易数据"
    : headerDate === snapshot?.asOf && snapshot?.session === "trading"
      ? "盘中"
      : "收盘";
  const marketName = instrument.market === "CN" ? "A 股" : "美股";
  const switching =
    !!pendingInstrument && pendingInstrument.symbol !== instrument.symbol;
  return (
    <section
      className={`market-card${instrument.kind === "stock" ? " stock-selected" : ""}${switching ? " is-switching" : ""}`}
      data-market={instrument.market}
      aria-label={`${marketName}市场信号`}
      aria-busy={loading || undefined}
    >
      {switching && (
        <div className="market-loading" role="status">
          <span className="sr-only">正在切换至{pendingInstrument.name}</span>
        </div>
      )}
      <div className="market-content">
        <div className="market-top">
          <div className="market-title">
            <h2>{marketName}</h2>
            <div className="quote-top">
              <h3>
                {instrument.name}
                {instrument.kind === "stock" && <span>{instrument.code}</span>}
              </h3>
            </div>
          </div>
          {snapshot && (
            <div className={`date-control${historical ? " is-historical" : ""}`}>
              <span className="latest-date-slot">
                {historical && <LatestDateButton onClick={() => setSelection(null)} />}
              </span>
              <span className="quote-date" aria-live="polite" aria-atomic="true">
                <span className="quote-date-heading">
                  <time dateTime={headerDate}>{displayDate(headerDate!, true)}</time>
                  <span className="quote-session">{session}</span>
                </span>
                <strong className={tone(day?.change ?? null)}>
                  {number(day?.change ?? null, 2, true)}{day?.change != null ? "%" : ""}
                </strong>
              </span>
            </div>
          )}
        </div>
        {snapshot ? (
          <>
            <div className="quote-row">
              <div className="quote">
                {number(reading ? reading.price : null)}
              </div>
              <div
                className={`quote-change ${tone(reading ? reading.change : null)}`}
              >
                {number(reading ? reading.change : null, 2, true)}
                {reading && reading.change !== null ? "%" : ""}
              </div>
              {instrument.kind === "stock" && (
                <button className="back-market" onClick={reset}>
                  <ArrowLeft size={13} />返回大盘
                </button>
              )}
            </div>
            {error && (
              <div className="market-refresh-error" role="status">
                {failedInstrument &&
                failedInstrument.symbol !== instrument.symbol
                  ? `暂未载入${failedInstrument.name}`
                  : "更新暂不可用，显示上次行情"}
                <button onClick={retry} aria-label={`重试${marketName}行情`}>
                  <RotateCw size={14} />
                </button>
              </div>
            )}
            <YearHeatmap
              snapshot={snapshot}
              selectedDate={date!}
              previewDate={previewDate}
              onPreviewDate={setPreviewDate}
              onSelectDate={(next) => {
                if (snapshot.days.find((item) => item.date === next)?.status === "closed") return;
                setSelection(
                  next === snapshot.asOf
                    ? null
                    : { symbol: instrument.symbol, date: next },
                );
              }}
            />
            <div
              className="signals"
              data-date={date}
              aria-label={`${displayDate(date!, true)}指标`}
            >
              {signalsForDate(snapshot, date!).map((signal) => (
                <SignalMeter
                  key={signal.id}
                  signal={signal}
                  snapshot={{
                    ...snapshot,
                    asOf: date!,
                    session: historical ? "closed" : snapshot.session,
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="market-empty" role="status">
            <span>{loading ? "正在读取行情…" : "行情暂不可用"}</span>
            {!loading && (
              <button onClick={retry}>
                <RotateCw size={14} />
                重试
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
