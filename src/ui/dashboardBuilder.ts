import fs from "node:fs/promises";
import path from "node:path";
import { readLatestNovelProject } from "../projects/novelProjectStore.js";

type DashboardSection = {
  title: string;
  status: "ready" | "missing";
  href?: string;
  summary: string;
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

  const html = renderDashboard({
    sections,
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

function renderDashboard(options: {
  sections: DashboardSection[];
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
    "</body>",
    "</html>"
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
.topbar, .project, .commands {
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
a, .actions span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #b8c3ba;
  color: #18201c;
  background: #ffffff;
  text-decoration: none;
  border-radius: 6px;
  font-size: 14px;
}
.actions span {
  color: #8a938c;
  background: #eef1ed;
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
}
`;
}

function renderUiReport(options: {
  htmlPath: string;
  sections: DashboardSection[];
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
    "## 下一步",
    "",
    "1. 用浏览器打开 `ui/latest-dashboard.html` 审阅当前创作链路。",
    "2. 后续可把静态工作台升级成带按钮执行命令的本地桌面服务。",
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
