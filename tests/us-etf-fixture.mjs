export const date = '2026-11-05', cutoff = date + 'T21:00:00Z';
export function etfInput() {
  const base = { asOf: '2026-09-30', availableAt: '2026-10-20T20:05:00Z', source: 'filing', currency: 'USD' };
  const holding = (symbol, weight, price, equity, revenue) => ({ symbol, weight,
    price: { ...base, value: price, asOf: date, availableAt: cutoff, source: 'price', basis: 'unadjusted_close', shareBasis: 'common-2026' },
    shares: { ...base, value: 10, basis: 'actual_common_outstanding', shareBasis: 'common-2026', unit: 'shares' },
    equity: { ...base, value: equity, basis: 'common' }, revenue: { ...base, value: revenue, basis: 'ttm' }, corporateActionsCheckedThrough: date, shareClassStatus: 'verified_all_common',
  });
  return { code: 'XLK', date, cutoff, holdingsAsOf: date, holdingsSource: 'holdings', sources: [{ id: 'price', url: 'https://example.invalid/price' }, { id: 'filing', url: 'https://example.invalid/filing' }, { id: 'holdings', url: 'https://example.invalid/holdings' }], holdings: [holding('AAA', .6, 100, 100, 200), holding('BBB', .4, 200, 100, 400)] };
}
