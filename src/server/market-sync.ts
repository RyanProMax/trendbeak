import {assertPublishableOverview} from './china-overview';
// Controlled jobs only. Never imported by an HTTP reader.
import type { Market, MarketSnapshot, DailyBar, TechnicalValues } from "../market-types";
import { updateHistory, type HistoryState } from "../lib/history-engine";
import { buildCalendar, calculateSignals, marketDate } from "../lib/market-signals";
import { validCompactSnapshot, validSnapshot } from "../lib/snapshot-record";
import { snapshotKey } from "./market-snapshot-store";
export const TECHNICAL_SOURCE = 'trendbeak_technical_v1';
export interface MarketState {
    overviewState?: import('./china-overview').ChinaOverviewCheckpoint;
    http?:{body:string};
    calculation: Omit<HistoryState, 'processed'>;
    view: MarketSnapshot;
}
export class RebuildRequired extends Error {
    constructor(reason: string) { super(reason); this.name = 'RebuildRequired'; }
}
const pricesSame = (a: DailyBar, b: DailyBar) => ['open', 'high', 'low', 'close'].every(k => a[k as 'close'] === b[k as 'close']);
export function syncURL(market: Market, symbol: string, mode: 'init' | 'sync' | 'rebuild', lastDate?: string, now = Date.now()): URL {
    const days = lastDate ? Math.floor((Date.parse(marketDate(now, market)) - Date.parse(lastDate)) / 86400000) : 0;
    if (mode === 'sync' && (!lastDate || days > 28 || days < 0))
        throw new RebuildRequired('Snapshot is outside the bounded delta window; run an explicit rebuild');
    if (market === 'CN') {
        const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
        const count = mode === 'sync' ? Math.min(32, Math.max(10, days + 4)) : 640;
        url.searchParams.set('param', `${symbol.endsWith('.SS') ? 'sh' : 'sz'}${symbol.slice(0, 6)},day,,,${count},qfq`);
        return url;
    }
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.search = new URLSearchParams({ range: mode === 'sync' ? (days > 2 ? '1mo' : '5d') : '2y', interval: '1d' }).toString();
    return url;
}
export function materialize(quote: MarketSnapshot, state: HistoryState): MarketSnapshot {
    const { bars: _, sentiment: __, freshness: ___, ...meta } = quote, last = state.rows.at(-1)!, date = state.bars.at(-1)!.date, cutoff = new Date(Date.parse(date) - 364 * 86400000).toISOString().slice(0, 10);
    const signals = calculateSignals([], state.trading).map(s => { const id = s.id as keyof TechnicalValues; return { ...s, value: last.values[id], previous: last.previous[id], unavailable: last.values[id] === null ? s.unavailable : null }; });
    return { ...meta, asOf: date, price: last.price, change: last.change, technicalSource: TECHNICAL_SOURCE, days: buildCalendar(state.bars, marketDate(Date.parse(quote.fetchedAt), quote.instrument.market), quote.instrument.market), signals, history: Object.fromEntries(state.bars.flatMap((b, i) => b.date >= cutoff ? [[b.date, state.rows[i]]] : [])) };
}
export function prepareMarketState(quote: MarketSnapshot, mode: 'init' | 'sync' | 'rebuild', previous?: MarketState, now = Date.now(), corporateAction = false) {
    const { market, symbol } = quote.instrument;
    const expectedSource = market === 'CN' ? `https://gu.qq.com/${symbol.endsWith('.SS') ? 'sh' : 'sz'}${symbol.slice(0, 6)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`;
    if (quote.source?.url !== expectedSource)
        throw Error('Quote publisher/channel does not match instrument');
    if (quote.asOf > marketDate(Date.parse(quote.fetchedAt), market) || !validCompactSnapshot(quote, market, symbol, now))
        throw Error('Invalid normalized quote input');
    if (mode === 'sync' && !previous)
        throw new RebuildRequired('Instrument is not initialized');
    let bars = quote.bars!, old: HistoryState | undefined;
    if (mode === 'rebuild' && previous && bars.at(-1)!.date < previous.view.asOf)
        throw Error('Rebuild input is older than the durable snapshot');
    if (mode === 'sync') {
        if (Date.parse(quote.fetchedAt) < Date.parse(previous!.view.fetchedAt))
            throw Error('Upstream observation predates the durable snapshot');
        if (bars.length > 32)
            throw Error('Incremental response exceeds 32-bar budget');
        if (corporateAction)
            throw new RebuildRequired('Corporate action requires an explicit price-basis rebuild');
        const prior = previous!.calculation;
        if (previous!.view.technicalSource !== TECHNICAL_SOURCE || !prior || prior.bars.length > 800 || prior.rows.length !== prior.bars.length || prior.states.length !== prior.bars.length || prior.rows.some(row=>!row.radar?.bollinger || row.radar.ema.strength===undefined))
            throw new RebuildRequired('Invalid checkpoint; explicit rebuild required');
        const incomingDates = new Set(bars.map(b => b.date));
        if (prior.bars.some(b => b.date >= bars[0].date && b.date <= bars.at(-1)!.date && !incomingDates.has(b.date)))
            throw new RebuildRequired('Source omitted a stored overlap date; explicit repair required');
        const byDate = new Map(prior.bars.map(b => [b.date, b])), last = prior.bars.at(-1)!.date;
        if (bars.at(-1)!.date < last)
            throw Error('Upstream is older than the durable snapshot');
        const overlap = bars.filter(b => byDate.has(b.date)), complete = overlap.filter(b => b.date < last), changed = complete.filter(b => !pricesSame(b, byDate.get(b.date)!)), anchors = complete.filter(b => pricesSame(b, byDate.get(b.date)!));
        if (changed.length > 1 || anchors.length < Math.min(2, Math.max(0, prior.bars.length - 1)))
            throw new RebuildRequired('Cannot establish a consistent price basis from overlap; old snapshot retained');
        for (const b of bars)
            byDate.set(b.date, b);
        bars = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        if (bars.length > 800)
            throw new RebuildRequired('Checkpoint reached 800 bars; run a controlled rebuild instead of daily truncation');
        old = { ...prior, processed: 0 };
    }
    const overview=quote.chinaOverview??previous?.view.chinaOverview;
    if(overview)assertPublishableOverview(overview,marketDate(now,market));
    if(overview&&(market!=='CN'||symbol!=='000300.SS'))throw Error('China market overview belongs only to the China benchmark');
    const calculated = updateHistory(bars, quote.session === 'trading', old), view = {...materialize(quote, calculated),...(overview?{chinaOverview:overview}:{})};
    if (!validSnapshot(view, market, symbol, now))
        throw Error('Invalid materialized view');
    const { processed, ...calculation } = calculated, payload:MarketState = { calculation, view, ...(previous?.overviewState?{overviewState:previous.overviewState}:{}) };
    const text = JSON.stringify(payload), bytes = new TextEncoder().encode(text).length;
    if (bytes > 1800000)
        throw Error('Market snapshot exceeds storage budget');
    return { payload, text, bytes, processed, key: snapshotKey(market, symbol) };
}
export async function writeMarketState(db: D1Database, prepared: ReturnType<typeof prepareMarketState>, expected: string | undefined, now = Date.now()) {
    const updatedAt = new Date(Math.max(now, expected ? Date.parse(expected) + 1 : 0)).toISOString();
    const statement = expected ? db.prepare('UPDATE market_snapshot SET payload = ?, updated_at = ? WHERE key = ? AND updated_at = ?').bind(prepared.text, updatedAt, prepared.key, expected) : db.prepare('INSERT INTO market_snapshot (key,payload,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(prepared.key, prepared.text, updatedAt);
    const result = await statement.run();
    if (!result.success || result.meta.changes !== 1)
        throw Error('Snapshot changed concurrently; nothing overwritten. Inspect current state before retrying');
    return updatedAt;
}
