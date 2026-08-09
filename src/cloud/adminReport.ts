import fs from "node:fs/promises";
import path from "node:path";

export type AdminMetric = {
  name: string;
  value: string | number;
  status: "ok" | "warn" | "blocked";
  detail: string;
};

export type CloudAdminReport = {
  generatedAt: string;
  scope: "local-admin-preview";
  metrics: AdminMetric[];
  adminViews: {
    name: string;
    purpose: string;
    source: string[];
  }[];
  auditChecks: string[];
  nextActions: string[];
};

export async function writeCloudAdminReport(options: {
  cloudDir: string;
  reportDir: string;
  projectDir: string;
}): Promise<{
  jsonPath: string;
  reportPath: string;
  admin: CloudAdminReport;
}> {
  await fs.mkdir(options.cloudDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const admin = await buildCloudAdminReport(options);
  const jsonPath = path.join(options.cloudDir, "admin-overview.json");
  const reportPath = path.join(options.reportDir, "latest-cloud-admin.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(admin, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderCloudAdminReport(admin, jsonPath), "utf8");

  return { jsonPath, reportPath, admin };
}

async function buildCloudAdminReport(options: {
  cloudDir: string;
  reportDir: string;
  projectDir: string;
}): Promise<CloudAdminReport> {
  const readiness = await readJson(path.join(options.cloudDir, "cloud-readiness.json"));
  const contract = await readJson(path.join(options.cloudDir, "api-contract.json"));
  const quota = await readJson(path.join(options.cloudDir, "quota-report.json"));
  const latestRun = await readJson(path.join(options.reportDir, "latest-agent-run.json"));
  const projectCount = await countProjectDirs(options.projectDir);
  const reportCount = await countFiles(options.reportDir, ".md");
  const cloudJsonCount = await countFiles(options.cloudDir, ".json");
  const endpointCount = Array.isArray(contract?.endpoints) ? contract.endpoints.length : 0;
  const quotaAlerts = Array.isArray(quota?.alerts) ? quota.alerts.length : 0;
  const failedSteps = Array.isArray(latestRun?.steps)
    ? latestRun.steps.filter((step: { status?: string }) => step.status === "failed").length
    : 0;

  const metrics: AdminMetric[] = [
    {
      name: "deployable",
      value: readiness?.deployable === true ? "yes" : "no",
      status: readiness?.deployable === true ? "ok" : "warn",
      detail: "本地闭环脚本是否齐全"
    },
    {
      name: "apiEndpoints",
      value: endpointCount,
      status: endpointCount >= 8 ? "ok" : "warn",
      detail: "Cloud API Contract 中登记的端点数量"
    },
    {
      name: "quotaAlerts",
      value: quotaAlerts,
      status: quotaAlerts > 0 ? "warn" : "ok",
      detail: "额度报告中的提醒数量"
    },
    {
      name: "latestRunFailedSteps",
      value: failedSteps,
      status: failedSteps > 0 ? "blocked" : "ok",
      detail: "最近一次 agent:run 的失败步骤数"
    },
    {
      name: "localProjects",
      value: projectCount,
      status: projectCount > 0 ? "ok" : "warn",
      detail: "本地小说项目数量"
    },
    {
      name: "localReports",
      value: reportCount,
      status: reportCount > 0 ? "ok" : "warn",
      detail: "本地 Markdown 报告数量"
    },
    {
      name: "cloudJsonArtifacts",
      value: cloudJsonCount,
      status: cloudJsonCount >= 3 ? "ok" : "warn",
      detail: "本地云化 JSON 产物数量"
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    scope: "local-admin-preview",
    metrics,
    adminViews: [
      {
        name: "用户与项目",
        purpose: "查看用户、项目数量和最近写作状态",
        source: ["projects/<project-id>/project.json", "latest-agent-run.json"]
      },
      {
        name: "额度与模型调用",
        purpose: "查看 run、prompt、live-ai、抓榜和章节写入计量",
        source: ["cloud/quota-report.json"]
      },
      {
        name: "任务与报告",
        purpose: "查看最近 agent:run 步骤、失败原因和报告索引",
        source: ["reports/latest-agent-run.json", "reports/*.md"]
      },
      {
        name: "云化与审计",
        purpose: "查看 API 契约、上传边界、权限和版权提醒",
        source: ["cloud/cloud-readiness.json", "cloud/api-contract.json"]
      }
    ],
    auditChecks: [
      "reports、projects、feedback、samples 默认仍为本地私有",
      "管理员视图只展示摘要和路径，不直接展示正文",
      "live-ai 和 --crawl 必须显式开启并记录到 run",
      "真实登录上线前必须增加 userId、projectOwnerId 和 role"
    ],
    nextActions: [
      "把 adminViews 转成 Desktop UI 的管理页",
      "为用户、项目、报告、额度设计数据库表",
      "选择 Auth provider 后把 permissions 映射到 session role",
      "把 CLI 生成逻辑抽成可被 HTTP handler 调用的 service 层"
    ]
  };
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function countProjectDirs(projectDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch (error) {
    if (isMissingFile(error)) return 0;
    throw error;
  }
}

async function countFiles(dir: string, extension: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).length;
  } catch (error) {
    if (isMissingFile(error)) return 0;
    throw error;
  }
}

function renderCloudAdminReport(admin: CloudAdminReport, jsonPath: string): string {
  return [
    "# Cloud Admin Report",
    "",
    `- 生成时间：${admin.generatedAt}`,
    `- 范围：${admin.scope}`,
    `- JSON 报告：${jsonPath}`,
    "",
    "## Metrics",
    "",
    "| Metric | Value | Status | Detail |",
    "| --- | ---: | --- | --- |",
    ...admin.metrics.map(
      (metric) => `| ${metric.name} | ${metric.value} | ${metric.status} | ${metric.detail} |`
    ),
    "",
    "## Admin Views",
    "",
    "| View | Purpose | Source |",
    "| --- | --- | --- |",
    ...admin.adminViews.map(
      (view) => `| ${view.name} | ${view.purpose} | ${view.source.join("<br>")} |`
    ),
    "",
    "## Audit Checks",
    "",
    renderList(admin.auditChecks),
    "",
    "## Next Actions",
    "",
    renderList(admin.nextActions),
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
