import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { createCloudHttpServer } from "../server/cloudHttpAdapter.js";
import type { CloudServicePaths } from "../services/cloudService.js";

export type LocalUiServerPaths = CloudServicePaths & {
  uiDir: string;
};

export type LocalUiServerHandle = {
  server: http.Server;
  baseUrl: string;
  port: number;
};

export type LocalUiServerSmoke = {
  generatedAt: string;
  preferredPort: number;
  baseUrl: string;
  reusedExistingServer: boolean;
  checks: {
    name: string;
    ok: boolean;
    status?: number;
    detail: string;
  }[];
};

export async function startLocalUiServer(
  paths: CloudServicePaths,
  port: number
): Promise<LocalUiServerHandle> {
  const server = createCloudHttpServer(paths);
  await listen(server, port);
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port
  };
}

export async function writeLocalUiServerSmokeReport(
  paths: LocalUiServerPaths,
  options: { port: number }
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: LocalUiServerSmoke;
}> {
  await fs.mkdir(paths.cloudDir, { recursive: true });
  await fs.mkdir(paths.reportDir, { recursive: true });

  let handle: LocalUiServerHandle | undefined;
  let reusedExistingServer = false;
  const preferredBaseUrl = `http://127.0.0.1:${options.port}`;

  try {
    handle = await startLocalUiServer(paths, options.port);
  } catch (error) {
    if (isAddressInUse(error)) {
      reusedExistingServer = true;
    } else {
      throw error;
    }
  }

  const baseUrl = handle?.baseUrl ?? preferredBaseUrl;
  const editorPath = path.join(paths.uiDir, "project-editor.html");
  const checks: LocalUiServerSmoke["checks"] = [];

  checks.push({
    name: "editor-html",
    ok: await fileExists(editorPath),
    detail: editorPath
  });

  checks.push(await checkDashboardRoot(baseUrl));
  checks.push(await checkHealth(baseUrl));
  checks.push(await checkCorsPreflight(baseUrl));

  const smoke: LocalUiServerSmoke = {
    generatedAt: new Date().toISOString(),
    preferredPort: options.port,
    baseUrl,
    reusedExistingServer,
    checks
  };
  const jsonPath = path.join(paths.cloudDir, "ui-server-smoke.json");
  const reportPath = path.join(paths.reportDir, "latest-ui-server.md");
  try {
    await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
    await fs.writeFile(reportPath, renderLocalUiServerReport(smoke, jsonPath), "utf8");
  } finally {
    if (handle) {
      await close(handle.server);
    }
  }

  return {
    jsonPath,
    reportPath,
    smoke
  };
}

async function checkDashboardRoot(
  baseUrl: string
): Promise<LocalUiServerSmoke["checks"][number]> {
  try {
    const dashboard = await fetch(`${baseUrl}/`);
    const contentType = dashboard.headers.get("content-type") ?? "";
    const html = await dashboard.text();
    const ok =
      dashboard.status === 200 &&
      contentType.includes("text/html") &&
      html.includes("WebMindWriter 工作台");
    return {
      name: "dashboard-root",
      ok,
      status: dashboard.status,
      detail: ok ? "root serves dashboard HTML" : "root dashboard failed"
    };
  } catch (error) {
    return {
      name: "dashboard-root",
      ok: false,
      detail: `root dashboard unreachable: ${formatError(error)}`
    };
  }
}

async function checkHealth(baseUrl: string): Promise<LocalUiServerSmoke["checks"][number]> {
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    return {
      name: "api-health",
      ok: health.status === 200,
      status: health.status,
      detail: health.status === 200 ? "health endpoint reachable" : "health endpoint failed"
    };
  } catch (error) {
    return {
      name: "api-health",
      ok: false,
      detail: `health endpoint unreachable: ${formatError(error)}`
    };
  }
}

async function checkCorsPreflight(
  baseUrl: string
): Promise<LocalUiServerSmoke["checks"][number]> {
  try {
    const preflight = await fetch(`${baseUrl}/api/projects/example/chapters/1`, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-webmind-role, x-webmind-project-ids"
      }
    });
    const cors = preflight.headers.get("access-control-allow-origin");

    return {
      name: "cors-preflight",
      ok: preflight.status === 204 && cors === "*",
      status: preflight.status,
      detail:
        preflight.status === 204 && cors === "*"
          ? "preflight accepted with wildcard origin"
          : "preflight failed"
    };
  } catch (error) {
    return {
      name: "cors-preflight",
      ok: false,
      detail: `preflight unreachable: ${formatError(error)}`
    };
  }
}

function renderLocalUiServerReport(smoke: LocalUiServerSmoke, jsonPath: string): string {
  return [
    "# Local UI Server Smoke Report",
    "",
    `- Generated at: ${smoke.generatedAt}`,
    `- Base URL: ${smoke.baseUrl}`,
    `- Preferred port: ${smoke.preferredPort}`,
    `- Reused existing server: ${smoke.reusedExistingServer ? "yes" : "no"}`,
    `- JSON: ${jsonPath}`,
    "",
    "## Checks",
    "",
    "| Check | OK | Status | Detail |",
    "| --- | --- | ---: | --- |",
    ...smoke.checks.map(
      (check) =>
        `| ${check.name} | ${check.ok ? "yes" : "no"} | ${check.status ?? ""} | ${check.detail} |`
    ),
    "",
    "## Next Actions",
    "",
    "1. Run `npm run agent:ui:serve` and open `ui/project-editor.html`.",
    "2. Use the editor with API base `http://127.0.0.1:4317`.",
    "3. Later, wrap the server and editor into a single desktop launch command.",
    ""
  ].join("\n");
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EADDRINUSE"
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
