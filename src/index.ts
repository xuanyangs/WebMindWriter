import { Command } from "commander";
import { config } from "./config.js";
import { crawlFanqieRank } from "./fanqieRankCrawler.js";
import { exportBatchToCsv, exportSnapshotToCsv } from "./csv.js";
import { JsonSnapshotStore } from "./jsonSnapshotStore.js";
import { getAllRankTargets } from "./rankTargets.js";
import { summarizeBatch } from "./analysis/rankDiff.js";
import { writeScanReport } from "./reports/scanReport.js";
import { SqliteRankStore } from "./storage/sqliteStore.js";
import type { RankBatch, RankSnapshot } from "./types.js";

const program = new Command();

program
  .name("fanqie-loop")
  .description("番茄小说公开榜单采集与扫榜分析工程")
  .version("0.1.0");

program
  .command("crawl")
  .description("采集一次公开榜单，保存 JSON 快照并写入 SQLite")
  .option("--url <url>", "榜单地址", config.defaultRankUrl)
  .option("--limit <number>", "采集条数", String(config.topLimit))
  .option("--category-id <id>", "番茄分类 ID", config.defaultCategoryId)
  .option("--gender <number>", "频道：1 男频，2 女频", config.defaultGender)
  .option("--rank-mold <number>", "榜单类型", config.defaultRankMold)
  .action(async (options: CliOptions) => {
    await crawlOnce(options);
  });

program
  .command("crawl-all")
  .description("采集全部内置公开榜单，保存批次、写入 SQLite 并生成报告")
  .option("--limit <number>", "每个榜单采集条数", "20")
  .option("--delay-ms <number>", "每个榜单之间的等待时间", "500")
  .action(async (options: { limit: string; delayMs: string }) => {
    await crawlAll(Number(options.limit), Number(options.delayMs));
  });

program
  .command("loop")
  .description("循环采集单个公开榜单")
  .option("--url <url>", "榜单地址", config.defaultRankUrl)
  .option("--limit <number>", "采集条数", String(config.topLimit))
  .option("--category-id <id>", "番茄分类 ID", config.defaultCategoryId)
  .option("--gender <number>", "频道：1 男频，2 女频", config.defaultGender)
  .option("--rank-mold <number>", "榜单类型", config.defaultRankMold)
  .option(
    "--interval-minutes <number>",
    "采集间隔，单位分钟",
    String(config.intervalMinutes)
  )
  .action(async (options: CliOptions & { intervalMinutes: string }) => {
    const intervalMs = Number(options.intervalMinutes) * 60 * 1000;
    await crawlOnce(options);

    setInterval(() => {
      crawlOnce(options).catch((error) => {
        console.error(`[loop] 采集失败：${formatError(error)}`);
      });
    }, intervalMs);
  });

program
  .command("loop-all")
  .description("循环采集全部公开榜单，并在每轮生成扫榜报告")
  .option("--limit <number>", "每个榜单采集条数", "20")
  .option("--delay-ms <number>", "每个榜单之间的等待时间", "500")
  .option(
    "--interval-minutes <number>",
    "采集间隔，单位分钟",
    String(config.intervalMinutes)
  )
  .action(async (options: { limit: string; delayMs: string; intervalMinutes: string }) => {
    const intervalMs = Number(options.intervalMinutes) * 60 * 1000;
    const run = () => crawlAll(Number(options.limit), Number(options.delayMs));

    await run();
    setInterval(() => {
      run().catch((error) => {
        console.error(`[loop-all] 批量采集失败：${formatError(error)}`);
      });
    }, intervalMs);
  });

program
  .command("export")
  .description("导出最新单榜快照为 CSV")
  .action(async () => {
    const store = new JsonSnapshotStore(config.dataDir);
    const latest = await store.readLatest();

    if (!latest) {
      console.log("还没有可导出的快照，请先运行 npm run crawl。");
      return;
    }

    const csvPath = await exportSnapshotToCsv(latest, config.dataDir);
    console.log(`已导出：${csvPath}`);
  });

