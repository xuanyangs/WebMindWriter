import { Command } from "commander";
import { config } from "./config.js";
import { makeModelConfig } from "./agents/modelClient.js";
import { writeAiScanReport } from "./agents/scanAgent.js";
import { writeAiTeardownReport } from "./agents/teardownAgent.js";
import { writeAiTextTeardownReport } from "./agents/textTeardownAgent.js";
import { writeAiIdeaReport, writeAiIdeasReport } from "./agents/ideaAgent.js";
import { crawlFanqieRank } from "./fanqieRankCrawler.js";
import { exportBatchToCsv, exportSnapshotToCsv } from "./csv.js";
import { JsonSnapshotStore } from "./jsonSnapshotStore.js";
import { getAllRankTargets } from "./rankTargets.js";
import { summarizeBatch } from "./analysis/rankDiff.js";
import { writeAgentScanReport } from "./reports/agentScanReport.js";
import { writeBookTeardownReport } from "./reports/bookTeardownReport.js";
import { writeIdeaReport, writeIdeasReport } from "./reports/ideaReport.js";
import { readLatestIdeaSourceReports } from "./reports/reportContext.js";
import { writeScanReport } from "./reports/scanReport.js";
import { writeTextTeardownReport } from "./reports/textTeardownReport.js";
import { FeedbackStore } from "./feedback/feedbackStore.js";
import { feedbackTypes, type FeedbackType } from "./feedback/feedbackTypes.js";
import {
  writeAgentRunReport,
  type AgentRunGoal,
  type AgentRunStep,
  type AgentRunStepStatus
} from "./orchestrator/agentRunReport.js";
import { SampleStore } from "./samples/sampleStore.js";
import { SqliteRankStore } from "./storage/sqliteStore.js";
import type { RankBatch, RankingItem, RankSnapshot } from "./types.js";

const program = new Command();
const agentRunGoals: AgentRunGoal[] = [
  "daily",
  "scan",
  "teardown",
  "text-teardown",
  "feedback-review",
  "idea"
];

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
  .command("sample:add")
  .description("创建或导入人工整理的开局样本文本，不自动采集正文")
  .requiredOption("--book-id <id>", "bookId，用作样本文件名")
  .option("--title <title>", "作品标题")
  .option("--source-url <url>", "样本来源链接")
  .option("--file <path>", "从本地文本/Markdown 文件导入")
  .action(async (options: {
    bookId: string;
    title?: string;
    sourceUrl?: string;
    file?: string;
  }) => {
    const samples = openSamples();
    const filePath = options.file
      ? await samples.importFromFile({
          bookId: options.bookId,
          title: options.title,
          sourceUrl: options.sourceUrl,
          inputPath: options.file
        })
      : await samples.createTemplate({
          bookId: options.bookId,
          title: options.title,
          sourceUrl: options.sourceUrl
        });

    console.log(`样本文本文件已准备：${filePath}`);
  });

program
  .command("sample:import-dir")
  .description("从本地目录批量导入 txt 开局样本，只截取前 N 字")
  .requiredOption("--dir <path>", "本地 txt 文件目录")
  .option("--limit-chars <number>", "每本导入的最大字符数", "8000")
  .action(async (options: { dir: string; limitChars: string }) => {
    const imported = await openSamples().importDirectory({
      dir: options.dir,
      limitChars: Number(options.limitChars)
    });

    if (imported.length === 0) {
      console.log("没有找到可导入的 .txt 文件。");
      return;
    }

    console.log(`已导入 ${imported.length} 本开局样本：`);
    for (const item of imported) {
      console.log(`${item.bookId} | ${item.title} | ${item.filePath}`);
    }
  });

