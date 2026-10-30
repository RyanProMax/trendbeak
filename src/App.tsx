import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import TechnicalRadar from "./components/TechnicalRadar";
import MarketTrend from "./components/MarketTrend";
import TrendRangeControl from "./components/TrendRange";
import { clampWindow, historyBounds, latestWindow, windowDays, parseTrendWindow, TREND_WINDOW_STORAGE_KEY, type TrendWindow } from "./lib/trend-window";
import { isExchangeClosed } from "./lib/exchange-calendar";
import { calendarForRange, shiftDate } from "./lib/chart-series";
import { rememberSnapshot, restoreSnapshot } from "./lib/browser-snapshots";
import { recordFromSnapshot, readSnapshot, validRecord } from "./lib/snapshot-record";
import { displayDate } from "./lib/market-format";

export type { PageData } from "./market-types";
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function Dashboard({ data }: { data: PageData }) {
  const [markets, setMarkets] = useState<Record<Market, ViewState>>(
    data.markets,
  );
  const current = useRef(markets);
  current.current = markets;
  const [benchmarks, setBenchmarks] = useState<Record<Market, MarketSnapshot | null>>({ CN: data.markets.CN.snapshot, US: data.markets.US.snapshot });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [userWindow,setUserWindow] = useState<TrendWindow|null>(null);
  const [navigating,setNavigating] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({ mood: true, index: true });
  const [defaultDays,setDefaultDays] = useState(365);
  const [rangeReady,setRangeReady] = useState(false);
  useEffect(()=>{
    setDefaultDays(window.matchMedia("(max-width: 760px)").matches?90:365);
    try { const saved=parseTrendWindow(window.sessionStorage.getItem(TREND_WINDOW_STORAGE_KEY));if(saved)setUserWindow(previous=>previous??saved); } catch { /* Storage is optional. */ }
    setRangeReady(true);
  },[]);
  const chooseWindow = useCallback((next:TrendWindow)=>{
    setUserWindow(next);
    try { window.sessionStorage.setItem(TREND_WINDOW_STORAGE_KEY,JSON.stringify(next)); } catch { /* Quota or private mode must not block controls. */ }
  },[]);
  const calendarEnd = Object.values(markets).flatMap(({snapshot})=>snapshot?[snapshot.asOf]:[]).sort().at(-1);
  const bounds = useMemo(()=>historyBounds(Object.values(benchmarks)),[benchmarks]);
  const trendWindow = bounds?clampWindow(userWindow??latestWindow(bounds,defaultDays),bounds):null;
  const windowEnd = trendWindow?.end??calendarEnd;
  const range = trendWindow?windowDays(trendWindow):defaultDays;
  const alignedDays = useMemo(()=>Object.fromEntries((["CN","US"] as Market[]).map(market=>[market,
    markets[market].snapshot&&windowEnd?calendarForRange(markets[market].snapshot!,windowEnd,range):[],
  ])),[markets,windowEnd,range]);
  useEffect(() => {
    document.querySelectorAll("[data-trend-hover]").forEach((cell) => cell.removeAttribute("data-trend-hover"));
    if (hoveredDate) document.querySelectorAll(`.calendar-section rect[data-date="${hoveredDate}"]`).forEach((cell) => cell.setAttribute("data-trend-hover", "true"));
  }, [hoveredDate, alignedDays]);
  const selectable = useCallback((date:string)=>(["CN","US"] as Market[]).some(market=>{
    const snapshot=markets[market].snapshot;if(!snapshot||isExchangeClosed(date,market))return false;
    // Selection inspects exact dates; it never changes the shared date window.
    return alignedDays[market].some(day=>day.date===date&&day.status!=="closed") || !!bounds && date>=bounds.start && date<=bounds.end && !!snapshot.history[date];
  }),[bounds,markets,alignedDays]);
  const selectDate = useCallback((date: string) => {
    if (selectable(date)) setSelectedDate(date);
  }, [selectable]);
  const globalDate = selectedDate ?? Object.values(markets).flatMap(({ snapshot }) => snapshot ? [snapshot.asOf] : []).sort().at(-1) ?? calendarEnd;
  const controllers = useRef<Partial<Record<Market, AbortController>>>({});
  const requestedSymbols = useRef<Partial<Record<Market,string>>>({});
  const benchmarkRequests = useRef<Partial<Record<Market,Promise<void>>>>({});
  const load = async (
    instrument: Instrument,
    scroll = false,
  ): Promise<boolean> => {
    const market = instrument.market;
    if (controllers.current[market] && requestedSymbols.current[market] === instrument.symbol) return false;
    controllers.current[market]?.abort();
    const controller = new AbortController();
    controllers.current[market] = controller;
    requestedSymbols.current[market] = instrument.symbol;
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
      const record = recordFromSnapshot(payload.data);
      if (!validRecord(record,market,instrument.symbol)) throw new Error("Invalid snapshot");
      payload.data = readSnapshot(record,Date.now(),payload.data.freshness?.via ?? "upstream",payload.data.freshness?.state === "stale");
      rememberSnapshot(payload.data,browserStorage());
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
      if (!controller.signal.aborted) {
        const previous = current.current[market].snapshot;
        const record = previous ? recordFromSnapshot(previous) : null;
        const backup = validRecord(record,market,instrument.symbol) ? readSnapshot(record,Date.now(),"memory",true) : restoreSnapshot(market,instrument.symbol,browserStorage());
        setMarkets((states) => {
          const prior = states[market], old = prior.snapshot ? recordFromSnapshot(prior.snapshot) : null;
          const retained = validRecord(old,market,prior.instrument.symbol) ? prior.snapshot : null;
          return { ...states, [market]: backup ? { instrument, snapshot: backup, loading: false, error: null } : {
            ...prior, instrument: retained ? prior.instrument : instrument, snapshot: retained,
            loading: false, error: "行情暂不可用", pendingInstrument: undefined, failedInstrument: instrument, retryable,
          } };
        });
        if (backup && instrument.kind === "index") setBenchmarks((states)=>({ ...states,[market]:backup }));
        return !!backup;
      }
      return false;
    } finally {
      if(controllers.current[market] === controller) { delete controllers.current[market]; delete requestedSymbols.current[market]; }
    }
  };
  useEffect(() => {
    const store = browserStorage();
    for(const market of ["CN", "US"] as Market[]) {
      const initial = data.markets[market].snapshot;
      if(initial) rememberSnapshot(initial,store);
      const backup = restoreSnapshot(market,data.markets[market].instrument.symbol,store);
      if(backup && (!initial || Date.parse(backup.freshness!.storedAt) > Date.parse(initial.freshness?.storedAt ?? initial.fetchedAt))) {
        setMarkets((states)=>({ ...states,[market]:{ ...states[market],snapshot:backup,error:null } }));
        setBenchmarks((states)=>({ ...states,[market]:backup }));
      }
    }
  }, []);
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
            if (current.current[market].instrument.kind === "stock" && !benchmarkRequests.current[market]) {
              benchmarkRequests.current[market] = fetch(`/api/markets/${market}`).then(async (response) => {
                if (!response.ok) throw new Error("Benchmark unavailable");
                const payload = await response.json() as { data: MarketSnapshot };
                const record = recordFromSnapshot(payload.data);
                if (!validRecord(record,market,BENCHMARKS[market].symbol)) throw new Error("Invalid benchmark");
                const snapshot = readSnapshot(record,Date.now(),payload.data.freshness?.via ?? "upstream",payload.data.freshness?.state === "stale");
                rememberSnapshot(snapshot,browserStorage());
                setBenchmarks((previous) => ({ ...previous, [market]: snapshot }));
              }).catch(() => {
                setBenchmarks((previous) => {
                  const old = previous[market] ? recordFromSnapshot(previous[market]!) : null;
                  const backup = validRecord(old,market,BENCHMARKS[market].symbol) ? readSnapshot(old,Date.now(),"memory",true) : restoreSnapshot(market,BENCHMARKS[market].symbol,browserStorage());
                  return { ...previous,[market]:backup };
                });
              }).finally(()=>{ delete benchmarkRequests.current[market]; });
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
            <img className="brand-wordmark" src="/trendbeak-wordmark.svg?v=11" alt="trendbeak" width="480" height="120" />
          </a>
          <StockSearch onSelect={(instrument) => load(instrument, true)} />
        </div>
      </header>
      <main id="main-content" data-range-ready={rangeReady}>
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
        <section className={`market-signals${navigating ? " is-navigating" : ""}`} aria-labelledby="signals-title">
          <div className="signals-heading"><h2 id="signals-title">市场信号</h2>
            <div className="chart-legend" aria-label="情绪按分值由绿经金到红，大盘为深灰实线"><button type="button" className="emotion-key" aria-pressed={visibleSeries.mood} onClick={() => setVisibleSeries((old) => ({ ...old, mood: !old.mood }))}>情绪</button><button type="button" className="index-key" aria-pressed={visibleSeries.index} onClick={() => setVisibleSeries((old) => ({ ...old, index: !old.index }))}>大盘</button></div>
          </div>
          <div className="analysis-grid">{(["CN", "US"] as Market[]).map((market) => {
            const snapshot = markets[market].snapshot;
            if (!snapshot) return <section className="analysis-unavailable" data-analysis-market={market} key={market} aria-label={`${market === "CN" ? "A 股" : "美股"}指标`}>行情恢复后显示指标</section>;
            const date = selectedDate ?? snapshot.asOf;
            return <section className="market-analysis" data-analysis-market={market} key={market}>
              <div className="signals" data-date={date} aria-label={`${displayDate(date, true)}指标`}>
                <div className="analysis-heading"><h3>{market === "CN" ? "A 股" : "美股"}</h3></div>
                <MarketTrend snapshot={snapshot} benchmark={benchmarks[market]} bounds={bounds ?? {start:shiftDate(windowEnd ?? snapshot.asOf,-364),end:windowEnd ?? snapshot.asOf}} windowEnd={windowEnd ?? snapshot.asOf} selectedDate={date} hoveredDate={hoveredDate} range={range} visible={visibleSeries} onHoverDate={setHoveredDate} onSelectDate={selectDate} canSelectDate={selectable} />
                <TechnicalRadar snapshot={snapshot} date={date} />
              </div>
            </section>;
          })}{bounds && trendWindow && <TrendRangeControl bounds={bounds} value={trendWindow} benchmarks={benchmarks} onChange={chooseWindow} onDragging={setNavigating} />}</div>
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
        <meta name="theme-color" content="#59685f" />
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
        <meta property="og:image" content={new URL("/og.png?v=11", data.requestUrl).href} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="trendbeak · 每日市场信号" />
        <meta name="twitter:image" content={new URL("/og.png?v=11", data.requestUrl).href} />
        <link rel="canonical" href={data.requestUrl} />
        <link rel="manifest" href="/manifest.webmanifest?v=11" />
        <link rel="icon" href="/favicon.ico?v=11" sizes="any" />
        <link rel="icon" href="/favicon-16.png?v=11" type="image/png" sizes="16x16" />
        <link rel="icon" href="/favicon-32.png?v=11" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon.svg?v=11" type="image/svg+xml" sizes="any" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png?v=11"
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
