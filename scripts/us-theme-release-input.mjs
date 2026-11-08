// Decode one manually reviewed source; never fetch providers or read credentials.
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseStockcheckPB, prepareThemePB } from './us-theme-valuations.mjs';

export function decodeThemeRelease({ code, observedAt, compressed, sha256 }, now = Date.now()) {
  if (!['SOX', 'SPX'].includes(code) || typeof compressed !== 'string' || compressed.length > 62000
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compressed)
    || !/^[a-f0-9]{64}$/.test(sha256 ?? '') || !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > now) throw Error('Invalid reviewed source input');
  const raw = gunzipSync(Buffer.from(compressed, 'base64'), { maxOutputLength: 262144 });
  if (createHash('sha256').update(raw).digest('hex') !== sha256) throw Error('Source digest mismatch');
  const html = raw.toString('utf8');
  prepareThemePB(parseStockcheckPB(html, code, observedAt));
  return [{ code, html, observedAt }];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputs = decodeThemeRelease({ code: process.env.THEME_CODE, observedAt: process.env.THEME_OBSERVED_AT,
    compressed: process.env.THEME_SOURCE_GZIP, sha256: process.env.THEME_SOURCE_SHA256 });
  await writeFile(process.argv[2], JSON.stringify(inputs), { flag: 'wx', mode: 0o600 });
  console.log('One reviewed index source validated; no upstream requests or database writes.');
}
