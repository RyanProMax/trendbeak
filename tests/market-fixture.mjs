import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export const fixtureNow = Date.parse('2026-11-01T08:00:00Z');
export function compactQuote(market = 'CN', symbol = market === 'CN' ? '000300.SS' : '^GSPC', now = fixtureNow, count = 500) {
    const dates = [];
    for (let t = Date.parse('2026-10-30'); dates.length < count; t -= 86400000) {
        if (![0, 6].includes(new Date(t).getUTCDay()))
            dates.unshift(new Date(t).toISOString().slice(0, 10));
    }
    const bars = dates.map((date, i) => ({ date, open: 100 + i * .01, close: 100 + i * .01, high: 102 + i * .01, low: 98 + i * .01, volume: 1000 + i }));
    return { instrument: { market, symbol, code: symbol, name: symbol, kind: symbol === '^GSPC' || symbol === '000300.SS' ? 'index' : 'stock' }, asOf: dates.at(-1), fetchedAt: new Date(now).toISOString(), session: 'closed', price: bars.at(-1).close, change: 0, currency: market === 'CN' ? 'CNY' : 'USD', bars, days: [], history: {}, signals: [], source: market === 'CN' ? { name: '腾讯证券', url: `https://gu.qq.com/${symbol.endsWith('.SS') ? 'sh' : 'sz'}${symbol.slice(0, 6)}` } : { name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/` } };
}
export function memoryDB() {
    const sqlite = new DatabaseSync(':memory:');
    for (const name of ['0001_sentiment_daily.sql', '0002_sentiment_benzinga.sql', '0003_market_snapshot.sql'])
        sqlite.exec(readFileSync('migrations/' + name, 'utf8'));
    const stats = { reads: 0, writes: 0, sql: [], fail: false };
    const wrap = () => ({ prepare(sql) { return { bind(...values) { return { all: async () => { stats.reads++; stats.sql.push(sql); if (stats.fail)
                    throw Error('Injected D1 outage'); return { success: true, results: sqlite.prepare(sql).all(...values) }; }, run: async () => { stats.writes++; if (stats.fail)
                    throw Error('Injected D1 outage'); const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; } }; } }; } });
    return { sqlite, db: wrap(), stats, wrap, close: () => sqlite.close() };
}
export async function preparedDB(vite, now = fixtureNow, { nvda = false } = {}) {
    const fixture = memoryDB(), job = await vite.ssrLoadModule('/src/server/market-sync.ts');
    for (const [market, symbol] of [['CN', '000300.SS'], ['US', '^GSPC'], ...(nvda ? [['US', 'NVDA']] : [])]) {
        const input = compactQuote(market, symbol, now), p = job.prepareMarketState(input, 'init', undefined, now);
        fixture.sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run(p.key, p.text, new Date(now).toISOString());
        for (const b of input.bars) {
            fixture.sqlite.prepare('INSERT OR IGNORE INTO sentiment_daily(market,date,source,score,updated_at) VALUES(?,?,?,?,?)').run(market, b.date, market === 'CN' ? 'baifenwei' : 'cnn_whit3rabbit', 20, new Date(now).toISOString());
        }
    }
    fixture.sqlite.prepare('INSERT INTO sentiment_daily(market,date,source,score,updated_at) VALUES(?,?,?,?,?)').run('US', '2026-03-12', 'cnn_benzinga', 21.2, new Date(now).toISOString());
    const{attachHTTP}=await vite.ssrLoadModule('/src/server/market-http.ts');for(const row of fixture.sqlite.prepare('SELECT key,payload FROM market_snapshot').all()){const p=await attachHTTP(fixture.db,{key:row.key,payload:JSON.parse(row.payload),text:row.payload,bytes:Buffer.byteLength(row.payload),processed:0},now);fixture.sqlite.prepare('UPDATE market_snapshot SET payload=? WHERE key=?').run(p.text,row.key);}fixture.stats.reads=0;fixture.stats.sql=[];return fixture;
}
