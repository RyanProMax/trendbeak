import { useEffect, useRef, useState, type ReactNode } from 'react';
import CollapsiblePanel, { usePanelVisible } from './CollapsiblePanel';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { DRAM_ASSUMPTIONS, validDRAMEstimate, type DRAMEstimate } from '../lib/us-dram-estimate';
import { ValuationHelp, ValuationReading } from './IndexValuations';
import { displayDate, number } from '../lib/market-format';
import { US_VALUATION_GROUPS, US_VALUATION_THEMES, heldUSThemeSource, validUSThemeValuation, type USThemeValuation, type USValuationGroup } from '../lib/us-theme-valuations';
import './market-overview.css';
import './us-sector-valuations.css';

type Result = { date: string; rows: USThemeValuation[]; estimates: DRAMEstimate[]; error: boolean; expires: number };
export default function USThemeValuations({ date, group: selectedGroup, readout }: { date: string; group?: USValuationGroup; readout?: ReactNode }) {
  const [localGroup, setGroup] = useState<USValuationGroup>('ai');
  const group = selectedGroup ?? localGroup;
  const cache = useRef(new Map<string, Result>()), [loaded, setLoaded] = useState<Result | null>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRefresh(n => n + 1); }, 300000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const cached = cache.current.get(date);
    if (cached && cached.expires > Date.now()) { setLoaded(cached); return; }
    const controller = new AbortController(); let active = true;
    const save = (rows: USThemeValuation[], estimates: DRAMEstimate[], error: boolean) => {
      if (!active) return;
      const result = { date, rows, estimates, error, expires: Date.now() + (error ? 30000 : 300000) };
      cache.current.delete(date); cache.current.set(date, result);
      while (cache.current.size > 366) cache.current.delete(cache.current.keys().next().value!);
      setLoaded(result);
    };
    const timer = setTimeout(() => { void (async () => {
      try {
        const response = await fetch(`/api/valuations/US/themes?date=${encodeURIComponent(date)}&view=dram-holdings-v2&rights=2026-11-10`, { signal: controller.signal });
        if (!response.ok) throw Error('Theme valuations unavailable');
        const { data } = await response.json() as { data: { date: string; rows: USThemeValuation[]; estimates?: DRAMEstimate[] } };
        if (data?.date !== date || !Array.isArray(data.rows) || data.rows.length > US_VALUATION_THEMES.length || new Set(data.rows.map(r => r?.code)).size !== data.rows.length || data.rows.some(r => !heldUSThemeSource(r?.code) && !validUSThemeValuation(r, date))) throw Error('Invalid theme valuations');
        const estimates = data.estimates ?? [];
        if (!Array.isArray(estimates) || estimates.length > 1 || estimates.some(r => !validDRAMEstimate(r, date))) throw Error('Invalid holdings estimate');
        save(data.rows.filter(r => !heldUSThemeSource(r.code)), estimates, false);
      } catch { save([], [], true); }
    })(); }, 150);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [date, refresh]);
  const result = cache.current.get(date) ?? (loaded?.date === date ? loaded : null);
  const themes = US_VALUATION_THEMES.filter(theme => theme[3] === group);
  const groupLabel = US_VALUATION_GROUPS.find(([id]) => id === group)![1];
  const categories =
    <div className="valuation-groups" role="group" aria-label="估值指数分类">
      {US_VALUATION_GROUPS.map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}
    </div>;
  return <CollapsiblePanel panelKey="us-valuations" title="指数与主题估值" className="index-valuations us-theme-valuations us-valuation-groups" readout={readout ?? categories}>
    <table key={group} data-valuation-date={date} aria-busy={!result} aria-label={`${groupLabel}估值，${displayDate(date, true)}`}>
      <colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">指数 / 主题</th><th scope="col"><ValuationHelp metric="pb" mixed /></th><th scope="col"><ValuationHelp metric="ps" mixed /></th></tr></thead>
      <tbody>{themes.map(([code, name, kind]) => {
        if (code === 'STXWSML') {
          const estimate = result?.estimates?.[0];
          return <tr key="DRAM"><th scope="row"><strong>{name}</strong><small>DRAM · 持仓估算</small>{estimate && <small aria-label="持仓日期">{displayDate(estimate.economicDate, true)}</small>}</th>
            <td><DRAMReading estimate={estimate} metric="pb" /></td><td><DRAMReading estimate={estimate} metric="ps" /></td></tr>;
        }
        const row = (!heldUSThemeSource(code) ? result?.rows.find(r => r.code === code) : null) ?? { name, code, date, pb: { value: null, percentile: null }, ps: { value: null, percentile: null } };
        return <tr key={code}><th scope="row"><strong>{name}</strong><small>{code}{kind === '全球指数' ? ' · 全球' : ''}</small></th>
          <td><ValuationReading row={row} metric="pb" precisionDecimals={row.provenance?.precisionDecimals === 1 ? 1 : 2} /></td><td><ValuationReading row={row} metric="ps" precisionDecimals={row.provenance?.precisionDecimals === 1 ? 1 : 2} /></td>
        </tr>;
      })}</tbody>
    </table>
  </CollapsiblePanel>;
}

