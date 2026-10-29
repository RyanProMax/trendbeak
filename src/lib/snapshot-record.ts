import type { Market, MarketSnapshot } from "../market-types";
import { isDate, marketDate } from "./market-signals";

export const SNAPSHOT_SCHEMA = 1;
export const FRESH_MS = 60_000;
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60_000;
export interface SnapshotRecord { schema: number; storedAt: string; snapshot: MarketSnapshot }
export type SnapshotVia = "upstream" | "memory" | "edge" | "browser";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nullable = (v: unknown) => v === null || finite(v);
const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length < 500;
const source = (v: any) => v && text(v.name) && typeof v.url === "string" && /^https:\/\//.test(v.url);
const values = (v: any) => v && ["rsi", "trend", "volume", "range"].every(key => nullable(v[key]));
const timestamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const snapshotKey = (market: Market, symbol: string) => `v${SNAPSHOT_SCHEMA}:${market}:${symbol}`;

/** Treat both edge bodies and browser storage as untrusted, versioned input. */
export function validSnapshot(v: any, market: Market, symbol: string, now: number): v is MarketSnapshot {
  if (!Number.isFinite(now) || !["CN", "US"].includes(market) || typeof symbol !== "string") return false;
  if (market === "CN" ? !/^\d{6}\.(SS|SZ)$/.test(symbol) : symbol !== "^GSPC" && !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return false;
  const today = marketDate(now, market);
  if (!v || v.instrument?.market !== market || v.instrument?.symbol !== symbol || !text(v.instrument.name) || !text(v.instrument.code) || !["stock", "index"].includes(v.instrument.kind) ||
      !isDate(v.asOf) || v.asOf > today || !timestamp(v.fetchedAt) || Date.parse(v.fetchedAt) > now ||
      !["trading", "closed"].includes(v.session) || !finite(v.price) || v.price <= 0 || !nullable(v.change) || !text(v.currency) || !source(v.source) ||
      !Array.isArray(v.days) || v.days.length !== 365 || !Array.isArray(v.signals) || v.signals.length < 4 || v.signals.length > 5 || !v.history || typeof v.history !== "object") return false;
  if (!v.days.every((d: any, i: number) => isDate(d?.date) && d.date <= today && (!i || v.days[i-1].date < d.date) && nullable(d.change) && ["trading", "closed", "missing"].includes(d.status))) return false;
  const rows = Object.entries(v.history);
  if (!rows.length || rows.length > 800 || !rows.every(([date, row]: [string, any]) => isDate(date) && date <= today && finite(row?.price) && row.price > 0 && nullable(row.change) && values(row.values) && values(row.previous) && (row.range === null || (finite(row.range?.low) && finite(row.range?.high) && row.range.low <= row.range.high)))) return false;
  if (v.history[v.asOf]?.price !== v.price || !v.signals.every((s: any) => ["sentiment", "rsi", "trend", "volume", "range"].includes(s?.id) && text(s.name) && typeof s.period === "string" && nullable(s.value) && nullable(s.previous) && finite(s.min) && finite(s.max) && s.min < s.max && typeof s.unit === "string" && Number.isInteger(s.digits) && Array.isArray(s.labels) && s.labels.length === 3 && s.labels.every(text) && text(s.explanation))) return false;
  if (v.sentiment && (!source(v.sentiment.source) || !text(v.sentiment.description) || !Array.isArray(v.sentiment.observations) || v.sentiment.observations.length > 10_000 || !v.sentiment.observations.every((p: any, i: number) => isDate(p?.date) && p.date <= today && (!i || v.sentiment.observations[i-1].date < p.date) && finite(p.value) && p.value >= 0 && p.value <= 100 && nullable(p.previous)))) return false;
  return true;
}
export function validRecord(v: any, market: Market, symbol: string, now = Date.now()): v is SnapshotRecord {
  return !!v && v.schema === SNAPSHOT_SCHEMA && timestamp(v.storedAt) && Date.parse(v.storedAt) <= now && now - Date.parse(v.storedAt) < MAX_SNAPSHOT_AGE_MS &&
    validSnapshot(v.snapshot, market, symbol, now) && Date.parse(v.snapshot.fetchedAt) <= Date.parse(v.storedAt) && now - Date.parse(v.snapshot.fetchedAt) < MAX_SNAPSHOT_AGE_MS;
}
export function readSnapshot(record: SnapshotRecord, now: number, via: SnapshotVia, stale = false): MarketSnapshot {
  return { ...record.snapshot, freshness: { state: stale || now - Date.parse(record.storedAt) >= FRESH_MS ? "stale" : "fresh", storedAt: record.storedAt,
    ageSeconds: Math.max(0, Math.floor((now - Date.parse(record.storedAt)) / 1000)), freshTtlSeconds: FRESH_MS / 1000, maxAgeSeconds: MAX_SNAPSHOT_AGE_MS / 1000, via } };
}
export function recordFromSnapshot(snapshot: MarketSnapshot): SnapshotRecord {
  const { freshness, ...raw } = snapshot;
  return { schema: SNAPSHOT_SCHEMA, storedAt: freshness?.storedAt ?? snapshot.fetchedAt, snapshot: raw };
}
