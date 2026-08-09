import fs from "node:fs/promises";
import path from "node:path";

export type CloudReadiness = {
  generatedAt: string;
  phase: "local-first" | "cloud-ready";
  deployable: boolean;
  missing: string[];
  capabilities: string[];
  requiredEnv: string[];
  dataPolicy: string[];
  quotaPolicy: string[];
  adminSurface: string[];
  nextSteps: string[];
};

export async function writeCloudReadiness(options: {
  cloudDir: string;
  reportDir: string;
  packageJsonPath: string;
}): Promise<{
  jsonPath: string;
  reportPath: string;
  readiness: CloudReadiness;
}> {
  await fs.mkdir(options.cloudDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const packageJson = JSON.parse(await fs.readFile(options.packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const readiness = buildReadiness(packageJson.scripts ?? {});
  const jsonPath = path.join(options.cloudDir, "cloud-readiness.json");
  const reportPath = path.join(options.reportDir, "latest-cloud.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderCloudReport(readiness, jsonPath), "utf8");

  return { jsonPath, reportPath, readiness };
}

function buildReadiness(scripts: Record<string, string>): CloudReadiness {
  const requiredScripts = [
    "agent:run",
    "agent:ideas",
    "agent:recipe",
    "agent:project:create",
    "agent:write:chapter",
    "agent:ui:build",
    "agent:ui:editor:build",
    "agent:ui:serve",
    "agent:ui:serve:check"
  ];
  const missing = requiredScripts.filter((script) => !scripts[script]);

  return {
    generatedAt: new Date().toISOString(),
    phase: missing.length === 0 ? "cloud-ready" : "local-first",
    deployable: missing.length === 0,
    missing,
    capabilities: [
      "榜单采集和 SQLite 存储",
      "扫榜、拆书、选题、配方、项目、写作闭环",
      "AI dry-run prompt 和 OpenAI-compatible modelClient",
      "本地静态工作台"
    ],
    requiredEnv: [
      "MODEL_BASE_URL",
      "MODEL_API_KEY",
      "MODEL_NAME",
      "DATABASE_PATH",
      "DATA_DIR",
      "REPORT_DIR",
      "PROJECT_DIR",
      "UI_DIR",
      "CLOUD_DIR"
    ],
    dataPolicy: [
      "默认不上传 data、reports、samples、feedback、projects、.env、node_modules",
      "正文样本和章节草稿属于作者本地资产，云化前必须明确授权边界",
      "公开榜单元数据可作为趋势输入，但不能采集或复刻付费正文"
    ],
    quotaPolicy: [
      "按用户、项目、日期记录模型调用次数和 token 预算",
      "默认 dry-run 不消耗模型额度",
      "live-ai 必须显式启用，并记录目标、报告路径和失败原因"
    ],
    adminSurface: [
      "用户列表和项目数量",
      "模型调用额度与失败日志",
      "爬虫任务状态和最近一次采集时间",
      "内容安全与版权边界审计"
    ],
    nextSteps: [
      "选择云提供商和数据库：例如 Vercel/Supabase 或 Cloudflare/Neon",
      "拆分本地 CLI 核心为可被 HTTP API 调用的 service 层",
      "增加用户、项目、报告、额度四类表结构",
      "把 Desktop UI 升级为登录后的 Web 工作台"
    ]
  };
}

function renderCloudReport(readiness: CloudReadiness, jsonPath: string): string {
  return [
    "# Cloud Readiness 报告",
    "",
    `- 生成时间：${readiness.generatedAt}`,
    `- 阶段：${readiness.phase}`,
    `- 可进入云化设计：${readiness.deployable ? "yes" : "no"}`,
    `- JSON 清单：${jsonPath}`,
    "",
    "## 已具备能力",
    "",
    renderList(readiness.capabilities),
    "",
    "## 缺失项",
    "",
    readiness.missing.length > 0 ? renderList(readiness.missing) : "暂无脚本缺失。",
    "",
    "## 环境变量",
    "",
    renderList(readiness.requiredEnv),
    "",
    "## 数据边界",
    "",
    renderList(readiness.dataPolicy),
    "",
    "## 额度策略",
    "",
    renderList(readiness.quotaPolicy),
    "",
    "## 管理后台",
    "",
    renderList(readiness.adminSurface),
    "",
    "## 下一步",
    "",
    renderList(readiness.nextSteps),
    ""
  ].join("\n");
}

function renderList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}
