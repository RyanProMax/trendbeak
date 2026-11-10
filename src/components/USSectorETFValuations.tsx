import { useEffect, useRef, useState, type ReactNode } from 'react';
import CollapsiblePanel, { usePanelVisible } from './CollapsiblePanel';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole } from '@floating-ui/react';
import { displayDate, number } from '../lib/market-format';
import { US_SECTOR_ETFS, validETFValuation, holdXLKCommonCapital, holdXLCParentCapitalPS, type ETFValuation } from '../lib/us-etf-valuations';
import { currentBasketForView, type CurrentBasketReading } from '../lib/us-etf-current';
import {XLP_CLASS_METHOD} from '../lib/us-etf-xlp-method';
import './market-overview.css';
import './us-sector-valuations.css';
type Result = { date: string; viewMode: string; rows: ETFValuation[]; current: CurrentBasketReading | null; error: boolean; expires: number };
function SourceComparison({ row }: { row: ETFValuation }) {
  const [open,setOpen]=useState(false),visible=usePanelVisible(),c=row.sourceComparison!;
  useEffect(()=>{setOpen(false);},[visible,row.date]);
  const {refs,floatingStyles,context}=useFloating({open,onOpenChange:setOpen,placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,middleware:[offset(8),flip(),shift({padding:12})]});
  const {getReferenceProps,getFloatingProps}=useInteractions([useHover(context,{mouseOnly:true}),useFocus(context),useClick(context),useDismiss(context),useRole(context,{role:'tooltip'})]);
  const values=(m:'pb'|'ps')=>`${m.toUpperCase()} ${row[m].value===null?'—':number(row[m].value)+'倍'} / ${c.alternateSourceValues[m]===null?'—':number(c.alternateSourceValues[m]!)+ '倍'}`;
  return <><button type="button" className="valuation-source-conflict" aria-label={`${row.code} 持仓来源有差异`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>持仓来源有差异</button>
    {open&&<FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <strong>{row.code} · 当前核验</strong><span>核验日期：{displayDate(new Date(c.observedAt).toISOString().slice(0, 10), true)}</span><span>监管申报主值 / 发行方披露备值</span>
      <span>{row.pb.estimate ? 'PB估算未作来源对比' : values('pb')}</span><span>{row.ps.estimate ? 'PS估算未作来源对比' : values('ps')}</span>
      <span>备值差异：{(['pb','ps']as const).map(m=>`${m.toUpperCase()} ${row[m].estimate ? '估算不比较' : c.deltaPercent[m]===null?'—':number(c.deltaPercent[m]!,Math.abs(c.deltaPercent[m]!) < .1 ? 4 : 2,true)+'%'}`).join('；')}</span>
      <span>两份持仓披露的权重不同，不代表估值区间。</span>
    </div></FloatingPortal>}
  </>;
}
function MetricEstimate({row,metric}: {row: ETFValuation; metric: 'pb'|'ps'}) {
  const [open,setOpen]=useState(false),visible=usePanelVisible();
  useEffect(()=>{setOpen(false);},[visible,row.date]);
  const {refs,floatingStyles,context}=useFloating({open,onOpenChange:setOpen,placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,middleware:[offset(8),flip(),shift({padding:12})]});
  const {getReferenceProps,getFloatingProps}=useInteractions([useHover(context,{mouseOnly:true}),useFocus(context),useClick(context),useDismiss(context),useRole(context,{role:'tooltip'})]);
  return <><button type="button" className="valuation-quarterly-rank" aria-label={`${row.code} ${metric.toUpperCase()} 估算说明`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>估算</button>{open&&<FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}><strong>{row.code} {metric.toUpperCase()} · 估算</strong><span>估值日期：{displayDate(row.date,true)}</span><span>{metric==='pb'?'优先股资本采用估价扣减，并非披露的完整账面值。':'仅DVN采用2025全年合并模拟收入，非截至该日的滚动十二个月收入。'}</span><span>使用该季度持仓及公允价值，非实时行情。</span><span>无同口径历史分位。</span></div></FloatingPortal>}</>;
}
function CurrentBasketEstimate({row,metric}: {row:CurrentBasketReading;metric:'pb'|'ps'}) {
  const [open,setOpen]=useState(false),visible=usePanelVisible();
  useEffect(()=>setOpen(false),[visible,row.priceAsOf]);
  const {refs,floatingStyles,context}=useFloating({open,onOpenChange:setOpen,placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,middleware:[offset(8),flip(),shift({padding:12})]});
  const {getReferenceProps,getFloatingProps}=useInteractions([useHover(context,{mouseOnly:true}),useFocus(context),useClick(context),useDismiss(context),useRole(context,{role:'tooltip'})]);
  return <><button type="button" className="valuation-quarterly-rank" aria-label={`XLI ${metric.toUpperCase()} 披露持仓重估说明`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>估算</button>{open&&<FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}><strong>XLI {metric.toUpperCase()} · 持仓重估</strong><span>价格截至{displayDate(row.priceAsOf,true)}收盘，非实时行情。</span><span>按截至{displayDate(row.holdingsAsOf,true)}的已披露持仓重新计价，并非当前基金持仓或净值。</span><span>已核实覆盖{number(row.metrics[metric].verifiedCoverage*100,2)}%。{metric==='ps'?'少量收入采用分部口径估算。':''}少量股类按转换价值估算。</span><span>无同口径历史分位。</span></div></FloatingPortal>}</>;
}
function XLPMethodEstimate({row,metric}:{row:ETFValuation;metric:'pb'|'ps'}){
 const [open,setOpen]=useState(false),visible=usePanelVisible();useEffect(()=>setOpen(false),[visible,row.date]);
 const {refs,floatingStyles,context}=useFloating({open,onOpenChange:setOpen,placement:'top',strategy:'fixed',whileElementsMounted:autoUpdate,middleware:[offset(8),flip(),shift({padding:12})]});
 const {getReferenceProps,getFloatingProps}=useInteractions([useHover(context,{mouseOnly:true}),useFocus(context),useClick(context),useDismiss(context),useRole(context,{role:'tooltip'})]);
 return <><button type="button" className="valuation-quarterly-rank" aria-label={`XLP ${metric.toUpperCase()} 股类转换估算说明`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>估算</button>{open&&<FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}><strong>XLP {metric.toUpperCase()} · 股类转换估算</strong><span>持仓与基金期末估值截至{displayDate(row.date,true)}，完整资料公开于{displayDate(row.availableDate,true)}，非实时行情。</span><span>上市股类用各自基金估值；无单独报价股类按已披露转换规则估算，不表示投票权或股息权相同。</span><span>覆盖{number(row[metric].verifiedCoverage*100,2)}%，无同口径历史分位。</span></div></FloatingPortal>}</>;
}
function HistoricalRank({ row, metric }: { row: ETFValuation; metric: 'pb' | 'ps' }) {
  const value = row[metric], h = value.quarterlyHistory!;
  const [open, setOpen] = useState(false), visible = usePanelVisible();
  useEffect(() => { setOpen(false); }, [visible, row.date]);
  const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: setOpen, placement: 'top', strategy: 'fixed', whileElementsMounted: autoUpdate, middleware: [offset(8), flip(), shift({ padding: 12 })] });
  const { getReferenceProps, getFloatingProps } = useInteractions([useHover(context, { mouseOnly: true }), useFocus(context), useClick(context), useDismiss(context), useRole(context, { role: 'tooltip' })]);
  const quarter = (date: string) => `${date.slice(0, 4)}年第${Number(date.slice(5, 7)) / 3}季度`;
  return <><button type="button" className="valuation-quarterly-rank" aria-label={`${row.code} ${metric.toUpperCase()} 季度历史分位`} aria-expanded={open} ref={refs.setReference} {...getReferenceProps()}>季度分位 {number(value.percentile!, 1)}%</button>
    {open && <FloatingPortal><div className="valuation-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <strong>{row.code} {metric.toUpperCase()} · 季度样本分位</strong>
      <span>{h.sampleCount}期有效样本，{quarter(h.windowStart!)}至{quarter(h.windowEnd!)}。</span>
      <span>{h.missingQuarterCount}期缺失，未补值；当前季度不计入样本。</span>
      <span>{h.withoutOfficialProForma.sampleCount < h.sampleCount ? '包含已核验的可比财务估算，并非纯原报表口径。' : '根据已披露财务资料估算。'}</span>
      {h.withoutOfficialProForma.sampleCount < h.sampleCount && <span>{h.withoutOfficialProForma.percentile !== null ? `剔除官方备考估算季度：${h.withoutOfficialProForma.sampleCount}期，分位 ${number(h.withoutOfficialProForma.percentile, 1)}%。` : `剔除官方备考估算季度后仅${h.withoutOfficialProForma.sampleCount}期，未达到展示门槛。`}</span>}
      <span>仅达到20期、跨5年才展示。缺失样本可能影响排名，不代表统计置信度。</span>
    </div></FloatingPortal>}
  </>;
}
export default function USSectorETFValuations({ date, viewMode = 'historical', codes, readout }: { date: string; viewMode?: 'latest'|'historical'; codes?: readonly string[]; readout?: ReactNode }) {
  // Expiry is a display-clock condition, not a successful-network condition.
  const [viewClock,setViewClock]=useState(()=>Date.now());
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const tick=()=>{const now=Date.now();setViewClock(now);clearTimeout(timer);timer=setTimeout(tick,86400000-now%86400000+5);};const visible=()=>{if(document.visibilityState==='visible')tick();};tick();document.addEventListener('visibilitychange',visible);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};},[]);
  const cacheKey = `${viewMode}:${date}`;
  const cache = useRef(new Map<string, Result>()), [loaded, setLoaded] = useState<Result | null>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRefresh(n => n + 1); }, 300000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const cached = cache.current.get(cacheKey);
    if (cached && cached.expires > Date.now()) { setLoaded(cached); return; }
    const controller = new AbortController(); let active = true;
    const save = (rows: ETFValuation[], error: boolean, current: CurrentBasketReading | null = null) => {
      if (!active) return;
      setViewClock(Date.now());
      const result = { date, viewMode, rows: rows.map(row => holdXLCParentCapitalPS(holdXLKCommonCapital(row))), current, error, expires: Date.now() + (error ? 30000 : 300000) };
      cache.current.delete(cacheKey); cache.current.set(cacheKey, result);
      while (cache.current.size > 366) cache.current.delete(cache.current.keys().next().value!);
      setLoaded(result);
    };
    const timer = setTimeout(() => { void (async () => {
      try {
        const response = await fetch(`/api/valuations/US?date=${encodeURIComponent(date)}&format=sector-methods-v7`, { signal: controller.signal });
        if (!response.ok) throw Error('ETF valuations unavailable');
        const { data } = await response.json() as { data: { date: string; rows: ETFValuation[] } };
        if (data?.date !== date || !Array.isArray(data.rows) || data.rows.length > 11 || new Set(data.rows.map(r => r.code)).size !== data.rows.length || data.rows.some(r => !validETFValuation(r, date))) throw Error('Invalid ETF valuations');
        let current:CurrentBasketReading|null=null;
        if(viewMode==='latest'||date==='2026-11-06')try{const c=await fetch('/api/valuations/US/current-estimate',{signal:controller.signal});if(c.ok){const body=await c.json() as {data:unknown};current=currentBasketForView(body.data,{mode:viewMode,date});}}catch{/* Independent current failure must not erase quarterly rows. */}
        save(data.rows, false,current);
      } catch { save([], true); }
    })(); }, 150);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [date, viewMode, cacheKey, refresh]);
  const cachedResult = cache.current.get(cacheKey) ?? (loaded?.date === date && loaded.viewMode === viewMode ? loaded : null);
  const result = cachedResult ? {...cachedResult,current:currentBasketForView(cachedResult.current,{mode:viewMode,date},viewClock)} : null;
  const status = !result ? '正在读取估值数据' : result.error ? '估值数据暂不可用' : !result.rows.some(r => r.pb.value !== null || r.ps.value !== null) ? '该日期暂无估值数据' : '持仓估算';
  const quarterDates = [...new Set(result?.rows.filter(r => r.pricingBasis === 'portfolio_fair_value_per_share').map(r => r.date))];
  const quarter = quarterDates.length === 1 && result?.rows.every(r => r.pricingBasis === 'portfolio_fair_value_per_share');
  const stateLabel = result?.current ? `披露持仓估算 · XLI价格截至${displayDate(result.current.priceAsOf, true)}` : status === '持仓估算' && quarter ? `季度持仓估算 · ${displayDate(quarterDates[0], true)}` : status;
  const visibleRows = result?.rows.filter(r => !codes || codes.includes(r.code));
  const shareEstimateCodes = visibleRows?.filter(r => (r.pb.value !== null || r.ps.value !== null) && (r.qualityFlags?.eventReconstructedShares ?? 0) > 0).map(r => r.code) ?? [];
  return <CollapsiblePanel panelKey="us-valuations" title="板块 ETF 估值" className="index-valuations us-sector-valuations us-valuation-groups" readout={readout}>
    <p className="valuation-status" aria-live="polite">{stateLabel}</p>
    {visibleRows?.some(r => r.code === 'XLC' && r.ps.value !== null && (r.qualityFlags?.comparableRevenue ?? 0) > 0) && <p className="valuation-adjustment">XLC 可比口径：已调整拆分前收入</p>}
    {shareEstimateCodes.length > 0 && <p className="valuation-adjustment">{shareEstimateCodes.join('、')} 含股本事件估算</p>}
    {visibleRows?.some(r => r.code === 'XLI' && (r.pb.value !== null || r.ps.value !== null) && (r.qualityFlags?.eventProForma ?? 0) > 0) && <p className="valuation-adjustment">XLI 含分拆财务估算</p>}
    {visibleRows?.some(r => r.code === 'XLE' && r.pb.value !== null && (r.qualityFlags?.eventProForma ?? 0) > 0) && <p className="valuation-adjustment">XLE 含合并财务估算</p>}

    <table data-valuation-date={date} aria-label={`板块 ETF 估值，${displayDate(date, true)}`}>
      <colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">板块 / ETF</th><th scope="col">PB <small>倍</small></th><th scope="col">PS <small>倍</small></th></tr></thead>
      <tbody>{US_SECTOR_ETFS.filter(([code]) => !codes || codes.includes(code)).map(([code, name]) => {
        const row = result?.rows.find(r => r.code === code), current = code==='XLI' ? result?.current : null;
        return <tr key={code}><th scope="row"><strong>{name}</strong><small>{code}</small>{row?.pricingBasis === 'portfolio_fair_value_per_share'&&(!quarter || result?.current && !current)&&<small>{displayDate(row.date, true)}</small>}{!current&&row?.sourceComparison?.sourceConflict&&<SourceComparison row={row}/>}</th>
          {(['pb', 'ps'] as const).map(metric => current ? <td key={metric}><div className="etf-valuation-reading"><b className={current.metrics[metric].value===null?'is-missing':undefined}>{current.metrics[metric].value===null?'—':number(current.metrics[metric].value!)}</b><CurrentBasketEstimate row={current} metric={metric}/></div></td> : <td key={metric}><div className="etf-valuation-reading"><b className={(row?.[metric].estimate?.value ?? row?.[metric].value) == null ? "is-missing" : undefined}>{(row?.[metric].estimate?.value ?? row?.[metric].value) != null ? number((row?.[metric].estimate?.value ?? row?.[metric].value)!) : '—'}</b>{row?.methodVersion===XLP_CLASS_METHOD && row[metric].value!==null && <XLPMethodEstimate row={row} metric={metric}/>} {row?.[metric].estimate && <MetricEstimate row={row} metric={metric}/>}{row?.[metric].percentile != null && row[metric].quarterlyHistory && <HistoricalRank row={row} metric={metric}/>}</div></td>)}
        </tr>;
      })}</tbody>
    </table>
  </CollapsiblePanel>;
}
