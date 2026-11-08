import { useEffect, useRef, useState } from 'react';
import CollapsiblePanel from './CollapsiblePanel';
import { ValuationHelp, ValuationReading } from './IndexValuations';
import { displayDate } from '../lib/market-format';
import { US_VALUATION_GROUPS, US_VALUATION_THEMES, validUSThemeValuation, type USThemeValuation, type USValuationGroup } from '../lib/us-theme-valuations';
import './market-overview.css';
import './us-sector-valuations.css';

type Result = { date: string; rows: USThemeValuation[]; error: boolean; expires: number };
export default function USSectorValuations({ date }: { date: string }) {
  const [group, setGroup] = useState<USValuationGroup>('ai');
  const cache = useRef(new Map<string, Result>()), [loaded, setLoaded] = useState<Result | null>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRefresh(n => n + 1); }, 300000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const cached = cache.current.get(date);
    if (cached && cached.expires > Date.now()) { setLoaded(cached); return; }
    const controller = new AbortController(); let active = true;
    const save = (rows: USThemeValuation[], error: boolean) => {
      if (!active) return;
      const result = { date, rows, error, expires: Date.now() + (error ? 30000 : 300000) };
      cache.current.delete(date); cache.current.set(date, result);
      while (cache.current.size > 366) cache.current.delete(cache.current.keys().next().value!);
      setLoaded(result);
    };
    const timer = setTimeout(() => { void (async () => {
      try {
        const response = await fetch(`/api/valuations/US/themes?date=${encodeURIComponent(date)}`, { signal: controller.signal });
        if (!response.ok) throw Error('Theme valuations unavailable');
        const { data } = await response.json() as { data: { date: string; rows: USThemeValuation[] } };
        if (data?.date !== date || !Array.isArray(data.rows) || data.rows.length > US_VALUATION_THEMES.length || new Set(data.rows.map(r => r?.code)).size !== data.rows.length || data.rows.some(r => !validUSThemeValuation(r, date))) throw Error('Invalid theme valuations');
        save(data.rows, false);
      } catch { save([], true); }
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
  return <CollapsiblePanel panelKey="us-valuations" title="指数与主题估值" className="index-valuations us-theme-valuations" readout={categories}>
    <table key={group} data-valuation-date={date} aria-busy={!result} aria-label={`${groupLabel}估值，${displayDate(date, true)}`}>
      <colgroup><col className="valuation-name-column" /><col /><col /></colgroup>
      <thead><tr><th scope="col">指数 / 主题</th><th scope="col"><ValuationHelp metric="pb" /></th><th scope="col"><ValuationHelp metric="ps" /></th></tr></thead>
      <tbody>{themes.map(([code, name, kind]) => {
        const row = result?.rows.find(r => r.code === code) ?? { name, code, date, pb: { value: null, percentile: null }, ps: { value: null, percentile: null } };
        return <tr key={code}><th scope="row"><strong>{name}</strong><small>{code}{kind === '全球指数' ? ' · 全球' : ''}</small></th>
          <td><ValuationReading row={row} metric="pb" /></td><td><ValuationReading row={row} metric="ps" /></td>
        </tr>;
      })}</tbody>
    </table>
  </CollapsiblePanel>;
}
