import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RankBatch, RankingItem, RankSnapshot } from "../types.js";

const schema = `
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
`;

type SnapshotRow = {
  id: string;
  source: "fanqie";
  rank_url: string;
  rank_name: string;
  gender: string | null;
  rank_mold: string | null;
  category_id: string | null;
  category_name: string | null;
  captured_at: string;
  item_count: number;
};

type ItemRow = {
  rank: number;
  title: string;
  author: string | null;
  category: string | null;
  tags_json: string;
  description: string | null;
  word_count: string | null;
  status: string | null;
  heat: string | null;
  book_id: string | null;
  source_url: string | null;
};

type BatchRow = {
  id: string;
  source: "fanqie";
  captured_at: string;
  target_count: number;
  total_item_count: number;
  failures_json: string;
};

export type BookHistoryRow = {
  snapshotId: string;
  rankName: string;
  categoryName?: string;
  capturedAt: string;
  rank: number;
  title: string;
  author?: string;
  bookId?: string;
  sourceUrl?: string;
};

export class SqliteRankStore {
  private readonly db: DatabaseSync;

  constructor(readonly databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }

  saveSnapshot(snapshot: RankSnapshot, batchId?: string): void {
    this.db.exec("BEGIN");
    try {
      this.saveSnapshotRows(snapshot, batchId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveBatch(batch: RankBatch): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        `INSERT OR REPLACE INTO rank_batches
          (id, source, captured_at, target_count, total_item_count, failures_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        batch.id,
        batch.source,
        batch.capturedAt,
        batch.targetCount,
        batch.totalItemCount,
        JSON.stringify(batch.failures)
      );

      for (const snapshot of batch.snapshots) {
        this.saveSnapshotRows(snapshot, batch.id);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getLatestBatch(): RankBatch | undefined {
    const row = this.db.prepare(
      `SELECT * FROM rank_batches ORDER BY captured_at DESC LIMIT 1`
    ).get() as BatchRow | undefined;

    return row ? this.batchFromRow(row) : undefined;
  }

  getLatestSnapshot(rankName?: string): RankSnapshot | undefined {
    const row = rankName
      ? this.db.prepare(
          `SELECT * FROM rank_snapshots
           WHERE rank_name = ?
           ORDER BY captured_at DESC
           LIMIT 1`
        ).get(rankName) as SnapshotRow | undefined
      : this.db.prepare(
          `SELECT * FROM rank_snapshots ORDER BY captured_at DESC LIMIT 1`
        ).get() as SnapshotRow | undefined;

    return row ? this.snapshotFromRow(row) : undefined;
  }

  getPreviousSnapshotForRank(
    rankName: string,
    beforeCapturedAt: string
  ): RankSnapshot | undefined {
    const row = this.db.prepare(
      `SELECT * FROM rank_snapshots
       WHERE rank_name = ? AND captured_at < ?
       ORDER BY captured_at DESC
       LIMIT 1`
    ).get(rankName, beforeCapturedAt) as SnapshotRow | undefined;

    return row ? this.snapshotFromRow(row) : undefined;
  }

  queryRankItems(options: {
    rankName?: string;
    date?: string;
    limit: number;
  }): RankSnapshot[] {
    const filters: string[] = [];
    const params: Array<string | number> = [];

    if (options.rankName) {
      filters.push("rank_name = ?");
      params.push(options.rankName);
    }

    if (options.date) {
      filters.push("captured_at LIKE ?");
      params.push(`${options.date}%`);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.db.prepare(
      `SELECT * FROM rank_snapshots
       ${where}
       ORDER BY captured_at DESC, rank_name ASC
       LIMIT ?`
    ).all(...params, options.limit) as SnapshotRow[];

    return rows.map((row) => this.snapshotFromRow(row));
  }

  findBookHistory(options: {
    bookId?: string;
    title?: string;
    limit: number;
  }): BookHistoryRow[] {
    if (!options.bookId && !options.title) return [];

    const where = options.bookId ? "i.book_id = ?" : "i.title = ?";
    const value = options.bookId ?? options.title ?? "";

    return this.db.prepare(
      `SELECT
         s.id AS snapshotId,
         s.rank_name AS rankName,
         s.category_name AS categoryName,
         s.captured_at AS capturedAt,
         i.rank,
         i.title,
         i.author,
         i.book_id AS bookId,
         i.source_url AS sourceUrl
       FROM rank_items i
       JOIN rank_snapshots s ON s.id = i.snapshot_id
       WHERE ${where}
       ORDER BY s.captured_at DESC
       LIMIT ?`
    ).all(value, options.limit) as BookHistoryRow[];
  }

  countBatches(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS count FROM rank_batches`
    ).get() as { count: number };
    return row.count;
  }

  countSnapshots(): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS count FROM rank_snapshots`
    ).get() as { count: number };
    return row.count;
  }

  private saveSnapshotRows(snapshot: RankSnapshot, batchId?: string): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO rank_snapshots
        (id, batch_id, source, rank_url, rank_name, gender, rank_mold,
         category_id, category_name, captured_at, item_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      snapshot.id,
      batchId ?? null,
      snapshot.source,
      snapshot.rankUrl,
      snapshot.rankName,
      snapshot.gender ?? null,
      snapshot.rankMold ?? null,
      snapshot.categoryId ?? null,
      snapshot.categoryName ?? null,
      snapshot.capturedAt,
      snapshot.itemCount
    );

    this.db.prepare(
      `DELETE FROM rank_items WHERE snapshot_id = ?`
    ).run(snapshot.id);

    const insertItem = this.db.prepare(
      `INSERT INTO rank_items
        (snapshot_id, item_key, rank, title, author, category, tags_json,
         description, word_count, status, heat, book_id, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of snapshot.items) {
      insertItem.run(
        snapshot.id,
        itemKey(item),
        item.rank,
        item.title,
        item.author ?? null,
        item.category ?? null,
        JSON.stringify(item.tags),
        item.description ?? null,
        item.wordCount ?? null,
        item.status ?? null,
        item.heat ?? null,
        item.bookId ?? null,
        item.sourceUrl ?? null
      );
    }
  }