program
  .command("sample:list")
  .description("列出本地人工样本文本")
  .action(async () => {
    const samples = await openSamples().list();

    if (samples.length === 0) {
      console.log("还没有样本文本，请先运行 npm run sample:add。");
      return;
    }

    for (const sample of samples) {
      console.log(`${sample.bookId} | ${sample.title ?? "未命名"} | ${sample.filePath}`);
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

program
  .command("agent:scan")
  .description("基于 SQLite 最新批次生成作者决策版扫榜 Agent 报告")
  .action(async () => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成 Agent 报告的批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateAgentReport(batch, db);
      console.log(`Agent 报告已生成：${reportPath}`);
    } finally {
      db.close();
    }
  });

program
  .command("agent:teardown")
  .description("基于最新榜单变化生成拆书 Agent 报告")
  .option("--limit <number>", "拆解样本数", "5")
  .action(async (options: { limit: string }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成拆书报告的批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateBookTeardownReport(
        batch,
        db,
        Number(options.limit)
      );
      console.log(`拆书报告已生成：${reportPath}`);
    } finally {
      db.close();
    }
  });

program
  .command("agent:scan:ai")
  .description("调用 OpenAI-compatible 模型生成 AI 扫榜报告")
  .option("--dry-run", "只生成 prompt 文件，不调用模型")
  .action(async (options: { dryRun?: boolean }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成 AI 扫榜报告的批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateAiScanReport(batch, db, Boolean(options.dryRun));
      console.log(
        options.dryRun
          ? `AI 扫榜 prompt 已生成：${reportPath}`
          : `AI 扫榜报告已生成：${reportPath}`
      );
    } finally {
      db.close();
    }
  });

program
  .command("agent:teardown:ai")
  .description("调用 OpenAI-compatible 模型生成 AI 拆书报告")
  .option("--limit <number>", "拆解样本数", "5")
  .option("--dry-run", "只生成 prompt 文件，不调用模型")
  .action(async (options: { limit: string; dryRun?: boolean }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成 AI 拆书报告的批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateAiTeardownReport(
        batch,
        db,
        Number(options.limit),
        Boolean(options.dryRun)
      );
      console.log(
        options.dryRun
          ? `AI 拆书 prompt 已生成：${reportPath}`
          : `AI 拆书报告已生成：${reportPath}`
      );
    } finally {
      db.close();
    }
  });

program
  .command("agent:teardown:text")
  .description("基于人工开局样本文本生成规则版深度拆书报告")
  .requiredOption("--book-id <id>", "要拆解的样本文本 bookId")
  .action(async (options: { bookId: string }) => {
    const sample = await openSamples().read(options.bookId);

    if (!sample) {
      console.log("没有找到样本文本，请先运行 npm run sample:add。");
      return;
    }

    const item = await findLatestBookItem(options.bookId);
    const reportPath = await writeTextTeardownReport({
      sample,
      item,
      outputDir: config.reportDir
    });

    console.log(`文本拆书报告已生成：${reportPath}`);
  });

program
  .command("agent:teardown:text:batch")
  .description("批量生成本地人工样本文本的规则版深度拆书报告")
  .option("--limit <number>", "最多处理样本数，默认全部")
  .action(async (options: { limit?: string }) => {
    const samples = await openSamples().list();
    const selected = options.limit
      ? samples.slice(0, Number(options.limit))
      : samples;

    if (selected.length === 0) {
      console.log("还没有样本文本，请先运行 npm run sample:add 或 npm run sample:import-dir。");
      return;
    }

    console.log(`开始生成 ${selected.length} 份文本拆书报告：`);
    for (const sample of selected) {
      const item = await findLatestBookItem(sample.bookId);
      const reportPath = await writeTextTeardownReport({
        sample,
        item,
        outputDir: config.reportDir
      });
      console.log(`${sample.bookId} | ${sample.title ?? "未命名"} | ${reportPath}`);
    }
  });

program
  .command("agent:teardown:text:ai")
  .description("调用 OpenAI-compatible 模型生成 AI 开局文本拆书报告")
  .requiredOption("--book-id <id>", "要拆解的样本文本 bookId")
  .option("--dry-run", "只生成 prompt 文件，不调用模型")
  .action(async (options: { bookId: string; dryRun?: boolean }) => {
    const sample = await openSamples().read(options.bookId);

    if (!sample) {
      console.log("没有找到样本文本，请先运行 npm run sample:add。");
      return;
    }

    const item = await findLatestBookItem(options.bookId);
    const reportPath = await writeAiTextTeardownReport({
      sample,
      item,
      outputDir: config.reportDir,
      modelConfig: makeModelConfig(process.env),
      dryRun: Boolean(options.dryRun)
    });

    console.log(
      options.dryRun
        ? `AI 文本拆书 prompt 已生成：${reportPath}`
        : `AI 文本拆书报告已生成：${reportPath}`
    );
  });

