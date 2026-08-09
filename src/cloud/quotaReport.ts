import fs from "node:fs/promises";
import path from "node:path";
import type { AgentRunReport, AgentRunStep } from "../orchestrator/agentRunReport.js";

export type QuotaUnit = {
  name: string;
  used: number;
  policy: string;
};

export type CloudQuotaReport = {
  generatedAt: string;
  source: {
    kind: "current-run" | "latest-agent-run-json" | "missing";
    goal: string;
    path?: string;
  };
  usage: {
    totalSteps: number;
    doneSteps: number;
    skippedSteps: number;
    failedSteps: number;
    dryRunPromptEvents: number;
    liveAiEvents: number;
    crawlRuns: number;
    projectWrites: number;
    chapterWrites: number;
  };
  quotaUnits: QuotaUnit[];
  alerts: string[];
  recommendedLimits: QuotaUnit[];
};

export async function writeCloudQuotaReport(options: {
  cloudDir: string;
  reportDir: string;
  source?: {
    goal: string;
    steps: AgentRunStep[];
    aiMode?: "dry-run" | "live";
  };
}): Promise<{
  jsonPath: string;
  reportPath: string;
  quota: CloudQuotaReport;
}> {
  await fs.mkdir(options.cloudDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const source = options.source ?? (await readLatestAgentRun(options.reportDir));
  const quota = buildQuotaReport(source);
  const jsonPath = path.join(options.cloudDir, "quota-report.json");
  const reportPath = path.join(options.reportDir, "latest-cloud-quota.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(quota, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderQuotaReport(quota, jsonPath), "utf8");

  return { jsonPath, reportPath, quota };
}

async function readLatestAgentRun(reportDir: string): Promise<{
  kind: "latest-agent-run-json" | "missing";
  goal: string;
  steps: AgentRunStep[];
  aiMode?: "dry-run" | "live";
  path?: string;
}> {
  const jsonPath = path.join(reportDir, "latest-agent-run.json");

  try {
    const report = JSON.parse(await fs.readFile(jsonPath, "utf8")) as AgentRunReport;
    return {
      kind: "latest-agent-run-json",
      goal: report.goal,
      steps: report.steps,
      aiMode: report.options.aiMode,
      path: jsonPath
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        kind: "missing",
        goal: "unknown",
        steps: []
      };
    }

    throw error;
  }
}

function buildQuotaReport(source: {
  kind?: "current-run" | "latest-agent-run-json" | "missing";
  goal: string;
  steps: AgentRunStep[];
  aiMode?: "dry-run" | "live";
  path?: string;
}): CloudQuotaReport {
  const doneSteps = source.steps.filter((step) => step.status === "done");
  const skippedSteps = source.steps.filter((step) => step.status === "skipped");
  const failedSteps = source.steps.filter((step) => step.status === "failed");
  const aiSteps = doneSteps.filter((step) => step.name.includes("AI"));
  const dryRunPromptEvents =
    source.aiMode === "live" ? 0 : aiSteps.filter((step) => step.name.includes("Prompt")).length;
  const liveAiEvents = source.aiMode === "live" ? aiSteps.length : 0;
  const crawlRuns = doneSteps.filter((step) => step.name.includes("抓取")).length;
  const projectWrites = doneSteps.filter((step) => step.name.includes("项目")).length;
  const chapterWrites = doneSteps.filter(
    (step) => step.name.includes("章节") && !step.name.includes("AI")
  ).length;

  const quotaUnits: QuotaUnit[] = [
    {
      name: "agentRun",
      used: source.steps.length > 0 ? 1 : 0,
      policy: "每次 orchestrator 执行计 1 次 run"
    },
    {
      name: "agentStep",
      used: doneSteps.length,
      policy: "每个完成步骤计 1 次 step"
    },
    {
      name: "dryRunPrompt",
      used: dryRunPromptEvents,
      policy: "dry-run prompt 只计审阅事件，不计模型 token"
    },
    {
      name: "liveAiCall",
      used: liveAiEvents,
      policy: "live-ai 步骤后续按模型 token 细分"
    },
    {
      name: "crawlRun",
      used: crawlRuns,
      policy: "真实抓榜任务按用户和日期限频"
    },
    {
      name: "projectWrite",
      used: projectWrites,
      policy: "项目创建和项目资料更新按项目写入计量"
    },
    {
      name: "chapterWrite",
      used: chapterWrites,
      policy: "章节草稿写入按项目和章节计量"
    }
  ];

  const alerts: string[] = [];
  if (source.steps.length === 0) {
    alerts.push("没有可用的 latest-agent-run.json；请先运行 agent:run。");
  }
  if (failedSteps.length > 0) {
    alerts.push(`存在失败步骤：${failedSteps.map((step) => step.name).join("、")}`);
  }
  if (skippedSteps.some((step) => step.name.includes("抓取"))) {
    alerts.push("本轮未启用 --crawl，抓榜额度未消耗。");
  }
  if (source.aiMode !== "live") {
    alerts.push("本轮为 dry-run，模型 token 额度未消耗。");
  }

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kind: source.kind ?? "current-run",
      goal: source.goal,
      path: source.path
    },
    usage: {
      totalSteps: source.steps.length,
      doneSteps: doneSteps.length,
      skippedSteps: skippedSteps.length,
      failedSteps: failedSteps.length,
      dryRunPromptEvents,
      liveAiEvents,
      crawlRuns,
      projectWrites,
      chapterWrites
    },
    quotaUnits,
    alerts,
    recommendedLimits: [
      {
        name: "dailyRunsPerUser",
        used: 10,
        policy: "MVP 阶段每用户每天 10 次完整 daily run"
      },
      {
        name: "crawlRunsPerUserPerDay",
        used: 3,
        policy: "公开榜单抓取先限制每天 3 次，避免误伤目标站"
      },
      {
        name: "liveAiCallsPerUserPerDay",
        used: 20,
        policy: "真实模型调用按用户每日上限控制"
      },
      {
        name: "chaptersPerProjectPerDay",
        used: 5,
        policy: "每个项目每天最多生成 5 章草稿"
      }
    ]
  };
}

