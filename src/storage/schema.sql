CREATE TABLE IF NOT EXISTS rank_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  total_item_count INTEGER NOT NULL,
  failures_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  source TEXT NOT NULL,
  rank_url TEXT NOT NULL,
  rank_name TEXT NOT NULL,
  gender TEXT,
  rank_mold TEXT,
  category_id TEXT,
  category_name TEXT,
  captured_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES rank_batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rank_items (
  snapshot_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  word_count TEXT,
  status TEXT,
  heat TEXT,
  book_id TEXT,
  source_url TEXT,
  PRIMARY KEY (snapshot_id, item_key),
  FOREIGN KEY (snapshot_id) REFERENCES rank_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rank_batches_captured_at
  ON rank_batches(captured_at);

CREATE INDEX IF NOT EXISTS idx_rank_snapshots_rank_time
  ON rank_snapshots(rank_name, captured_at);

CREATE INDEX IF NOT EXISTS idx_rank_items_book_id
  ON rank_items(book_id);

CREATE INDEX IF NOT EXISTS idx_rank_items_title
  ON rank_items(title);
