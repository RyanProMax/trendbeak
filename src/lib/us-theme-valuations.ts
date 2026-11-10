import type { IndexValuation } from './china-overview';

export const US_VALUATION_GROUPS = [['ai', 'AI 板块'], ['traditional', '传统行业'], ['broad', '宽基']] as const;
export type USValuationGroup = typeof US_VALUATION_GROUPS[number][0];
// Published benchmarks, not ETF aliases or bespoke stock baskets. Official
// definitions and scope are recorded in docs/us-theme-valuations.md.
export const US_VALUATION_THEMES = [
  ['SOX', '半导体', '指数', 'ai'],
  ['STXWSML', '存储', '全球指数', 'ai'],
  ['IUSAOTT', '光连接', '指数', 'ai'],
  ['IDCEIT', '数据中心', '指数', 'ai'],
  ['SOLIVEPP', 'AI 电力基建', '全球指数', 'ai'],
  ['CPQ', '云计算', '指数', 'ai'],
  ['EMCLOUD', '云软件', '指数', 'ai'],
  ['NQCYBR', '网络安全', '指数', 'ai'],
  ['IBOTZ', '机器人', '全球指数', 'ai'],
  ['BKX', '银行', '指数', 'traditional'],
  ['KIX', '保险', '指数', 'traditional'],
  ['S5ENRS', '能源', '指数', 'traditional'],
  ['S5UTIL', '公用事业', '指数', 'traditional'],
  ['S5CONS', '必需消费', '指数', 'traditional'],
  ['S5COND', '可选消费', '指数', 'traditional'],
  ['S5HLTH', '医疗保健', '指数', 'traditional'],
  ['S5INDU', '工业', '指数', 'traditional'],
  ['S5MATR', '原材料', '指数', 'traditional'],
  ['S5RLST', '房地产', '指数', 'traditional'],
  ['XAU', '金银矿业', '指数', 'traditional'],
  ['SPX', '标普500', '指数', 'broad'],
  ['NDX', '纳斯达克100', '指数', 'broad'],
] as const;
export const US_THEME_METHOD = 'prior-ten-years-midrank-v1';
export const US_THEME_MIN_SAMPLES = 60;
export type USThemeValuation = IndexValuation;
export function validValuationDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validUSThemeValuation(row: any, selected: string): row is USThemeValuation {
  const theme = US_VALUATION_THEMES.find(([code]) => code === row?.code);
  if (!theme || row.name !== theme[1] || !validValuationDate(row.date) || row.date !== selected) return false;
  const cutoff = new Date(selected); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 10);
  for (const metric of [row.pb, row.ps]) {
    if (!metric || !(metric.value === null || typeof metric.value === 'number' && Number.isFinite(metric.value) && metric.value > 0)
      || !(metric.percentile === null || typeof metric.percentile === 'number' && Number.isFinite(metric.percentile) && metric.percentile >= 0 && metric.percentile <= 100)) return false;
    if (metric.value === null && metric.percentile !== null) return false;
    if (!Number.isInteger(metric.samples) || metric.samples < 0 || metric.samples > 2700) return false;
    if (metric.samples === 0) {
      if (metric.from !== undefined || metric.through !== undefined || metric.percentile !== null) return false;
    } else if (!validValuationDate(metric.from) || !validValuationDate(metric.through)
      || metric.from < cutoff.toISOString().slice(0, 10) || metric.through < metric.from || metric.through >= selected
      || metric.samples > (Date.parse(metric.through) - Date.parse(metric.from)) / 86400000 + 1) return false;
    if (metric.percentile !== null && metric.samples < US_THEME_MIN_SAMPLES) return false;
  }
  return true;
}
