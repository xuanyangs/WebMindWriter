import fs from "node:fs/promises";
import path from "node:path";
import { readLatestNovelProject, type NovelProject } from "../projects/novelProjectStore.js";

type WorkspaceCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type FileNode = {
  label: string;
  type: "memory" | "chapter";
  target: string;
};

const memoryFiles: FileNode[] = [
  { label: "世界观.md", type: "memory", target: "world" },
  { label: "人物库.md", type: "memory", target: "characters" },
  { label: "后续剧情规划.md", type: "memory", target: "futurePlot" },
  { label: "章节摘要.md", type: "memory", target: "chapterSummaries" },
  { label: "简介.md", type: "memory", target: "synopsis" }
];

export async function buildWorkspace(options: {
  reportDir: string;
  projectDir: string;
  uiDir: string;
}): Promise<{
  htmlPath: string;
  reportPath: string;
  checks: WorkspaceCheck[];
}> {
  await fs.mkdir(options.uiDir, { recursive: true });
  await fs.mkdir(options.reportDir, { recursive: true });

  const project = await readLatestNovelProject(options.projectDir);
  const chapters = project ? await readChapterNodes(project) : [];
  const html = renderWorkspace({
    project,
    chapters,
    builtAt: new Date().toISOString()
  });
  const htmlPath = path.join(options.uiDir, "project-editor.html");
  await fs.writeFile(htmlPath, html, "utf8");

  const checks = validateWorkspaceHtml(html, project?.id);
  const reportPath = path.join(options.reportDir, "latest-ui-editor.md");
  await fs.writeFile(
    reportPath,
    renderWorkspaceReport({ htmlPath, projectId: project?.id, checks }),
    "utf8"
  );

  return { htmlPath, reportPath, checks };
}

async function readChapterNodes(project: NovelProject): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(project.paths.chaptersDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => {
        const match = entry.name.match(/^chapter-(\d+)\.md$/);
        const chapterNumber = match ? Number(match[1]) : 1;
        return {
          label: match ? `第${chapterNumber}章.md` : entry.name,
          type: "chapter" as const,
          target: String(chapterNumber)
        };
      })
      .sort((a, b) => Number(a.target) - Number(b.target));
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