function DRAMReading({ estimate, metric }: { estimate?: DRAMEstimate; metric: 'pb'|'ps' }) {
  const [open, setOpen] = useState(false), panelVisible = usePanelVisible();
  useEffect(() => { setOpen(false); }, [panelVisible, estimate]);
  const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: setOpen, placement: 'top', strategy: 'fixed', whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12 })] });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context), useRole(context, { role: 'tooltip' })]);
  const reading = estimate?.metrics[metric];
  const assumptions = dramAssumptionSummary(estimate?.assumptions.items ?? []);
  return <div className="valuation-reading">
    <button type="button" className="valuation-trigger" data-percentile-stage="missing" disabled={!estimate} ref={refs.setReference} {...getReferenceProps()} aria-label={`存储 ${metric.toUpperCase()} 持仓估算详情`}>
      <b>{reading?.value == null ? '—' : `${number(reading.value)}倍`}</b>
    </button>
    {open && estimate && <FloatingPortal><div className="valuation-tooltip dram-estimate-tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
      <strong>DRAM · {metric.toUpperCase()} 持仓估算</strong>
      <span>限12家已披露股票/TRS标的；基金持仓表未经审计。</span>
      {assumptions.map((text, i) => <span key={i}>{text}</span>)}
      <span>{reading?.knownAt ? `所需数据披露日期：${displayDate(reading.knownAt, true)}` : '所需数据尚未齐全'}</span>
      {estimate.priceDate !== estimate.economicDate && <span>定价日：{displayDate(estimate.priceDate, true)}</span>}
    </div></FloatingPortal>}
  </div>;
}

const DRAM_SUMMARIES: Record<keyof typeof DRAM_ASSUMPTIONS, { family: number; text: string }> = {
  conditional_trs_notional: { family: 0, text: 'TRS 名义额×1，非认证敞口' },
  fund_reported_marks: { family: 0, text: '申报估值，未核为收盘价' },
  fund_fx_interpretation: { family: 1, text: '基金汇率口径，非认证定盘价' },
  external_reference_fx: { family: 1, text: 'Fed H.10纽约午间参考折算财务，非基金实际汇率' },
  reference_fx_timing_mismatch: { family: 1, text: '汇率与基金估值时点未核同步' },
  reported_rounded_ordinary_quantity: { family: 2, text: '普通股数量为舍入估算' },
  treasury_quantity_inference: { family: 2, text: '额外库藏股推定为零' },
  locked_private_ordinary_mark: { family: 3, text: '限售私募股按上市股估值，折价未知' },
  reported_parent_equity_convention: { family: 7, text: '母公司账面权益非认证清算权' },
  convertible_reserve_allocation: { family: 7, text: '保留转债权益准备' },
  reported_consolidation_perimeter: { family: 7, text: '采用实际报告合并范围' },
  qualified_interim_review: { family: 8, text: '中期审阅有重大保留意见' },
  shares_carried: { family: 2, text: '股数沿用或事件调整，变动未全核' },
  share_rounding_delivery: { family: 2, text: '股数舍入及交付假设' },
  fiscal_period_mismatch: { family: 2, text: '财报期滞后' },
  fiscal_53_week_ttm: { family: 2, text: '含53周收入' },
  equal_common_preferred_participation: { family: 3, text: '普通/优先股暂按等经济单位' },
  preferred_liquidation_unverified: { family: 3, text: '清算权未核' },
  extra_dividend_not_capitalized: { family: 3, text: '额外股息未资本化' },
  proportional_a_h_participation: { family: 4, text: 'A/H同比例权益，非同价' },
  pending_cancellation_economic_exclusion: { family: 4, text: '待注销受限股暂剔除' },
  reported_crossholding_book: { family: 5, text: '披露权益保留交叉持股，未重估' },
  retrospective_date_only: { family: 6, text: '事后披露，不代表开盘已知' },
  reported_financial_precision: { family: 6, text: '财报有舍入，计算精度非准确度' },
};
export function dramAssumptionSummary(items: DRAMEstimate['assumptions']['items']): string[] {
  const groups = new Map<string, { family: number; text: Set<string>; issuers: Map<string, string> }>();
  for (const item of items) {
    const summary = DRAM_SUMMARIES[item.code], key = `${summary.family}:${item.scope}`;
    const group = groups.get(key) ?? { family: summary.family, text: new Set<string>(), issuers: new Map<string, string>() };
    group.text.add(summary.text);
    if (item.scope === 'issuer') group.issuers.set(item.issuerIsin!, item.code === 'qualified_interim_review' ? ({TW0008299009:'Phison',TW0002337003:'Macronix'}[item.issuerIsin!] ?? item.issuerName!) : item.issuerName!);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.family - b.family).map(group => {
    const name = [...group.issuers.values()][0], count = group.issuers.size;
    const label = group.family === 8 && count <= 2 && [...group.issuers.values()].join('、').length <= 24 ? [...group.issuers.values()].join('、') : count === 1 && name.length <= 20 ? name : `${count}家持仓公司`;
    const scope = count ? `涉及${label}：` : '';
    return scope + [...group.text].join('；') + '。';
  });
}
