import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BENCHMARKS,
  type Instrument,
  type Market,
  type MarketSnapshot,
  type PageData,
} from "./market-types";
import StockSearch from "./components/StockSearch";
import MarketCard, { type ViewState } from "./components/MarketCard";
import { CalendarSkeleton, SignalsSkeleton } from "./components/MarketSkeleton";
import YearHeatmap, { HeatLegend } from "./components/YearHeatmap";
import {MarketSentimentRadar} from "./components/ChinaSentimentRadar";
import{US_LABELS,usReadings}from"./lib/us-overview";
import ChinaSentimentRadar from "./components/ChinaSentimentRadar";
import IndexValuations from "./components/IndexValuations";
import {chinaReadings,OVERVIEW_SOURCES} from "./lib/china-overview";
import MarketTrend from "./components/MarketTrend";
import TrendRangeControl from "./components/TrendRange";
import { clampWindow, historyBounds, latestWindow, windowDays, persistTrendWindow, restoreTrendWindow, type TrendWindow } from "./lib/trend-window";
import { isExchangeClosed } from "./lib/exchange-calendar";
import { calendarForRange, shiftDate } from "./lib/chart-series";
import { rememberSnapshot, restoreSnapshot } from "./lib/browser-snapshots";
import { recordFromSnapshot, readSnapshot, validRecord, validSnapshot } from "./lib/snapshot-record";
import { DATA_VERSION, fetchQuote } from "./lib/client-version";
import { expandSnapshot } from "./lib/expand-snapshot";
import { displayDate } from "./lib/market-format";