function renderWorkspace(options: {
  project?: NovelProject;
  chapters: FileNode[];
  builtAt: string;
}): string {
  const projectId = options.project?.id ?? "";
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>WebMindWriter</title>",
    "<style>",
    renderCss(),
    "</style>",
    "</head>",
    "<body>",
    '<div class="app-shell">',
    '<aside class="rail">',
    '<div class="logo">✦</div>',
    '<button title="写作">▣</button>',
    '<button title="资料">▤</button>',
    '<button title="设置">⚙</button>',
    "</aside>",
    '<aside class="sessions">',
    '<header class="brand">',
    "<h1>WebMindWriter</h1>",
    '<span>v0.1</span>',
    "</header>",
    '<section class="session-head">',
    "<h2>对话列表</h2>",
    '<button id="newSession" type="button">＋</button>',
    "</section>",
    renderSession("创建新小说", "842 条消息", false),
    renderSession("继续写44章", "4 条消息", true),
    renderSession("你能扫哪些榜单？", "6 条消息", false),
    "</aside>",
    '<main class="workspace">',
    '<section class="agent-pane">',
    '<header class="pane-title">',
    "<div>",
    '<span class="subtle">当前会话</span>',
    "<h2>继续写44章</h2>",
    "</div>",
    '<button type="button">＋</button>',
    "</header>",
    '<nav class="tool-tabs">',
    ...["备忘录", "起名", "蒸馏", "拆解", "扫榜"].map((item) => `<button type="button">${item}</button>`),
    "</nav>",
    '<section class="agent-scroll">',
    '<article class="assistant-card good">',
    "<strong>可继续写作</strong>",
    "<p>我已经接入项目、章节、旧稿和项目记忆。先读取章节，再根据右侧资料继续推进。</p>",
    "</article>",
    '<article class="assistant-card">',
    "<strong>下一步建议</strong>",
    "<p>维护人物库、世界观、章节摘要后，再让写作 Agent 生成下一章草稿。</p>",
    "</article>",
    "</section>",
    '<footer class="composer">',
    '<textarea id="agentPrompt" placeholder="写下你的故事...（Enter 发送，Shift + Enter 换行）"></textarea>',
    '<div class="chips">',
    '<button type="button">@技能</button>',
    '<button type="button">#文件</button>',
    '<button type="button">deepseek-v4-flash-free</button>',
    "</div>",
    "</footer>",
    "</section>",
    '<section class="editor-pane">',
    '<header class="editor-top">',
    "<div>",
    `<h2 id="projectTitle">${escapeHtml(options.project?.title ?? "未选择项目")}</h2>`,
    `<p>${escapeHtml(options.project?.genreDirection ?? "local-first workspace")}</p>`,
    "</div>",
    '<div class="top-actions">',
    '<button id="loadProject" type="button">项目</button>',
    '<button id="loadChapter" type="button">读取</button>',
    '<button id="saveChapter" type="button">保存</button>',
    '<button id="loadRevisions" type="button">旧稿</button>',
    '<button id="restoreRevision" type="button">恢复</button>',
    "</div>",
    "</header>",
    '<section class="tabbar">',
    '<button class="tab active" type="button" data-file-type="chapter" data-target="1">第1章.md</button>',
    '<button class="tab" type="button" data-file-type="memory" data-target="characters">人物库.md</button>',
    '<button class="tab" type="button" data-file-type="memory" data-target="world">世界观.md</button>',
    "</section>",
    '<section class="editor-card">',
    '<div class="editor-meta">',
    '<input id="apiBase" value="http://127.0.0.1:4317" aria-label="API">',
    `<input id="projectId" value="${escapeHtml(projectId)}" aria-label="项目">`,
    '<input id="chapterNumber" type="number" value="1" aria-label="章节">',
    '<span id="status">ready</span>',
    "</div>",
    '<textarea id="chapterContent" spellcheck="false"></textarea>',
    '<section class="memory-dock">',
    '<div class="memory-head">',
    "<h3>小说资料</h3>",
    '<span id="memoryStatus">memory ready</span>',
    "</div>",
    '<div class="memory-grid">',
    renderMemoryBox("人物库", "charactersMemory"),
    renderMemoryBox("世界观", "worldMemory"),
    renderMemoryBox("章节摘要", "chapterSummariesMemory"),
    renderMemoryBox("后续剧情规划", "futurePlotMemory"),
    renderMemoryBox("简介", "synopsisMemory"),
    "</div>",
    '<button id="loadMemory" type="button">读取资料</button>',
    '<button id="saveMemory" type="button">保存资料</button>',
    "</section>",
    "</section>",
    '<footer class="wordbar">',
    '<span id="totalWords">文章总字数 0</span>',
    '<span id="currentWords">0 字</span>',
    "</footer>",
    "</section>",
    "</main>",
    '<aside class="files">',
    '<header class="file-head">',
    "<h2>目录</h2>",
    '<button type="button">⌕</button>',
    '<button type="button">↻</button>',
    "</header>",
    '<section class="project-select">',
    `<strong>${escapeHtml(options.project?.title ?? "未选择项目")}</strong>`,
    '<span>⌄</span>',
    "</section>",
    renderFileGroup("小说资料", memoryFiles),
    renderFileGroup("章节内容", options.chapters.length > 0 ? options.chapters : [{ label: "第1章.md", type: "chapter", target: "1" }]),
    '<section class="revision-panel">',
    "<h3>旧稿</h3>",
    '<div id="revisionList"></div>',
    '<pre id="revisionPreview"></pre>',
    "</section>",
    "</aside>",
    "</div>",
    "<script>",
    renderScript(),
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");
}

function renderSession(title: string, meta: string, active: boolean): string {
  return [
    `<article class="session ${active ? "active" : ""}">`,
    "<strong>",
    escapeHtml(title),
    "</strong>",
    `<span>${escapeHtml(meta)}</span>`,
    "</article>"
  ].join("");
}

function renderMemoryBox(label: string, id: string): string {
  return [
    "<label>",
    `<span>${escapeHtml(label)}</span>`,
    `<textarea id="${id}" spellcheck="false"></textarea>`,
    "</label>"
  ].join("");
}

function renderFileGroup(title: string, files: FileNode[]): string {
  return [
    '<section class="file-group">',
    `<h3>▾ ${escapeHtml(title)}</h3>`,
    ...files.map(
      (file) =>
        `<button type="button" data-file-type="${file.type}" data-target="${escapeHtml(file.target)}">▸ ${escapeHtml(file.label)}</button>`
    ),
    "</section>"
  ].join("\n");
}