program
  .command("agent:ideas")
  .description("读取最新扫榜/拆书/文本拆书报告和反馈，生成原创选题卡")
  .option("--limit <number>", "生成选题卡数量", "5")
  .option("--sample-limit <number>", "纳入本地开局样本数量", "8")
  .option("--feedback-limit <number>", "纳入反馈记忆数量", "20")
  .action(async (options: {
    limit: string;
    sampleLimit: string;
    feedbackLimit: string;
  }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成选题卡的榜单批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateIdeasReport(
        batch,
        db,
        parsePositiveInteger(options.limit, "--limit"),
        parsePositiveInteger(options.sampleLimit, "--sample-limit"),
        parsePositiveInteger(options.feedbackLimit, "--feedback-limit")
      );
      console.log(`IdeasAgent 选题卡已生成：${reportPath}`);
    } finally {
      db.close();
    }
  });

program
  .command("agent:ideas:ai")
  .description("读取最新报告和反馈，调用 OpenAI-compatible 模型生成 AI 原创选题卡")
  .option("--limit <number>", "生成选题卡数量", "5")
  .option("--sample-limit <number>", "纳入本地开局样本数量", "8")
  .option("--feedback-limit <number>", "纳入反馈记忆数量", "20")
  .option("--dry-run", "只生成 prompt 文件，不调用模型")
  .action(async (options: {
    limit: string;
    sampleLimit: string;
    feedbackLimit: string;
    dryRun?: boolean;
  }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成 AI 选题卡的榜单批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateAiIdeasReport(
        batch,
        db,
        parsePositiveInteger(options.limit, "--limit"),
        parsePositiveInteger(options.sampleLimit, "--sample-limit"),
        parsePositiveInteger(options.feedbackLimit, "--feedback-limit"),
        Boolean(options.dryRun)
      );
      console.log(
        options.dryRun
          ? `AI 选题 prompt 已生成：${reportPath}`
          : `AI 选题卡已生成：${reportPath}`
      );
    } finally {
      db.close();
    }
  });

program
  .command("agent:idea")
  .description("基于榜单趋势、本地开局样本和反馈记忆生成原创选题卡")
  .option("--limit <number>", "生成选题卡数量", "5")
  .option("--sample-limit <number>", "纳入本地开局样本数量", "8")
  .option("--feedback-limit <number>", "纳入反馈记忆数量", "20")
  .action(async (options: {
    limit: string;
    sampleLimit: string;
    feedbackLimit: string;
  }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成选题卡的榜单批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateIdeaReport(
        batch,
        db,
        parsePositiveInteger(options.limit, "--limit"),
        parsePositiveInteger(options.sampleLimit, "--sample-limit"),
        parsePositiveInteger(options.feedbackLimit, "--feedback-limit")
      );
      console.log(`IdeaAgent 选题卡已生成：${reportPath}`);
    } finally {
      db.close();
    }
  });

program
  .command("agent:idea:ai")
  .description("调用 OpenAI-compatible 模型生成 AI 原创选题卡")
  .option("--limit <number>", "生成选题卡数量", "5")
  .option("--sample-limit <number>", "纳入本地开局样本数量", "8")
  .option("--feedback-limit <number>", "纳入反馈记忆数量", "20")
  .option("--dry-run", "只生成 prompt 文件，不调用模型")
  .action(async (options: {
    limit: string;
    sampleLimit: string;
    feedbackLimit: string;
    dryRun?: boolean;
  }) => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);

      if (!batch) {
        console.log("没有可生成 AI 选题卡的榜单批次，请先运行 npm run crawl:all。");
        return;
      }

      const reportPath = await generateAiIdeaReport(
        batch,
        db,
        parsePositiveInteger(options.limit, "--limit"),
        parsePositiveInteger(options.sampleLimit, "--sample-limit"),
        parsePositiveInteger(options.feedbackLimit, "--feedback-limit"),
        Boolean(options.dryRun)
      );
      console.log(
        options.dryRun
          ? `AI 选题 prompt 已生成：${reportPath}`
          : `AI 选题卡已生成：${reportPath}`
      );
    } finally {
      db.close();
    }
  });

