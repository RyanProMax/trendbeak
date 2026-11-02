import {refreshMarketHTTP} from './prepare-market-http.mjs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'vite';
import { connectD1 } from './d1-client.mjs';
const args = process.argv.slice(2), mode = args.shift();
function option(name) { const i = args.indexOf(name); if (i < 0)
    return; const value = args[i + 1]; if (!value || value.startsWith('--'))
    throw Error('Missing ' + name); args.splice(i, 2); return value; }
const market = option('--market'), symbol = option('--symbol'), file = option('--file'), fetchedAt = option('--fetched-at'), remote = args.includes('--remote'), dryRun = args.includes('--dry-run');
if (!['schema', 'init', 'sync', 'rebuild','prepare'].includes(mode) || args.some(a => !['--remote', '--dry-run'].includes(a)) || mode !== 'schema' && (!['CN', 'US'].includes(market) || mode!=='prepare'&&!symbol))
    throw Error('Usage: market-sync.mjs schema | init|sync|rebuild --market CN|US --symbol SYMBOL [--file reviewed-input.json [--fetched-at ACTUAL_FETCH_TIMESTAMP]] [--dry-run] [--remote]');
const connection = await connectD1(remote);
let vite;
try {
    const db = connection.db;
    if (mode === 'schema') {
        if (!dryRun) {
            const result=await db.prepare(await readFile('migrations/0003_market_snapshot.sql', 'utf8')).bind().run();
            if(!result.success)throw Error('Market schema operation failed');
        }
        console.log(JSON.stringify({ mode, target: remote ? 'remote' : 'local', dryRun }));
    }
    else {
        vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false } });
        const [job, source] = await Promise.all([vite.ssrLoadModule('/src/server/market-sync.ts'), vite.ssrLoadModule('/src/server/market-data.ts')]);
        if (symbol&&!source.validSymbol(market, symbol))
            throw Error('Invalid instrument');
        if(mode==='prepare'){console.log(JSON.stringify({mode,target:remote?'remote':'local',dryRun,responses:await refreshMarketHTTP(db,vite,market,symbol,dryRun)}));}
        else {
        const key = `${market}/${symbol}`, r = await db.prepare('SELECT payload, updated_at FROM market_snapshot WHERE key = ?').bind(key).all();
        if (!r.success)
            throw Error('Snapshot lookup failed');
        const record = r.results[0], previous = record ? JSON.parse(record.payload) : undefined;
        if (mode === 'init' && record) {
            console.log(JSON.stringify({ mode, key, target: remote ? 'remote' : 'local', alreadyPrepared: true, upstreamCalls: 0, dbReads: 1, dbWrites: 0, computedRows: 0 }));
        }
        else {
            if (mode !== 'init' && !record)
                throw Error('Snapshot not prepared; run explicit init first');
            const now = Date.now(), url = job.syncURL(market, symbol, mode, mode === 'sync' ? previous?.calculation?.bars?.at(-1)?.date : undefined, now);
            let input, upstreamCalls = 0;
            if (file) {
                if ((await stat(file)).size > 2000000)
                    throw Error('Input file exceeds 2 MB budget');
                input = JSON.parse(await readFile(file, 'utf8'));
            }
            else {
                upstreamCalls++;
                input = await source.fetchJson(url);
            }
            const observed = file && !input.bars ? Date.parse(fetchedAt ?? '') : now;
            if (!input.bars && (!Number.isFinite(observed) || observed > now))
                throw Error('Raw input files require their actual --fetched-at timestamp');
            let quote;
            if (input.bars) {
                quote = input;
            }
            else
                quote = market === 'CN' ? source.parseTencent(input, symbol, observed, true) : source.parseYahoo(input, symbol, observed, true);
            if (quote.instrument?.market !== market || quote.instrument?.symbol !== symbol)
                throw Error('Input identity mismatch');
            const split = !!Object.keys(input.chart?.result?.[0]?.events?.splits ?? {}).length;
            const calculated = job.prepareMarketState(quote, mode, previous, now, split);
            const {attachHTTP}=await vite.ssrLoadModule('/src/server/market-http.ts');
            const unchanged=mode==='sync'&&calculated.processed===0;
            const prepared=unchanged?{...calculated,payload:previous,text:record.payload,bytes:Buffer.byteLength(record.payload)}:await attachHTTP(db,calculated,now);
            let writes = 0;
            if (!dryRun && prepared.text !== record?.payload) {
                await job.writeMarketState(db, prepared, record?.updated_at, now);
                writes = 1;
            }
            console.log(JSON.stringify({ mode, key, target: remote ? 'remote' : 'local', dryRun, upstreamCalls, requestedWindow: mode === 'sync' ? (market === 'CN' ? url.searchParams.get('param') : url.searchParams.get('range')) : 'explicit bounded initialization/rebuild', inputBars: quote.bars.length, retainedBars: prepared.payload.calculation.bars.length, viewRows: Object.keys(prepared.payload.view.history).length, payloadBytes: prepared.bytes, dbReads: 1, dbWrites: writes, computedRows: prepared.processed, source: prepared.payload.view.source, technicalSource: prepared.payload.view.technicalSource }));
        }
        }
    }
}
finally {
    await vite?.close();
    await connection.close();
}
