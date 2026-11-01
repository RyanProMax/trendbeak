import type { Market } from "../market-types";
import { isDate, marketDate } from "../lib/market-signals";
import { validSentimentSource, type SentimentSource } from "../lib/sentiment-sources";

export interface SentimentInput { date: string; score: number }

/** Validate the whole input before generating any write. Seeds never revise existing keys. */
export function sentimentImportSQL(market: Market, source: SentimentSource, rows: SentimentInput[], mode: "seed" | "sync", now = Date.now()): string {
  if (!validSentimentSource(market, source) || !["seed", "sync"].includes(mode) || !rows.length) throw new Error("Invalid sentiment import");
  const seen = new Set<string>(), today = marketDate(now, market);
  for (const row of rows) {
    if (!isDate(row.date) || row.date > today || seen.has(row.date) || typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) throw new Error("Invalid or duplicate sentiment observation");
    seen.add(row.date);
  }
  const timestamp = new Date(now).toISOString();
  const conflict = mode === "seed" ? "DO NOTHING" : "DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at WHERE sentiment_daily.score <> excluded.score";
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows.slice(i, i + 200).map(row => `('${market}', '${row.date}', '${source}', ${row.score}, '${timestamp}')`);
    statements.push(`INSERT INTO sentiment_daily (market, date, source, score, updated_at) VALUES\n${values.join(",\n")}\nON CONFLICT (market, date, source) ${conflict};`);
  }
  return statements.join("\n") + "\n";
}
