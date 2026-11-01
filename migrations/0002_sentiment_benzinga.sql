-- Rebuild only to extend the source CHECK; preserve every original field/value.
-- D1 imports execute this file inside a transaction. No extra table remains.
CREATE TABLE sentiment_daily_new (
  market TEXT NOT NULL CHECK (market IN ('CN', 'US')),
  date TEXT NOT NULL CHECK (length(date) = 10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(date, '+0 days') IS NOT NULL AND date(date, '+0 days') = date),
  source TEXT NOT NULL CHECK (
    (market = 'CN' AND source = 'baifenwei') OR
    (market = 'US' AND source IN ('cnn_whit3rabbit', 'cnn_benzinga')) OR
    source = 'self_v0_2'
  ),
  score REAL NOT NULL CHECK (typeof(score) IN ('integer', 'real') AND score >= 0 AND score <= 100),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (market, date, source)
) WITHOUT ROWID;
INSERT INTO sentiment_daily_new (market, date, source, score, updated_at)
SELECT market, date, source, score, updated_at FROM sentiment_daily;
DROP TABLE sentiment_daily;
ALTER TABLE sentiment_daily_new RENAME TO sentiment_daily;
