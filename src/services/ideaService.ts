import { summarizeBatch } from "../analysis/rankDiff.js";
import { FeedbackStore } from "../feedback/feedbackStore.js";
import { readLatestIdeaSourceReports } from "../reports/reportContext.js";
import { writeIdeasReport } from "../reports/ideaReport.js";
import { SampleStore } from "../samples/sampleStore.js";
import { SqliteRankStore } from "../storage/sqliteStore.js";
import type { RankBatch, RankSnapshot } from "../types.js";

export type IdeaServicePaths = {
  databasePath: string;
  reportDir: string;
  sampleDir: string;
  feedbackDir: string;
};

export type IdeaServiceOptions = {
  limit: number;
  sampleLimit: number;
  feedbackLimit: number;
};

export type IdeaServiceResult = {
  reportPath: string;
  batchId: string;
  capturedAt: string;
  ideaLimit: number;
  sampleCount: number;
  feedbackCount: number;
  sourceReportCount: number;
};

export async function runIdeasService(
  paths: IdeaServicePaths,
  options: IdeaServiceOptions
): Promise<IdeaServiceResult | undefined> {
  const db = new SqliteRankStore(paths.databasePath);
  try {
    const batch = db.getLatestBatch();
    if (!batch) return undefined;

    return writeIdeasFromBatch(paths, options, batch, db);
  } finally {
    db.close();
  }
}

export async function writeIdeasFromBatch(
  paths: IdeaServicePaths,
  options: IdeaServiceOptions,
  batch: RankBatch,
  db: SqliteRankStore
): Promise<IdeaServiceResult> {
  const analysis = buildIdeaServiceBatchAnalysis(batch, db);
  const samples = (await new SampleStore(paths.sampleDir).list()).slice(0, options.sampleLimit);
  const feedback = await new FeedbackStore(paths.feedbackDir).list({
    limit: options.feedbackLimit
  });
  const sourceReports = await readLatestIdeaSourceReports(paths.reportDir);
  const reportPath = await writeIdeasReport({
    batch,
    analysis,
    samples,
    feedback,
    sourceReports,
    outputDir: paths.reportDir,
    limit: options.limit
  });

  return {
    reportPath,
    batchId: batch.id,
    capturedAt: batch.capturedAt,
    ideaLimit: options.limit,
    sampleCount: samples.length,
    feedbackCount: feedback.length,
    sourceReportCount: sourceReports.filter((report) => report.exists).length
  };
}

function buildIdeaServiceBatchAnalysis(batch: RankBatch, db: SqliteRankStore) {
  const previousByRankName = new Map<string, RankSnapshot | undefined>();

  for (const snapshot of batch.snapshots) {
    previousByRankName.set(
      snapshot.rankName,
      db.getPreviousSnapshotForRank(snapshot.rankName, snapshot.capturedAt)
    );
  }

  return summarizeBatch(batch, previousByRankName);
}
