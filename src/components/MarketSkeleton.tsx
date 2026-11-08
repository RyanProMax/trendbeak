import CollapsiblePanel from "./CollapsiblePanel";
import type { Market } from "../market-types";

export function QuoteSkeleton() {
  return <div className="quote-skeleton" role="status" aria-label="正在读取行情">
    <span className="sr-only">正在读取行情</span>
    <div className="skeleton skeleton-price" aria-hidden="true" />
    <div className="skeleton skeleton-change" aria-hidden="true" />
    <div className="skeleton skeleton-date" aria-hidden="true" />
  </div>;
}

export function CalendarSkeleton() {
  return <div className="calendar-loading" role="status" aria-label="正在读取每日涨跌">
    <span className="sr-only">正在读取每日涨跌</span>
    <div className="skeleton-calendar-months" aria-hidden="true">{Array.from({length: 6}, (_, i) => <i className="skeleton" key={i} />)}</div>
    <div className="skeleton-calendar-grid" aria-hidden="true">{Array.from({length: 5}, (_, i) => <i className="skeleton" key={i} />)}</div>
  </div>;
}

export function SignalsSkeleton({market}: {market: Market}) {
  const name = market === "CN" ? "A 股" : "美股";
  return <section className="market-analysis" data-analysis-market={market} aria-label={`${name}指标`} aria-busy="true">
    <div className="signals signals-skeleton" role="status" aria-label={`正在读取${name}市场信号`}>
      <div className="analysis-heading"><h3>{name}</h3><span className="sr-only">正在读取市场信号</span></div>
      <div className="trend-wrap skeleton-trend" aria-hidden="true">
        <div className="chart-axis-head"><span>情绪 · 0–100</span><span>指数点位</span></div>
        <div className="skeleton-chart interactive-trend"><div className="skeleton skeleton-chart-placeholder"/></div>
        <div className="trend-status"/>
      </div>
      <div className="trend-range-control skeleton-range" aria-hidden="true">
        <div className="navigator-track"><div className="navigator-preview skeleton"/></div>
        <div className="navigator-caption"><i className="skeleton"/><i className="skeleton"/></div>
      </div>

    </div>
  </section>;
}

/** Matches the live sibling panel; no borrowed dates, scores or observations. */
export function SentimentSkeleton({market}:{market:Market}) {
  return <CollapsiblePanel panelKey="sentiment" title={market==='CN'?'A股市场情绪':'美股市场情绪'} readout={<span>—</span>}>
    <section className="china-sentiment skeleton-overview" aria-busy="true" aria-label="正在读取市场情绪">
      <svg className="six-factor-graphic" viewBox="0 0 360 288" aria-hidden="true">
        {[.5,1].map(scale=><polygon key={scale} className="six-factor-grid" points={Array.from({length:6},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/3;return `${180+Math.cos(angle)*103*scale},${144+Math.sin(angle)*103*scale}`;}).join(' ')}/>)}
      </svg>
      <div className="six-factor-readings" aria-hidden="true">{Array.from({length:6},(_,i)=><div className="six-factor-trigger six-factor-skeleton" key={i}><span className="six-factor-heading"><span className="skeleton skeleton-factor-label"/><span className="skeleton skeleton-factor-value"/></span><span className="six-factor-percentile"><span className="six-factor-percentile-label"><span>历史分位</span><span>—</span></span><span className="six-factor-track skeleton"/></span></div>)}</div>
    </section>
  </CollapsiblePanel>;
}