  private batchFromRow(row: BatchRow): RankBatch {
    const snapshots = this.db.prepare(
      `SELECT * FROM rank_snapshots
       WHERE batch_id = ?
       ORDER BY rank_name ASC, captured_at ASC`
    ).all(row.id) as SnapshotRow[];

    return {
      id: row.id,
      source: row.source,
      capturedAt: row.captured_at,
      targetCount: row.target_count,
      totalItemCount: row.total_item_count,
      snapshots: snapshots.map((snapshotRow) => this.snapshotFromRow(snapshotRow)),
      failures: parseJson(row.failures_json, [])
    };
  }

  private snapshotFromRow(row: SnapshotRow): RankSnapshot {
    const itemRows = this.db.prepare(
      `SELECT * FROM rank_items
       WHERE snapshot_id = ?
       ORDER BY rank ASC`
    ).all(row.id) as ItemRow[];

    return {
      id: row.id,
      source: row.source,
      rankUrl: row.rank_url,
      rankName: row.rank_name,
      gender: row.gender ?? undefined,
      rankMold: row.rank_mold ?? undefined,
      categoryId: row.category_id ?? undefined,
      categoryName: row.category_name ?? undefined,
      capturedAt: row.captured_at,
      itemCount: row.item_count,
      items: itemRows.map(itemFromRow)
    };
  }
}

function itemFromRow(row: ItemRow): RankingItem {
  return {
    rank: row.rank,
    title: row.title,
    author: row.author ?? undefined,
    category: row.category ?? undefined,
    tags: parseJson(row.tags_json, []),
    description: row.description ?? undefined,
    wordCount: row.word_count ?? undefined,
    status: row.status ?? undefined,
    heat: row.heat ?? undefined,
    bookId: row.book_id ?? undefined,
    sourceUrl: row.source_url ?? undefined
  };
}

function itemKey(item: RankingItem): string {
  return item.bookId ?? `${item.rank}:${item.title}`;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
