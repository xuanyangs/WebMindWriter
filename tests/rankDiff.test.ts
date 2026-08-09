import assert from "node:assert/strict";
import test from "node:test";
import { diffSnapshot } from "../src/analysis/rankDiff.js";
import type { RankSnapshot } from "../src/types.js";

test("diffSnapshot finds new entries, risers, and fallers", () => {
  const previous = snapshot("2026-08-08T00:00:00.000Z", [
    ["a", "A", 1],
    ["b", "B", 2],
    ["c", "C", 3]
  ]);
  const current = snapshot("2026-08-09T00:00:00.000Z", [
    ["b", "B", 1],
    ["a", "A", 2],
    ["d", "D", 3]
  ]);

  const diff = diffSnapshot(current, previous);

  assert.equal(diff.risers[0]?.title, "B");
  assert.equal(diff.risers[0]?.delta, 1);
  assert.equal(diff.fallers[0]?.title, "A");
  assert.equal(diff.fallers[0]?.delta, -1);
  assert.equal(diff.newEntries[0]?.title, "D");
});

function snapshot(
  capturedAt: string,
  rows: Array<[string, string, number]>
): RankSnapshot {
  return {
    id: `snapshot-${capturedAt}`,
    source: "fanqie",
    rankUrl: "https://fanqienovel.com/rank/1_1_1140",
    rankName: "男频阅读榜-东方仙侠",
    gender: "1",
    rankMold: "1",
    categoryId: "1140",
    categoryName: "东方仙侠",
    capturedAt,
    itemCount: rows.length,
    items: rows.map(([bookId, title, rank]) => ({
      bookId,
      title,
      rank,
      tags: []
    }))
  };
}
