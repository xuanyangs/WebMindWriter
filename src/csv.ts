import fs from "node:fs/promises";
import path from "node:path";
import type { RankBatch, RankSnapshot } from "./types.js";

export async function exportSnapshotToCsv(
  snapshot: RankSnapshot,
  dataDir: string
): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const csvPath = path.join(dataDir, "latest-rank.csv");
  const rows = [
    csvHeader(),
    ...snapshotToRows(snapshot)
  ];

  const csv = rows.map((row) => row.map(formatCell).join(",")).join("\n");
  await fs.writeFile(csvPath, csv, "utf8");
  return csvPath;
}

export async function exportBatchToCsv(
  batch: RankBatch,
  dataDir: string
): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const csvPath = path.join(dataDir, "latest-rank-batch.csv");
  const rows = [
    csvHeader(),
    ...batch.snapshots.flatMap((snapshot) => snapshotToRows(snapshot))
  ];

  const csv = rows.map((row) => row.map(formatCell).join(",")).join("\n");
  await fs.writeFile(csvPath, csv, "utf8");
  return csvPath;
}

function csvHeader(): string[] {
  return [
    "capturedAt",
    "rankName",
    "gender",
    "rankMold",
    "categoryId",
    "categoryName",
    "rank",
    "title",
    "author",
    "category",
    "tags",
    "wordCount",
    "status",
    "heat",
    "sourceUrl",
    "description"
  ];
}

function snapshotToRows(snapshot: RankSnapshot): Array<Array<string | number>> {
  return snapshot.items.map((item) => [
    snapshot.capturedAt,
    snapshot.rankName,
    snapshot.gender ?? "",
    snapshot.rankMold ?? "",
    snapshot.categoryId ?? "",
    snapshot.categoryName ?? "",
    item.rank,
    item.title,
    item.author ?? "",
    item.category ?? "",
    item.tags.join("|"),
    item.wordCount ?? "",
    item.status ?? "",
    item.heat ?? "",
    item.sourceUrl ?? "",
    item.description ?? ""
  ]);
}

function formatCell(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
