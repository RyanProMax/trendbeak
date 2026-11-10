import { useState } from 'react';
import USSectorETFValuations from './USSectorETFValuations';
import USThemeValuations from './USThemeValuations';
import type { USValuationGroup } from '../lib/us-theme-valuations';
const GROUPS = [['etf', 'AI 板块'], ['ai', '细分主题'], ['traditional', '传统行业'], ['broad', '宽基']] as const;
const AI_ETFS = ['XLK', 'XLC', 'XLI', 'XLU'] as const;
export default function USSectorValuations({date, viewMode = 'historical'}: {date: string; viewMode?: 'latest'|'historical'}) {
  const [group, setGroup] = useState<'etf'|USValuationGroup>('etf');
  const categories = <div className="valuation-groups" role="group" aria-label="估值分类">{GROUPS.map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>)}</div>;
  return group === 'etf'
    ? <USSectorETFValuations date={date} viewMode={viewMode} codes={AI_ETFS} readout={categories}/>
    : <USThemeValuations date={date} group={group} readout={categories}/>;
}