program
  .command("agent:run")
  .description("运行 Agent Orchestrator：按目标自动编排扫榜、拆书、文本样本和反馈循环")
  .option(
    "--goal <goal>",
    `编排目标：${agentRunGoals.join(", ")}`,
    "daily"
  )
  .option("--crawl", "先抓取全部内置公开榜单；默认只使用本地已有数据")
  .option("--crawl-limit <number>", "抓取时每个榜单的条数", "20")
  .option("--delay-ms <number>", "抓取榜单之间的等待毫秒数", "500")
  .option("--limit <number>", "榜单拆书目标数量", "5")
  .option("--sample-limit <number>", "本地样本文本处理数量", "6")
  .option("--live-ai", "真实调用模型；默认只生成 prompt dry-run 文件")
  .action(async (options: {
    goal: string;
    crawl?: boolean;
    crawlLimit: string;
    delayMs: string;
    limit: string;
    sampleLimit: string;
    liveAi?: boolean;
  }) => {
    const result = await runAgentOrchestrator({
      goal: parseAgentRunGoal(options.goal),
      crawl: Boolean(options.crawl),
      crawlLimit: parsePositiveInteger(options.crawlLimit, "--crawl-limit"),
      delayMs: parseNonNegativeInteger(options.delayMs, "--delay-ms"),
      teardownLimit: parsePositiveInteger(options.limit, "--limit"),
      sampleLimit: parsePositiveInteger(options.sampleLimit, "--sample-limit"),
      liveAi: Boolean(options.liveAi)
    });

    console.log(`Agent Orchestrator 完成：${result.reportPath}`);
    for (const step of result.steps) {
      console.log(`[${step.status}] ${step.name} - ${step.detail}`);
    }
  });

program
  .command("feedback:add")
  .description("记录一次报告反馈，用来改进后续 prompt 和模板")
  .requiredOption("--target <id>", "反馈对象，例如 bookId、报告名或批次 ID")
  .requiredOption("--type <type>", `反馈类型：${feedbackTypes.join(", ")}`)
  .requiredOption("--rating <number>", "评分，1-5")
  .option("--note <text>", "简短备注")
  .option("--report-path <path>", "对应报告文件路径")
  .action(async (options: {
    target: string;
    type: FeedbackType;
    rating: string;
    note?: string;
    reportPath?: string;
  }) => {
    const record = await openFeedback().add({
      target: options.target,
      type: options.type,
      rating: Number(options.rating),
      note: options.note,
      reportPath: options.reportPath
    });

    console.log(
      `反馈已记录：${record.id} | ${record.type} | ${record.target} | ${record.rating}/5`
    );
  });

program
  .command("feedback:list")
  .description("查看最近的报告反馈")
  .option("--target <id>", "只看某个反馈对象")
  .option("--type <type>", `只看某类反馈：${feedbackTypes.join(", ")}`)
  .option("--limit <number>", "展示条数", "20")
  .option("--summary", "只展示汇总")
  .action(async (options: {
    target?: string;
    type?: FeedbackType;
    limit: string;
    summary?: boolean;
  }) => {
    const store = openFeedback();

    if (options.summary) {
      const rows = await store.summary();
      if (rows.length === 0) {
        console.log("还没有反馈记录。");
        return;
      }

      for (const row of rows) {
        console.log(`${row.type} | ${row.count} 条 | 平均 ${row.average}/5`);
      }
      return;
    }

    const rows = await store.list({
      target: options.target,
      type: options.type,
      limit: Number(options.limit)
    });

    if (rows.length === 0) {
      console.log("没有匹配的反馈记录。");
      return;
    }

    for (const row of rows) {
      const note = row.note ? ` | ${row.note}` : "";
      console.log(`${row.createdAt} | ${row.type} | ${row.target} | ${row.rating}/5${note}`);
    }
  });

