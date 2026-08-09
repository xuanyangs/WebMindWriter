import fs from "node:fs/promises";
import path from "node:path";
import type { RankBatch, RankSnapshot } from "./types.js";

export class JsonSnapshotStore {
  constructor(private readonly dataDir: string) {}

  async save(snapshot: RankSnapshot): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });

    const jsonPath = path.join(this.dataDir, "rank-snapshots.json");
    const jsonlPath = path.join(this.dataDir, "rank-snapshots.jsonl");
    const snapshots = await this.readAll();
    const merged = snapshots.filter((item) => item.id !== snapshot.id);

    merged.push(snapshot);
    merged.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    await fs.writeFile(jsonPath, JSON.stringify(merged, null, 2), "utf8");
    await fs.appendFile(jsonlPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  }

  async readAll(): Promise<RankSnapshot[]> {
    const jsonPath = path.join(this.dataDir, "rank-snapshots.json");

    try {
      const content = await fs.readFile(jsonPath, "utf8");
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed) ? (parsed as RankSnapshot[]) : [];
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async readLatest(): Promise<RankSnapshot | undefined> {
    const snapshots = await this.readAll();
    return snapshots.at(-1);
  }

  async saveBatch(batch: RankBatch): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });

    const batchPath = path.join(this.dataDir, "latest-rank-batch.json");
    const batchArchivePath = path.join(this.dataDir, `${batch.id}.json`);
    const batchHistoryPath = path.join(this.dataDir, "rank-batches.jsonl");

    await fs.writeFile(batchPath, JSON.stringify(batch, null, 2), "utf8");
    await fs.writeFile(batchArchivePath, JSON.stringify(batch, null, 2), "utf8");
    await fs.appendFile(batchHistoryPath, `${JSON.stringify(batch)}\n`, "utf8");

    const snapshots = await this.readAll();
    const batchIds = new Set(batch.snapshots.map((snapshot) => snapshot.id));
    const merged = snapshots.filter((snapshot) => !batchIds.has(snapshot.id));

    merged.push(...batch.snapshots);
    merged.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    await fs.writeFile(
      path.join(this.dataDir, "rank-snapshots.json"),
      JSON.stringify(merged, null, 2),
      "utf8"
    );
    await fs.appendFile(
      path.join(this.dataDir, "rank-snapshots.jsonl"),
      `${batch.snapshots.map((snapshot) => JSON.stringify(snapshot)).join("\n")}\n`,
      "utf8"
    );
  }

  async readLatestBatch(): Promise<RankBatch | undefined> {
    const batchPath = path.join(this.dataDir, "latest-rank-batch.json");

    try {
      const content = await fs.readFile(batchPath, "utf8");
      return JSON.parse(content) as RankBatch;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
