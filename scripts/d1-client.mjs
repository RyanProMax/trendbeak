import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
/** Parameterized values avoid D1's SQL-text limit; never print credentials or bodies. */
export async function connectD1(remote = false) {
    process.env.WRANGLER_SEND_METRICS = 'false';
    process.env.WRANGLER_LOG_PATH ??= join(tmpdir(), 'trendbeak-market-cli.log');
    if (!remote) {
        const { getPlatformProxy } = await import('wrangler');
        const proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: true, remoteBindings: false, envFiles: [] });
        return { db: proxy.env.SENTIMENT_DB, close: () => proxy.dispose() };
    }
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!/^[a-f0-9]{32}$/.test(account ?? ''))
        throw Error('Specify the existing CLOUDFLARE_ACCOUNT_ID; account discovery is not automatic');
    const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8')), database = config.d1_databases.find(b => b.binding === 'SENTIMENT_DB')?.database_id;
    if (!database)
        throw Error('Existing D1 binding missing');
    let token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
        const root = process.env.XDG_CONFIG_HOME ?? (process.platform === 'darwin' ? join(homedir(), 'Library', 'Preferences') : join(homedir(), '.config')), auth = await readFile(join(root, '.wrangler', 'config', 'default.toml'), 'utf8');
        token = auth.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
        const expires = auth.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
        if (!token || !expires || Date.parse(expires) <= Date.now())
            throw Error('Existing Wrangler login unavailable or expired; no credential was created. Refresh that existing login before retrying');
    }
    const query = async (sql, params = []) => { const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000) }); const body = await response.json(); if (!response.ok || !body.success || !body.result?.[0]?.success)
        throw Error(`D1 operation failed (HTTP ${response.status}); inspect current state before retrying. No automatic retry`); return body.result[0]; };
    return { db: { prepare(sql) { return { bind(...params) { return { all: () => query(sql, params), run: () => query(sql, params) }; } }; }, exec: sql => query(sql) }, close: async () => { } };
}