type CliOptions = {
  url: string;
  limit: string;
  categoryId?: string;
  gender?: string;
  rankMold?: string;
};

type AgentRunOptions = {
  goal: AgentRunGoal;
  crawl: boolean;
  crawlLimit: number;
  delayMs: number;
  teardownLimit: number;
  sampleLimit: number;
  liveAi: boolean;
};

type AgentRunStepOutcome = {
  status?: AgentRunStepStatus;
  detail: string;
  outputPath?: string;
};

type AgentRunResult = {
  reportPath: string;
  steps: AgentRunStep[];
};

async function runAgentOrchestrator(options: AgentRunOptions): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const steps: AgentRunStep[] = [];

  if (options.goal === "daily") {
    if (options.crawl) {
      await recordAgentStep(steps, "抓取公开榜单", async () => {
        await crawlAll(options.crawlLimit, options.delayMs);
        return {
          detail: `抓取全部内置榜单，每榜 ${options.crawlLimit} 条`
        };
      });
    } else {
      appendAgentStep(steps, {
        name: "抓取公开榜单",
        status: "skipped",
        detail: "未传 --crawl，本轮只使用本地已有数据"
      });
    }

    await runScanGoal(steps, options.liveAi);
    await runTeardownGoal(steps, options.teardownLimit, options.liveAi);
    await runTextTeardownGoal(steps, options.sampleLimit, options.liveAi);
    await runFeedbackReviewGoal(steps);
    await runIdeaGoal(steps, options.teardownLimit, options.sampleLimit, options.liveAi);
  }

  if (options.goal === "scan") {
    await runScanGoal(steps, options.liveAi);
  }

  if (options.goal === "teardown") {
    await runTeardownGoal(steps, options.teardownLimit, options.liveAi);
  }

  if (options.goal === "text-teardown") {
    await runTextTeardownGoal(steps, options.sampleLimit, options.liveAi);
  }

  if (options.goal === "feedback-review") {
    await runFeedbackReviewGoal(steps);
  }

  if (options.goal === "idea") {
    await runIdeaGoal(steps, options.teardownLimit, options.sampleLimit, options.liveAi);
  }

  const completedAt = new Date().toISOString();
  const reportPath = await writeAgentRunReport(
    {
      goal: options.goal,
      startedAt,
      completedAt,
      options: {
        crawl: options.crawl,
        aiMode: options.liveAi ? "live" : "dry-run",
        teardownLimit: options.teardownLimit,
        sampleLimit: options.sampleLimit
      },
      steps,
      nextActions: buildAgentRunNextActions(options.goal, steps)
    },
    config.reportDir
  );

  return { reportPath, steps };
}

async function runScanGoal(
  steps: AgentRunStep[],
  liveAi: boolean
): Promise<void> {
  await recordAgentStep(steps, "规则扫榜 Agent 报告", async () => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);
      if (!batch) {
        return {
          status: "skipped",
          detail: "没有可用榜单批次，请先运行 crawl:all 或 agent:run -- --crawl"
        };
      }

      const reportPath = await generateAgentReport(batch, db);
      return {
        detail: `基于批次 ${batch.id} 生成作者决策扫榜报告`,
        outputPath: reportPath
      };
    } finally {
      db.close();
    }
  });

  await recordAgentStep(steps, liveAi ? "AI 扫榜报告" : "AI 扫榜 Prompt", async () => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);
      if (!batch) {
        return {
          status: "skipped",
          detail: "没有可用榜单批次，跳过 AI 扫榜"
        };
      }

      const reportPath = await generateAiScanReport(batch, db, !liveAi);
      return {
        detail: liveAi
          ? `调用模型分析批次 ${batch.id}`
          : `为批次 ${batch.id} 生成可审核 prompt`,
        outputPath: reportPath
      };
    } finally {
      db.close();
    }
  });
}

