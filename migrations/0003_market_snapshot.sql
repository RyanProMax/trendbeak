-- One actual snapshot per instrument: durable incremental state and reader projection.
CREATE TABLE IF NOT EXISTS market_snapshot (
  key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload, '$.view') = 'object' AND length(CAST(payload AS BLOB)) <= 1800000),
  updated_at TEXT NOT NULL
) WITHOUT ROWID;
