import fs from "node:fs/promises";
import path from "node:path";
import { writeCloudAdminReport } from "../cloud/adminReport.js";
import { writeCloudAuthPolicy } from "../cloud/authPolicy.js";
import { writeCloudApiContract } from "../cloud/cloudContract.js";
import { writeCloudQuotaReport } from "../cloud/quotaReport.js";
import { writeCloudReadiness } from "../cloud/cloudReadiness.js";
import type { AgentRunStep } from "../orchestrator/agentRunReport.js";

export type CloudServicePaths = {
  cloudDir: string;
  reportDir: string;
  projectDir: string;
  packageJsonPath: string;
};

export type CloudServiceEntry = {
  id: string;
  callable: string;
  purpose: string;
  cliCommand: string;
  httpTarget: string;
  writes: string[];
};

export async function runCloudReadinessService(paths: CloudServicePaths) {
  return writeCloudReadiness({
    cloudDir: paths.cloudDir,
    reportDir: paths.reportDir,
    packageJsonPath: paths.packageJsonPath
  });
}

export async function runCloudApiContractService(paths: CloudServicePaths) {
  return writeCloudApiContract({
    cloudDir: paths.cloudDir,
    reportDir: paths.reportDir
  });
}

export async function runCloudAuthPolicyService(paths: CloudServicePaths) {
  return writeCloudAuthPolicy({
    cloudDir: paths.cloudDir,
    reportDir: paths.reportDir
  });
}

export async function runCloudQuotaService(
  paths: CloudServicePaths,
  source?: {
    goal: string;
    steps: AgentRunStep[];
    aiMode: "dry-run" | "live";
  }
) {
  return writeCloudQuotaReport({
    cloudDir: paths.cloudDir,
    reportDir: paths.reportDir,
    source
  });
}

export async function runCloudAdminService(paths: CloudServicePaths) {
  return writeCloudAdminReport({
    cloudDir: paths.cloudDir,
    reportDir: paths.reportDir,
    projectDir: paths.projectDir
  });
}

export async function writeCloudServiceRegistry(paths: CloudServicePaths): Promise<{
  jsonPath: string;
  reportPath: string;
  services: CloudServiceEntry[];
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const services = buildCloudServiceRegistry();
  const jsonPath = path.join(paths.cloudDir, "service-registry.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-services.md");

  await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), services }, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderCloudServiceRegistry(services, jsonPath), "utf8");

  return { jsonPath, reportPath, services };
}

function buildCloudServiceRegistry(): CloudServiceEntry[] {
  return [
    {
      id: "cloud-readiness",
      callable: "runCloudReadinessService",
      purpose: "检查本地闭环脚本、环境变量和云化准备状态",
      cliCommand: "agent:cloud:plan",
      httpTarget: "GET /api/admin/cloud/readiness",
      writes: ["cloud/cloud-readiness.json", "reports/latest-cloud.md"]
    },
    {
      id: "cloud-api-contract",
      callable: "runCloudApiContractService",
      purpose: "生成云端 API 端点、权限、额度和存储映射",
      cliCommand: "agent:cloud:contract",
      httpTarget: "GET /api/admin/cloud/api-contract",
      writes: ["cloud/api-contract.json", "reports/latest-cloud-contract.md"]
    },
    {
      id: "cloud-auth-policy",
      callable: "runCloudAuthPolicyService",
      purpose: "生成登录角色、session claims 和路由权限矩阵",
      cliCommand: "agent:cloud:auth",
      httpTarget: "GET /api/admin/cloud/auth-policy",
      writes: ["cloud/auth-policy.json", "reports/latest-cloud-auth.md"]
    },
    {
      id: "cloud-quota",
      callable: "runCloudQuotaService",
      purpose: "根据 agent run 统计 run、prompt、抓榜、项目和章节计量",
      cliCommand: "agent:cloud:quota",
      httpTarget: "GET /api/admin/cloud/quota",
      writes: ["cloud/quota-report.json", "reports/latest-cloud-quota.md"]
    },
    {
      id: "cloud-admin",
      callable: "runCloudAdminService",
      purpose: "汇总管理后台指标、视图、审计检查和下一步",
      cliCommand: "agent:cloud:admin",
      httpTarget: "GET /api/admin/cloud/overview",
      writes: ["cloud/admin-overview.json", "reports/latest-cloud-admin.md"]
    },
    {
      id: "cloud-service-registry",
      callable: "writeCloudServiceRegistry",
      purpose: "暴露 CLI 到 future HTTP handler 的 service 映射",
      cliCommand: "agent:cloud:services",
      httpTarget: "GET /api/admin/cloud/services",
      writes: ["cloud/service-registry.json", "reports/latest-cloud-services.md"]
    }
  ];
}

function renderCloudServiceRegistry(
  services: CloudServiceEntry[],
  jsonPath: string
): string {
  return [
    "# Cloud Service Registry",
    "",
    `- 生成时间：${new Date().toISOString()}`,
    `- JSON 注册表：${jsonPath}`,
    "",
    "## Services",
    "",
    "| ID | Callable | CLI | HTTP Target | Writes |",
    "| --- | --- | --- | --- | --- |",
    ...services.map(
      (service) =>
        `| ${service.id} | ${service.callable} | ${service.cliCommand} | ${service.httpTarget} | ${service.writes.join("<br>")} |`
    ),
    "",
    "## Next Actions",
    "",
    "1. 把 service callable 接入 HTTP handler",
    "2. 为 service 增加 request validation 和 auth middleware",
    "3. 把 report/cloud/project 路径切换为数据库和对象存储",
    ""
  ].join("\n");
}
