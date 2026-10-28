import { useEffect, useRef, useState } from "react";
import {
  BENCHMARKS,
  type Instrument,
  type Market,
  type MarketState,
  type MarketSnapshot,
  type PageData,
} from "./market-types";
import StockSearch from "./components/StockSearch";
import MarketCard, { type ViewState } from "./components/MarketCard";

export type { PageData } from "./market-types";
function Dashboard({ data }: { data: PageData }) {
  const [markets, setMarkets] = useState<Record<Market, ViewState>>(
    data.markets,
  );
  const current = useRef(markets);
  current.current = markets;
  const calendarDates = Object.values(markets).flatMap(({ snapshot }) =>
    snapshot ? [snapshot.days[0].date, snapshot.days.at(-1)!.date] : [],
  ).sort();
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
        for (const market of ["CN", "US"] as Market[])
          if (!current.current[market].loading)
            void load(current.current[market].instrument);
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
            <img className="brand-mark" src="/favicon.svg?v=4" alt="" />
            <span>
              stock<span className="brand-light">daily</span>
            </span>
          </a>
          <StockSearch onSelect={(instrument) => load(instrument, true)} />
        </div>
      </header>
      <main id="main-content">
        <h1 className="sr-only">每日市场信号</h1>
        {calendarDates.length > 0 && (
          <div className="market-period" aria-label="行情日历时间范围">
            <span>近一年</span>
            <span>{month(calendarDates[0])} — {month(calendarDates.at(-1)!)}</span>
          </div>
        )}
        <div className="market-grid">
          {(["CN", "US"] as Market[]).map((market) => (
            <MarketCard
              key={market}
              state={markets[market]}
              reset={() => void load(BENCHMARKS[market])}
              retry={() =>
                void load(
                  markets[market].failedInstrument ??
                    markets[market].instrument,
                )
              }
            />
          ))}
        </div>
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
        <link rel="manifest" href="/manifest.webmanifest?v=4" />
        <link rel="icon" href="/favicon.svg?v=4" type="image/svg+xml" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png?v=4"
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
