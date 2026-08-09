import fs from "node:fs/promises";
import path from "node:path";

export type CloudApiEndpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  purpose: string;
  agentCapability: string;
  input: string[];
  output: string[];
  permissions: string[];
  quotaCost: string;
  sourceCommands: string[];
};

export type CloudApiContract = {
  generatedAt: string;
  version: string;
  basePath: string;
  providerAgnostic: boolean;
  auth: {
    mode: string;
    notes: string[];
  };
  quota: {
    unit: string;
    counters: string[];
    defaultPolicy: string[];
  };
  storage: {
    entity: string;
    localPath: string;
    cloudTable: string;
    uploadPolicy: string;
  }[];
  endpoints: CloudApiEndpoint[];
  adminViews: string[];
  migrationOrder: string[];
};

export async function writeCloudApiContract(options: {
  cloudDir: string;
  reportDir: string;
}): Promise<{
  jsonPath: string;
  reportPath: string;
  contract: CloudApiContract;
}> {
  await fs.mkdir(options.cloudDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const contract = buildCloudApiContract();
  const jsonPath = path.join(options.cloudDir, "api-contract.json");
  const reportPath = path.join(options.reportDir, "latest-cloud-contract.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderCloudApiContract(contract, jsonPath), "utf8");

  return { jsonPath, reportPath, contract };
}

function buildCloudApiContract(): CloudApiContract {
  const endpoints: CloudApiEndpoint[] = [
    {
      id: "health",
      method: "GET",
      path: "/api/health",
      purpose: "检查服务、数据库和模型配置是否可用",
      agentCapability: "system",
      input: [],
      output: ["status", "version", "database", "modelMode"],
      permissions: ["public"],
      quotaCost: "free",
      sourceCommands: []
    },
    {
      id: "run-daily",
      method: "POST",
      path: "/api/runs/daily",
      purpose: "编排扫榜、拆书、选题、配方、项目、写作、UI 和云化检查",
      agentCapability: "orchestrator",
      input: ["crawl", "liveAi", "teardownLimit", "sampleLimit"],
      output: ["runId", "reportPath", "steps", "nextActions"],
      permissions: ["author"],
      quotaCost: "1 run + optional model tokens",
      sourceCommands: ["agent:run -- --goal daily"]
    },
    {
      id: "ideas",
      method: "POST",
      path: "/api/ideas",
      purpose: "读取扫榜、拆书和反馈，生成原创新书选题卡",
      agentCapability: "IdeaAgent",
      input: ["limit", "sampleLimit", "dryRun"],
      output: ["ideaCards", "reportPath", "promptPath"],
      permissions: ["author"],
      quotaCost: "1 analysis + optional model tokens",
      sourceCommands: ["agent:ideas", "agent:ideas:ai"]
    },
    {
      id: "recipe",
      method: "POST",
      path: "/api/recipes",
      purpose: "把最高价值选题卡转成可执行写作配方",
      agentCapability: "RecipeAgent",
      input: ["ideaId", "dryRun"],
      output: ["recipe", "reportPath", "promptPath"],
      permissions: ["author"],
      quotaCost: "1 analysis + optional model tokens",
      sourceCommands: ["agent:recipe", "agent:recipe:ai"]
    },
    {
      id: "project-create",
      method: "POST",
      path: "/api/projects",
      purpose: "基于写作配方创建本地/云端小说项目",
      agentCapability: "NovelProject",
      input: ["slug", "recipeId"],
      output: ["projectId", "projectPath", "reportPath"],
      permissions: ["author"],
      quotaCost: "1 project write",
      sourceCommands: ["agent:project:create"]
    },
    {
      id: "project-read",
      method: "GET",
      path: "/api/projects/{projectId}",
      purpose: "读取小说项目、配方、纲要、记忆和章节状态",
      agentCapability: "NovelProject",
      input: ["projectId"],
      output: ["project", "outline", "memory", "chapters"],
      permissions: ["project-owner"],
      quotaCost: "free",
      sourceCommands: []
    },
    {
      id: "chapter-write",
      method: "POST",
      path: "/api/projects/{projectId}/chapters",
      purpose: "根据项目资料写章节草稿并维护项目记忆",
      agentCapability: "WritingAgent",
      input: ["projectId", "chapterNumber", "force", "dryRun"],
      output: ["chapterPath", "reportPath", "memoryPatch"],
      permissions: ["project-owner"],
      quotaCost: "1 chapter + optional model tokens",
      sourceCommands: ["agent:write:chapter", "agent:write:chapter:ai"]
    },
    {
      id: "reports-latest",
      method: "GET",
      path: "/api/reports/latest",
      purpose: "返回作者工作台需要展示的最新报告索引",
      agentCapability: "Desktop UI",
      input: ["projectId"],
      output: ["scan", "ideas", "recipe", "project", "writing", "cloud"],
      permissions: ["author"],
      quotaCost: "free",
      sourceCommands: ["agent:ui:build"]
    },
    {
      id: "admin-usage",
      method: "GET",
      path: "/api/admin/usage",
      purpose: "查看用户、项目、模型调用和失败任务的额度情况",
      agentCapability: "admin",
      input: ["from", "to", "userId"],
      output: ["users", "projects", "runs", "modelTokens", "failures"],
      permissions: ["admin"],
      quotaCost: "free",
      sourceCommands: []
    },
    {
      id: "admin-jobs",
      method: "GET",
      path: "/api/admin/jobs",
      purpose: "查看爬虫任务、Agent 运行和最近产物",
      agentCapability: "admin",
      input: ["status", "goal"],
      output: ["jobs", "latestReports"],
      permissions: ["admin"],
      quotaCost: "free",
      sourceCommands: []
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    version: "2026-08-local-contract-v1",
    basePath: "/api",
    providerAgnostic: true,
    auth: {
      mode: "session-token",
      notes: [
        "本地 CLI 暂无登录；云化时所有 author/project-owner/admin 接口必须校验会话",
        "live-ai、抓榜 --crawl 和正文上传必须单独记录授权",
        "管理员接口只允许查看额度、任务和审计摘要，不直接暴露正文"
      ]
    },
    quota: {
      unit: "run/project/chapter/model-token",
      counters: [
        "dailyRunsPerUser",
        "crawlRunsPerDay",
        "modelTokensPerUser",
        "projectsPerUser",
        "chaptersPerProject"
      ],
      defaultPolicy: [
        "dry-run 不消耗模型额度",
        "live-ai 按模型 token 记录",
        "抓榜任务按用户和日期限频",
        "章节写作按项目记录草稿次数"
      ]
    },
    storage: [
      {
        entity: "rank_batches",
        localPath: "data/*.json, data/*.sqlite",
        cloudTable: "rank_batches, rank_items",
        uploadPolicy: "只上传公开榜单元数据"
      },
      {
        entity: "reports",
        localPath: "reports/*.md",
        cloudTable: "reports",
        uploadPolicy: "用户授权后同步报告摘要和路径"
      },
      {
        entity: "projects",
        localPath: "projects/<project-id>/",
        cloudTable: "projects, project_files, chapters",
        uploadPolicy: "默认本地私有，云端同步必须显式开启"
      },
      {
        entity: "feedback",
        localPath: "feedback/*.jsonl",
        cloudTable: "feedback_events",
        uploadPolicy: "可同步结构化评分和备注"
      }
    ],
    endpoints,
    adminViews: [
      "用户和项目概览",
      "模型额度和失败日志",
      "爬虫任务状态",
      "内容授权和版权审计"
    ],
    migrationOrder: [
      "先把 CLI 生成逻辑抽成 service 层",
      "再为 service 层包 HTTP handler",
      "接入用户、项目、报告、额度四类表",
      "最后把本地静态工作台升级为登录后的 Web 工作台"
    ]
  };
}

function renderCloudApiContract(contract: CloudApiContract, jsonPath: string): string {
  return [
    "# Cloud API Contract",
    "",
    `- 生成时间：${contract.generatedAt}`,
    `- 版本：${contract.version}`,
    `- Base Path：${contract.basePath}`,
    `- Provider Agnostic：${contract.providerAgnostic ? "yes" : "no"}`,
    `- JSON 契约：${jsonPath}`,
    "",
    "## 认证边界",
    "",
    `- 模式：${contract.auth.mode}`,
    ...contract.auth.notes.map((note) => `- ${note}`),
    "",
    "## 额度策略",
    "",
    `- 计量单位：${contract.quota.unit}`,
    "",
    "### Counters",
    "",
    renderList(contract.quota.counters),
    "",
    "### Default Policy",
    "",
    renderList(contract.quota.defaultPolicy),
    "",
    "## API Endpoints",
    "",
    "| ID | Method | Path | Capability | Quota | Source Commands |",
    "| --- | --- | --- | --- | --- | --- |",
    ...contract.endpoints.map(
      (endpoint) =>
        `| ${endpoint.id} | ${endpoint.method} | ${endpoint.path} | ${endpoint.agentCapability} | ${endpoint.quotaCost} | ${endpoint.sourceCommands.join("<br>")} |`
    ),
    "",
    "## Storage Mapping",
    "",
    "| Entity | Local Path | Cloud Table | Upload Policy |",
    "| --- | --- | --- | --- |",
    ...contract.storage.map(
      (item) =>
        `| ${item.entity} | ${item.localPath} | ${item.cloudTable} | ${item.uploadPolicy} |`
    ),
    "",
    "## Admin Views",
    "",
    renderList(contract.adminViews),
    "",
    "## Migration Order",
    "",
    renderList(contract.migrationOrder),
    ""
  ].join("\n");
}

function renderList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}
