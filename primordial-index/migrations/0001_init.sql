-- Primordial Index D1 schema (index-contract.md §2).
-- No PII: client_id is an anonymous random UUID; gh_login is a public handle.

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT NOT NULL,
  event       TEXT NOT NULL,           -- run_start | run_complete
  success     INTEGER,                 -- 0/1, null on run_start
  duration_ms INTEGER,
  client_id   TEXT NOT NULL,
  ts          TEXT NOT NULL            -- ISO8601
);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id, ts);

CREATE TABLE IF NOT EXISTS ratings (
  agent_id   TEXT NOT NULL,
  gh_login   TEXT NOT NULL,
  stars      INTEGER NOT NULL,         -- 1..5
  comment    TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, gh_login)
);
