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
        <div className="skeleton-chart-labels"><i className="skeleton"/><i className="skeleton"/></div>
        <div className="skeleton-chart"><div className="skeleton skeleton-chart-placeholder"/></div>
        <div className="skeleton-chart-labels"><i className="skeleton"/><i className="skeleton"/></div>
      </div>
      <div className="technical-signals skeleton-technical" aria-hidden="true">
        <div className="skeleton-radar"><div className="skeleton skeleton-diamond"/>{[0, 1, 2, 3].map(i => <div className={`skeleton-radar-label skeleton-radar-label-${i}`} key={i}><i className="skeleton"/><i className="skeleton"/></div>)}</div>
      </div>
    </div>
  </section>;
}
