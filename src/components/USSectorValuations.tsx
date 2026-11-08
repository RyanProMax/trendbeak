import { useEffect, useRef, useState } from 'react';
import CollapsiblePanel, { usePanelVisible } from './CollapsiblePanel';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole } from '@floating-ui/react';
import { displayDate, number } from '../lib/market-format';
import { US_SECTOR_ETFS, validETFValuation, type ETFValuation } from '../lib/us-etf-valuations';
import './market-overview.css';
import './us-sector-valuations.css';
type Result = { date: string; rows: ETFValuation[]; error: boolean; expires: number };
function SourceComparison({ row }: { row: ETFValuation }) {
  const [open,setOpen]=useState(false),visible=usePanelVisible(),c=row.sourceComparison!;
  useEffect(()=>{setOpen(false);},[visible,row.date]);
  const {refs,floatingStyles,context}=useFloating({open,onOpenChange:setOpen,placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,middleware:[offset(8),flip(),shift({padding:12})]});
  const {getReferenceProps,getFloatingProps}=useInteractions([useHover(context,{mouseOnly:true}),useFocus(context),useClick(context),useDismiss(context),useRole(context,{role:'tooltip'})]);
  const values=(m:'pb'|'ps')=>`${m.toUpperCase()} ${row[m].value===null?'—':number(row[m].value)+'倍'} / ${c.alternateSourceValues[m]===null?'—':number(c.alternateSourceValues[m]!)+ '倍'}`;
  return <><button type="button" className="valuation-source-conflict" aria-label={`${row.code} 持仓来源有差异`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>持仓来源有差异</button>
    {open&&<FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <strong>{row.code} · 当前核验</strong><span>核验日期：{displayDate(new Date(c.observedAt).toISOString().slice(0, 10), true)}</span><span>监管申报主值 / 发行方披露备值</span>
      <span>{values('pb')}</span><span>{values('ps')}</span>
      <span>备值差异：{(['pb','ps']as const).map(m=>`${m.toUpperCase()} ${c.deltaPercent[m]===null?'—':number(c.deltaPercent[m]!,1)+'%'}`).join('；')}</span>
      <span>两份持仓披露的权重不同，不代表估值区间。</span>
    </div></FloatingPortal>}
  </>;
}
export default function USSectorValuations({ date }: { date: string }) {
  const cache = useRef(new Map<string, Result>()), [loaded, setLoaded] = useState<Result | null>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRefresh(n => n + 1); }, 300000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const cached = cache.current.get(date);
    if (cached && cached.expires > Date.now()) { setLoaded(cached); return; }
    const controller = new AbortController(); let active = true;
    const save = (rows: ETFValuation[], error: boolean) => {
      if (!active) return;
      const result = { date, rows, error, expires: Date.now() + (error ? 30000 : 300000) };
      cache.current.delete(date); cache.current.set(date, result);
      while (cache.current.size > 366) cache.current.delete(cache.current.keys().next().value!);
      setLoaded(result);
    };
    const timer = setTimeout(() => { void (async () => {
      try {
        const response = await fetch(`/api/valuations/US?date=${encodeURIComponent(date)}`, { signal: controller.signal });
        if (!response.ok) throw Error('ETF valuations unavailable');
        const { data } = await response.json() as { data: { date: string; rows: ETFValuation[] } };
        if (data?.date !== date || !Array.isArray(data.rows) || data.rows.length > 11 || new Set(data.rows.map(r => r.code)).size !== data.rows.length || data.rows.some(r => !validETFValuation(r, date))) throw Error('Invalid ETF valuations');
        save(data.rows, false);
      } catch { save([], true); }
    })(); }, 150);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [date, refresh]);
  const result = cache.current.get(date) ?? (loaded?.date === date ? loaded : null);
  const status = !result ? '正在读取估值数据' : result.error ? '估值数据暂不可用' : !result.rows.some(r => r.pb.value !== null || r.ps.value !== null) ? '该日期暂无估值数据' : '持仓估算';
  const quarterDates = [...new Set(result?.rows.filter(r => r.pricingBasis === 'portfolio_fair_value_per_share').map(r => r.date))];
  const quarter = quarterDates.length === 1 && result?.rows.every(r => r.pricingBasis === 'portfolio_fair_value_per_share');
  const stateLabel = status === '持仓估算' && quarter ? `季度持仓估算 · ${displayDate(quarterDates[0], true)}` : status;
  return <CollapsiblePanel panelKey="us-valuations" title="板块 ETF 估值" className="index-valuations us-sector-valuations">
    <p className="valuation-status" aria-live="polite">{stateLabel}</p>
    {result?.rows.some(r => r.code === 'XLC' && r.ps.value !== null && r.qualityFlags.comparableRevenue > 0) && <p className="valuation-adjustment">XLC 可比口径：已调整拆分前收入</p>}
    {result?.rows.some(r => r.code === 'XLF' && (r.pb.value !== null || r.ps.value !== null) && r.qualityFlags.eventReconstructedShares > 0) && <p className="valuation-adjustment">XLF 含股本事件估算</p>}
    {result?.rows.some(r => r.code === 'XLI' && (r.pb.value !== null || r.ps.value !== null) && r.qualityFlags.eventProForma > 0) && <p className="valuation-adjustment">XLI 含分拆财务估算</p>}
    <table data-valuation-date={date} aria-label={`板块 ETF 估值，${displayDate(date, true)}`}>
      <colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">板块 / ETF</th><th scope="col">PB <small>倍</small></th><th scope="col">PS <small>倍</small></th></tr></thead>
      <tbody>{US_SECTOR_ETFS.map(([code, name]) => {
        const row = result?.rows.find(r => r.code === code);
        return <tr key={code}><th scope="row"><strong>{name}</strong><small>{code}</small>{row?.pricingBasis === 'portfolio_fair_value_per_share'&&!quarter&&<small>{displayDate(row.date, true)}</small>}{row?.sourceComparison?.sourceConflict&&<SourceComparison row={row}/>}</th>
          {(['pb', 'ps'] as const).map(metric => <td key={metric}><div className="etf-valuation-reading"><b className={row?.[metric].value == null ? "is-missing" : undefined}>{row?.[metric].value != null ? number(row[metric].value) : '—'}</b></div></td>)}
        </tr>;
      })}</tbody>
    </table>
  </CollapsiblePanel>;
}