function renderScript(): string {
  return String.raw`
const state = { revisionFile: "", activeType: "chapter", activeTarget: "1" };
const $ = (id) => document.getElementById(id);

function apiBase() { return $("apiBase").value.replace(/\/+$/, ""); }
function projectId() { return encodeURIComponent($("projectId").value.trim()); }
function chapterNumber() { return encodeURIComponent($("chapterNumber").value.trim() || "1"); }
function chapterPath() { return apiBase() + "/api/projects/" + projectId() + "/chapters/" + chapterNumber(); }
function memoryPath() { return apiBase() + "/api/projects/" + projectId() + "/memory"; }
function setStatus(value) { $("status").textContent = value; }
function setMemoryStatus(value) { $("memoryStatus").textContent = value; }

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

function countWords(value) {
  return (value.match(/[\u4e00-\u9fa5]/g) || []).length + (value.match(/[A-Za-z0-9]+/g) || []).length;
}

function updateWords() {
  const current = countWords($("chapterContent").value);
  $("currentWords").textContent = current + " 字";
  $("totalWords").textContent = "文章总字数 " + current;
}

async function loadProject() {
  setStatus("loading project");
  const data = await requestJson(apiBase() + "/api/projects/" + projectId());
  $("projectTitle").textContent = data.project.title;
  setStatus("project loaded · " + data.chapterCount + " chapters");
  await loadMemory();
}

async function loadChapter() {
  setStatus("loading chapter");
  const data = await requestJson(chapterPath());
  $("chapterContent").value = data.chapter.content || "";
  setStatus("chapter loaded");
  updateWords();
}

async function saveChapter() {
  setStatus("saving");
  const data = await requestJson(chapterPath(), {
    method: "POST",
    body: JSON.stringify({ content: $("chapterContent").value, note: "saved from workspace" })
  });
  setStatus(data.revisionPath ? "saved with backup" : "saved");
  await loadRevisions();
}

async function loadRevisions() {
  setStatus("loading revisions");
  const data = await requestJson(chapterPath() + "/revisions");
  $("revisionList").innerHTML = "";
  for (const revision of data.revisions || []) {
    const row = document.createElement("button");
    row.type = "button";
    row.textContent = revision.fileName;
    row.addEventListener("click", () => loadRevision(revision.fileName));
    $("revisionList").appendChild(row);
  }
  setStatus((data.revisionCount || 0) + " revisions");
}

async function loadRevision(fileName) {
  state.revisionFile = fileName;
  const data = await requestJson(chapterPath() + "/revisions/" + encodeURIComponent(fileName));
  $("revisionPreview").textContent = data.revision.content || "";
  setStatus("revision loaded");
}

async function restoreRevision() {
  if (!state.revisionFile) return;
  const data = await requestJson(chapterPath() + "/revisions/" + encodeURIComponent(state.revisionFile) + "/restore", {
    method: "POST",
    body: JSON.stringify({ note: "restored from workspace" })
  });
  $("chapterContent").value = data.chapter.content || "";
  setStatus("restored");
  updateWords();
  await loadRevisions();
}

async function loadMemory() {
  setMemoryStatus("loading memory");
  const data = await requestJson(memoryPath());
  $("charactersMemory").value = data.memory.sections.characters || "";
  $("worldMemory").value = data.memory.sections.world || "";
  $("chapterSummariesMemory").value = data.memory.sections.chapterSummaries || "";
  $("futurePlotMemory").value = data.memory.sections.futurePlot || "";
  $("synopsisMemory").value = data.memory.sections.synopsis || "";
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
        chapterSummaries: $("chapterSummariesMemory").value,
        futurePlot: $("futurePlotMemory").value,
        synopsis: $("synopsisMemory").value
      }
    })
  });
  setMemoryStatus("memory saved");
}

function activateFile(type, target) {
  state.activeType = type;
  state.activeTarget = target;
  if (type === "chapter") {
    $("chapterNumber").value = target;
    loadChapter().catch((error) => setStatus(error.message));
    return;
  }
  loadMemory().then(() => {
    const map = {
      characters: "charactersMemory",
      world: "worldMemory",
      chapterSummaries: "chapterSummariesMemory",
      futurePlot: "futurePlotMemory",
      synopsis: "synopsisMemory"
    };
    const node = $(map[target]);
    if (node) node.focus();
  }).catch((error) => setMemoryStatus(error.message));
}

for (const button of document.querySelectorAll("[data-file-type]")) {
  button.addEventListener("click", () => activateFile(button.dataset.fileType, button.dataset.target));
}

$("chapterContent").addEventListener("input", updateWords);
$("loadProject").addEventListener("click", () => loadProject().catch((error) => setStatus(error.message)));
$("loadChapter").addEventListener("click", () => loadChapter().catch((error) => setStatus(error.message)));
$("saveChapter").addEventListener("click", () => saveChapter().catch((error) => setStatus(error.message)));
$("loadRevisions").addEventListener("click", () => loadRevisions().catch((error) => setStatus(error.message)));
$("restoreRevision").addEventListener("click", () => restoreRevision().catch((error) => setStatus(error.message)));
$("loadMemory").addEventListener("click", () => loadMemory().catch((error) => setMemoryStatus(error.message)));
$("saveMemory").addEventListener("click", () => saveMemory().catch((error) => setMemoryStatus(error.message)));
updateWords();
`;
}