async function runTeardownGoal(
  steps: AgentRunStep[],
  limit: number,
  liveAi: boolean
): Promise<void> {
  await recordAgentStep(steps, "规则榜单拆书报告", async () => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);
      if (!batch) {
        return {
          status: "skipped",
          detail: "没有可用榜单批次，请先运行 crawl:all 或 agent:run -- --crawl"
        };
      }

      const reportPath = await generateBookTeardownReport(batch, db, limit);
      return {
        detail: `基于批次 ${batch.id} 生成 ${limit} 个榜单拆书目标`,
        outputPath: reportPath
      };
    } finally {
      db.close();
    }
  });

  await recordAgentStep(
    steps,
    liveAi ? "AI 榜单拆书报告" : "AI 榜单拆书 Prompt",
    async () => {
      const db = openDb();
      try {
        const batch = await loadLatestBatch(db);
        if (!batch) {
          return {
            status: "skipped",
            detail: "没有可用榜单批次，跳过 AI 榜单拆书"
          };
        }

        const reportPath = await generateAiTeardownReport(batch, db, limit, !liveAi);
        return {
          detail: liveAi
            ? `调用模型拆解批次 ${batch.id} 的 ${limit} 个目标`
            : `为批次 ${batch.id} 的 ${limit} 个目标生成可审核 prompt`,
          outputPath: reportPath
        };
      } finally {
        db.close();
      }
    }
  );
}

async function runTextTeardownGoal(
  steps: AgentRunStep[],
  sampleLimit: number,
  liveAi: boolean
): Promise<void> {
  await recordAgentStep(steps, "规则本地文本拆书报告", async () => {
    const selected = (await openSamples().list()).slice(0, sampleLimit);
    if (selected.length === 0) {
      return {
        status: "skipped",
        detail: "没有本地开局样本，请先运行 sample:add 或 sample:import-dir"
      };
    }

    const reportPaths: string[] = [];
    for (const sample of selected) {
      const item = await findLatestBookItem(sample.bookId);
      reportPaths.push(
        await writeTextTeardownReport({
          sample,
          item,
          outputDir: config.reportDir
        })
      );
    }

    return {
      detail: `生成 ${selected.length} 份本地文本拆书报告`,
      outputPath: reportPaths.at(-1)
    };
  });

  await recordAgentStep(
    steps,
    liveAi ? "AI 本地文本拆书报告" : "AI 本地文本拆书 Prompt",
    async () => {
      const [sample] = (await openSamples().list()).slice(0, sampleLimit);
      if (!sample) {
        return {
          status: "skipped",
          detail: "没有本地开局样本，跳过 AI 文本拆书"
        };
      }

      const item = await findLatestBookItem(sample.bookId);
      const reportPath = await writeAiTextTeardownReport({
        sample,
        item,
        outputDir: config.reportDir,
        modelConfig: makeModelConfig(process.env),
        dryRun: !liveAi
      });

      return {
        detail: liveAi
          ? `调用模型拆解样本 ${sample.title ?? sample.bookId}`
          : `为样本 ${sample.title ?? sample.bookId} 生成可审核 prompt`,
        outputPath: reportPath
      };
    }
  );
}

async function runFeedbackReviewGoal(steps: AgentRunStep[]): Promise<void> {
  await recordAgentStep(steps, "反馈记忆汇总", async () => {
    const store = openFeedback();
    const summary = await store.summary();
    const recent = await store.list({ limit: 5 });

    if (summary.length === 0) {
      return {
        status: "skipped",
        detail: "还没有反馈记录；下一轮请用 feedback:add 给报告打分"
      };
    }

    return {
      detail: [
        `反馈类型 ${summary.length} 类，最近 ${recent.length} 条`,
        summary
          .map((row) => `${row.type}: ${row.count} 条，均分 ${row.average}/5`)
          .join("；")
      ].join("；")
    };
  });
}

