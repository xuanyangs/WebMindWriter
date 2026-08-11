import fs from "node:fs/promises";
import path from "node:path";
import { readLatestNovelProject } from "../projects/novelProjectStore.js";

type DashboardSection = {
  title: string;
  status: "ready" | "missing";
  href?: string;
  summary: string;
};

type DashboardAction = {
  label: string;
  kind: "open" | "command" | "report";
  value: string;
  href?: string;
  available: boolean;
};

const reportFiles = [
  ["扫榜", "latest-agent-scan.md"],
  ["拆书", "latest-book-teardown.md"],
  ["选题", "latest-ideas.md"],
  ["配方", "latest-recipe.md"],
  ["项目", "latest-project.md"],
  ["写作", "latest-writing.md"],
  ["总控", "latest-agent-run.md"]
] as const;

export async function buildDashboard(options: {
  reportDir: string;
  projectDir: string;
  uiDir: string;
}): Promise<{
  htmlPath: string;
  reportPath: string;
}> {
  await fs.mkdir(options.uiDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const sections = await readReportSections(options.reportDir, options.uiDir);
  const project = await readLatestNovelProject(options.projectDir);
  const chapterPath = project
    ? path.join(project.paths.chaptersDir, "chapter-001.md")
    : undefined;
  const chapterExists = chapterPath ? await fileExists(chapterPath) : false;
  const actions = await buildOperatorActions({
    reportDir: options.reportDir,
    uiDir: options.uiDir,
    projectReadmePath: project?.paths.readme,
    chapterPath: chapterExists ? chapterPath : undefined,
    editorHref: "project-editor.html"
  });

  const html = renderDashboard({
    sections,
    actions,
    projectTitle: project?.title,
    projectId: project?.id,
    projectHref: project ? relativeHref(options.uiDir, project.paths.readme) : undefined,
    chapterHref: chapterExists && chapterPath
      ? relativeHref(options.uiDir, chapterPath)
      : undefined,
    editorHref: "project-editor.html",
    builtAt: new Date().toISOString()
  });

  const htmlPath = path.join(options.uiDir, "latest-dashboard.html");
  await fs.writeFile(htmlPath, html, "utf8");

  const reportPath = path.join(options.reportDir, "latest-ui.md");
  await fs.writeFile(
    reportPath,
    renderUiReport({
      htmlPath,
      sections,
      actions,
      projectId: project?.id,
      chapterPath: chapterExists ? chapterPath : undefined
    }),
    "utf8"
  );

  return { htmlPath, reportPath };
}

async function readReportSections(
  reportDir: string,
  uiDir: string
): Promise<DashboardSection[]> {
  const sections: DashboardSection[] = [];

  for (const [title, fileName] of reportFiles) {
    const reportPath = path.join(reportDir, fileName);
    const exists = await fileExists(reportPath);
    const content = exists ? await fs.readFile(reportPath, "utf8") : "";
    sections.push({
      title,
      status: exists ? "ready" : "missing",
      href: exists ? relativeHref(uiDir, reportPath) : undefined,
      summary: exists ? summarizeMarkdown(content) : "尚未生成"
    });
  }

  return sections;
}

async function buildOperatorActions(options: {
  reportDir: string;
  uiDir: string;
  projectReadmePath?: string;
  chapterPath?: string;
  editorHref: string;
}): Promise<DashboardAction[]> {
  const launchReportHref = await reportHref(options.reportDir, options.uiDir, "latest-ui-launch.md");
  const agentRunHref = await reportHref(options.reportDir, options.uiDir, "latest-agent-run.md");
  const recipeHref = await reportHref(options.reportDir, options.uiDir, "latest-recipe.md");

  return [
    {
      label: "启动",
      kind: "command",
      value: "npm run agent:ui:launch",
      available: true
    },
    {
      label: "编辑章节",
      kind: "open",
      value: "project-editor.html",
      href: options.editorHref,
      available: true
    },
    {
      label: "项目说明",
      kind: "open",
      value: options.projectReadmePath ?? "未创建项目",
      href: options.projectReadmePath
        ? relativeHref(options.uiDir, options.projectReadmePath)
        : undefined,
      available: Boolean(options.projectReadmePath)
    },
    {
      label: "第一章",
      kind: "open",
      value: options.chapterPath ?? "未生成章节",
      href: options.chapterPath ? relativeHref(options.uiDir, options.chapterPath) : undefined,
      available: Boolean(options.chapterPath)
    },
    {
      label: "生成新章",
      kind: "command",
      value: "npm run agent:write:chapter",
      available: Boolean(options.projectReadmePath)
    },
    {
      label: "每日闭环",
      kind: "command",
      value: "npm run agent:run -- --goal daily",
      available: true
    },
    {
      label: "启动校验",
      kind: "command",
      value: "npm run agent:ui:launch:check",
      available: true
    },
    {
      label: "启动报告",
      kind: "report",
      value: "reports/latest-ui-launch.md",
      href: launchReportHref,
      available: Boolean(launchReportHref)
    },
    {
      label: "总控报告",
      kind: "report",
      value: "reports/latest-agent-run.md",
      href: agentRunHref,
      available: Boolean(agentRunHref)
    },
    {
      label: "配方报告",
      kind: "report",
      value: "reports/latest-recipe.md",
      href: recipeHref,
      available: Boolean(recipeHref)
    }
  ];
}

async function reportHref(
  reportDir: string,
  uiDir: string,
  fileName: string
): Promise<string | undefined> {
  const reportPath = path.join(reportDir, fileName);
  return (await fileExists(reportPath)) ? relativeHref(uiDir, reportPath) : undefined;
}

function renderDashboard(options: {
  sections: DashboardSection[];
  actions: DashboardAction[];
  projectTitle?: string;
  projectId?: string;
  projectHref?: string;
  chapterHref?: string;
  editorHref: string;
  builtAt: string;
}): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>WebMindWriter 工作台</title>",
    "<style>",
    renderCss(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="topbar">',
    "<div>",
    "<h1>WebMindWriter 工作台</h1>",
    `<p>${escapeHtml(options.projectTitle ?? "还没有本地小说项目")}</p>`,
    "</div>",
    `<span class="stamp">${escapeHtml(options.builtAt)}</span>`,
    "</section>",
    '<section class="project">',
    "<div>",
    "<h2>当前项目</h2>",
    `<p>${escapeHtml(options.projectId ?? "未创建")}</p>`,
    "</div>",
    '<div class="actions">',
    options.projectHref ? `<a href="${options.projectHref}">项目</a>` : "<span>项目</span>",
    options.chapterHref ? `<a href="${options.chapterHref}">第一章</a>` : "<span>第一章</span>",
    `<a href="${options.editorHref}">章节编辑器</a>`,
    "</div>",
    "</section>",
    '<section class="operator-action-panel" aria-label="本地操作面板">',
    "<header>",
    "<h2>本地操作面板</h2>",
    `<strong>${options.actions.filter((action) => action.available).length}/${options.actions.length}</strong>`,
    "</header>",
    '<div class="action-grid">',
    ...options.actions.map(renderAction),
    "</div>",
    "</section>",
    '<section class="pipeline">',
    ...options.sections.map(renderSection),
    "</section>",
    '<section class="commands">',
    "<h2>下一次运行</h2>",
    "<code>npm run agent:run -- --goal daily</code>",
    "<code>npm run agent:ui:build</code>",
    "<code>npm run agent:ui:serve</code>",
    "</section>",
    "</main>",
    "<script>",
    renderDashboardScript(),
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderAction(action: DashboardAction): string {
  const statusClass = action.available ? "ready" : "missing";
  const value = escapeHtml(action.value);
  const control = action.href
    ? `<a href="${action.href}">打开</a>`
    : `<button type="button" data-copy="${value}" ${action.available ? "" : "disabled"}>复制</button>`;

  return [
    `<article class="op ${statusClass}">`,
    "<div>",
    `<span>${escapeHtml(action.kind)}</span>`,
    `<h3>${escapeHtml(action.label)}</h3>`,
    `<code>${value}</code>`,
    "</div>",
    control,
    "</article>"
  ].join("\n");
}

function renderSection(section: DashboardSection): string {
  const statusClass = section.status === "ready" ? "ready" : "missing";
  const link = section.href
    ? `<a href="${section.href}">打开</a>`
    : "<span>缺失</span>";

  return [
    `<article class="stage ${statusClass}">`,
    "<header>",
    `<h2>${escapeHtml(section.title)}</h2>`,
    `<strong>${section.status === "ready" ? "ready" : "missing"}</strong>`,
    "</header>",
    `<p>${escapeHtml(section.summary)}</p>`,
    link,
    "</article>"
  ].join("\n");
}

function renderCss(): string {
  return `
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  color: #18201c;
  background: #f6f7f4;
}
.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 28px 0 40px;
}
.topbar, .project, .commands, .operator-action-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid #d9ded6;
  padding: 18px 0;
}
h1, h2, p { margin: 0; }
h1 { font-size: 28px; font-weight: 700; }
h2 { font-size: 15px; font-weight: 700; }
p { color: #546057; line-height: 1.55; }
.stamp {
  color: #69746c;
  font-size: 13px;
  white-space: nowrap;
}
.actions, .commands {
  flex-wrap: wrap;
}
a, .actions span, button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #b8c3ba;
  color: #18201c;
  background: #ffffff;
  text-decoration: none;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
}
.actions span, button:disabled {
  color: #8a938c;
  background: #eef1ed;
  cursor: default;
}
.operator-action-panel {
  align-items: stretch;
  flex-direction: column;
}
.operator-action-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.operator-action-panel strong {
  color: #546057;
  font-size: 13px;
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 10px;
}
.op {
  display: flex;
  min-height: 132px;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid #d7ddd5;
  border-top-width: 4px;
  border-radius: 8px;
  background: #ffffff;
}
.op.ready { border-top-color: #37785f; }
.op.missing { border-top-color: #ad7b35; }
.op div {
  min-width: 0;
  display: grid;
  gap: 7px;
}
.op span {
  color: #69746c;
  font-size: 12px;
  text-transform: uppercase;
}
.op h3 {
  margin: 0;
  font-size: 15px;
}
.op code {
  width: 100%;
  justify-content: flex-start;
  min-height: 30px;
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 1.35;
}
.pipeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  padding: 18px 0;
}
.stage {
  min-height: 178px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
  border: 1px solid #d7ddd5;
  border-left-width: 5px;
  border-radius: 8px;
  background: #ffffff;
}
.stage.ready { border-left-color: #37785f; }
.stage.missing { border-left-color: #ad7b35; }
.stage header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.stage strong {
  font-size: 12px;
  text-transform: uppercase;
  color: #69746c;
}
.stage p {
  min-height: 72px;
  font-size: 14px;
}
.commands {
  justify-content: flex-start;
}
code {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d4d9d2;
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
}
@media (max-width: 720px) {
  .topbar, .project { align-items: flex-start; flex-direction: column; }
  .stamp { white-space: normal; }
  .op { flex-direction: column; }
}
`;
}

function renderDashboardScript(): string {
  return String.raw`
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "已复制";
      setTimeout(() => { button.textContent = "复制"; }, 1200);
    } catch {
      button.textContent = value;
    }
  });
}
`;
}

function renderUiReport(options: {
  htmlPath: string;
  sections: DashboardSection[];
  actions: DashboardAction[];
  projectId?: string;
  chapterPath?: string;
}): string {
  return [
    "# Desktop UI 构建报告",
    "",
    `- HTML：${options.htmlPath}`,
    `- 当前项目：${options.projectId ?? "未创建"}`,
    `- 第一章：${options.chapterPath ?? "未生成"}`,
    "",
    "## 报告状态",
    "",
    ...options.sections.map((section, index) =>
      `${index + 1}. ${section.title}：${section.status}`
    ),
    "",
    "## 本地操作面板",
    "",
    ...options.actions.map((action, index) =>
      `${index + 1}. ${action.label}：${action.available ? "ready" : "missing"}，${action.value}`
    ),
    "",
    "## 下一步",
    "",
    "1. 用浏览器打开 `ui/latest-dashboard.html`，从本地操作面板进入章节编辑器或复制命令。",
    "2. 下一轮把操作面板接入更细的项目状态，例如章节缺失时优先提示生成章节。",
    ""
  ].join("\n");
}

function summarizeMarkdown(markdown: string): string {
  const line = markdown
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#") && !item.startsWith("| ---"));

  return line?.replace(/^- /, "").slice(0, 140) ?? "已生成";
}

function relativeHref(fromDir: string, targetPath: string): string {
  return path.relative(fromDir, targetPath).replace(/\\/g, "/");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