function renderCss(): string {
  return `
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #f4f1ff;
  background: #080812;
  font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
}
button, input, textarea, pre { font: inherit; }
button {
  border: 1px solid #30294f;
  color: #cfc8ff;
  background: #151322;
  border-radius: 7px;
  cursor: pointer;
}
button:hover { border-color: #6f55ff; color: #fff; }
.app-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: 64px 194px minmax(820px, 1fr) 260px;
  background: #090911;
}
.rail {
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 18px;
  padding-top: 18px;
  background: linear-gradient(180deg, #724bff, #23165e 45%, #090911);
}
.logo {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #845dff;
  font-size: 22px;
}
.rail button {
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  font-size: 18px;
}
.sessions {
  border-right: 1px solid #171429;
  background: #0c0b15;
}
.brand {
  height: 92px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid #171429;
}
.brand h1 {
  margin: 0;
  font-size: 20px;
}
.brand span {
  padding: 5px 8px;
  border-radius: 7px;
  color: #9d8dff;
  background: #21165d;
  font-size: 12px;
}
.session-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 14px;
}
h2, h3, p { margin: 0; }
.session-head h2 { font-size: 17px; }
.session {
  margin: 8px 8px;
  padding: 14px;
  display: grid;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #d8d4f0;
}
.session.active {
  border-color: #5b45d7;
  background: #1c1731;
  color: #927cff;
}
.session span, .subtle, .editor-top p, .wordbar, .file-group h3 {
  color: #87809e;
  font-size: 12px;
}
.workspace {
  min-width: 0;
  display: grid;
  grid-template-columns: 45% 55%;
  border-right: 1px solid #171429;
}
.agent-pane, .editor-pane, .files {
  min-width: 0;
  min-height: 0;
}
.agent-pane {
  display: grid;
  grid-template-rows: 92px 48px 1fr 178px;
  border-right: 1px solid #171429;
  background: #0f0e18;
}
.pane-title, .editor-top, .file-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #171429;
}
.pane-title h2, .editor-top h2 { font-size: 18px; }
.tool-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-bottom: 1px solid #171429;
}
.tool-tabs button {
  border: 0;
  border-radius: 0;
  background: #151321;
}
.agent-scroll {
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 14px;
}
.assistant-card {
  padding: 16px;
  border: 1px solid #27223b;
  border-radius: 12px;
  background: #171522;
  line-height: 1.65;
}
.assistant-card.good {
  border-color: #1f6544;
}
.assistant-card strong { color: #54f08a; }
.composer {
  padding: 14px;
  border-top: 1px solid #171429;
}
.composer textarea {
  width: 100%;
  height: 76px;
  resize: none;
  padding: 12px;
  color: #f4f1ff;
  border: 1px solid #2b2540;
  border-radius: 12px;
  background: #171522;
}
.chips {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.chips button { height: 30px; padding: 0 10px; }
.editor-pane {
  display: grid;
  grid-template-rows: 92px 42px 1fr 32px;
  background: #090911;
}
.top-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.top-actions button {
  height: 32px;
  padding: 0 10px;
}
.tabbar {
  display: flex;
  gap: 1px;
  padding-left: 12px;
  align-items: end;
  border-bottom: 1px solid #171429;
  background: #11101b;
}
.tab {
  height: 34px;
  padding: 0 14px;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
}
.tab.active { color: #fff; background: #19162a; border-color: #372d65; }
.editor-card {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(320px, 1fr) minmax(260px, 36vh);
  padding: 10px;
  gap: 10px;
}
.editor-meta {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) 82px auto;
  gap: 8px;
  align-items: center;
}
input {
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  color: #d9d5ef;
  border: 1px solid #27223b;
  border-radius: 7px;
  background: #13111d;
}
#status, #memoryStatus {
  white-space: nowrap;
  color: #9e96bd;
  font-size: 12px;
}
#chapterContent {
  width: 100%;
  min-height: 0;
  resize: none;
  padding: 24px;
  color: #f7f5ff;
  border: 1px solid #27223b;
  border-radius: 12px;
  background: #0b0b14;
  line-height: 1.8;
  font-size: 17px;
}
.memory-dock {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  padding: 12px;
  border: 1px solid #27223b;
  border-radius: 12px;
  background: #11101a;
}
.memory-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.memory-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 8px;
  overflow: auto;
}
.memory-grid label {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 6px;
  color: #9e96bd;
  font-size: 12px;
}
.memory-grid textarea {
  min-height: 142px;
  resize: none;
  padding: 10px;
  color: #f4f1ff;
  border: 1px solid #27223b;
  border-radius: 8px;
  background: #0b0b14;
  line-height: 1.55;
}
.memory-dock > button {
  height: 30px;
  width: fit-content;
  padding: 0 12px;
}
.wordbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  border-top: 1px solid #171429;
}
.files {
  display: grid;
  grid-template-rows: 54px auto auto auto 1fr;
  background: #0d0c16;
}
.file-head h2 { font-size: 16px; }
.file-head div, .file-head {
  gap: 8px;
}
.file-head button { width: 32px; height: 30px; }
.project-select {
  margin: 12px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  border: 1px solid #46358e;
  border-radius: 8px;
  color: #8f78ff;
  background: #151126;
}
.file-group {
  display: grid;
  gap: 4px;
  padding: 8px 14px;
}
.file-group button {
  height: 32px;
  justify-content: flex-start;
  text-align: left;
  border: 0;
  color: #dfdcf4;
  background: transparent;
}
.file-group button:hover {
  background: #171522;
}
.revision-panel {
  min-height: 0;
  overflow: auto;
  padding: 12px;
  border-top: 1px solid #171429;
}
#revisionList {
  display: grid;
  gap: 6px;
}
#revisionList button {
  min-height: 30px;
  text-align: left;
  justify-content: flex-start;
  padding: 0 8px;
}
#revisionPreview {
  margin-top: 10px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  color: #cfc9e8;
  font-size: 12px;
}
@media (max-width: 1180px) {
  .app-shell { grid-template-columns: 56px 0 minmax(0, 1fr); }
  .sessions { display: none; }
  .workspace { grid-template-columns: 1fr; }
  .agent-pane { display: none; }
  .files { display: none; }
}
`;
}