function renderQuotaReport(quota: CloudQuotaReport, jsonPath: string): string {
  return [
    "# Cloud Quota Report",
    "",
    `- 生成时间：${quota.generatedAt}`,
    `- 来源：${quota.source.kind}`,
    `- 目标：${quota.source.goal}`,
    `- 来源文件：${quota.source.path ?? "current run"}`,
    `- JSON 报告：${jsonPath}`,
    "",
    "## Usage",
    "",
    `- totalSteps：${quota.usage.totalSteps}`,
    `- doneSteps：${quota.usage.doneSteps}`,
    `- skippedSteps：${quota.usage.skippedSteps}`,
    `- failedSteps：${quota.usage.failedSteps}`,
    `- dryRunPromptEvents：${quota.usage.dryRunPromptEvents}`,
    `- liveAiEvents：${quota.usage.liveAiEvents}`,
    `- crawlRuns：${quota.usage.crawlRuns}`,
    `- projectWrites：${quota.usage.projectWrites}`,
    `- chapterWrites：${quota.usage.chapterWrites}`,
    "",
    "## Quota Units",
    "",
    "| Unit | Used | Policy |",
    "| --- | ---: | --- |",
    ...quota.quotaUnits.map((unit) => `| ${unit.name} | ${unit.used} | ${unit.policy} |`),
    "",
    "## Alerts",
    "",
    quota.alerts.length > 0 ? renderList(quota.alerts) : "暂无告警。",
    "",
    "## Recommended Limits",
    "",
    "| Limit | Value | Policy |",
    "| --- | ---: | --- |",
    ...quota.recommendedLimits.map(
      (limit) => `| ${limit.name} | ${limit.used} | ${limit.policy} |`
    ),
    ""
  ].join("\n");
}

function renderList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
