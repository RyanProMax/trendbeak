import USThemeValuations from './USThemeValuations';

// AI exposure is represented by the existing subtheme benchmarks, not broad
// sector ETF proxies. Keep their dated reader separate from archived ETF work.
export default function USSectorValuations({date}: {date: string; viewMode?: 'latest'|'historical'}) {
  return <USThemeValuations date={date}/>;
}