function validateWorkspaceHtml(html: string, projectId?: string): WorkspaceCheck[] {
  return [
    {
      name: "ide-shell",
      ok: html.includes("app-shell") && html.includes("WebMindWriter"),
      detail: "workspace shell is present"
    },
    {
      name: "agent-pane",
      ok: html.includes("agent-pane") && html.includes("备忘录") && html.includes("扫榜"),
      detail: "agent pane tools are present"
    },
    {
      name: "editor-pane",
      ok: html.includes("chapterContent") && html.includes("saveChapter"),
      detail: "chapter editor is present"
    },
    {
      name: "file-tree",
      ok: html.includes("小说资料") && html.includes("章节内容"),
      detail: "project file tree is present"
    },
    {
      name: "memory-sections",
      ok:
        html.includes("charactersMemory") &&
        html.includes("worldMemory") &&
        html.includes("futurePlotMemory") &&
        html.includes("synopsisMemory"),
      detail: "memory files are editable"
    },
    {
      name: "project-default",
      ok: Boolean(projectId) && html.includes(projectId ?? ""),
      detail: projectId ? `default project ${projectId}` : "no local project found"
    }
  ];
}

function renderWorkspaceReport(options: {
  htmlPath: string;
  projectId?: string;
  checks: WorkspaceCheck[];
}): string {
  return [
    "# Product Workspace Build Report",
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
    "1. Turn the agent pane buttons into real task actions.",
    "2. Add multi-chapter tab management and file-level memory persistence.",
    "3. Replace generated static HTML with a bundled desktop shell when the workflow stabilizes.",
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

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
