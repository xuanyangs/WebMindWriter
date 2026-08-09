import fs from "node:fs/promises";
import path from "node:path";

export type AuthRole = "public" | "author" | "project-owner" | "admin";

export type AuthRouteRule = {
  endpointId: string;
  method: string;
  path: string;
  requiredRoles: AuthRole[];
  dataScope: string;
  audit: string;
};

export type CloudAuthPolicy = {
  generatedAt: string;
  mode: "provider-pending";
  roles: {
    role: AuthRole;
    description: string;
  }[];
  sessionClaims: string[];
  routeRules: AuthRouteRule[];
  providerCandidates: {
    provider: string;
    fit: string;
    tradeoff: string;
  }[];
  securityChecks: string[];
  nextActions: string[];
};

export async function writeCloudAuthPolicy(options: {
  cloudDir: string;
  reportDir: string;
}): Promise<{
  jsonPath: string;
  reportPath: string;
  policy: CloudAuthPolicy;
}> {
  await fs.mkdir(options.cloudDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const contract = await readJson(path.join(options.cloudDir, "api-contract.json"));
  const policy = buildCloudAuthPolicy(contract);
  const jsonPath = path.join(options.cloudDir, "auth-policy.json");
  const reportPath = path.join(options.reportDir, "latest-cloud-auth.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderAuthPolicy(policy, jsonPath), "utf8");

  return { jsonPath, reportPath, policy };
}

function buildCloudAuthPolicy(contract?: Record<string, unknown>): CloudAuthPolicy {
  const endpoints = Array.isArray(contract?.endpoints)
    ? (contract.endpoints as {
        id?: string;
        method?: string;
        path?: string;
        permissions?: string[];
      }[])
    : [];

  return {
    generatedAt: new Date().toISOString(),
    mode: "provider-pending",
    roles: [
      {
        role: "public",
        description: "只允许访问健康检查和公开状态"
      },
      {
        role: "author",
        description: "作者本人，可运行 Agent、查看自己的报告和项目"
      },
      {
        role: "project-owner",
        description: "项目拥有者，可读取和写入指定小说项目"
      },
      {
        role: "admin",
        description: "系统管理员，只看运营摘要、额度和审计，不直接读取正文"
      }
    ],
    sessionClaims: [
      "userId",
      "role",
      "projectIds",
      "quotaPlan",
      "canUseLiveAi",
      "canRunCrawler"
    ],
    routeRules: endpoints.map((endpoint) => {
      const requiredRoles = normalizeRoles(endpoint.permissions ?? []);
      return {
        endpointId: endpoint.id ?? "unknown",
        method: endpoint.method ?? "GET",
        path: endpoint.path ?? "/api/unknown",
        requiredRoles,
        dataScope: describeDataScope(requiredRoles),
        audit: describeAudit(requiredRoles)
      };
    }),
    providerCandidates: [
      {
        provider: "Supabase Auth",
        fit: "适合快速拿到登录、用户表和 Postgres 数据库",
        tradeoff: "需要接受 Supabase 项目结构和 RLS 配置"
      },
      {
        provider: "Clerk",
        fit: "适合快速做成熟登录、组织和角色",
        tradeoff: "数据库仍需另选，免费额度和商业条款需确认"
      },
      {
        provider: "Auth.js",
        fit: "适合自托管和框架自由度",
        tradeoff: "需要自己维护 session、用户表和权限逻辑"
      }
    ],
    securityChecks: [
      "所有 author 接口必须带 userId",
      "所有 project-owner 接口必须校验 projectId 属于当前 userId",
      "所有 admin 接口必须脱敏正文和 prompt 内容",
      "live-ai 和 --crawl 需要额外 capability 开关",
      "反馈、样本、项目正文默认本地私有，云同步必须显式授权"
    ],
    nextActions: [
      "选择 Auth provider",
      "增加 users、projects、sessions、quota_events 表",
      "把 routeRules 接入 HTTP middleware",
      "在 Desktop UI 里增加登录态和角色态"
    ]
  };
}

function normalizeRoles(permissions: string[]): AuthRole[] {
  if (permissions.includes("admin")) return ["admin"];
  if (permissions.includes("project-owner")) return ["project-owner", "admin"];
  if (permissions.includes("author")) return ["author", "admin"];
  return ["public", "author", "project-owner", "admin"];
}

function describeDataScope(roles: AuthRole[]): string {
  if (roles.includes("public")) return "public health metadata";
  if (roles.includes("admin") && roles.length === 1) return "system summary only";
  if (roles.includes("project-owner")) return "current user's owned project";
  if (roles.includes("author")) return "current user's reports and runs";
  return "public health metadata";
}

function describeAudit(roles: AuthRole[]): string {
  if (roles.includes("public")) return "no user audit required";
  if (roles.includes("admin") && roles.length === 1) {
    return "record adminId, filters, and viewed summary";
  }
  if (roles.includes("project-owner")) {
    return "record userId, projectId, action, and artifact path";
  }
  if (roles.includes("author")) {
    return "record userId, goal, aiMode, and quota usage";
  }
  return "no user audit required";
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function renderAuthPolicy(policy: CloudAuthPolicy, jsonPath: string): string {
  return [
    "# Cloud Auth Policy",
    "",
    `- 生成时间：${policy.generatedAt}`,
    `- 模式：${policy.mode}`,
    `- JSON 策略：${jsonPath}`,
    "",
    "## Roles",
    "",
    "| Role | Description |",
    "| --- | --- |",
    ...policy.roles.map((role) => `| ${role.role} | ${role.description} |`),
    "",
    "## Session Claims",
    "",
    renderList(policy.sessionClaims),
    "",
    "## Route Rules",
    "",
    "| Endpoint | Method | Path | Roles | Data Scope | Audit |",
    "| --- | --- | --- | --- | --- | --- |",
    ...policy.routeRules.map(
      (rule) =>
        `| ${rule.endpointId} | ${rule.method} | ${rule.path} | ${rule.requiredRoles.join(", ")} | ${rule.dataScope} | ${rule.audit} |`
    ),
    "",
    "## Provider Candidates",
    "",
    "| Provider | Fit | Tradeoff |",
    "| --- | --- | --- |",
    ...policy.providerCandidates.map(
      (candidate) => `| ${candidate.provider} | ${candidate.fit} | ${candidate.tradeoff} |`
    ),
    "",
    "## Security Checks",
    "",
    renderList(policy.securityChecks),
    "",
    "## Next Actions",
    "",
    renderList(policy.nextActions),
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
