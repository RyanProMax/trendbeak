import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BENCHMARKS,
  type Instrument,
  type Market,
  type MarketSnapshot,
  type PageData,
  type TrendRange,
} from "./market-types";
import StockSearch from "./components/StockSearch";
import MarketCard, { type ViewState } from "./components/MarketCard";
import YearHeatmap, { HeatLegend } from "./components/YearHeatmap";
import SignalMeter from "./components/SignalMeter";
import MarketTrend from "./components/MarketTrend";
import TrendRangeControl from "./components/TrendRange";
import { signalsForDate } from "./lib/market-signals";
import { calendarForRange, shiftDate } from "./lib/chart-series";
import { displayDate } from "./lib/market-format";

export type { PageData } from "./market-types";
function Dashboard({ data }: { data: PageData }) {
  const [markets, setMarkets] = useState<Record<Market, ViewState>>(
    data.markets,
  );
  const current = useRef(markets);
  current.current = markets;
  const [benchmarks, setBenchmarks] = useState<Record<Market, MarketSnapshot | null>>({ CN: data.markets.CN.snapshot, US: data.markets.US.snapshot });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [range, setRange] = useState<TrendRange>(365);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({ mood: true, index: true });
  const calendarDates = Object.values(markets).flatMap(({ snapshot }) =>
    snapshot ? [snapshot.days[0].date, snapshot.days.at(-1)!.date] : [],
  ).sort();
  const calendarEnd = calendarDates.at(-1);
  const calendarStart = calendarEnd ? shiftDate(calendarEnd, -364) : undefined;
  const alignedDays = useMemo(() => Object.fromEntries((["CN", "US"] as Market[]).map((market) => [market,
    markets[market].snapshot && calendarEnd ? calendarForRange(markets[market].snapshot!, calendarEnd) : [],
  ])), [markets, calendarEnd]);
  const windowEnd = Object.values(benchmarks).flatMap((snapshot) => snapshot ? [snapshot.asOf] : []).sort().at(-1) ?? calendarEnd;
  useEffect(() => {
    document.querySelectorAll("[data-trend-hover]").forEach((cell) => cell.removeAttribute("data-trend-hover"));
    if (hoveredDate) document.querySelectorAll(`.calendar-section rect[data-date="${hoveredDate}"]`).forEach((cell) => cell.setAttribute("data-trend-hover", "true"));
  }, [hoveredDate, alignedDays]);
  const selectable = useCallback((date: string) => !!calendarStart && !!calendarEnd && date >= calendarStart && date <= calendarEnd &&
    (["CN", "US"] as Market[]).some((market) => alignedDays[market].some((day) => day.date === date && day.status !== "closed")), [calendarStart, calendarEnd, alignedDays]);
  const selectDate = useCallback((date: string) => {
    if (selectable(date)) setSelectedDate(date);
  }, [selectable]);
  const globalDate = selectedDate ?? Object.values(markets).flatMap(({ snapshot }) => snapshot ? [snapshot.asOf] : []).sort().at(-1) ?? calendarEnd;
  const controllers = useRef<Partial<Record<Market, AbortController>>>({});
  const load = async (
    instrument: Instrument,
    scroll = false,
  ): Promise<boolean> => {
    const market = instrument.market;
    controllers.current[market]?.abort();
    const controller = new AbortController();
    controllers.current[market] = controller;
    setMarkets((previous) => ({
      ...previous,
      [market]: {
        ...previous[market],
        // Commit an instrument's name and its matching quote together.
        instrument: previous[market].snapshot
          ? previous[market].instrument
          : instrument,
        pendingInstrument: instrument,
        failedInstrument: undefined,
        error: null,
        loading: true,
      },
    }));
    let retryable = false;
    try {
      const response = await fetch(
        `/api/markets/${market}?symbol=${encodeURIComponent(instrument.symbol)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const failure = await response.json() as { retryable?: boolean };
        retryable = failure.retryable === true;
        throw new Error("Market unavailable");
      }
      const payload = (await response.json()) as { data: MarketSnapshot };
      if (controller.signal.aborted) return false;
      if (
        payload.data.instrument.symbol !== instrument.symbol ||
        payload.data.instrument.market !== market
      )
        throw new Error("Instrument mismatch");
      setMarkets((previous) => ({
        ...previous,
        [market]: {
          instrument,
          snapshot: payload.data,
          error: null,
          loading: false,
        },
      }));
      if (instrument.kind === "index") setBenchmarks((previous) => ({ ...previous, [market]: payload.data }));
      if (scroll)
        requestAnimationFrame(() => {
          const card = document.querySelector(`[data-market="${market}"]`);
          const rect = card?.getBoundingClientRect();
          if (
            card &&
            rect &&
            (rect.top > window.innerHeight - 120 || rect.bottom < 0)
          ) {
            card.scrollIntoView({
              block: "start",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
          }
        });
      return true;
    } catch {
      if (!controller.signal.aborted)
        setMarkets((previous) => ({
          ...previous,
          [market]: {
            ...previous[market],
            loading: false,
            error: "行情暂不可用",
            pendingInstrument: undefined,
            failedInstrument: instrument,
            retryable,
          },
        }));
      return false;
    }
  };
  useEffect(() => {
    // Recover a transient empty SSR state once, without waiting a full minute.
    // A manual request or a successful quote supersedes this timer.
    const recoveryTimers = (["CN", "US"] as Market[]).flatMap((market) =>
      !data.markets[market].snapshot && data.markets[market].retryable === true
        ? [window.setTimeout(() => {
            const state = current.current[market];
            if (!state.snapshot && !state.loading && !controllers.current[market]) void load(state.instrument);
          }, 1500)] : [],
    );
    const refresh = () => {
      if (document.visibilityState === "visible")
        for (const market of ["CN", "US"] as Market[]) {
          if (!current.current[market].loading) {
            void load(current.current[market].instrument);
            if (current.current[market].instrument.kind === "stock") {
              void fetch(`/api/markets/${market}`).then(async (response) => {
                if (!response.ok) return;
                const payload = await response.json() as { data: MarketSnapshot };
                if (payload.data.instrument.symbol === BENCHMARKS[market].symbol)
                  setBenchmarks((previous) => ({ ...previous, [market]: payload.data }));
              }).catch(() => {});
            }
          }
        }
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      recoveryTimers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", refresh);
      Object.values(controllers.current).forEach((controller) =>
        controller.abort(),
      );
    };
  }, []);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="trendbeak 首页">
            <img className="brand-wordmark" src="/trendbeak-wordmark.svg?v=10" alt="trendbeak" width="339" height="68" />
          </a>
          <StockSearch onSelect={(instrument) => load(instrument, true)} />
        </div>
      </header>
      <main id="main-content">
        <h1 className="sr-only">每日市场信号</h1>
        <section className="annual-calendar" aria-labelledby="calendar-title">
          <div className="calendar-heading">
            <h2 id="calendar-title">每日涨跌</h2>
            {globalDate ? <time className="global-selected-date" dateTime={globalDate} aria-live="polite">{displayDate(globalDate, true)}</time> : <span className="global-selected-date">—</span>}
          </div>
          <div className="calendar-rows">
            {(["CN", "US"] as Market[]).map((market, index) => {
              const snapshot = markets[market].snapshot;
              return <div className="calendar-row" data-calendar-market={market} key={market}>
                <MarketCard state={markets[market]} date={selectedDate ?? undefined} reset={() => void load(BENCHMARKS[market])} retry={() => void load(markets[market].failedInstrument ?? markets[market].instrument)} />
                {snapshot ? <YearHeatmap snapshot={snapshot} days={alignedDays[market]} selectedDate={selectedDate ?? snapshot.asOf} onSelectDate={selectDate} onHoverDate={setHoveredDate} showMonths={index === 0 || !markets.CN.snapshot} />
                  : <p className="calendar-unavailable">行情暂不可用</p>}
              </div>;
            })}
          </div>
          {calendarEnd && <HeatLegend />}
        </section>
        <section className="market-signals" aria-labelledby="signals-title">
          <div className="signals-heading"><h2 id="signals-title">市场信号</h2>
            <div className="chart-legend" aria-label="情绪按分值由绿经金到红，大盘为深灰实线"><button type="button" className="emotion-key" aria-pressed={visibleSeries.mood} onClick={() => setVisibleSeries((old) => ({ ...old, mood: !old.mood }))}>情绪</button><button type="button" className="index-key" aria-pressed={visibleSeries.index} onClick={() => setVisibleSeries((old) => ({ ...old, index: !old.index }))}>大盘</button></div>
          </div>
          <div className="analysis-grid">{(["CN", "US"] as Market[]).map((market) => {
            const snapshot = markets[market].snapshot;
            if (!snapshot) return <section className="analysis-unavailable" data-analysis-market={market} key={market} aria-label={`${market === "CN" ? "A 股" : "美股"}指标`}>行情恢复后显示指标</section>;
            const date = selectedDate ?? snapshot.asOf;
            const signals = signalsForDate(snapshot, date);
            const datedSnapshot = { ...snapshot, asOf: date, session: date === snapshot.asOf ? snapshot.session : "closed" as const };
            return <section className="market-analysis" data-analysis-market={market} key={market}>
              <div className="signals" data-date={date} aria-label={`${displayDate(date, true)}指标`}>
                <div className="analysis-heading"><h3>{market === "CN" ? "A 股" : "美股"}</h3></div>
                <MarketTrend snapshot={snapshot} benchmark={benchmarks[market]} windowEnd={windowEnd ?? snapshot.asOf} selectedDate={date} hoveredDate={hoveredDate} range={range} visible={visibleSeries} onHoverDate={setHoveredDate} onSelectDate={selectDate} canSelectDate={selectable} />
                <div className="technical-signals">{signals.slice(1).map((signal) => <SignalMeter key={signal.id} signal={signal} snapshot={datedSnapshot} range={range} windowEnd={windowEnd ?? snapshot.asOf} />)}</div>
              </div>
            </section>;
          })}{windowEnd && <TrendRangeControl end={windowEnd} range={range} benchmarks={benchmarks} onChange={setRange} />}</div>
        </section>
      </main>
    </>
  );
}

export default function Document({ data }: { data: PageData }) {
  const serialized = JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#7561b4" />
        <meta name="application-name" content="trendbeak" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="trendbeak" />
        <meta
          name="description"
          content="A 股与美股每日行情、年度涨跌与关键技术指标。"
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="trendbeak" />
        <meta property="og:title" content="每日市场信号 · trendbeak" />
        <meta
          property="og:description"
          content="A 股与美股每日行情、年度涨跌与关键技术指标。"
        />
        <meta property="og:url" content={data.requestUrl} />
        <meta property="og:image" content={new URL("/og.png?v=10", data.requestUrl).href} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="trendbeak · 每日市场信号" />
        <meta name="twitter:image" content={new URL("/og.png?v=10", data.requestUrl).href} />
        <link rel="canonical" href={data.requestUrl} />
        <link rel="manifest" href="/manifest.webmanifest?v=10" />
        <link rel="icon" href="/favicon.svg?v=10" type="image/svg+xml" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png?v=10"
          sizes="180x180"
        />
        <link rel="stylesheet" href="/static/client.css" />
        <title>每日市场信号 · trendbeak</title>
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          跳至行情
        </a>
        <Dashboard data={data} />
        <script
          id="trendbeak-data"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: serialized }}
        />
        <script type="module" src="/static/client.js" />
      </body>
    </html>
  );
}
