import { useEffect, useRef, useState } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole } from '@floating-ui/react';
import { displayDate, number } from '../lib/market-format';
import './market-overview.css';
import { validChinaOverview, valuationRowsForDate, type IndexValuation } from '../lib/china-overview';
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
        <span>{reading.samples === undefined ? '—' : `${reading.samples}天`}</span></> : <span>—</span>}
    </div></FloatingPortal>}
  </div>;
}
/** Dates and ranks come from the prepared view; readers never calculate ranks. */
export default function IndexValuations({ rows: availableRows, date }: { rows: IndexValuation[]; date?: string }) {
  type Result={date:string;rows:IndexValuation[];error:boolean;expires:number};
  const cache=useRef(new Map<string,Result>());
  const [loaded,setLoaded]=useState<Result|null>(null);
  const needsHistory=!!date&&availableRows.some(row=>row.date!==date);
  useEffect(()=>{
    if(!date||!needsHistory)return;
    const cached=cache.current.get(date);
    if(cached&&cached.expires>Date.now()){setLoaded(cached);return;}
    const controller=new AbortController();let active=true;
    const save=(rows:IndexValuation[],error:boolean)=>{
      if(!active)return;
      const result={date,rows,error,expires:Date.now()+(error?30000:300000)};
      cache.current.delete(date);cache.current.set(date,result);
      while(cache.current.size>366)cache.current.delete(cache.current.keys().next().value!);
      setLoaded(result);
    };
    const timer=setTimeout(()=>{void (async()=>{try{
      const response=await fetch(`/api/valuations/CN?date=${encodeURIComponent(date)}`,{signal:controller.signal});
      if(!response.ok)throw Error('Valuation unavailable');
      const {data}=await response.json() as {data:{date:string;rows:IndexValuation[]}};
      if(data?.date!==date||!Array.isArray(data.rows)||data.rows.some((row:IndexValuation)=>row.date!==date)||!validChinaOverview({sourceIds:{},history:{},valuations:{sourceId:'efunds_index',period:'近十年内 · 独立分位',rows:data.rows}},date))throw Error('Invalid valuation');
      save(data.rows,false);
    }catch{save([],true);}})();},150);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[date,needsHistory]);
  const candidate=date?cache.current.get(date):undefined;
  // Expiry gates requests on date visits, never hides an already displayed result.
  const result=candidate??(loaded&&loaded.date===date?loaded:null);
  const historical=result?.rows??[];
  const exactRows=availableRows.map(row=>{if(row.date===date)return row;const candidate=historical.find(candidate=>candidate.code===row.code);return candidate?{...candidate,name:row.name,code:row.code}:row;});
  const rows = date ? valuationRowsForDate(exactRows, date) : exactRows;
  const status=!needsHistory?'':!result?'正在读取估值数据':result.error?'估值数据暂不可用':!exactRows.some(row=>row.date===date)?'该日期暂无估值数据':'';
  const dates = rows.map(row => row.date).sort(), first = dates[0], last = dates.at(-1);
  return <section className="index-valuations" aria-label="指数估值">
    <header className="overview-heading"><h3>指数估值</h3><span>{first && <time dateTime={first}>{displayDate(first, true)}</time>}{last && last !== first && <> 至 <time dateTime={last}>{displayDate(last, true)}</time></>}</span></header>
    <p className="valuation-status" aria-live="polite">{status || '\u00a0'}</p>
    <table><colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">指数</th><th scope="col">PB 分位</th><th scope="col">PS 分位</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.code}><th scope="row"><strong>{row.name}</strong><small>{row.code}</small></th>
        <td><ValuationReading row={row} metric="pb" /></td><td><ValuationReading row={row} metric="ps" /></td></tr>)}</tbody>
    </table>
  </section>;
}