program
  .command("export-all")
  .description("导出最新批量榜单为 CSV")
  .action(async () => {
    const store = new JsonSnapshotStore(config.dataDir);
    const latestBatch = await store.readLatestBatch();

    if (!latestBatch) {
      console.log("还没有可导出的批次，请先运行 npm run crawl:all。");
      return;
    }

    const csvPath = await exportBatchToCsv(latestBatch, config.dataDir);
    console.log(`已导出：${csvPath}`);
  });

program
  .command("db:import")
  .description("把 data 目录里的 JSON 快照导入 SQLite")
  .action(async () => {
    const jsonStore = new JsonSnapshotStore(config.dataDir);
    const db = openDb();

    try {
      const snapshots = await jsonStore.readAll();
      for (const snapshot of snapshots) {
        db.saveSnapshot(snapshot);
      }

      const latestBatch = await jsonStore.readLatestBatch();
      if (latestBatch) {
        db.saveBatch(latestBatch);
      }

      console.log(
        `导入完成：${db.countBatches()} 个批次，${db.countSnapshots()} 个榜单快照。`
      );
      console.log(`SQLite：${config.databasePath}`);
    } finally {
      db.close();
    }
  });

program
  .command("query:latest")
  .description("查询 SQLite 中的最新批次")
  .option("--limit <number>", "每个榜单展示条数", "5")
  .action((options: { limit: string }) => {
    const db = openDb();
    try {
      const batch = db.getLatestBatch();
      if (!batch) {
        console.log("SQLite 里还没有批次，请先运行 npm run db:import 或 npm run crawl:all。");
        return;
      }

      printBatch(batch, Number(options.limit));
    } finally {
      db.close();
    }
  });

program
  .command("query:rank")
  .description("查询指定日期或榜单的快照")
  .option("--rank-name <name>", "榜单名称，例如：男频阅读榜-东方仙侠")
  .option("--date <yyyy-mm-dd>", "采集日期，例如：2026-08-09")
  .option("--limit <number>", "最多展示快照数", "5")
  .option("--top <number>", "每个榜单展示作品数", "10")
  .action((options: {
    rankName?: string;
    date?: string;
    limit: string;
    top: string;
  }) => {
    const db = openDb();
    try {
      const snapshots = db.queryRankItems({
        rankName: options.rankName,
        date: options.date,
        limit: Number(options.limit)
      });

      if (snapshots.length === 0) {
        console.log("没有查到匹配的榜单快照。");
        return;
      }

      for (const snapshot of snapshots) {
        printSnapshot(snapshot, Number(options.top));
      }
    } finally {
      db.close();
    }
  });

program
  .command("query:book")
  .description("查询一本书的历史排名")
  .option("--book-id <id>", "番茄 bookId")
  .option("--title <title>", "作品标题；没有 bookId 时可用")
  .option("--limit <number>", "展示条数", "20")
  .action((options: { bookId?: string; title?: string; limit: string }) => {
    const db = openDb();
    try {
      const rows = db.findBookHistory({
        bookId: options.bookId,
        title: options.title,
        limit: Number(options.limit)
      });

      if (rows.length === 0) {
        console.log("没有查到这本书的历史记录。");
        return;
      }

      for (const row of rows) {
        console.log(
          `${row.capturedAt} | ${row.rankName} | #${row.rank} | ${row.title}`
        );
      }
    } finally {
      db.close();
    }
  });

