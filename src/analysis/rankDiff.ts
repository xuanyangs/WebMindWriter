import type { RankBatch, RankingItem, RankSnapshot } from "../types.js";

export type RankChange = {
  rankName: string;
  categoryName?: string;
  title: string;
  author?: string;
  bookId?: string;
  sourceUrl?: string;
  currentRank: number;
  previousRank?: number;
  delta?: number;
};

export type SnapshotDiff = {
  rankName: string;
  categoryName?: string;
  currentCapturedAt: string;
  previousCapturedAt?: string;
  itemCount: number;
  newEntries: RankChange[];
  risers: RankChange[];
  fallers: RankChange[];
};

export type BatchAnalysis = {
  batchId: string;
  capturedAt: string;
  snapshotCount: number;
  itemCount: number;
  comparedSnapshotCount: number;
  newEntries: RankChange[];
  risers: RankChange[];
  fallers: RankChange[];
  categoryCounts: Array<{ name: string; count: number }>;
  tagCounts: Array<{ name: string; count: number }>;
  snapshotDiffs: SnapshotDiff[];
};

export function diffSnapshot(
  current: RankSnapshot,
  previous?: RankSnapshot
): SnapshotDiff {
  const previousByKey = new Map<string, RankingItem>();

  for (const item of previous?.items ?? []) {
    previousByKey.set(itemIdentity(item), item);
  }

  const newEntries: RankChange[] = [];
  const risers: RankChange[] = [];
  const fallers: RankChange[] = [];

  for (const item of current.items) {
    const oldItem = previousByKey.get(itemIdentity(item));
    const change = toRankChange(current, item, oldItem);

    if (!oldItem) {
      newEntries.push(change);
      continue;
    }

    if ((change.delta ?? 0) > 0) {
      risers.push(change);
    } else if ((change.delta ?? 0) < 0) {
      fallers.push(change);
    }
  }

  return {
    rankName: current.rankName,
    categoryName: current.categoryName,
    currentCapturedAt: current.capturedAt,
    previousCapturedAt: previous?.capturedAt,
    itemCount: current.itemCount,
    newEntries: sortByCurrentRank(newEntries),
    risers: sortByDelta(risers),
    fallers: sortByDelta(fallers, "asc")
  };
}

export function summarizeBatch(
  batch: RankBatch,
  previousByRankName: Map<string, RankSnapshot | undefined>
): BatchAnalysis {
  const snapshotDiffs = batch.snapshots.map((snapshot) =>
    diffSnapshot(snapshot, previousByRankName.get(snapshot.rankName))
  );

  return {
    batchId: batch.id,
    capturedAt: batch.capturedAt,
    snapshotCount: batch.snapshots.length,
    itemCount: batch.totalItemCount,
    comparedSnapshotCount: snapshotDiffs.filter((diff) => diff.previousCapturedAt).length,
    newEntries: sortByCurrentRank(snapshotDiffs.flatMap((diff) => diff.newEntries)),
    risers: sortByDelta(snapshotDiffs.flatMap((diff) => diff.risers)),
    fallers: sortByDelta(snapshotDiffs.flatMap((diff) => diff.fallers), "asc"),
    categoryCounts: topCounts(
      batch.snapshots.flatMap((snapshot) =>
        snapshot.items.map((item) => item.category ?? snapshot.categoryName).filter(Boolean)
      ) as string[]
    ),
    tagCounts: topCounts(batch.snapshots.flatMap((snapshot) =>
      snapshot.items.flatMap((item) => item.tags)
    )),
    snapshotDiffs
  };
}

function toRankChange(
  snapshot: RankSnapshot,
  current: RankingItem,
  previous?: RankingItem
): RankChange {
  return {
    rankName: snapshot.rankName,
    categoryName: snapshot.categoryName,
    title: current.title,
    author: current.author,
    bookId: current.bookId,
    sourceUrl: current.sourceUrl,
    currentRank: current.rank,
    previousRank: previous?.rank,
    delta: previous ? previous.rank - current.rank : undefined
  };
}

function itemIdentity(item: RankingItem): string {
  return item.bookId ?? item.title;
}

function sortByCurrentRank(items: RankChange[]): RankChange[] {
  return [...items].sort((a, b) => a.currentRank - b.currentRank);
}

function sortByDelta(
  items: RankChange[],
  direction: "asc" | "desc" = "desc"
): RankChange[] {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const deltaCompare = ((a.delta ?? 0) - (b.delta ?? 0)) * multiplier;
    return deltaCompare || a.currentRank - b.currentRank;
  });
}

function topCounts(values: string[], limit = 20): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
