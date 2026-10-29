import { useEffect, useRef, useState } from "react";
import {
  BENCHMARKS,
  type Instrument,
  type Market,
  type MarketSnapshot,
  type PageData,
} from "./market-types";
import StockSearch from "./components/StockSearch";
import MarketCard, { type ViewState } from "./components/MarketCard";
import YearHeatmap, { HeatLegend } from "./components/YearHeatmap";
import SignalMeter from "./components/SignalMeter";
import MarketTrend from "./components/MarketTrend";
import { signalsForDate } from "./lib/market-signals";
import { calendarForRange, shiftDate } from "./lib/chart-series";
import { displayDate } from "./lib/market-format";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type { PageData } from "./market-types";
function Dashboard({ data }: { data: PageData }) {
  const [markets, setMarkets] = useState<Record<Market, ViewState>>(
    data.markets,
  );
  const current = useRef(markets);
  current.current = markets;
  const [benchmarks, setBenchmarks] = useState<Record<Market, MarketSnapshot | null>>({ CN: data.markets.CN.snapshot, US: data.markets.US.snapshot });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [range, setRange] = useState<30 | 90>(30);
  const [dateError, setDateError] = useState("");
  const calendarDates = Object.values(markets).flatMap(({ snapshot }) =>
    snapshot ? [snapshot.days[0].date, snapshot.days.at(-1)!.date] : [],
  ).sort();
  const calendarEnd = calendarDates.at(-1);
  const calendarStart = calendarEnd ? shiftDate(calendarEnd, -364) : undefined;
  const alignedDays = Object.fromEntries((["CN", "US"] as Market[]).map((market) => [market,
    markets[market].snapshot && calendarEnd ? calendarForRange(markets[market].snapshot!, calendarEnd) : [],
  ]));
  const selectable = (date: string) => !!calendarStart && !!calendarEnd && date >= calendarStart && date <= calendarEnd &&
    (["CN", "US"] as Market[]).some((market) => alignedDays[market].some((day) => day.date === date && day.status !== "closed"));
  const selectDate = (date: string) => {
    if (!selectable(date)) { setDateError("请选择日历范围内的交易日期"); return; }
    setDateError(""); setSelectedDate(date);
  };
  const adjacentDate = (direction: number) => {
    if (!calendarEnd || !calendarStart) return null;
    let date = shiftDate(selectedDate ?? calendarEnd, direction);
    while (date >= calendarStart && date <= calendarEnd) {
      if (selectable(date)) return date;
      date = shiftDate(date, direction);
    }
    return null;
  };
  const previousDate = adjacentDate(-1), nextDate = adjacentDate(1);
  const month = (date: string) => new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
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
    try {
      const response = await fetch(
        `/api/markets/${market}?symbol=${encodeURIComponent(instrument.symbol)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Market unavailable");
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
          },
        }));
      return false;
    }
  };
  useEffect(() => {
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
          <a className="brand" href="/" aria-label="Stock Daily 首页">
            <img className="brand-wordmark" src="/stockdaily-wordmark.svg?v=9" alt="stockdaily" width="331" height="68" />
          </a>
          <StockSearch onSelect={(instrument) => load(instrument, true)} />
        </div>
      </header>
      <main id="main-content">
        <h1 className="sr-only">每日市场信号</h1>
        <div className="market-grid">
          {(["CN", "US"] as Market[]).map((market) => <MarketCard key={market} state={markets[market]}
            date={selectedDate ?? undefined} reset={() => void load(BENCHMARKS[market])}
            retry={() => void load(markets[market].failedInstrument ?? markets[market].instrument)} />)}
        </div>
        {calendarEnd && <section className="annual-calendar" aria-labelledby="calendar-title">
          <div className="calendar-heading">
            <div className="section-title"><h2 id="calendar-title">每日涨跌</h2><span className="market-period" aria-label="行情日历时间范围" title={`${month(calendarStart!)} — ${month(calendarEnd)}`}>近一年</span></div>
            <div className="session-dates" aria-live="polite">{(["CN", "US"] as Market[]).map((market) => {
              const snapshot = markets[market].snapshot;
              if (!snapshot) return <span key={market}>{market === "CN" ? "A 股" : "美股"} · 行情暂缺</span>;
              const date = selectedDate ?? snapshot.asOf;
              const day = alignedDays[market].find((day) => day.date === date);
              const session = day?.status === "closed" ? "休市" : !snapshot.history[date] ? "无交易数据" : date === snapshot.asOf && snapshot.session === "trading" ? "盘中" : "收盘";
              return <span key={market}>{market === "CN" ? "A 股" : "美股"} <time dateTime={date}>{displayDate(date)}</time> · {session}</span>;
            })}</div>
            <div className={`date-control${selectedDate ? " is-historical" : ""}`}>
              <button aria-label="前一个交易日期" disabled={!previousDate} onClick={() => previousDate && selectDate(previousDate)}><ChevronLeft size={15} /></button>
              <input type="date" aria-label="选择日历日期" min={calendarStart} max={calendarEnd} value={selectedDate ?? calendarEnd} onChange={(event) => event.target.value && selectDate(event.target.value)} />
              <button aria-label="后一个交易日期" disabled={!nextDate} onClick={() => nextDate && selectDate(nextDate)}><ChevronRight size={15} /></button>
              <button className="latest-date-button" aria-label="返回最新日期" disabled={!selectedDate} onClick={() => { setSelectedDate(null); setDateError(""); }}>最新</button>
            </div>
          </div>
          {dateError && <p className="date-error" role="status">{dateError}</p>}
          <div className="calendar-rows">
            {(["CN", "US"] as Market[]).map((market, index) => {
              const snapshot = markets[market].snapshot;
              return <div className="calendar-row" data-calendar-market={market} key={market}><h3>{market === "CN" ? "A 股" : "美股"}</h3>
                {snapshot ? <YearHeatmap snapshot={snapshot} days={alignedDays[market]} selectedDate={selectedDate ?? snapshot.asOf} onSelectDate={selectDate} showMonths={index === 0 || !markets.CN.snapshot} />
                  : <p className="calendar-unavailable">行情暂不可用</p>}
              </div>;
            })}
          </div>
          <HeatLegend />
        </section>}
        <section className="market-signals" aria-labelledby="signals-title">
          <div className="signals-heading"><h2 id="signals-title">市场信号</h2>
            <div className="chart-legend" aria-label="情绪为紫色实线，大盘为深灰虚线"><span className="emotion-key">情绪</span><span className="index-key">大盘</span></div>
            <div className="range-control" role="group" aria-label="趋势时间范围">{([30, 90] as const).map((days) => <button key={days} aria-pressed={range === days} onClick={() => setRange(days)}>{days} 日</button>)}</div>
          </div>
          <div className="analysis-grid">{(["CN", "US"] as Market[]).map((market) => {
            const snapshot = markets[market].snapshot;
            if (!snapshot) return <section className="analysis-unavailable" key={market} aria-label={`${market === "CN" ? "A 股" : "美股"}指标`}>行情恢复后显示指标</section>;
            const date = selectedDate ?? snapshot.asOf;
            const signals = signalsForDate(snapshot, date);
            const datedSnapshot = { ...snapshot, asOf: date, session: date === snapshot.asOf ? snapshot.session : "closed" as const };
            return <section className="market-analysis" data-analysis-market={market} key={market}>
              <div className="signals" data-date={date} aria-label={`${displayDate(date, true)}指标`}>
                <div className="analysis-heading"><h3>{market === "CN" ? "A 股" : "美股"}</h3><SignalMeter signal={signals[0]} snapshot={datedSnapshot} /></div>
                <MarketTrend snapshot={snapshot} benchmark={benchmarks[market]} date={selectedDate ?? calendarEnd ?? date} range={range} />
                <div className="technical-signals">{signals.slice(1).map((signal) => <SignalMeter key={signal.id} signal={signal} snapshot={datedSnapshot} />)}</div>
              </div>
            </section>;
          })}</div>
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
        <meta name="application-name" content="Stock Daily" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Stock Daily" />
        <meta
          name="description"
          content="A 股与美股每日行情、年度涨跌与关键技术指标。"
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Stock Daily" />
        <meta property="og:title" content="每日市场信号 · Stock Daily" />
        <meta
          property="og:description"
          content="A 股与美股每日行情、年度涨跌与关键技术指标。"
        />
        <meta property="og:url" content={data.requestUrl} />
        <link rel="canonical" href={data.requestUrl} />
        <link rel="manifest" href="/manifest.webmanifest?v=9" />
        <link rel="icon" href="/favicon.svg?v=9" type="image/svg+xml" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png?v=9"
          sizes="180x180"
        />
        <link rel="stylesheet" href="/static/client.css" />
        <title>每日市场信号 · Stock Daily</title>
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          跳至行情
        </a>
        <Dashboard data={data} />
        <script
          id="stock-daily-data"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: serialized }}
        />
        <script type="module" src="/static/client.js" />
      </body>
    </html>
  );
}
