import fs from "node:fs/promises";
import path from "node:path";
import { readLatestNovelProject } from "../projects/novelProjectStore.js";

type EditorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

const requiredApiMarkers = [
  "/api/projects/",
  "/memory",
  "/chapters/",
  "/revisions",
  "/restore"
] as const;

export async function buildChapterEditor(options: {
  reportDir: string;
  projectDir: string;
  uiDir: string;
}): Promise<{
  htmlPath: string;
  reportPath: string;
  checks: EditorCheck[];
}> {
  await fs.mkdir(options.uiDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const project = await readLatestNovelProject(options.projectDir);
  const html = renderEditor({
    projectId: project?.id ?? "",
    title: project?.title ?? "",
    builtAt: new Date().toISOString()
  });
  const htmlPath = path.join(options.uiDir, "project-editor.html");
  await fs.writeFile(htmlPath, html, "utf8");

  const checks = validateEditorHtml(html, project?.id);
  const reportPath = path.join(options.reportDir, "latest-ui-editor.md");
  await fs.writeFile(
    reportPath,
    renderEditorReport({
      htmlPath,
      projectId: project?.id,
      checks
    }),
    "utf8"
  );

  return {
    htmlPath,
    reportPath,
    checks
  };
}

function renderEditor(options: {
  projectId: string;
  title: string;
  builtAt: string;
}): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>WebMindWriter 章节编辑器</title>",
    "<style>",
    renderCss(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="topbar">',
    "<div>",
    "<h1>WebMindWriter 章节编辑器</h1>",
    `<p id="projectTitle">${escapeHtml(options.title || "未选择项目")}</p>`,
    "</div>",
    '<nav class="nav">',
    '<a href="latest-dashboard.html">工作台</a>',
    '<a href="#chapterContent">正文</a>',
    '<a href="#charactersMemory">记忆</a>',
    "</nav>",
    `<span class="stamp">${escapeHtml(options.builtAt)}</span>`,
    "</section>",
    '<section class="toolbar" aria-label="编辑控制">',
    labelInput("API", "apiBase", "http://127.0.0.1:4317"),
    labelInput("项目", "projectId", options.projectId),
    labelInput("章节", "chapterNumber", "1", "number"),
    button("loadProject", "项目"),
    button("loadChapter", "读取"),
    button("saveChapter", "保存"),
    button("loadRevisions", "版本"),
    button("restoreRevision", "恢复"),
    button("loadMemory", "记忆"),
    button("saveMemory", "存记忆"),
    "</section>",
    '<section class="workspace">',
    '<aside class="panel">',
    "<h2>项目</h2>",
    '<pre id="projectMeta"></pre>',
    "<h2>版本</h2>",
    '<div id="revisionList" class="revision-list"></div>',
    "</aside>",
    '<section class="editor">',
    '<div class="editor-head">',
    "<h2>正文</h2>",
    '<span id="status">ready</span>',
    "</div>",
    '<textarea id="chapterContent" spellcheck="false"></textarea>',
    '<div class="revision-preview">',
    "<h2>旧稿</h2>",
    '<pre id="revisionPreview"></pre>',
    "</div>",
    '<section class="memory-editor" aria-label="项目记忆">',
    '<div class="editor-head">',
    "<h2>项目记忆</h2>",
    '<span id="memoryStatus">memory ready</span>',
    "</div>",
    '<div class="memory-grid">',
    memoryTextarea("人物库", "charactersMemory"),
    memoryTextarea("世界观", "worldMemory"),
    memoryTextarea("章节摘要", "chapterSummariesMemory"),
    "</div>",
    "</section>",
    "</section>",
    "</section>",
    "</main>",
    "<script>",
    renderScript(),
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");
}

function labelInput(
  label: string,
  id: string,
  value: string,
  type = "text"
): string {
  return [
    "<label>",
    `<span>${escapeHtml(label)}</span>`,
    `<input id="${id}" type="${type}" value="${escapeHtml(value)}">`,
    "</label>"
  ].join("");
}

function button(id: string, label: string): string {
  return `<button id="${id}" type="button">${escapeHtml(label)}</button>`;
}

function memoryTextarea(label: string, id: string): string {
  return [
    "<label>",
    `<span>${escapeHtml(label)}</span>`,
    `<textarea id="${id}" spellcheck="false"></textarea>`,
    "</label>"
  ].join("");
}

function renderScript(): string {
  return String.raw`
const state = {
  revisionFile: ""
};

const $ = (id) => document.getElementById(id);

function apiBase() {
  return $("apiBase").value.replace(/\/+$/, "");
}

function projectId() {
  return encodeURIComponent($("projectId").value.trim());
}

function chapterNumber() {
  return encodeURIComponent($("chapterNumber").value.trim() || "1");
}

function chapterPath() {
  return apiBase() + "/api/projects/" + projectId() + "/chapters/" + chapterNumber();
}

function memoryPath() {
  return apiBase() + "/api/projects/" + projectId() + "/memory";
}

function setStatus(value) {
  $("status").textContent = value;
}

function setMemoryStatus(value) {
  $("memoryStatus").textContent = value;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-webmind-role": "project-owner",
      "x-webmind-project-ids": decodeURIComponent(projectId()),
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || response.statusText);
  return body;
}

async function loadProject() {
  setStatus("loading project");
  const data = await requestJson(apiBase() + "/api/projects/" + projectId());
  $("projectTitle").textContent = data.project.title;
  $("projectMeta").textContent = JSON.stringify({
    id: data.project.id,
    title: data.project.title,
    status: data.project.status,
    chapterCount: data.chapterCount
  }, null, 2);
  setStatus("project loaded");
  await loadMemory();
}

async function loadChapter() {
  setStatus("loading chapter");
  const data = await requestJson(chapterPath());
  $("chapterContent").value = data.chapter.content || "";
  setStatus("chapter loaded");
}

async function saveChapter() {
  setStatus("saving");
  const data = await requestJson(chapterPath(), {
    method: "POST",
    body: JSON.stringify({
      content: $("chapterContent").value,
      note: "saved from local editor"
    })
  });
  setStatus(data.backupRevisionPath ? "saved with backup" : "saved");
  await loadRevisions();
}

async function loadRevisions() {
  setStatus("loading revisions");
  const data = await requestJson(chapterPath() + "/revisions");
  $("revisionList").innerHTML = "";
  for (const revision of data.revisions || []) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "revision";
    row.textContent = revision.fileName;
    row.addEventListener("click", () => loadRevision(revision.fileName));
    $("revisionList").appendChild(row);
  }
  setStatus((data.revisionCount || 0) + " revisions");
}

async function loadRevision(fileName) {
  state.revisionFile = fileName;
  setStatus("loading revision");
  const data = await requestJson(chapterPath() + "/revisions/" + encodeURIComponent(fileName));
  $("revisionPreview").textContent = data.revision.content || "";
  setStatus("revision loaded");
}

async function restoreRevision() {
  if (!state.revisionFile) return;
  setStatus("restoring");
  const data = await requestJson(
    chapterPath() + "/revisions/" + encodeURIComponent(state.revisionFile) + "/restore",
    {
      method: "POST",
      body: JSON.stringify({ note: "restored from local editor" })
    }
  );
  $("chapterContent").value = data.chapter.content || "";
  setStatus("restored");
  await loadRevisions();
}

async function loadMemory() {
  setMemoryStatus("loading memory");
  const data = await requestJson(memoryPath());
  $("charactersMemory").value = data.memory.sections.characters || "";
  $("worldMemory").value = data.memory.sections.world || "";
  $("chapterSummariesMemory").value = data.memory.sections.chapterSummaries || "";
  setMemoryStatus("memory loaded");
}

async function saveMemory() {
  setMemoryStatus("saving memory");
  await requestJson(memoryPath(), {
    method: "POST",
    body: JSON.stringify({
      sections: {
        characters: $("charactersMemory").value,
        world: $("worldMemory").value,
        chapterSummaries: $("chapterSummariesMemory").value
      }
    })
  });
  setMemoryStatus("memory saved");
}

$("loadProject").addEventListener("click", () => loadProject().catch((error) => setStatus(error.message)));
$("loadChapter").addEventListener("click", () => loadChapter().catch((error) => setStatus(error.message)));
$("saveChapter").addEventListener("click", () => saveChapter().catch((error) => setStatus(error.message)));
$("loadRevisions").addEventListener("click", () => loadRevisions().catch((error) => setStatus(error.message)));
$("restoreRevision").addEventListener("click", () => restoreRevision().catch((error) => setStatus(error.message)));
$("loadMemory").addEventListener("click", () => loadMemory().catch((error) => setMemoryStatus(error.message)));
$("saveMemory").addEventListener("click", () => saveMemory().catch((error) => setMemoryStatus(error.message)));
$("revisionPreview").addEventListener("dblclick", () => restoreRevision().catch((error) => setStatus(error.message)));
`;
}

function renderCss(): string {
  return `
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #17201c;
  background: #f6f7f4;
  font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
}
.shell {
  width: min(1280px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 32px;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d6ddd5;
}
.nav {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}
.nav a {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid #b9c3bb;
  border-radius: 6px;
  color: #17201c;
  background: #fff;
  text-decoration: none;
  font-size: 13px;
}
h1, h2, p { margin: 0; }
h1 { font-size: 26px; font-weight: 700; }
h2 { font-size: 14px; font-weight: 700; }
p, .stamp { color: #56615a; }
.stamp { font-size: 13px; }
.toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1.2fr) minmax(180px, 1fr) 92px repeat(7, 76px);
  gap: 8px;
  align-items: end;
  padding: 14px 0;
  border-bottom: 1px solid #d6ddd5;
}
label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: #56615a;
}
input, textarea, button, pre {
  font: inherit;
}
input {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 1px solid #b9c3bb;
  border-radius: 6px;
  background: #fff;
}
button {
  height: 34px;
  border: 1px solid #9fb0a5;
  border-radius: 6px;
  color: #17201c;
  background: #fff;
  cursor: pointer;
}
button:hover { background: #eef3ef; }
.workspace {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 14px;
  padding-top: 14px;
  min-height: calc(100vh - 150px);
}
.panel {
  display: grid;
  align-content: start;
  gap: 10px;
}
pre {
  margin: 0;
  overflow: auto;
  padding: 12px;
  border: 1px solid #d7ddd5;
  border-radius: 8px;
  background: #fff;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 13px;
}
.revision-list {
  display: grid;
  gap: 6px;
  max-height: 40vh;
  overflow: auto;
}
.revision {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  padding: 0 8px;
}
.editor {
  display: grid;
  grid-template-rows: auto minmax(420px, 1fr) minmax(180px, 24vh) auto;
  gap: 10px;
}
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
#status, #memoryStatus {
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid #cbd4cd;
  border-radius: 6px;
  color: #3c594b;
  background: #fff;
  font-size: 12px;
}
textarea {
  width: 100%;
  min-height: 420px;
  resize: vertical;
  padding: 14px;
  border: 1px solid #b9c3bb;
  border-radius: 8px;
  background: #fff;
  line-height: 1.7;
  font-size: 15px;
}
.revision-preview {
  display: grid;
  gap: 8px;
  min-height: 0;
}
#revisionPreview {
  min-height: 160px;
}
.memory-editor {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}
.memory-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.memory-grid label {
  min-width: 0;
}
.memory-grid textarea {
  min-height: 180px;
  font-size: 14px;
}
@media (max-width: 920px) {
  .toolbar, .workspace { grid-template-columns: 1fr; }
  .topbar { align-items: flex-start; flex-direction: column; }
  .memory-grid { grid-template-columns: 1fr; }
}
`;
}

function validateEditorHtml(html: string, projectId?: string): EditorCheck[] {
  return [
    {
      name: "html-written",
      ok: html.includes("<textarea") && html.includes("chapterContent"),
      detail: "editor textarea is present"
    },
    {
      name: "project-default",
      ok: Boolean(projectId) && html.includes(projectId ?? ""),
      detail: projectId ? `default project ${projectId}` : "no local project found"
    },
    ...requiredApiMarkers.map((marker) => ({
      name: `api-marker:${marker}`,
      ok: html.includes(marker),
      detail: html.includes(marker) ? "marker found" : "marker missing"
    })),
    {
      name: "save-action",
      ok: html.includes("saveChapter") && html.includes("method: \"POST\""),
      detail: "save action is wired to POST"
    },
    {
      name: "restore-action",
      ok: html.includes("restoreRevision") && html.includes("restored from local editor"),
      detail: "restore action is wired"
    },
    {
      name: "memory-editor",
      ok:
        html.includes("charactersMemory") &&
        html.includes("worldMemory") &&
        html.includes("chapterSummariesMemory"),
      detail: "project memory sections are editable"
    },
    {
      name: "memory-save-action",
      ok: html.includes("saveMemory") && html.includes("/memory"),
      detail: "memory save action is wired"
    }
  ];
}

function renderEditorReport(options: {
  htmlPath: string;
  projectId?: string;
  checks: EditorCheck[];
}): string {
  return [
    "# UI Chapter Editor Build Report",
    "",
    `- HTML: ${options.htmlPath}`,
    `- Default project: ${options.projectId ?? "missing"}`,
    "",
    "## Checks",
    "",
    "| Check | OK | Detail |",
    "| --- | --- | --- |",
    ...options.checks.map(
      (check) => `| ${check.name} | ${check.ok ? "yes" : "no"} | ${check.detail} |`
    ),
    "",
    "## Next Actions",
    "",
    "1. 启动本地 HTTP server 后打开 `ui/project-editor.html` 进行人工写作流测试。",
    "2. 在项目记忆区维护人物库、世界观和章节摘要，再继续写下一章。",
    "3. 后续把静态编辑器升级为带自动 server lifecycle 的本地桌面工作台。",
    ""
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
