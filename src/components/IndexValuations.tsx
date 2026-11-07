import { useState } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole } from '@floating-ui/react';
import { displayDate, number } from '../lib/market-format';
import './market-overview.css';
import type { IndexValuation } from '../lib/china-overview';
export type { IndexValuation } from '../lib/china-overview';

function ValuationReading({ row, metric }: { row: IndexValuation; metric: 'pb' | 'ps' }) {
  const reading = row[metric], p = reading.percentile;
  const valid = p !== null && Number.isFinite(p) && p >= 0 && p <= 100;
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: setOpen, placement: 'top', whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12 })] });
  const { getReferenceProps, getFloatingProps } = useInteractions([useHover(context), useFocus(context), useClick(context), useDismiss(context), useRole(context, { role: 'tooltip' })]);
  return <div className="valuation-reading">
    <button type="button" className="valuation-trigger" ref={refs.setReference} {...getReferenceProps()} aria-label={`${row.name} ${metric.toUpperCase()} 分位，查看计算区间`}>
      <b>{valid ? `${number(p, 1)}%` : '—'}</b>
      <span className="valuation-track" aria-hidden="true">{valid && <i style={{ width: `${p}%` }} />}</span>
      <small>{reading.value === null ? '—' : `${number(reading.value)}倍`}</small>
    </button>
    {open && <FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <strong>{row.name} · {metric.toUpperCase()} 分位</strong>
      {reading.from ? <><span>{displayDate(reading.from, true)} 至 {displayDate(reading.through ?? row.date, true)}{!reading.through && '前（不含当日）'}</span>
        <span>{reading.samples ?? '—'} 个有效交易日</span></> : <span>—</span>}
    </div></FloatingPortal>}
  </div>;
}
/** Dates and ranks come from the prepared view; readers never calculate ranks. */
export default function IndexValuations({ rows }: { rows: IndexValuation[] }) {
  const dates = rows.map(row => row.date).sort(), first = dates[0], last = dates.at(-1);
  return <section className="index-valuations" aria-label="指数估值">
    <header className="overview-heading"><h3>指数估值</h3><span>{first && <time dateTime={first}>{displayDate(first, true)}</time>}{last && last !== first && <> 至 <time dateTime={last}>{displayDate(last, true)}</time></>}</span></header>
    <table><colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">指数</th><th scope="col">PB 分位</th><th scope="col">PS 分位</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.code}><th scope="row"><strong>{row.name}</strong><small>{row.code}</small></th>
        <td><ValuationReading row={row} metric="pb" /></td><td><ValuationReading row={row} metric="ps" /></td></tr>)}</tbody>
    </table>
  </section>;
}