program
  .command("report")
  .description("基于 SQLite 最新批次生成扫榜 Markdown 报告")
  .action(async () => {
    const db = openDb();
    try {
      let batch = db.getLatestBatch();

      if (!batch) {
        const jsonStore = new JsonSnapshotStore(config.dataDir);
        const latestBatch = await jsonStore.readLatestBatch();
        if (latestBatch) {
          db.saveBatch(latestBatch);
          batch = latestBatch;
        }
      }

      if (!batch) {
        console.log("没有可生成报告的批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateReport(batch, db);
      console.log(`报告已生成：${reportPath}`);
    } finally {
      db.close();
    }
  });

type CliOptions = {
  url: string;
  limit: string;
  categoryId?: string;
  gender?: string;
  rankMold?: string;
};

async function crawlOnce(options: CliOptions): Promise<void> {
  const jsonStore = new JsonSnapshotStore(config.dataDir);
  const limit = Number(options.limit);
  const url = options.url;
  console.log(`开始采集：${url}`);

  const snapshot = await crawlFanqieRank({
    url,
    limit,
    timeoutMs: config.timeoutMs,
    categoryId: options.categoryId,
    gender: options.gender,
    rankMold: options.rankMold
  });

  await jsonStore.save(snapshot);

  const db = openDb();
  try {
    db.saveSnapshot(snapshot);
  } finally {
    db.close();
  }

  console.log(
    `采集完成：${snapshot.rankName}，${snapshot.itemCount} 条，${snapshot.capturedAt}`
  );

  if (snapshot.itemCount === 0) {
    console.log(
      "没有解析到作品。可能是页面结构变化、服务端未返回榜单 HTML，或需要改用浏览器渲染采集。"
    );
  }
}

async function crawlAll(limit: number, delayMs: number): Promise<void> {
  const jsonStore = new JsonSnapshotStore(config.dataDir);
  const targets = getAllRankTargets();
  const capturedAt = new Date().toISOString();
  const snapshots: RankSnapshot[] = [];
  const failures: RankBatch["failures"] = [];

  console.log(`开始批量采集：${targets.length} 个榜单，每榜 ${limit} 条`);

  for (const [index, target] of targets.entries()) {
    console.log(`[${index + 1}/${targets.length}] ${target.rankName}`);

    try {
      const snapshot = await crawlFanqieRank({
        url: target.url,
        limit,
        timeoutMs: config.timeoutMs,
        categoryId: target.categoryId,
        gender: target.gender,
        rankMold: target.rankMold,
        rankName: target.rankName,
        categoryName: target.categoryName
      });
      snapshots.push(snapshot);
      console.log(`  完成：${snapshot.itemCount} 条`);
    } catch (error) {
      failures.push({
        rankName: target.rankName,
        url: target.url,
        error: formatError(error)
      });
      console.log(`  失败：${formatError(error)}`);
    }

    if (index < targets.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const batch: RankBatch = {
    id: makeBatchId(capturedAt),
    source: "fanqie",
    capturedAt,
    targetCount: targets.length,
    totalItemCount: snapshots.reduce((sum, snapshot) => sum + snapshot.itemCount, 0),
    snapshots,
    failures
  };

  await jsonStore.saveBatch(batch);
  const csvPath = await exportBatchToCsv(batch, config.dataDir);

  const db = openDb();
  try {
    db.saveBatch(batch);
    const reportPath = await generateReport(batch, db);
    console.log(`扫榜报告：${reportPath}`);
  } finally {
    db.close();
  }

  console.log(
    `批量采集完成：成功 ${snapshots.length} 个，失败 ${failures.length} 个，共 ${batch.totalItemCount} 条`
  );
  console.log("批次 JSON：latest-rank-batch.json");
  console.log(`批次 CSV：${csvPath}`);
  console.log(`SQLite：${config.databasePath}`);
}

async function generateReport(
  batch: RankBatch,
  db: SqliteRankStore
): Promise<string> {
  const previousByRankName = new Map<string, RankSnapshot | undefined>();

  for (const snapshot of batch.snapshots) {
    previousByRankName.set(
      snapshot.rankName,
      db.getPreviousSnapshotForRank(snapshot.rankName, snapshot.capturedAt)
    );
  }

  const analysis = summarizeBatch(batch, previousByRankName);
  return writeScanReport(batch, analysis, config.reportDir);
}

function printBatch(batch: RankBatch, limit: number): void {
  console.log(
    `${batch.id} | ${batch.capturedAt} | ${batch.snapshots.length} 个榜单 | ${batch.totalItemCount} 条`
  );
  for (const snapshot of batch.snapshots.slice(0, limit)) {
    printSnapshot(snapshot, 3);
  }
}

function printSnapshot(snapshot: RankSnapshot, top: number): void {
  console.log("");
  console.log(`${snapshot.rankName} | ${snapshot.capturedAt} | ${snapshot.itemCount} 条`);
  for (const item of snapshot.items.slice(0, top)) {
    const author = item.author ? ` | ${item.author}` : "";
    console.log(`#${item.rank} ${item.title}${author}`);
  }
}

function openDb(): SqliteRankStore {
  return new SqliteRankStore(config.databasePath);
}

function makeBatchId(capturedAt: string): string {
  return `fanqie-rank-batch-${capturedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

program.parseAsync().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