async function runIdeaGoal(
  steps: AgentRunStep[],
  limit: number,
  sampleLimit: number,
  liveAi: boolean
): Promise<void> {
  await recordAgentStep(steps, "规则原创选题卡", async () => {
    const db = openDb();
    try {
      const batch = await loadLatestBatch(db);
      if (!batch) {
        return {
          status: "skipped",
          detail: "没有可用榜单批次，请先运行 crawl:all 或 agent:run -- --crawl"
        };
      }

      const reportPath = await generateIdeasReport(batch, db, limit, sampleLimit, 20);
      return {
        detail: `生成 ${limit} 张原创选题卡`,
        outputPath: reportPath
      };
    } finally {
      db.close();
    }
  });

  await recordAgentStep(
    steps,
    liveAi ? "AI 原创选题卡" : "AI 原创选题 Prompt",
    async () => {
      const db = openDb();
      try {
        const batch = await loadLatestBatch(db);
        if (!batch) {
          return {
            status: "skipped",
            detail: "没有可用榜单批次，跳过 AI 选题"
          };
        }

        const reportPath = await generateAiIdeasReport(
          batch,
          db,
          limit,
          sampleLimit,
          20,
          !liveAi
        );
        return {
          detail: liveAi
            ? `调用模型生成 ${limit} 张原创选题卡`
            : `生成 ${limit} 张原创选题 prompt`,
          outputPath: reportPath
        };
      } finally {
        db.close();
      }
    }
  );
}

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
  const analysis = buildBatchAnalysis(batch, db);
  return writeScanReport(batch, analysis, config.reportDir);
}

async function generateAgentReport(
  batch: RankBatch,
  db: SqliteRankStore
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  return writeAgentScanReport(batch, analysis, config.reportDir);
}

async function generateBookTeardownReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  return writeBookTeardownReport(batch, analysis, config.reportDir, limit);
}

async function generateAiScanReport(
  batch: RankBatch,
  db: SqliteRankStore,
  dryRun: boolean
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  return writeAiScanReport({
    batch,
    analysis,
    outputDir: config.reportDir,
    modelConfig: makeModelConfig(process.env),
    dryRun
  });
}

async function generateAiTeardownReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number,
  dryRun: boolean
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  return writeAiTeardownReport({
    batch,
    analysis,
    outputDir: config.reportDir,
    modelConfig: makeModelConfig(process.env),
    dryRun,
    limit
  });
}

async function generateIdeaReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number,
  sampleLimit: number,
  feedbackLimit: number
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  const samples = (await openSamples().list()).slice(0, sampleLimit);
  const feedback = await openFeedback().list({ limit: feedbackLimit });

  return writeIdeaReport({
    batch,
    analysis,
    samples,
    feedback,
    outputDir: config.reportDir,
    limit
  });
}

async function generateAiIdeaReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number,
  sampleLimit: number,
  feedbackLimit: number,
  dryRun: boolean
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  const samples = (await openSamples().list()).slice(0, sampleLimit);
  const feedback = await openFeedback().list({ limit: feedbackLimit });

  return writeAiIdeaReport({
    batch,
    analysis,
    samples,
    feedback,
    outputDir: config.reportDir,
    modelConfig: makeModelConfig(process.env),
    dryRun,
    limit
  });
}

async function generateIdeasReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number,
  sampleLimit: number,
  feedbackLimit: number
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  const samples = (await openSamples().list()).slice(0, sampleLimit);
  const feedback = await openFeedback().list({ limit: feedbackLimit });
  const sourceReports = await readLatestIdeaSourceReports(config.reportDir);

  return writeIdeasReport({
    batch,
    analysis,
    samples,
    feedback,
    sourceReports,
    outputDir: config.reportDir,
    limit
  });
}

async function generateAiIdeasReport(
  batch: RankBatch,
  db: SqliteRankStore,
  limit: number,
  sampleLimit: number,
  feedbackLimit: number,
  dryRun: boolean
): Promise<string> {
  const analysis = buildBatchAnalysis(batch, db);
  const samples = (await openSamples().list()).slice(0, sampleLimit);
  const feedback = await openFeedback().list({ limit: feedbackLimit });
  const sourceReports = await readLatestIdeaSourceReports(config.reportDir);

  return writeAiIdeasReport({
    batch,
    analysis,
    samples,
    feedback,
    sourceReports,
    outputDir: config.reportDir,
    modelConfig: makeModelConfig(process.env),
    dryRun,
    limit
  });
}

function buildBatchAnalysis(
  batch: RankBatch,
  db: SqliteRankStore
) {
  const previousByRankName = new Map<string, RankSnapshot | undefined>();

  for (const snapshot of batch.snapshots) {
    previousByRankName.set(
      snapshot.rankName,
      db.getPreviousSnapshotForRank(snapshot.rankName, snapshot.capturedAt)
    );
  }

  return summarizeBatch(batch, previousByRankName);
}

