import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { startLocalUiServer, type LocalUiServerHandle } from "./localUiServer.js";
import type { CloudServicePaths } from "../services/cloudService.js";

export type UiBrowserSmokePaths = CloudServicePaths & {
  uiDir: string;
};

export type UiBrowserSmoke = {
  generatedAt: string;
  baseUrl: string;
  reusedExistingServer: boolean;
  checks: {
    name: string;
    ok: boolean;
    detail: string;
  }[];
};

type FakeElement = {
  id: string;
  value: string;
  textContent: string;
  innerHTML: string;
  children: FakeElement[];
  listeners: Record<string, (() => void)[]>;
  appendChild(child: FakeElement): void;
  addEventListener(event: string, listener: () => void): void;
};

export async function writeUiBrowserSmokeReport(
  paths: UiBrowserSmokePaths,
  options: { port: number }
): Promise<{
  jsonPath: string;
  reportPath: string;
  smoke: UiBrowserSmoke;
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

  try {
    const dashboardPath = path.join(paths.uiDir, "latest-dashboard.html");
    const editorPath = path.join(paths.uiDir, "project-editor.html");
    const [dashboardHtml, editorHtml] = await Promise.all([
      fs.readFile(dashboardPath, "utf8"),
      fs.readFile(editorPath, "utf8")
    ]);

    const checks: UiBrowserSmoke["checks"] = [
      {
        name: "dashboard-links-editor",
        ok: dashboardHtml.includes("project-editor.html"),
        detail: "dashboard links to project-editor.html"
      },
      {
        name: "dashboard-mentions-server",
        ok: dashboardHtml.includes("agent:ui:serve"),
        detail: "dashboard shows the local server command"
      },
      {
        name: "workspace-shell",
        ok:
          editorHtml.includes("app-shell") &&
          editorHtml.includes("agent-pane") &&
          editorHtml.includes("file-group"),
        detail: "editor shows product workspace shell"
      },
      {
        name: "workspace-file-tree",
        ok:
          editorHtml.includes("小说资料") &&
          editorHtml.includes("章节内容") &&
          editorHtml.includes("世界观.md"),
        detail: "workspace shows novel file tree"
      }
    ];

    checks.push(...(await executeEditorSmoke(editorHtml, baseUrl)));

    const smoke: UiBrowserSmoke = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      reusedExistingServer,
      checks
    };
    const jsonPath = path.join(paths.cloudDir, "ui-browser-smoke.json");
    const reportPath = path.join(paths.reportDir, "latest-ui-browser.md");
    await fs.writeFile(jsonPath, `${JSON.stringify(smoke, null, 2)}\n`, "utf8");
    await fs.writeFile(reportPath, renderUiBrowserSmokeReport(smoke, jsonPath), "utf8");

    return { jsonPath, reportPath, smoke };
  } finally {
    if (handle) {
      await close(handle.server);
    }
  }
}

