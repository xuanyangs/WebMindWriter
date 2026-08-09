import fs from "node:fs/promises";
import path from "node:path";
import {
  type CloudServicePaths,
  runCloudReadinessService,
  writeCloudServiceRegistry
} from "../services/cloudService.js";

export type CloudHttpRequest = {
  method: "GET" | "POST";
  path: string;
};

export type CloudHttpResponse = {
  status: number;
  body: Record<string, unknown>;
};

export type CloudHttpSmokeResult = {
  generatedAt: string;
  checks: {
    name: string;
    request: CloudHttpRequest;
    status: number;
    ok: boolean;
    detail: string;
  }[];
};

export async function handleCloudHttpRequest(
  request: CloudHttpRequest,
  paths: CloudServicePaths
): Promise<CloudHttpResponse> {
  if (request.method === "GET" && request.path === "/api/health") {
    return {
      status: 200,
      body: {
        ok: true,
        service: "WebMindWriter cloud adapter",
        mode: "local"
      }
    };
  }

  if (request.method === "GET" && request.path === "/api/admin/cloud/readiness") {
    const result = await runCloudReadinessService(paths);
    return {
      status: 200,
      body: {
        ok: result.readiness.deployable,
        reportPath: result.reportPath,
        jsonPath: result.jsonPath,
        readiness: result.readiness
      }
    };
  }

  if (request.method === "GET" && request.path === "/api/admin/cloud/services") {
    const result = await writeCloudServiceRegistry(paths);
    return {
      status: 200,
      body: {
        ok: true,
        reportPath: result.reportPath,
        jsonPath: result.jsonPath,
        services: result.services
      }
    };
  }

  return {
    status: 404,
    body: {
      ok: false,
      error: "Not Found",
      method: request.method,
      path: request.path
    }
  };
}

export async function writeCloudHttpSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const requests: { name: string; request: CloudHttpRequest }[] = [
    {
      name: "health",
      request: {
        method: "GET",
        path: "/api/health"
      }
    },
    {
      name: "readiness",
      request: {
        method: "GET",
        path: "/api/admin/cloud/readiness"
      }
    },
    {
      name: "services",
      request: {
        method: "GET",
        path: "/api/admin/cloud/services"
      }
    },
    {
      name: "not-found",
      request: {
        method: "GET",
        path: "/api/unknown"
      }
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = await handleCloudHttpRequest(item.request, paths);
    const expectedStatus = item.name === "not-found" ? 404 : 200;
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === expectedStatus,
      detail:
        response.status === expectedStatus
          ? "matched expected status"
          : `expected ${expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

function renderHttpSmokeReport(smoke: CloudHttpSmokeResult, jsonPath: string): string {
  return [
    "# Cloud HTTP Adapter Smoke Report",
    "",
    `- 生成时间：${smoke.generatedAt}`,
    `- JSON 报告：${jsonPath}`,
    "",
    "## Checks",
    "",
    "| Check | Method | Path | Status | OK | Detail |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...smoke.checks.map(
      (check) =>
        `| ${check.name} | ${check.request.method} | ${check.request.path} | ${check.status} | ${check.ok ? "yes" : "no"} | ${check.detail} |`
    ),
    "",
    "## Next Actions",
    "",
    "1. 把 handleCloudHttpRequest 接到真实 HTTP server 或 serverless handler",
    "2. 为非 public 路由接入 AuthPolicyAgent 的 role 校验",
    "3. 为 POST Agent 路由增加 request schema validation",
    ""
  ].join("\n");
}