export type { PageData } from "./market-types";
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function Dashboard({ data }: { data: PageData }) {
  const [mounted,setMounted]=useState(false);
  const [markets, setMarkets] = useState<Record<Market, ViewState>>(
    Object.fromEntries(Object.entries(data.markets).map(([m,s])=>[m,{...s,loading:!s.snapshot&&!s.error}])) as Record<Market,ViewState>,
  );
  const current = useRef(markets);
  current.current = markets;
  const [benchmarks, setBenchmarks] = useState<Record<Market, MarketSnapshot | null>>({ CN: data.markets.CN.snapshot, US: data.markets.US.snapshot });
  const [activeMarket,setActiveMarket]=useState<Market>('CN');
  const shownMarket=useRef<Market>('CN'),lastReads=useRef<Partial<Record<Market,number>>>({}),benchmarkCurrent=useRef(benchmarks);benchmarkCurrent.current=benchmarks;
  const [selectedDates,setSelectedDates]=useState<Record<Market,string|null>>({CN:null,US:null});
  const selectedDate=selectedDates[activeMarket];
  const setSelectedDate=(value:string|null)=>setSelectedDates(old=>({...old,[activeMarket]:value}));
  const [userWindows,setUserWindows]=useState<Record<Market,TrendWindow|null>>({CN:null,US:null});
  const userWindow=userWindows[activeMarket];
  const setUserWindow=(value:TrendWindow)=>setUserWindows(old=>({...old,[activeMarket]:value}));
  const [scheme,setScheme]=useState<'light'|'dark'>('light');
  useEffect(()=>{const q=matchMedia('(prefers-color-scheme:dark)'),update=()=>setScheme(q.matches?'dark':'light');update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
  const [navigating,setNavigating] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({ mood: true, index: true });
  const [defaultDays,setDefaultDays] = useState(365);
  const [rangeReady,setRangeReady] = useState(false);
  const boundsByMarket=useMemo(()=>({CN:historyBounds([benchmarks.CN]),US:historyBounds([benchmarks.US])}),[benchmarks]);
  const bounds=boundsByMarket[activeMarket];
  const visibleBenchmarks=useMemo(()=>({CN:activeMarket==='CN'?benchmarks.CN:null,US:activeMarket==='US'?benchmarks.US:null}),[activeMarket,benchmarks]);
  const scrollAnchor=useRef<number|null>(null);
  useLayoutEffect(()=>{
    const expanded=Object.fromEntries((["CN","US"] as Market[]).map(m=>[m,{...data.markets[m],snapshot:data.markets[m].snapshot?expandSnapshot(data.markets[m].snapshot!):null,loading:!data.markets[m].snapshot&&!data.markets[m].error}])) as Record<Market,ViewState>;
    setMarkets(expanded);setBenchmarks({CN:expanded.CN.snapshot,US:expanded.US.snapshot});setMounted(true);
    setDefaultDays(window.matchMedia("(max-width: 760px)").matches?90:365);

    setRangeReady(true);
  },[]);
  const calendarEnd = markets[activeMarket].snapshot?.asOf;
  const trendWindow = bounds?clampWindow(userWindow??latestWindow(bounds,defaultDays),bounds):null;
  const chooseWindow=useCallback((next:TrendWindow)=>{
    if(!bounds)return;const normalized=clampWindow(next,bounds),track=document.querySelector(".navigator-track")?.getBoundingClientRect();
    scrollAnchor.current=track&&window.scrollY>0&&track.bottom>0&&track.top<window.innerHeight&&(normalized.start!==trendWindow?.start||normalized.end!==trendWindow?.end)?track.top:null;
    setUserWindow(normalized);
    try { persistTrendWindow(window.sessionStorage,normalized,bounds,activeMarket); } catch { /* Optional storage. */ }
  },[activeMarket,bounds?.start,bounds?.end,trendWindow?.start,trendWindow?.end]);
  useLayoutEffect(()=>{
    if(scrollAnchor.current!==null){const top=document.querySelector(".navigator-track")?.getBoundingClientRect().top;if(top!==undefined)window.scrollBy(0,top-scrollAnchor.current);scrollAnchor.current=null;}
  },[trendWindow?.start,trendWindow?.end]);
  useEffect(()=>{
    if(!rangeReady||!userWindow||!bounds)return;const normalized=clampWindow(userWindow,bounds);
    if(normalized.start!==userWindow.start||normalized.end!==userWindow.end)setUserWindow(normalized);
    try{persistTrendWindow(window.sessionStorage,normalized,bounds,activeMarket);}catch{/* Optional storage. */}
  },[rangeReady,userWindow,bounds?.start,bounds?.end]);
  const restoredMarkets=useRef(new Set<Market>());
  useEffect(()=>{if(!rangeReady||!bounds||restoredMarkets.current.has(activeMarket))return;restoredMarkets.current.add(activeMarket);try{const saved=restoreTrendWindow(window.sessionStorage,bounds,activeMarket);if(saved)setUserWindows(old=>({...old,[activeMarket]:old[activeMarket]??saved}));}catch{/* Optional storage. */}},[rangeReady,activeMarket,bounds?.start,bounds?.end]);
  const windowEnd = trendWindow?.end??calendarEnd;
  const range = trendWindow?windowDays(trendWindow):defaultDays;
  const alignedDays = useMemo(()=>Object.fromEntries((["CN","US"] as Market[]).map(market=>[market,
    markets[market].snapshot&&windowEnd?calendarForRange(markets[market].snapshot!,windowEnd,range):[],
  ])),[markets,windowEnd,range]);
  useEffect(() => {
    document.querySelectorAll("[data-trend-hover]").forEach((cell) => cell.removeAttribute("data-trend-hover"));
    if (hoveredDate) document.querySelectorAll(`.calendar-section rect[data-date="${hoveredDate}"]`).forEach((cell) => cell.setAttribute("data-trend-hover", "true"));
  }, [hoveredDate, alignedDays]);
  const selectable = useCallback((date:string)=>[activeMarket].some(market=>{
    const snapshot=markets[market].snapshot;if(!snapshot||isExchangeClosed(date,market))return false;
    // Selection inspects exact dates; it never changes the shared date window.
    return alignedDays[market].some(day=>day.date===date&&day.status!=="closed") || !!bounds && date>=bounds.start && date<=bounds.end && !!snapshot.history[date];
  }),[activeMarket,bounds,markets,alignedDays]);
  const selectDate = useCallback((date: string) => {
    if (selectable(date)) setSelectedDate(date);
  }, [selectable]);
  const globalDate = selectedDate ?? calendarEnd;
  const controllers = useRef<Partial<Record<Market, AbortController>>>({});
  const requestedSymbols = useRef<Partial<Record<Market,string>>>({});
  const benchmarkRequests = useRef<Partial<Record<Market,Promise<unknown>>>>({});
  const load = async (
    instrument: Instrument,
    scroll = false,
  ): Promise<boolean> => {
    const market = instrument.market;
    if (controllers.current[market] && requestedSymbols.current[market] === instrument.symbol) return false;
    controllers.current[market]?.abort();
    lastReads.current[market]=Date.now();
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
    let retryable = false, missing=false;
    try {
      const response = await fetchQuote(
        `/api/markets/${market}?symbol=${encodeURIComponent(instrument.symbol)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const failure = await response.json() as { retryable?: boolean; code?:string };
        missing=failure.code==="snapshot_missing";
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
      payload.data = expandSnapshot(payload.data);
      const record = recordFromSnapshot(payload.data);
      if (!(payload.data.freshness?.via==="database"?validSnapshot(payload.data,market,instrument.symbol,Date.now()):validRecord(record,market,instrument.symbol))) throw new Error("Invalid snapshot");
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
      if (instrument.kind === "index"){benchmarkCurrent.current={...benchmarkCurrent.current,[market]:payload.data};setBenchmarks((previous) => ({ ...previous, [market]: payload.data }));}
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
        if(!missing)console.warn("Market read failed",{market,symbol:instrument.symbol});
        const previous = current.current[market].snapshot;
        const record = previous ? recordFromSnapshot(previous) : null;
        const saved = (previous?.freshness?.via==="database"&&validSnapshot(previous,market,instrument.symbol,Date.now())||validRecord(record,market,instrument.symbol)) ? readSnapshot(record!,Date.now(),previous?.freshness?.via==="database"?"database":"memory",true) : restoreSnapshot(market,instrument.symbol,browserStorage());
        const backup = saved ? { ...saved, sentiment: previous?.sentiment ?? saved.sentiment } : null;
        setMarkets((states) => {
          const prior = states[market], old = prior.snapshot ? recordFromSnapshot(prior.snapshot) : null;
          const retained = (prior.snapshot?.freshness?.via==="database"&&validSnapshot(prior.snapshot,market,prior.instrument.symbol,Date.now())||validRecord(old,market,prior.instrument.symbol)) ? prior.snapshot : null;
          return { ...states, [market]: backup ? { instrument, snapshot: backup, loading: false, error: null } : {
            ...prior, instrument: retained ? prior.instrument : instrument, snapshot: retained,
            loading: false, error: missing?"该股票的历史数据尚未收录":"行情暂不可用", pendingInstrument: undefined, failedInstrument: instrument, retryable,
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
  const ensureBenchmark=async(market:Market)=>{if(benchmarkRequests.current[market])return benchmarkRequests.current[market];const task=load(BENCHMARKS[market]);benchmarkRequests.current[market]=task;try{return await task;}finally{if(benchmarkRequests.current[market]===task)delete benchmarkRequests.current[market];}};
  const changeMarket=(market:Market,record=true)=>{
    shownMarket.current=market;setActiveMarket(market);setHoveredDate(null);setNavigating(false);
    if(record){const url=new URL(location.href);url.searchParams.set('market',market);const instrument=current.current[market].instrument;if(instrument.kind==='stock')url.searchParams.set('symbol',instrument.symbol);else url.searchParams.delete('symbol');history.pushState(null,'',url);}
  };
  const visit=async(instrument:Instrument,record=true)=>{
    changeMarket(instrument.market,false);if(instrument.kind==='stock'&&(!benchmarkCurrent.current[instrument.market]||(instrument.market==='US'?!benchmarkCurrent.current.US?.usOverview:!benchmarkCurrent.current.CN?.chinaOverview)))await ensureBenchmark(instrument.market);const ok=await load(instrument,true);
    if(record){const url=new URL(location.href);url.searchParams.set('market',instrument.market);if(ok&&instrument.kind==='stock')url.searchParams.set('symbol',instrument.symbol);else url.searchParams.delete('symbol');history.pushState(null,'',url);}return ok;
  };
  const navigation=useRef({changeMarket,visit});navigation.current={changeMarket,visit};
  useEffect(()=>{const restore=(navigateSymbol=true)=>{const url=new URL(location.href),market=url.searchParams.get('market')==='US'?'US':'CN',symbol=url.searchParams.get('symbol');navigation.current.changeMarket(market,false);const old=current.current[market].instrument;if(!navigateSymbol)return;if(!symbol&&old.kind==='stock')void navigation.current.visit(BENCHMARKS[market],false);else if(symbol&&symbol!==old.symbol&&/^[A-Z^][A-Z0-9.^-]{0,23}$|^\d{6}\.(SS|SZ)$/.test(symbol))void navigation.current.visit({...BENCHMARKS[market],symbol,code:symbol,name:symbol,kind:'stock'},false);};restore(false);const pop=()=>restore();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  const deepLinkHandled=useRef(false);useEffect(()=>{if(deepLinkHandled.current||!markets[activeMarket].snapshot)return;deepLinkHandled.current=true;const symbol=new URL(location.href).searchParams.get('symbol');if(symbol&&symbol!==markets[activeMarket].instrument.symbol&&/^[A-Z^][A-Z0-9.^-]{0,23}$|^\d{6}\.(SS|SZ)$/.test(symbol))void navigation.current.visit({...BENCHMARKS[activeMarket],symbol,code:symbol,name:symbol,kind:'stock'},false);},[activeMarket,markets[activeMarket].snapshot]);
  useEffect(() => {
    const store = browserStorage();
    for(const market of ["CN", "US"] as Market[]) {
      const initial = data.markets[market].snapshot ? expandSnapshot(data.markets[market].snapshot!) : null;
      if(initial) rememberSnapshot(initial,store);
      // Inactive markets are restored locally, never fetched speculatively.
      const backup = restoreSnapshot(market,data.markets[market].instrument.symbol,store);
      if(backup && (!initial || Date.parse(backup.freshness!.storedAt) > Date.parse(initial.freshness?.storedAt ?? initial.fetchedAt))) {
        const restored = { ...backup, sentiment: initial?.sentiment ?? backup.sentiment };
        setMarkets((states)=>({ ...states,[market]:{ ...states[market],snapshot:restored,error:null } }));
        setBenchmarks((states)=>({ ...states,[market]:restored }));
      }
    }
  }, []);
  useEffect(()=>{const market=shownMarket.current;if(Date.now()-(lastReads.current[market]??0)>=300_000){const instrument=current.current[market].instrument;void(instrument.kind==='index'?ensureBenchmark(market):load(instrument));}},[activeMarket]);
  useEffect(() => {
    // Recover a transient empty SSR state once, without waiting a full minute.
    // A manual request or a successful quote supersedes this timer.
    const recoveryTimers = ([shownMarket.current] as Market[]).flatMap((market) =>
      !data.markets[market].snapshot && data.markets[market].error!==null && data.markets[market].retryable === true
        ? [window.setTimeout(() => {
            const state = current.current[market];
            if (!state.snapshot && !state.loading && !controllers.current[market]) void load(state.instrument);
          }, 1500)] : [],
    );
    const refresh = () => {
      if (document.visibilityState === "visible")
        for (const market of [shownMarket.current]) {
          if (!current.current[market].loading) {
            void load(current.current[market].instrument);
            if (current.current[market].instrument.kind === "stock" && !benchmarkRequests.current[market]) {
              benchmarkRequests.current[market] = fetchQuote(`/api/markets/${market}`).then(async (response) => {
                if (!response.ok) throw new Error("Benchmark unavailable");
                const payload = await response.json() as { data: MarketSnapshot };
                payload.data = expandSnapshot(payload.data);
                const record = recordFromSnapshot(payload.data);
                if (!(payload.data.freshness?.via==="database"?validSnapshot(payload.data,market,BENCHMARKS[market].symbol,Date.now()):validRecord(record,market,BENCHMARKS[market].symbol))) throw new Error("Invalid benchmark");
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
    let lastRefresh=Date.now();
    const boundedRefresh=()=>{if(Date.now()-lastRefresh<300_000)return;lastRefresh=Date.now();refresh();};
    const timer = window.setInterval(boundedRefresh, 300_000);
    document.addEventListener("visibilitychange", boundedRefresh);
    return () => {
      clearInterval(timer);
      recoveryTimers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", boundedRefresh);
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
            <picture><source media="(prefers-color-scheme: dark)" srcSet="/trendbeak-wordmark-dark.svg?v=11"/><img className="brand-wordmark" src="/trendbeak-wordmark.svg?v=11" alt="trendbeak" width="480" height="120" /></picture>
          </a>
          <div className="market-switch"><span aria-hidden="true">CN</span><span aria-hidden="true">US</span><input type="range" min="0" max="1" step="1" value={activeMarket==='CN'?0:1} aria-label="切换市场" aria-valuetext={activeMarket==='CN'?'A股':'美股'} onChange={e=>changeMarket(e.currentTarget.value==='0'?'CN':'US')}/></div>
          <StockSearch onSelect={(instrument) => visit(instrument)} />
        </div>
      </header>
      <main id="main-content" data-range-ready={rangeReady} data-market={activeMarket} data-selected-date={globalDate}>
        <h1 className="sr-only">每日市场信号</h1>
        <section className="annual-calendar" aria-labelledby="calendar-title">
          <div className="calendar-heading">
            <h2 id="calendar-title">每日涨跌</h2>
            {globalDate ? <time className="global-selected-date" dateTime={globalDate} aria-live="polite">{displayDate(globalDate, true)}</time> : <span className="global-selected-date">—</span>}
          </div>
          <div className="calendar-rows">
            {[activeMarket].map((market) => {
              const snapshot = markets[market].snapshot;
              return <div className="calendar-row" data-calendar-market={market} key={market}>
                <MarketCard state={markets[market]} date={selectedDate ?? undefined} reset={() => void visit(BENCHMARKS[market])} retry={() => void load(markets[market].failedInstrument ?? markets[market].instrument)} />
                {snapshot && mounted ? <YearHeatmap key={market} colorScheme={scheme} snapshot={snapshot} days={alignedDays[market]} selectedDate={selectedDate ?? snapshot.asOf} onSelectDate={selectDate} onHoverDate={setHoveredDate} showMonths />
                  : snapshot || markets[market].loading ? <CalendarSkeleton /> : <p className="calendar-unavailable">—</p>}
              </div>;
            })}
          </div>
          {calendarEnd && <HeatLegend colorScheme={scheme} />}
        </section>
        <section className={`market-signals${navigating ? " is-navigating" : ""}`} aria-labelledby="signals-title">
          <div className="signals-heading"><h2 id="signals-title">市场信号</h2>
            <div className="chart-legend" aria-label="情绪按分值由绿经金到红，大盘为深灰实线"><button type="button" className="emotion-key" aria-pressed={visibleSeries.mood} onClick={() => setVisibleSeries((old) => ({ ...old, mood: !old.mood }))}>情绪</button><button type="button" className="index-key" aria-pressed={visibleSeries.index} onClick={() => setVisibleSeries((old) => ({ ...old, index: !old.index }))}>大盘</button></div>
          </div>
          <div className="analysis-grid">{[activeMarket].map((market) => {
            const snapshot = markets[market].snapshot;
            if (!snapshot) return markets[market].loading ? <SignalsSkeleton market={market} key={market} /> : <section className="analysis-unavailable" data-analysis-market={market} key={market} aria-label={`${market === "CN" ? "A 股" : "美股"}指标`}>—</section>;
            const date = selectedDate ?? snapshot.asOf;
            return <section className="market-analysis" data-analysis-market={market} key={market}>
              <div className="signals" data-date={date} aria-label={`${displayDate(date, true)}指标`}>
                <div className="analysis-heading"><h3>{market === "CN" ? "A 股" : "美股"}</h3></div>
                {mounted ? <><MarketTrend key={market+snapshot.instrument.symbol} snapshot={snapshot} benchmark={benchmarks[market]} bounds={bounds ?? {start:shiftDate(windowEnd ?? snapshot.asOf,-364),end:windowEnd ?? snapshot.asOf}} windowEnd={windowEnd ?? snapshot.asOf} selectedDate={date} hoveredDate={hoveredDate} range={range} visible={visibleSeries} onHoverDate={setHoveredDate} onSelectDate={selectDate} dateSelected onClearDate={()=>setSelectedDate(null)} canSelectDate={selectable} />
                {bounds&&trendWindow&&<TrendRangeControl key={market+'-range'} bounds={bounds} value={trendWindow} benchmarks={visibleBenchmarks} onChange={chooseWindow} onDragging={setNavigating} />}
                <div className="signal-radar">{market==='CN'?<ChinaSentimentRadar key={market+date} date={date} readings={chinaReadings(benchmarks.CN??snapshot,date)}/>:<MarketSentimentRadar key={market+date} date={date} market="US" labels={US_LABELS} readings={usReadings(benchmarks.US??snapshot,date)}/>}</div></> : <div className="signals-loading" aria-label="正在绘制市场信号"/>}
              </div>
            </section>;
          })}</div>
        </section>
        {activeMarket==='CN'&&benchmarks.CN?.chinaOverview?.valuations&&<IndexValuations rows={benchmarks.CN.chinaOverview.valuations.rows} period={benchmarks.CN.chinaOverview.valuations.period} source={OVERVIEW_SOURCES[benchmarks.CN.chinaOverview.valuations.sourceId]}/>}
        {markets[activeMarket].snapshot&&<details className="data-sources"><summary>来源</summary><p><a href={markets[activeMarket].snapshot!.source.url} target="_blank" rel="noreferrer">{markets[activeMarket].snapshot!.source.name}</a>{markets[activeMarket].snapshot!.sentiment&&<> · <a href={markets[activeMarket].snapshot!.sentiment!.source.url} target="_blank" rel="noreferrer">{activeMarket==='CN'?'百分位':'CNN 社区存档'}</a></>}</p></details>}
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
        <meta name="color-scheme" content="light dark"/>
        <meta name="theme-color" content="#fafbf8" media="(prefers-color-scheme: light)"/><meta name="theme-color" content="#151c18" media="(prefers-color-scheme: dark)"/>
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
        <link rel="stylesheet" href={`/static/client.css?v=${DATA_VERSION}`} />
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
        <script type="module" src={`/static/client.js?v=${DATA_VERSION}`} />
      </body>
    </html>
  );
}
