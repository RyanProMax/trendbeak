import type { SentimentData, SentimentObservation } from "../market-types";
import { isDate, marketDate } from "../lib/market-signals";
import { parseCNNHistory, mergeKnownUSHistory } from "./cnn-history";

const SCHEMA = "trendbeak-us-history/v1", SHA = /^[a-f0-9]{64}$/;
const iso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const sourceValid = (s: any) => s && typeof s.name === "string" && s.name.length > 0 && s.name.length < 200 && typeof s.url === "string" && s.url.startsWith("https://");
export interface HistoryArtifactMeta {
  source: { name: string; url: string; kind: "official" | "third-party-archive"; revision: string };
  receivedAt: string; parsedAt: string; generatedAt: string;
  rawSha256: string; calendarSha256: string; parserSha256: string;
  window: { start: string; end: string };
}
interface Row { date: string; expectedTradingDay: boolean; status: "observed" | "NA"; value: number | null; observedAt: string | null; dateKind: "utc-date" | "market-time" | null }
export interface USHistoryArtifact {
  schema: typeof SCHEMA; meta: HistoryArtifactMeta;
  rights: { status: "unconfirmed"; activationRequiresExternalApproval: true };
  coverage: { expected: number; observedExpected: number; observedTotal: number; missingDates: string[] };
  rows: Row[];
  checksum: { algorithm: "SHA-256"; value: string };
}
export interface USHistoryAdmission { sha256: string; sourceUrl: string; decisionReference: string }
function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
export async function historyDigest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const payload = (artifact: USHistoryArtifact) => { const { checksum, ...body } = artifact; return body; };
function metaValid(meta: HistoryArtifactMeta) {
  return sourceValid(meta?.source) && ["official", "third-party-archive"].includes(meta.source.kind) && typeof meta.source.revision === "string" && meta.source.revision.length > 0 &&
    [meta.receivedAt,meta.parsedAt,meta.generatedAt].every(iso) && Date.parse(meta.receivedAt) <= Date.parse(meta.parsedAt) && Date.parse(meta.parsedAt) <= Date.parse(meta.generatedAt) &&
    [meta.rawSha256,meta.calendarSha256,meta.parserSha256].every(hash => SHA.test(hash)) && isDate(meta.window?.start) && isDate(meta.window?.end) && meta.window.start <= meta.window.end &&
    Date.parse(meta.window.end) - Date.parse(meta.window.start) < 365 * 86400000;
}
/** Offline export only: exactly the same CNN parser as the reader, no synthetic dates or scores. */
export async function buildUSHistoryArtifact(raw: unknown, expectedDates: string[], meta: HistoryArtifactMeta): Promise<USHistoryArtifact> {
  if (!metaValid(meta)) throw new Error("Invalid US history artifact metadata");
  const expected = new Set(expectedDates);
  if (!expected.size || expected.size !== expectedDates.length || expectedDates.some(date => !isDate(date) || date < meta.window.start || date > meta.window.end)) throw new Error("Invalid benchmark date input");
  const parsed = parseCNNHistory(raw, Date.parse(meta.parsedAt), meta.source);
  const actual = new Map(parsed.observations.filter(p => p.date >= meta.window.start && p.date <= meta.window.end).map(p => [p.date, p]));
  const dates = [...new Set([...expected,...actual.keys()])].sort();
  const rows: Row[] = dates.map(date => { const p = actual.get(date); return { date, expectedTradingDay: expected.has(date), status: p ? "observed" : "NA", value: p?.value ?? null, observedAt: p?.observedAt ?? null, dateKind: p?.dateKind ?? null }; });
  const body: Omit<USHistoryArtifact,"checksum"> = { schema: SCHEMA, meta, rights: { status: "unconfirmed" as const, activationRequiresExternalApproval: true as const },
    coverage: { expected: expected.size, observedExpected: rows.filter(row => row.expectedTradingDay && row.status === "observed").length, observedTotal: actual.size, missingDates: rows.filter(row => row.status === "NA").map(row => row.date) }, rows };
  return { ...body, checksum: { algorithm: "SHA-256", value: await historyDigest(body) } };
}
/** Integrity is not permission. Without a separately pinned admission this never returns data. */
export async function admitUSHistoryArtifact(input: unknown, admission: USHistoryAdmission | null, now = Date.now()): Promise<SentimentData> {
  if (!admission || !SHA.test(admission.sha256) || !admission.decisionReference?.trim()) throw new Error("US history admission pending");
  const a = input as USHistoryArtifact;
  if (!a || a.schema !== SCHEMA || !metaValid(a.meta) || a.meta.source.url !== admission.sourceUrl || a.checksum?.algorithm !== "SHA-256" ||
    a.checksum.value !== admission.sha256 || await historyDigest(payload(a)) !== admission.sha256 || Date.parse(a.meta.generatedAt) > now || Date.parse(a.meta.parsedAt) > now || Date.parse(a.meta.receivedAt) > now) throw new Error("Invalid or unpinned US history artifact");
  if (!Array.isArray(a.rows) || !a.rows.length || a.rows.length > 380) throw new Error("Invalid US history rows");
  const today = marketDate(now, "US"), min = new Date(Date.parse(today)-371*86400000).toISOString().slice(0,10), observations: SentimentObservation[] = [];
  for (const [i,row] of a.rows.entries()) {
    if (!isDate(row.date) || row.date < a.meta.window.start || row.date > a.meta.window.end || row.date > today || i && a.rows[i-1].date >= row.date || typeof row.expectedTradingDay !== "boolean") throw new Error("Invalid US history row date");
    if (row.status === "NA") { if (row.value !== null || row.observedAt !== null || row.dateKind !== null) throw new Error("NA must remain empty"); continue; }
    if (row.status !== "observed" || typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < 0 || row.value > 100 || !iso(row.observedAt) || Date.parse(row.observedAt) > Date.parse(a.meta.parsedAt)+300000 ||
      (row.dateKind === "utc-date" ? Date.parse(row.observedAt)%86400000 !== 0 || row.date !== row.observedAt.slice(0,10) : row.dateKind !== "market-time" || row.date !== marketDate(Date.parse(row.observedAt),"US"))) throw new Error("Invalid US history row value");
    if (row.date >= min) observations.push({ date: row.date, value: row.value, previous: observations.at(-1)?.value ?? null, observedAt: row.observedAt, dateKind: row.dateKind!, source: a.meta.source });
  }
  const missing = a.rows.filter(row => row.status === "NA").map(row=>row.date);
  if (canonical(missing) !== canonical(a.coverage?.missingDates) || a.coverage.expected !== a.rows.filter(row=>row.expectedTradingDay).length ||
    a.coverage.observedExpected !== a.rows.filter(row=>row.expectedTradingDay&&row.status==="observed").length || a.coverage.observedTotal !== a.rows.filter(row=>row.status==="observed").length) throw new Error("US history coverage mismatch");
  return { source: a.meta.source, description: `${a.meta.source.name}，转引CNN历史观测；当前值另有来源，缺日不填。`, observations,
    historySeed: { sha256: a.checksum.value, source: a.meta.source, through: a.meta.window.end, generatedAt: a.meta.generatedAt } };
}