async function loadLatestBatch(db: SqliteRankStore): Promise<RankBatch | undefined> {
  const batch = db.getLatestBatch();
  if (batch) return batch;

  const jsonStore = new JsonSnapshotStore(config.dataDir);
  const latestBatch = await jsonStore.readLatestBatch();
  if (!latestBatch) return undefined;

  db.saveBatch(latestBatch);
  return latestBatch;
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

function openSamples(): SampleStore {
  return new SampleStore(config.sampleDir);
}

function openFeedback(): FeedbackStore {
  return new FeedbackStore(config.feedbackDir);
}

async function findLatestBookItem(bookId: string): Promise<RankingItem | undefined> {
  const db = openDb();
  try {
    const batch = await loadLatestBatch(db);
    if (!batch) return undefined;

    for (const snapshot of batch.snapshots) {
      const item = snapshot.items.find((candidate) => candidate.bookId === bookId);
      if (item) return item;
    }

    return undefined;
  } finally {
    db.close();
  }
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

function parseAgentRunGoal(value: string): AgentRunGoal {
  if (agentRunGoals.includes(value as AgentRunGoal)) {
    return value as AgentRunGoal;
  }

  throw new Error(`--goal must be one of: ${agentRunGoals.join(", ")}`);
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

async function recordAgentStep(
  steps: AgentRunStep[],
  name: string,
  run: () => Promise<AgentRunStepOutcome>
): Promise<void> {
  const startedAt = new Date().toISOString();

  try {
    const outcome = await run();
    steps.push({
      name,
      status: outcome.status ?? "done",
      detail: outcome.detail,
      outputPath: outcome.outputPath,
      startedAt,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    steps.push({
      name,
      status: "failed",
      detail: formatError(error),
      startedAt,
      completedAt: new Date().toISOString()
    });
  }
}

function appendAgentStep(
  steps: AgentRunStep[],
  step: {
    name: string;
    status: AgentRunStepStatus;
    detail: string;
    outputPath?: string;
  }
): void {
  const now = new Date().toISOString();
  steps.push({
    ...step,
    startedAt: now,
    completedAt: now
  });
}

function buildAgentRunNextActions(
  goal: AgentRunGoal,
  steps: AgentRunStep[]
): string[] {
  const failed = steps.filter((step) => step.status === "failed");
  if (failed.length > 0) {
    return [
      `先处理失败步骤：${failed.map((step) => step.name).join("、")}`,
      "修复后重新运行相同的 agent:run 目标，确认报告变成完成状态"
    ];
  }

  const skipped = steps.filter((step) => step.status === "skipped");
  const missingInputs = skipped.filter((step) => step.name !== "抓取公开榜单");
  const actions: string[] = [];

  if (missingInputs.length > 0) {
    actions.push(
      `补齐被跳过的输入：${missingInputs.map((step) => step.name).join("、")}`
    );
  }

  if (skipped.some((step) => step.name === "抓取公开榜单")) {
    actions.push("需要当天新榜单数据时，重跑 agent:run -- --goal daily --crawl");
  }

  if (goal === "daily" || goal === "scan") {
    actions.push("审阅 latest-agent-scan 和 AI 扫榜 prompt，挑 1-3 个题材方向进入拆书");
  }

  if (goal === "daily" || goal === "teardown" || goal === "text-teardown" || goal === "idea") {
    actions.push("对最有价值的拆书报告记录 feedback:add，形成可被下一轮读取的偏好记忆");
  }

  if (goal === "daily" || goal === "idea") {
    actions.push("审阅 latest-idea-report，给最想继续开发的选题卡记录 feedback:add --type idea");
  }

  if (goal === "feedback-review") {
    actions.push("把低分反馈对应的 prompt 或规则模板列为下一轮代码改进目标");
  }

  actions.push("下一阶段可以新增 RecipeAgent：把高分选题卡扩展成章节节奏表和第一章大纲");
  return actions;
}

program.parseAsync().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