async function executeEditorSmoke(
  html: string,
  baseUrl: string
): Promise<UiBrowserSmoke["checks"]> {
  const script = extractScript(html);
  const dom = createFakeDom({
    ...readInputValues(html),
    apiBase: baseUrl
  });
  const context = {
    console,
    document: dom.document,
    fetch,
    encodeURIComponent,
    decodeURIComponent,
    Error,
    JSON,
    Promise
  };

  vm.runInNewContext(
    `${script}\n;globalThis.__webmindSmoke = { loadProject, loadChapter, loadRevisions, loadMemory };`,
    context
  );
  const smokeApi = (
    context as typeof context & {
      __webmindSmoke: {
        loadProject: () => Promise<void>;
        loadChapter: () => Promise<void>;
        loadRevisions: () => Promise<void>;
        loadMemory: () => Promise<void>;
      };
    }
  ).__webmindSmoke;

  const checks: UiBrowserSmoke["checks"] = [
    {
      name: "editor-script-loads",
      ok: typeof smokeApi.loadProject === "function",
      detail: "editor browser script executed"
    }
  ];

  checks.push(await runEditorAction("load-project", () => smokeApi.loadProject(), () => {
    const title = dom.element("projectTitle").textContent;
    const status = dom.element("status").textContent;
    return {
      ok: title.trim().length > 0 && status.includes("project loaded"),
      detail: title ? "project title rendered" : "project title missing"
    };
  }));

  checks.push(await runEditorAction("load-chapter", () => smokeApi.loadChapter(), () => {
    const content = dom.element("chapterContent").value;
    return {
      ok: content.trim().length > 0,
      detail: content.trim().length > 0 ? "chapter content loaded" : "chapter content empty"
    };
  }));

  checks.push(await runEditorAction("load-revisions", () => smokeApi.loadRevisions(), () => {
    return {
      ok: dom.element("status").textContent.includes("revisions"),
      detail: `status: ${dom.element("status").textContent}`
    };
  }));

  checks.push(await runEditorAction("load-memory", () => smokeApi.loadMemory(), () => {
    const characters = dom.element("charactersMemory").value;
    const world = dom.element("worldMemory").value;
    const summaries = dom.element("chapterSummariesMemory").value;
    return {
      ok: [characters, world, summaries].some((value) => value.trim().length > 0),
      detail: "project memory sections loaded"
    };
  }));

  return checks;
}

async function runEditorAction(
  name: string,
  action: () => Promise<void>,
  inspect: () => { ok: boolean; detail: string }
): Promise<UiBrowserSmoke["checks"][number]> {
  try {
    await action();
    const result = inspect();
    return {
      name,
      ok: result.ok,
      detail: result.detail
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: formatError(error)
    };
  }
}

function extractScript(html: string): string {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  if (!match) {
    throw new Error("No inline script found in project-editor.html.");
  }

  return match[1];
}

function readInputValues(html: string): Record<string, string> {
  const values: Record<string, string> = {};
  const inputPattern = /<input\s+[^>]*id="([^"]+)"[^>]*value="([^"]*)"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = inputPattern.exec(html)) !== null) {
    values[match[1]] = decodeHtml(match[2]);
  }

  return values;
}

function createFakeDom(defaults: Record<string, string>) {
  const elements = new Map<string, FakeElement>();
  const values: Record<string, string> = { ...defaults };

  const element = (id: string): FakeElement => {
    const existing = elements.get(id);
    if (existing) return existing;

    const created: FakeElement = {
      id,
      value: values[id] ?? "",
      textContent: "",
      innerHTML: "",
      children: [],
      listeners: {},
      appendChild(child) {
        this.children.push(child);
      },
      addEventListener(event, listener) {
        this.listeners[event] = [...(this.listeners[event] ?? []), listener];
      }
    };
    elements.set(id, created);
    return created;
  };

  const document = {
    getElementById: element,
    createElement: (tagName: string) => element(`created:${tagName}:${elements.size}`),
    querySelectorAll: (selector: string) => {
      if (selector === "[data-file-type]") return [];
      return [];
    }
  };

  return { document, element };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function renderUiBrowserSmokeReport(smoke: UiBrowserSmoke, jsonPath: string): string {
  return [
    "# UI Browser Smoke Report",
    "",
    `- Generated at: ${smoke.generatedAt}`,
    `- Base URL: ${smoke.baseUrl}`,
    `- Reused existing server: ${smoke.reusedExistingServer ? "yes" : "no"}`,
    `- JSON: ${jsonPath}`,
    "",
    "## Checks",
    "",
    "| Check | OK | Detail |",
    "| --- | --- | --- |",
    ...smoke.checks.map(
      (check) => `| ${check.name} | ${check.ok ? "yes" : "no"} | ${check.detail} |`
    ),
    "",
    "## Next Actions",
    "",
    "1. Keep `agent:ui:browser:check` in daily runs while the editor grows.",
    "2. Expand the operator panel with project-specific status actions.",
    "3. Later replace the fake DOM smoke with Playwright when the project adopts browser test dependencies.",
    ""
  ].join("\n");
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EADDRINUSE"
  );
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
