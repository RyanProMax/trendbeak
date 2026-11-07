import { connectD1 } from './d1-client.mjs';

// Explicit manual readiness check, even outside a market's settlement window.
// Regular closed-session schedule skips still do no D1 or upstream work.
const connection = await connectD1(true);
try {
  const result = await connection.db.prepare('SELECT key FROM market_snapshot WHERE key IN (?, ?, ?) LIMIT 3').bind('CN/000300.SS', 'US/^IXIC', 'US/NVDA').all();
  if (!result.success || result.results.length !== 3) throw Error('Existing daily snapshots are unavailable');
  console.log('Existing D1 credential and all three prepared instruments verified. No writes.');
} finally { await connection.close(); }