/** Deployable baseline + existing incremental cache. No DB, cron or new fetches. */
export function createUSHistoryChain(options: { seed?: () => Promise<unknown>; admission?: USHistoryAdmission | null; clock?: () => number } = {}) {
  const clock = options.clock ?? Date.now, admission = options.admission ?? null;
  let baseline: Promise<SentimentData> | undefined;
  return { async update(previous: SentimentData | undefined, current: SentimentData, at = clock()): Promise<SentimentData> {
    if (!admission) return mergeKnownUSHistory(previous,current,at);
    let seed: SentimentData | undefined;
    if(options.seed) try { seed = await (baseline ??= options.seed().then(value=>admitUSHistoryArtifact(value,admission,at))); }
      catch { baseline = undefined; /* Bad/missing optional baseline never disables valid current data. */ }
    const previousAdmitted = previous?.historySeed?.sha256 === admission.sha256 && previous.historySeed.source.url === admission.sourceUrl;
    const allowed = seed || previousAdmitted ? [admission.sourceUrl] : [];
    // Seed first; prior increments then win their dates, except immutable historical seed dates.
    let combined = seed ? mergeKnownUSHistory(seed, current,at,allowed) : current;
    const prior = !previousAdmitted && previous?.historySeed ? { ...previous, historySeed: undefined, observations: previous.observations.filter(p=>p.source?.url!==previous.historySeed!.source.url) } : previous;
    combined = mergeKnownUSHistory(prior,combined,at,allowed);
    if (seed?.historySeed || previousAdmitted) {
      combined.historySeed = seed?.historySeed ?? previous!.historySeed;
      combined.description = `CNN发布的美股市场情绪综合指数。历史来自${combined.historySeed!.source.name}，当前来自${current.source.name}；每个日期保留实际来源和观测时间，缺日不补值，不是个股评分。`;
    }
    return combined;
  } };
}
