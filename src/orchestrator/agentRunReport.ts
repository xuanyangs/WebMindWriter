import fs from "node:fs/promises";
import path from "node:path";

export type AgentRunGoal =
  | "daily"
  | "scan"
  | "teardown"
  | "text-teardown"
  | "feedback-review"
  | "idea"
  | "recipe"
  | "project"
  | "writing"
  | "ui"
  | "cloud"
  | "cloud-contract"
  | "cloud-quota"
  | "cloud-admin"
  | "cloud-auth"
  | "cloud-services"
  | "cloud-http"
  | "cloud-http-server"
  | "cloud-http-auth"
  | "cloud-http-ideas"
  | "cloud-http-recipes"
  | "cloud-http-projects"
  | "cloud-http-writing"
  | "cloud-http-validation"
  | "cloud-http-project-detail"
  | "cloud-http-project-chapter"
  | "cloud-http-project-chapter-save"
  | "cloud-http-project-chapter-revisions"
  | "cloud-http-project-chapter-revision-read"
  | "cloud-http-project-chapter-revision-restore";

export type AgentRunStepStatus = "done" | "skipped" | "failed";

export type AgentRunStep = {
  name: string;
  status: AgentRunStepStatus;
  detail: string;
  outputPath?: string;
  startedAt: string;
  completedAt: string;
};

export type AgentRunReport = {
  goal: AgentRunGoal;
  startedAt: string;
  completedAt: string;
  options: {
    crawl: boolean;
    aiMode: "dry-run" | "live";
    teardownLimit: number;
    sampleLimit: number;
  };
  steps: AgentRunStep[];
  nextActions: string[];
};

export async function writeAgentRunReport(
  report: AgentRunReport,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = renderAgentRunReport(report);
  const latestPath = path.join(outputDir, "latest-agent-run.md");
  const latestJsonPath = path.join(outputDir, "latest-agent-run.json");
  const archivePath = path.join(
    outputDir,
    `${compactTime(report.completedAt)}-agent-run.md`
  );
  const archiveJsonPath = path.join(
    outputDir,
    `${compactTime(report.completedAt)}-agent-run.json`
  );

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");
  await fs.writeFile(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(archiveJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return latestPath;
}

export function renderAgentRunReport(report: AgentRunReport): string {
  const lines: string[] = [
    "# Agent Orchestrator Run",
    "",
    `- 目标：${report.goal}`,
    `- 开始：${report.startedAt}`,
    `- 完成：${report.completedAt}`,
    `- 抓取：${report.options.crawl ? "enabled" : "disabled"}`,
    `- AI：${report.options.aiMode}`,
    `- 榜单拆书数量：${report.options.teardownLimit}`,
    `- 本地样本数量：${report.options.sampleLimit}`,
    "",
    "## 执行结果",
    "",
    "| 步骤 | 状态 | 说明 | 产物 |",
    "| --- | --- | --- | --- |"
  ];

  for (const step of report.steps) {
    lines.push(
      `| ${escapeCell(step.name)} | ${renderStatus(step.status)} | ${escapeCell(
        step.detail
      )} | ${escapeCell(step.outputPath ?? "")} |`
    );
  }

  lines.push("", "## 下一步", "");

  for (const action of report.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("");
  return lines.join("\n");
}

function renderStatus(status: AgentRunStepStatus): string {
  if (status === "done") return "完成";
  if (status === "skipped") return "跳过";
  return "失败";
}

function compactTime(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}
