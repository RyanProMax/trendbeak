import CollapsiblePanel, {PanelPreferences} from "./components/CollapsiblePanel";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BENCHMARKS,
  type Instrument,
  type Market,
  type MarketSnapshot,
  type PageData,
} from "./market-types";
import ThemeSwitch, { useColorScheme, THEME_BOOTSTRAP } from "./components/ThemeSwitch";
import StickyHeader from "./components/StickyHeader";
import TechnicalRadar from "./components/TechnicalRadar";
import {hasStockRadar} from "./lib/radar-signals";
import StockSearch from "./components/StockSearch";
import MarketSwitch from "./components/MarketSwitch";
import {useMarketMotion} from "./components/useMarketMotion";
import { type ViewState } from "./components/MarketCard";
import { CalendarSkeleton, SignalsSkeleton, SentimentSkeleton } from "./components/MarketSkeleton";
import YearHeatmap, { HeatLegend } from "./components/YearHeatmap";
import {MarketSentimentRadar} from "./components/ChinaSentimentRadar";
import{US_LABELS,usReadings}from"./lib/us-overview";
import IndexValuations from "./components/IndexValuations";
import {chinaReadings} from "./lib/china-overview";
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
  const activeSnapshot=markets[activeMarket].snapshot;
  const stockKey=activeSnapshot?.instrument.kind==='stock'?`${activeMarket}:${activeSnapshot.instrument.symbol}`:null;
  const [stockWindows,setStockWindows]=useState<Record<string,TrendWindow>>({});
  const userWindow=stockKey?stockWindows[stockKey]??null:userWindows[activeMarket];
  const setUserWindow=(value:TrendWindow)=>stockKey?setStockWindows(old=>({...old,[stockKey]:value})):setUserWindows(old=>({...old,[activeMarket]:value}));
  const { scheme, setScheme } = useColorScheme();
  const [navigating,setNavigating] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [trendReadoutTarget,setTrendReadoutTarget]=useState<HTMLDivElement|null>(null);
  const marketMotion=useRef(false),pointerInput=useRef(false),navigationEpoch=useRef(0);
  const [loadingCalendar,setLoadingCalendar]=useState<{market:Market;height:number}|null>(null);
  const mainRef=useMarketMotion(`${activeMarket}:${markets[activeMarket].snapshot?.instrument.symbol??'loading'}`,marketMotion);
  useEffect(()=>{
    const pointer=()=>{pointerInput.current=true;},keyboard=()=>{pointerInput.current=false;};
    window.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',keyboard,true);
    return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',keyboard,true);};
  },[]);
  const [defaultDays,setDefaultDays] = useState(365);
  const [rangeReady,setRangeReady] = useState(false);
  const boundsByMarket=useMemo(()=>({CN:historyBounds([benchmarks.CN]),US:historyBounds([benchmarks.US])}),[benchmarks]);
  const bounds=useMemo(()=>stockKey?historyBounds([activeSnapshot]):boundsByMarket[activeMarket],[stockKey,activeSnapshot,boundsByMarket,activeMarket]);
  const visibleBenchmarks=useMemo(()=>({CN:activeMarket==='CN'?(stockKey?activeSnapshot:benchmarks.CN):null,US:activeMarket==='US'?(stockKey?activeSnapshot:benchmarks.US):null}),[activeMarket,benchmarks,stockKey,activeSnapshot]);
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
    try { if(!stockKey)persistTrendWindow(window.sessionStorage,normalized,bounds,activeMarket); } catch { /* Optional storage. */ }
  },[activeMarket,stockKey,bounds?.start,bounds?.end,trendWindow?.start,trendWindow?.end]);
  useLayoutEffect(()=>{
    if(scrollAnchor.current!==null){const top=document.querySelector(".navigator-track")?.getBoundingClientRect().top;if(top!==undefined)window.scrollBy(0,top-scrollAnchor.current);scrollAnchor.current=null;}
  },[trendWindow?.start,trendWindow?.end]);
  useEffect(()=>{
    if(!rangeReady||!userWindow||!bounds)return;const normalized=clampWindow(userWindow,bounds);
    if(normalized.start!==userWindow.start||normalized.end!==userWindow.end)setUserWindow(normalized);
    try{if(!stockKey)persistTrendWindow(window.sessionStorage,normalized,bounds,activeMarket);}catch{/* Optional storage. */}
  },[rangeReady,activeMarket,stockKey,userWindow,bounds?.start,bounds?.end]);
  const restoredMarkets=useRef(new Set<Market>());
  useLayoutEffect(()=>{if(stockKey||!rangeReady||!bounds||restoredMarkets.current.has(activeMarket))return;restoredMarkets.current.add(activeMarket);try{const saved=restoreTrendWindow(window.sessionStorage,bounds,activeMarket);if(saved)setUserWindows(old=>({...old,[activeMarket]:old[activeMarket]??saved}));}catch{/* Optional storage. */}},[rangeReady,activeMarket,stockKey,bounds?.start,bounds?.end]);
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
  const failedSelection=markets[activeMarket].failedInstrument;
  const selectionFeedback=markets[activeMarket].error&&failedSelection?{
    message:`${markets[activeMarket].error==="该股票的历史数据尚未收录"?"尚未收录":"暂未载入"}${failedSelection.name}${activeSnapshot?`，仍显示${activeSnapshot.instrument.name}`:"，暂无可用行情"}`,
    placeholder:`${failedSelection.name}${markets[activeMarket].error==="该股票的历史数据尚未收录"?"未收录":"暂不可用"} · ${activeSnapshot?(activeSnapshot.instrument.kind==="stock"?`仍显示${activeSnapshot.instrument.code}`:"仍显示大盘"):"暂无行情"}`,
  }:null;

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
          instrument: payload.data.instrument,
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
  const changeMarket=(market:Market,record=true,animate=pointerInput.current)=>{
    navigationEpoch.current++;
    // Returning to a market/history entry is a new selection. A former stock
    // request must not replace the instrument represented by that destination.
    if(requestedSymbols.current[market]&&requestedSymbols.current[market]!==current.current[market].instrument.symbol){
      controllers.current[market]?.abort();
      delete controllers.current[market];delete requestedSymbols.current[market];
      setMarkets(states=>({...states,[market]:{...states[market],loading:false,pendingInstrument:undefined}}));
    }
    marketMotion.current=market!==shownMarket.current&&animate;
    if(market!==shownMarket.current){
      const height=mainRef.current?.querySelector('.calendar-rows')?.getBoundingClientRect().height;
      setLoadingCalendar(!current.current[market].snapshot&&height?{market,height}:null);
    }
    shownMarket.current=market;setActiveMarket(market);setHoveredDate(null);setNavigating(false);
    if(record){const url=new URL(location.href);url.searchParams.set('market',market);const instrument=current.current[market].instrument;if(instrument.kind==='stock')url.searchParams.set('symbol',instrument.symbol);else url.searchParams.delete('symbol');history.pushState(null,'',url);}
  };
  const visit=async(instrument:Instrument,record=true)=>{
    changeMarket(instrument.market,false);
    const epoch=++navigationEpoch.current;
    if(instrument.kind==='stock'&&(!benchmarkCurrent.current[instrument.market]||(instrument.market==='US'?!benchmarkCurrent.current.US?.usOverview:!benchmarkCurrent.current.CN?.chinaOverview))) await ensureBenchmark(instrument.market);
    if(epoch!==navigationEpoch.current)return false;
    const ok=await load(instrument,true);
    if(epoch!==navigationEpoch.current)return false;
    if(record){const actual=ok?instrument:current.current[instrument.market].instrument,url=new URL(location.href);url.searchParams.set('market',instrument.market);if(actual.kind==='stock')url.searchParams.set('symbol',actual.symbol);else url.searchParams.delete('symbol');history.pushState(null,'',url);}return ok;
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
    // A navigation read or a successful quote supersedes this timer.
    const recoveryTimers = ([shownMarket.current] as Market[]).flatMap((market) =>
      !data.markets[market].snapshot && data.markets[market].error!==null && data.markets[market].retryable === true
        ? [window.setTimeout(() => {
            const state = current.current[market];
            if (!state.snapshot && !state.loading && !controllers.current[market]) void load(state.instrument);
          }, 1500)] : [],
    );
    // Quote updates belong to scheduled backend jobs. A page/navigation read
    // still retrieves the prepared snapshot, but the browser never polls it.
    return () => {
      recoveryTimers.forEach(clearTimeout);
      Object.values(controllers.current).forEach((controller) =>
        controller.abort(),
      );
    };
  }, []);
  return (
    <>
      <StickyHeader className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="trendbeak 首页">
            <img className="brand-wordmark brand-light" src="/trendbeak-wordmark.svg?v=13" alt="trendbeak" width="1196" height="230" /><img className="brand-wordmark brand-dark" src="/trendbeak-wordmark-dark.svg?v=13" alt="trendbeak" width="1196" height="230" />
          </a>
          <MarketSwitch market={activeMarket} onChange={(market,animate)=>changeMarket(market,true,animate)}/>
          <StockSearch selectedInstrument={activeSnapshot?.instrument??BENCHMARKS[activeMarket]} selectionFeedback={selectionFeedback} onDismissFeedback={()=>setMarkets(states=>({...states,[activeMarket]:{...states[activeMarket],error:null,failedInstrument:undefined}}))} onClear={() => void visit(BENCHMARKS[activeMarket])} onSelect={(instrument) => visit(instrument)} />
          <ThemeSwitch scheme={scheme} setScheme={setScheme} />
        </div>
      </StickyHeader>
      <main ref={mainRef} id="main-content" data-range-ready={rangeReady} data-market={activeMarket} data-selected-date={globalDate}>
        <h1 className="sr-only">每日市场信号</h1>
        <PanelPreferences><CollapsiblePanel panelKey="calendar" title="每日涨跌" className="annual-calendar" readout={globalDate ? <time className="global-selected-date" dateTime={globalDate} aria-live="polite">{displayDate(globalDate, true)}</time> : <span className="global-selected-date">—</span>}>
          <div className="calendar-rows" style={!markets[activeMarket].snapshot&&markets[activeMarket].loading&&loadingCalendar?.market===activeMarket?{minHeight:loadingCalendar.height}:undefined}>
            {[activeMarket].map((market) => {
              const snapshot = markets[market].snapshot;
              return <div className="calendar-row" data-calendar-market={market} key={market}>
                <span className="sr-only">{markets[market].instrument.name}每日涨跌</span>
                {markets[market].pendingInstrument&&<span className="sr-only" role="status">正在切换至{markets[market].pendingInstrument!.name}</span>}
                {snapshot && mounted ? <YearHeatmap key={market} colorScheme={scheme} snapshot={snapshot} days={alignedDays[market]} selectedDate={selectedDate ?? snapshot.asOf} onSelectDate={selectDate} onHoverDate={setHoveredDate} showMonths />
                  : snapshot || markets[market].loading ? <CalendarSkeleton /> : <p className="calendar-unavailable">—</p>}
              </div>;
            })}
          </div>
          {(calendarEnd||markets[activeMarket].loading) && <HeatLegend colorScheme={scheme} />}
        </CollapsiblePanel>
        <CollapsiblePanel panelKey="signals" title={stockKey?`${activeSnapshot!.instrument.name} · ${activeSnapshot!.instrument.code}`:"市场信号"} className={`market-signals${stockKey ? " stock-signals" : ""}${navigating ? " is-navigating" : ""}`} readout={<div className="trend-heading-readout" ref={setTrendReadoutTarget}/>}>
          <div className="analysis-grid">{[activeMarket].map((market) => {
            const snapshot = markets[market].snapshot;
            if (!snapshot) return markets[market].loading ? <SignalsSkeleton market={market} key={market} /> : <section className="analysis-unavailable" data-analysis-market={market} key={market} aria-label={`${market === "CN" ? "A 股" : "美股"}指标`}>—</section>;
            const date = selectedDate ?? snapshot.asOf;
            return <section className="market-analysis" data-analysis-market={market} key={market}>
              <div className="signals" data-date={date} aria-label={`${displayDate(date, true)}指标`}>
                <div className="analysis-heading"><h3>{snapshot.instrument.kind==='stock'?snapshot.instrument.name:market === "CN" ? "A 股" : "美股"}</h3></div>
                {mounted ? <><MarketTrend key={market+snapshot.instrument.symbol} snapshot={snapshot} benchmark={benchmarks[market]} bounds={bounds ?? {start:shiftDate(windowEnd ?? snapshot.asOf,-364),end:windowEnd ?? snapshot.asOf}} windowEnd={windowEnd ?? snapshot.asOf} selectedDate={date} hoveredDate={hoveredDate} range={range} visible={{mood:snapshot.instrument.kind!=="stock",index:true}} readoutTarget={trendReadoutTarget} onHoverDate={setHoveredDate} onSelectDate={selectDate} dateSelected onClearDate={()=>setSelectedDate(null)} canSelectDate={selectable} />
                {bounds&&trendWindow&&<TrendRangeControl key={market+'-range'} bounds={bounds} value={trendWindow} benchmarks={visibleBenchmarks} onChange={chooseWindow} onDragging={setNavigating} />}
</> : <div className="signals-loading" aria-label="正在绘制市场信号"/>}
              </div>
            </section>;
          })}</div>
        </CollapsiblePanel>
        {!activeSnapshot&&markets[activeMarket].loading&&markets[activeMarket].instrument.kind==='index'&&<SentimentSkeleton market={activeMarket}/>}
        {mounted&&activeSnapshot?.instrument.kind==='stock'&&hasStockRadar(activeSnapshot,globalDate??activeSnapshot.asOf)&&<CollapsiblePanel panelKey="stock-radar" title="个股技术指标" className="stock-technical-panel"><TechnicalRadar key={activeSnapshot.instrument.symbol} snapshot={activeSnapshot} date={globalDate??activeSnapshot.asOf}/></CollapsiblePanel>}
        {mounted&&markets[activeMarket].snapshot&&markets[activeMarket].snapshot!.instrument.kind!=='stock'&&<MarketSentimentRadar date={globalDate??markets[activeMarket].snapshot!.asOf} market={activeMarket} labels={activeMarket==='US'?US_LABELS:undefined} readings={activeMarket==='CN'?chinaReadings(benchmarks.CN??markets.CN.snapshot!,globalDate??markets.CN.snapshot!.asOf):usReadings(benchmarks.US??markets.US.snapshot!,globalDate??markets.US.snapshot!.asOf)}/>}
        {activeMarket==='CN'&&benchmarks.CN?.chinaOverview?.valuations&&<IndexValuations rows={benchmarks.CN.chinaOverview.valuations.rows} date={globalDate}/>}
        </PanelPreferences>
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light dark"/>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
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
        <meta property="og:image" content={new URL("/og.png?v=13", data.requestUrl).href} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="trendbeak · 每日市场信号" />
        <meta name="twitter:image" content={new URL("/og.png?v=13", data.requestUrl).href} />
        <link rel="canonical" href={data.requestUrl} />
        <link rel="manifest" href="/manifest.webmanifest?v=13" />
        <link rel="icon" href="/favicon.ico?v=13" sizes="any" />
        <link rel="icon" href="/favicon-16.png?v=13" type="image/png" sizes="16x16" />
        <link rel="icon" href="/favicon-32.png?v=13" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon.svg?v=13" type="image/svg+xml" sizes="any" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png?v=13"
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
