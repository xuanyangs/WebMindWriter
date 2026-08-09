import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  type CloudServicePaths,
  runCloudReadinessService,
  writeCloudServiceRegistry
} from "../services/cloudService.js";
import { runIdeasService } from "../services/ideaService.js";
import { runProjectService } from "../services/projectService.js";
import { runRecipeService } from "../services/recipeService.js";
import { runWritingService } from "../services/writingService.js";

export type CloudHttpRequest = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  session?: CloudHttpSession;
};

export type CloudHttpResponse = {
  status: number;
  body: Record<string, unknown>;
};

export type CloudHttpRole = "public" | "author" | "project-owner" | "admin";

export type CloudHttpSession = {
  userId: string;
  role: CloudHttpRole;
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

export type CloudHttpServerSmokeResult = CloudHttpSmokeResult & {
  baseUrl: string;
};

export type CloudHttpAuthSmokeResult = CloudHttpSmokeResult;

export type CloudHttpIdeasSmokeResult = CloudHttpSmokeResult;

export type CloudHttpRecipesSmokeResult = CloudHttpSmokeResult;

export type CloudHttpProjectsSmokeResult = CloudHttpSmokeResult;

export type CloudHttpWritingSmokeResult = CloudHttpSmokeResult;

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
    const denied = authorizeCloudRequest(request, ["admin"]);
    if (denied) return denied;

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
    const denied = authorizeCloudRequest(request, ["admin"]);
    if (denied) return denied;

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

  if (request.method === "POST" && request.path === "/api/ideas") {
    const denied = authorizeCloudRequest(request, ["author", "admin"]);
    if (denied) return denied;

    const result = await runIdeasService(paths, {
      limit: readPositiveNumber(request.query?.limit, 5),
      sampleLimit: readPositiveNumber(request.query?.sampleLimit, 8),
      feedbackLimit: readPositiveNumber(request.query?.feedbackLimit, 20)
    });

    if (!result) {
      return {
        status: 409,
        body: {
          ok: false,
          error: "No latest rank batch. Run crawl:all or db:import first."
        }
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        reportPath: result.reportPath,
        batchId: result.batchId,
        capturedAt: result.capturedAt,
        ideaLimit: result.ideaLimit,
        sampleCount: result.sampleCount,
        feedbackCount: result.feedbackCount,
        sourceReportCount: result.sourceReportCount
      }
    };
  }

  if (request.method === "POST" && request.path === "/api/recipes") {
    const denied = authorizeCloudRequest(request, ["author", "admin"]);
    if (denied) return denied;

    try {
      const result = await runRecipeService(
        {
          reportDir: paths.reportDir,
          feedbackDir: paths.feedbackDir
        },
        {
          ideaIndex: readOptionalPositiveNumber(request.query?.ideaIndex),
          feedbackLimit: readPositiveNumber(request.query?.feedbackLimit, 20)
        }
      );

      return {
        status: 200,
        body: {
          ok: true,
          reportPath: result.reportPath,
          ideasPath: result.ideasPath,
          selectedIdeaIndex: result.selectedIdeaIndex,
          selectedIdeaTitle: result.selectedIdeaTitle,
          ideaCount: result.ideaCount,
          feedbackCount: result.feedbackCount
        }
      };
    } catch (error) {
      if (isMissingFile(error)) {
        return {
          status: 409,
          body: {
            ok: false,
            error: "No latest ideas report. Run agent:ideas first."
          }
        };
      }

      throw error;
    }
  }

  if (request.method === "POST" && request.path === "/api/projects") {
    const denied = authorizeCloudRequest(request, ["author", "admin"]);
    if (denied) return denied;

    try {
      const result = await runProjectService(
        {
          reportDir: paths.reportDir,
          projectDir: paths.projectDir
        },
        {
          slug: request.query?.slug,
          title: request.query?.title,
          force: readBoolean(request.query?.force),
          reuseExisting: true
        }
      );

      return {
        status: 200,
        body: {
          ok: true,
          reportPath: result.reportPath,
          recipePath: result.recipePath,
          projectId: result.project.id,
          title: result.project.title,
          genreDirection: result.project.genreDirection,
          projectPath: result.project.paths.root
        }
      };
    } catch (error) {
      if (isMissingFile(error)) {
        return {
          status: 409,
          body: {
            ok: false,
            error: "No latest recipe report. Run agent:recipe first."
          }
        };
      }

      throw error;
    }
  }

  const chapterRoute = matchProjectChaptersRoute(request.path);
  if (request.method === "POST" && chapterRoute) {
    const denied = authorizeCloudRequest(request, ["project-owner", "admin"]);
    if (denied) return denied;

    try {
      const result = await runWritingService(
        {
          reportDir: paths.reportDir,
          projectDir: paths.projectDir
        },
        {
          projectId: chapterRoute.projectId,
          chapterNumber: readPositiveNumber(
            request.query?.chapterNumber ?? request.query?.chapter,
            1
          ),
          force: readBoolean(request.query?.force)
        }
      );

      return {
        status: 200,
        body: {
          ok: true,
          reportPath: result.reportPath,
          projectId: result.project.id,
          chapterNumber: result.chapterNumber,
          chapterPath: result.chapterPath,
          wroteDraft: result.wroteDraft
        }
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Project not found:")) {
        return {
          status: 404,
          body: {
            ok: false,
            error: error.message
          }
        };
      }

      throw error;
    }
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

function authorizeCloudRequest(
  request: CloudHttpRequest,
  allowedRoles: CloudHttpRole[]
): CloudHttpResponse | undefined {
  if (request.session && allowedRoles.includes(request.session.role)) {
    return undefined;
  }

  return {
    status: 403,
    body: {
      ok: false,
      error: "Forbidden",
      requiredRoles: allowedRoles,
      role: request.session?.role ?? "anonymous"
    }
  };
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalPositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function matchProjectChaptersRoute(pathname: string): { projectId: string } | undefined {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/chapters$/);
  if (!match) return undefined;

  return {
    projectId: decodeURIComponent(match[1])
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export function createCloudHttpServer(paths: CloudServicePaths): http.Server {
  return http.createServer((request, response) => {
    void handleNodeRequest(request, response, paths);
  });
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
        path: "/api/admin/cloud/readiness",
        session: adminSession()
      }
    },
    {
      name: "services",
      request: {
        method: "GET",
        path: "/api/admin/cloud/services",
        session: adminSession()
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

export async function writeCloudHttpAuthSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpAuthSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const requests: {
    name: string;
    request: CloudHttpRequest;
    expectedStatus: number;
  }[] = [
    {
      name: "public-health",
      request: {
        method: "GET",
        path: "/api/health"
      },
      expectedStatus: 200
    },
    {
      name: "admin-readiness-allowed",
      request: {
        method: "GET",
        path: "/api/admin/cloud/readiness",
        session: adminSession()
      },
      expectedStatus: 200
    },
    {
      name: "author-readiness-denied",
      request: {
        method: "GET",
        path: "/api/admin/cloud/readiness",
        session: {
          userId: "local-author",
          role: "author"
        }
      },
      expectedStatus: 403
    },
    {
      name: "anonymous-services-denied",
      request: {
        method: "GET",
        path: "/api/admin/cloud/services"
      },
      expectedStatus: 403
    },
    {
      name: "unknown-still-404",
      request: {
        method: "GET",
        path: "/api/unknown"
      },
      expectedStatus: 404
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = await handleCloudHttpRequest(item.request, paths);
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === item.expectedStatus,
      detail:
        response.status === item.expectedStatus
          ? "matched expected status"
          : `expected ${item.expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpAuthSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-auth-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http-auth.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpAuthSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

export async function writeCloudHttpIdeasSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpIdeasSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const requests: {
    name: string;
    request: CloudHttpRequest;
    expectedStatus: number;
  }[] = [
    {
      name: "author-ideas-allowed",
      request: {
        method: "POST",
        path: "/api/ideas",
        query: {
          limit: "3",
          sampleLimit: "4",
          feedbackLimit: "10"
        },
        session: authorSession()
      },
      expectedStatus: 200
    },
    {
      name: "anonymous-ideas-denied",
      request: {
        method: "POST",
        path: "/api/ideas"
      },
      expectedStatus: 403
    },
    {
      name: "get-ideas-not-found",
      request: {
        method: "GET",
        path: "/api/ideas",
        session: authorSession()
      },
      expectedStatus: 404
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = await handleCloudHttpRequest(item.request, paths);
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === item.expectedStatus,
      detail:
        response.status === item.expectedStatus
          ? "matched expected status"
          : `expected ${item.expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpIdeasSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-ideas-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http-ideas.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpIdeasSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

export async function writeCloudHttpRecipesSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpRecipesSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const requests: {
    name: string;
    request: CloudHttpRequest;
    expectedStatus: number;
  }[] = [
    {
      name: "author-recipes-allowed",
      request: {
        method: "POST",
        path: "/api/recipes",
        query: {
          feedbackLimit: "10"
        },
        session: authorSession()
      },
      expectedStatus: 200
    },
    {
      name: "anonymous-recipes-denied",
      request: {
        method: "POST",
        path: "/api/recipes"
      },
      expectedStatus: 403
    },
    {
      name: "get-recipes-not-found",
      request: {
        method: "GET",
        path: "/api/recipes",
        session: authorSession()
      },
      expectedStatus: 404
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = await handleCloudHttpRequest(item.request, paths);
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === item.expectedStatus,
      detail:
        response.status === item.expectedStatus
          ? "matched expected status"
          : `expected ${item.expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpRecipesSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-recipes-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http-recipes.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpRecipesSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

export async function writeCloudHttpProjectsSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpProjectsSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const requests: {
    name: string;
    request: CloudHttpRequest;
    expectedStatus: number;
  }[] = [
    {
      name: "author-projects-allowed",
      request: {
        method: "POST",
        path: "/api/projects",
        session: authorSession()
      },
      expectedStatus: 200
    },
    {
      name: "anonymous-projects-denied",
      request: {
        method: "POST",
        path: "/api/projects"
      },
      expectedStatus: 403
    },
    {
      name: "get-projects-not-found",
      request: {
        method: "GET",
        path: "/api/projects",
        session: authorSession()
      },
      expectedStatus: 404
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = await handleCloudHttpRequest(item.request, paths);
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === item.expectedStatus,
      detail:
        response.status === item.expectedStatus
          ? "matched expected status"
          : `expected ${item.expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpProjectsSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-projects-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http-projects.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpProjectsSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

export async function writeCloudHttpWritingSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpWritingSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const prepareProject = await handleCloudHttpRequest(
    {
      method: "POST",
      path: "/api/projects",
      session: authorSession()
    },
    paths
  );
  const projectId = typeof prepareProject.body.projectId === "string"
    ? prepareProject.body.projectId
    : "missing-project";
  const chapterPath = `/api/projects/${encodeURIComponent(projectId)}/chapters`;
  const requests: {
    name: string;
    request: CloudHttpRequest;
    expectedStatus: number;
  }[] = [
    {
      name: "prepare-project",
      request: {
        method: "POST",
        path: "/api/projects",
        session: authorSession()
      },
      expectedStatus: 200
    },
    {
      name: "project-owner-writing-allowed",
      request: {
        method: "POST",
        path: chapterPath,
        query: {
          chapter: "1"
        },
        session: projectOwnerSession()
      },
      expectedStatus: 200
    },
    {
      name: "author-writing-denied",
      request: {
        method: "POST",
        path: chapterPath,
        query: {
          chapter: "1"
        },
        session: authorSession()
      },
      expectedStatus: 403
    },
    {
      name: "anonymous-writing-denied",
      request: {
        method: "POST",
        path: chapterPath
      },
      expectedStatus: 403
    },
    {
      name: "unknown-project-not-found",
      request: {
        method: "POST",
        path: "/api/projects/not-a-real-project/chapters",
        session: projectOwnerSession()
      },
      expectedStatus: 404
    }
  ];

  const checks = [];
  for (const item of requests) {
    const response = item.name === "prepare-project"
      ? prepareProject
      : await handleCloudHttpRequest(item.request, paths);
    checks.push({
      name: item.name,
      request: item.request,
      status: response.status,
      ok: response.status === item.expectedStatus,
      detail:
        response.status === item.expectedStatus
          ? "matched expected status"
          : `expected ${item.expectedStatus}, received ${response.status}`
    });
  }

  const smoke: CloudHttpWritingSmokeResult = {
    generatedAt: new Date().toISOString(),
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "http-writing-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-cloud-http-writing.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
  await fs.writeFile(reportPath, renderHttpWritingSmokeReport(smoke, jsonPath), "utf8");

  return { jsonPath, reportPath, smoke };
}

export async function writeCloudHttpServerSmokeReport(
  paths: CloudServicePaths
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: CloudHttpServerSmokeResult;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  const server = createCloudHttpServer(paths);
  await listen(server);

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const requests = [
    {
      name: "health",
      path: "/api/health",
      expectedStatus: 200
    },
    {
      name: "services",
      path: "/api/admin/cloud/services",
      expectedStatus: 200,
      role: "admin"
    },
    {
      name: "not-found",
      path: "/api/unknown",
      expectedStatus: 404
    }
  ];

  try {
    const checks = [];
    for (const item of requests) {
      const response = await fetch(`${baseUrl}${item.path}`, {
        headers: item.role ? { "x-webmind-role": item.role } : undefined
      });
      checks.push({
        name: item.name,
        request: {
          method: "GET" as const,
          path: item.path
        },
        status: response.status,
        ok: response.status === item.expectedStatus,
        detail:
          response.status === item.expectedStatus
            ? "matched expected status"
            : `expected ${item.expectedStatus}, received ${response.status}`
      });
    }

    const smoke: CloudHttpServerSmokeResult = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      checks
    };
    const jsonPath = path.join(paths.cloudDir, "http-server-smoke.json");
    const reportPath = path.join(paths.reportDir, "latest-cloud-http-server.md");

    await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
    await fs.writeFile(
      reportPath,
      renderHttpServerSmokeReport(smoke, jsonPath),
      "utf8"
    );

    return { jsonPath, reportPath, smoke };
  } finally {
    await close(server);
  }
}

async function handleNodeRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  paths: CloudServicePaths
): Promise<void> {
  const method = request.method === "POST" ? "POST" : "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const result = await handleCloudHttpRequest(
    {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      session: readSession(request)
    },
    paths
  );

  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(result.body));
}

function readSession(request: http.IncomingMessage): CloudHttpSession | undefined {
  const roleHeader = request.headers["x-webmind-role"];
  const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
  if (!isCloudHttpRole(role)) return undefined;

  const userIdHeader = request.headers["x-webmind-user-id"];
  const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
  return {
    userId: userId ?? `local-${role}`,
    role
  };
}

function isCloudHttpRole(value: unknown): value is CloudHttpRole {
  return (
    value === "public" ||
    value === "author" ||
    value === "project-owner" ||
    value === "admin"
  );
}

function adminSession(): CloudHttpSession {
  return {
    userId: "local-admin",
    role: "admin"
  };
}

function authorSession(): CloudHttpSession {
  return {
    userId: "local-author",
    role: "author"
  };
}

function projectOwnerSession(): CloudHttpSession {
  return {
    userId: "local-author",
    role: "project-owner"
  };
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
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

function renderHttpServerSmokeReport(
  smoke: CloudHttpServerSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Server Smoke Report",
    "",
    `- 生成时间：${smoke.generatedAt}`,
    `- Base URL：${smoke.baseUrl}`,
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
    "1. 给 server 增加配置化端口和进程生命周期管理",
    "2. 接入 AuthPolicyAgent 的 role middleware",
    "3. 选择部署平台后把 createCloudHttpServer 包装成对应 runtime handler",
    ""
  ].join("\n");
}

function renderHttpAuthSmokeReport(
  smoke: CloudHttpAuthSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Auth Smoke Report",
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
    "1. 用真实 Auth provider session 替换 x-webmind-role 本地头",
    "2. 把 AuthPolicyAgent 的 routeRules 接入更多 Agent API 路由",
    "3. 为 author/project-owner 路由增加 userId 和 projectId 级校验",
    ""
  ].join("\n");
}

function renderHttpIdeasSmokeReport(
  smoke: CloudHttpIdeasSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Ideas Smoke Report",
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
    "1. 把 RecipeAgent、ProjectAgent 和 WritingAgent 继续接到 authenticated HTTP routes",
    "2. 为 POST /api/ideas 增加 request schema validation",
    "3. 用真实 session 替换本地 author/admin smoke session",
    ""
  ].join("\n");
}

function renderHttpRecipesSmokeReport(
  smoke: CloudHttpRecipesSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Recipes Smoke Report",
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
    "1. 把 ProjectAgent 和 WritingAgent 继续接到 authenticated HTTP routes",
    "2. 为 POST /api/recipes 增加 request schema validation",
    "3. 把 recipes route 的输出接到 Web 工作台",
    ""
  ].join("\n");
}

function renderHttpProjectsSmokeReport(
  smoke: CloudHttpProjectsSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Projects Smoke Report",
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
    "1. 把 WritingAgent 继续接到 authenticated HTTP routes",
    "2. 为 POST /api/projects 增加 slug/title/force request schema validation",
    "3. 把 project-owner 级项目读取和章节写作权限接入 AuthPolicyAgent",
    ""
  ].join("\n");
}

function renderHttpWritingSmokeReport(
  smoke: CloudHttpWritingSmokeResult,
  jsonPath: string
): string {
  return [
    "# Cloud HTTP Writing Smoke Report",
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
    "1. 为 POST /api/projects/{projectId}/chapters 增加 request schema validation",
    "2. 把 project-owner session 的 projectIds 校验接到真实 Auth provider",
    "3. 把章节草稿结果接到 Web 工作台的项目详情页",
    ""
  ].join("\n");
}
