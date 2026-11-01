import{connectD1}from'./d1-client.mjs';
import{refreshMarketHTTP}from'./prepare-market-http.mjs';
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";

// No reader request invokes this script. Uses the existing Wrangler login only.
// Raw files and generated SQL stay private, outside public/build inputs.
const args = process.argv.slice(2), mode = args.shift();
function option(name) { const i = args.indexOf(name); if (i < 0) return undefined; const value = args[i + 1]; if (!value || value.startsWith("--")) throw Error(`Missing ${name}`); args.splice(i, 2); return value; }
const fromOption=option("--from"),toOption=option("--to");
const source = option("--source"), file = option("--file"), manifestPath = option("--manifest");
const remote = args.includes("--remote"), dryRun = args.includes("--dry-run");
if (args.some(arg => !["--remote", "--dry-run"].includes(arg)) || !["seed", "sync"].includes(mode) || !["baifenwei", "cnn_whit3rabbit", "cnn_benzinga"].includes(source) || file && manifestPath || mode === "seed" && !(file || manifestPath) || manifestPath && (source !== "cnn_whit3rabbit" || mode !== "seed") || mode === "seed" && source === "cnn_whit3rabbit" && !manifestPath || source === "cnn_benzinga" && (mode !== "seed" || !file)) {
  throw Error("Usage: sentiment-sync.mjs seed|sync --source baifenwei|cnn_whit3rabbit|cnn_benzinga [--file PATH | --manifest PATH] [--remote] [--dry-run]. CNN archive seeds require the verified bundle manifest; Benzinga accepts a reviewed single-record local seed only.");
}
if(remote&&!dryRun&&!/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID??""))throw Error("Specify the existing CLOUDFLARE_ACCOUNT_ID before remote writes");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
let temporary;
try {
  const parsers = await vite.ssrLoadModule("/src/server/sentiment-data.ts");
  const cnn = await vite.ssrLoadModule("/src/server/cnn-history.ts");
  const importer = await vite.ssrLoadModule("/src/server/sentiment-import.ts");
  const now = Date.now(), market = source === "baifenwei" ? "CN" : "US";
  let observations, rawSha256, verification;
  if (manifestPath) {
    const directory = dirname(resolve(manifestPath));
    const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
    const checksums = JSON.parse(await readFile(join(directory, "sha256sums.json"), "utf8"));
    const [raw, calendarBytes, parserBytes, artifactBytes] = await Promise.all([
      readFile(join(directory, "raw-cnn.json")), readFile(join(directory, "benchmark-dates.json")),
      readFile(join(directory, "parser-source.ts")), readFile(join(directory, "us-history.candidate.json")),
    ]);
    const meta = manifest.meta, artifact = JSON.parse(artifactBytes), calendar = JSON.parse(calendarBytes);
    const expected = "https://github.com/whit3rabbit/fear-greed-data/tree/" + meta.source.revision;
    if (!/^[a-f0-9]{40}$/.test(meta.source.revision) || meta.source.url !== expected || meta.source.kind !== "third-party-archive" ||
      hash(raw) !== meta.rawSha256 || hash(raw) !== checksums.rawFileSha256 || hash(calendarBytes) !== meta.calendarSha256 || hash(calendarBytes) !== checksums.calendarFileSha256 ||
      hash(parserBytes) !== meta.parserSha256 || hash(parserBytes) !== checksums.parserFileSha256 || hash(await readFile("src/server/cnn-history.ts")) !== meta.parserSha256 ||
      hash(artifactBytes) !== checksums.artifactFileSha256 || Date.parse(meta.generatedAt) > now) throw Error("US bundle input checksum/source mismatch");
    const artifacts = await vite.ssrLoadModule("/src/server/us-history-artifact.ts");
    const rebuilt = await artifacts.buildUSHistoryArtifact(JSON.parse(raw), calendar.dates, meta);
    const { checksum, ...body } = artifact;
    if (rebuilt.checksum.value !== manifest.checksum.value || checksum.value !== rebuilt.checksum.value || checksums.canonicalPayloadSha256 !== checksum.value || await artifacts.historyDigest(body) !== checksum.value || JSON.stringify(rebuilt.coverage) !== JSON.stringify(manifest.coverage)) throw Error("US bundle does not reproduce");
    observations = rebuilt.rows.filter(row => row.status === "observed").map(row => ({ date: row.date, value: row.value }));
    rawSha256 = hash(raw);
    verification = { checksum: checksum.value, coverage: rebuilt.coverage, revision: meta.source.revision, rawRowsInWindow: JSON.parse(raw).fear_and_greed_historical.data.filter(row => row.x >= Date.parse(meta.window.start) && row.x < Date.parse(meta.window.end) + 86400000).length };
  } else {
    let bytes;
    if (file) bytes = await readFile(resolve(file));
    else {
      const url = source === "baifenwei" ? "https://baifenwei.com/data/fear-greed/fear-greed-full.csv" : "https://raw.githubusercontent.com/whit3rabbit/fear-greed-data/main/json/cnn_output.json";
      const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw Error(`Sentiment upstream HTTP ${response.status}; database unchanged`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (bytes.length > 4_000_000) throw Error("Sentiment input too large");
    rawSha256 = hash(bytes);
    if (source === "cnn_benzinga") {
      const rows = JSON.parse(bytes);
      if (!Array.isArray(rows) || rows.length !== 1) throw Error("Provide exactly one reviewed report observation");
      observations = rows.map(row => ({ date: row.date, value: row.score }));
    } else observations = source === "baifenwei" ? parsers.parseChinaSentiment(bytes.toString(), now, true).observations : cnn.parseCNNHistory(JSON.parse(bytes), now).observations;
  }
  const {isDate,marketDate}=await vite.ssrLoadModule("/src/lib/market-signals.ts");
  const to=toOption??marketDate(now,market),from=fromOption??new Date(Date.parse(to)-14*86400000).toISOString().slice(0,10);
  if(mode==='sync'&&(!isDate(from)||!isDate(to)||from>to||Date.parse(to)-Date.parse(from)>365*86400000||to>marketDate(now,market)))throw Error("Sync window must be at most 366 real, non-future dates");
  if(mode==='seed'&&(fromOption||toOption))throw Error("Seed already uses the reviewed file; use sync for a correction window");
  const rows = observations.filter(row=>mode==='seed'||row.date>=from&&row.date<=to).map(row => ({ date: row.date, score: row.value }));
  const sql = rows.length?importer.sentimentImportSQL(market, source, rows, mode, now):"";
  if (!dryRun && rows.length) {
    temporary = await mkdtemp(join(tmpdir(), "trendbeak-sentiment-"));
    const sqlFile = join(temporary, "import.sql"); await writeFile(sqlFile, sql, { mode: 0o600 });
    const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "trendbeak-sentiment", remote ? "--remote" : "--local", "--file", sqlFile, "--yes"], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error("Database import did not complete; inspect D1 before retrying");
    const connection=await connectD1(remote);try{console.log(JSON.stringify({httpResponses:await refreshMarketHTTP(connection.db,vite,market)}));}catch(error){throw Error('Sentiment import completed; response preparation failed. Run market:prepare for '+market+'; '+String(error));}finally{await connection.close();}
  }
  console.log(JSON.stringify({ mode, source, market, target: remote ? "remote" : "local", dryRun, inputRows: rows.length, window:mode==='sync'?{from,to}:undefined, first: rows[0]?.date, last: rows.at(-1)?.date, rawSha256, verification }));
} finally {
  await vite.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
