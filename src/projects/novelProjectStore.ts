import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type NovelProject = {
  id: string;
  title: string;
  genreDirection: string;
  sourceRecipePath: string;
  createdAt: string;
  updatedAt: string;
  status: "planning" | "drafting" | "paused" | "finished";
  paths: {
    root: string;
    readme: string;
    outline: string;
    memory: string;
    metadata: string;
    chaptersDir: string;
  };
};

export type CreateNovelProjectOptions = {
  projectDir: string;
  recipePath: string;
  recipeMarkdown: string;
  slug?: string;
  title?: string;
  force?: boolean;
  reuseExisting?: boolean;
};

export async function createNovelProject(
  options: CreateNovelProjectOptions
): Promise<NovelProject> {
  const now = new Date().toISOString();
  const title = options.title || readRecipeValue(options.recipeMarkdown, "暂定书名") || "未命名小说项目";
  const genreDirection = readRecipeMeta(options.recipeMarkdown, "题材方向") || "未分类";
  const slug = options.slug || makeProjectSlug(title, options.recipeMarkdown);
  const root = path.join(options.projectDir, slug);
  const chaptersDir = path.join(root, "chapters");
  const existing = await readExistingProject(path.join(root, "project.json"));
  if (existing && options.reuseExisting && !options.force) {
    return existing;
  }

  await ensureProjectTarget(root, Boolean(options.force));
  await fs.mkdir(chaptersDir, { recursive: true });

  const project: NovelProject = {
    id: slug,
    title,
    genreDirection,
    sourceRecipePath: options.recipePath,
    createdAt: now,
    updatedAt: now,
    status: "planning",
    paths: {
      root,
      readme: path.join(root, "README.md"),
      outline: path.join(root, "outline.md"),
      memory: path.join(root, "memory.md"),
      metadata: path.join(root, "project.json"),
      chaptersDir
    }
  };

  await fs.writeFile(project.paths.metadata, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  await fs.writeFile(project.paths.readme, renderProjectReadme(project), "utf8");
  await fs.writeFile(project.paths.outline, renderProjectOutline(project, options.recipeMarkdown), "utf8");
  await fs.writeFile(project.paths.memory, renderProjectMemory(project), "utf8");
  await fs.writeFile(path.join(chaptersDir, ".gitkeep"), "", "utf8");

  return project;
}

async function readExistingProject(metadataPath: string): Promise<NovelProject | undefined> {
  try {
    const content = await fs.readFile(metadataPath, "utf8");
    return JSON.parse(content) as NovelProject;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

export async function writeProjectReport(
  project: NovelProject,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = [
    "# Novel Project 创建报告",
    "",
    `- 项目 ID：${project.id}`,
    `- 标题：${project.title}`,
    `- 题材方向：${project.genreDirection}`,
    `- 状态：${project.status}`,
    `- 来源配方：${project.sourceRecipePath}`,
    `- 项目目录：${project.paths.root}`,
    "",
    "## 已创建文件",
    "",
    `1. ${project.paths.metadata}`,
    `2. ${project.paths.readme}`,
    `3. ${project.paths.outline}`,
    `4. ${project.paths.memory}`,
    `5. ${project.paths.chaptersDir}`,
    "",
    "## 下一步",
    "",
    "1. 人工审阅 `outline.md` 和 `memory.md`，确认主角定位与前三章方向。",
    "2. 下一轮 WritingAgent 将读取该项目目录，生成第一章草稿。",
    "3. 项目内容默认不提交到 GitHub，适合作为本地创作资产持续迭代。",
    ""
  ].join("\n");

  const latestPath = path.join(outputDir, "latest-project.md");
  const archivePath = path.join(outputDir, `${project.id}-project.md`);
  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export async function readNovelProject(
  projectDir: string,
  projectId: string
): Promise<NovelProject | undefined> {
  return readExistingProject(path.join(projectDir, projectId, "project.json"));
}

export async function readLatestNovelProject(
  projectDir: string
): Promise<NovelProject | undefined> {
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    const projects: NovelProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = await readNovelProject(projectDir, entry.name);
      if (project) projects.push(project);
    }

    const sortedProjects = projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const userProject = sortedProjects.find((project) => !isSmokeProject(project));
    return userProject ?? sortedProjects[0];
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

export async function updateNovelProject(
  project: NovelProject,
  updates: Partial<Pick<NovelProject, "status" | "updatedAt">>
): Promise<NovelProject> {
  const next: NovelProject = {
    ...project,
    ...updates,
    updatedAt: updates.updatedAt ?? new Date().toISOString()
  };

  await fs.writeFile(next.paths.metadata, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function isSmokeProject(project: NovelProject): boolean {
  return project.id.startsWith("smoke-");
}

function renderProjectReadme(project: NovelProject): string {
  return [
    `# ${project.title}`,
    "",
    `- 项目 ID：${project.id}`,
    `- 题材方向：${project.genreDirection}`,
    `- 状态：${project.status}`,
    `- 创建时间：${project.createdAt}`,
    `- 来源配方：${project.sourceRecipePath}`,
    "",
    "## 文件说明",
    "",
    "- `project.json`：项目元数据，供 Agent 读取。",
    "- `outline.md`：当前大纲和章节计划。",
    "- `memory.md`：写作记忆、设定约束、避坑提醒。",
    "- `chapters/`：章节草稿目录。",
    "",
    "## 下一步",
    "",
    "运行 WritingAgent 生成第一章草稿后，把人工修改和反馈记录回项目记忆。",
    ""
  ].join("\n");
}

function renderProjectOutline(project: NovelProject, recipeMarkdown: string): string {
  return [
    `# ${project.title} 大纲`,
    "",
    "## 来源配方摘录",
    "",
    trim(recipeMarkdown, 6000),
    "",
    "## 待人工确认",
    "",
    "- 主角姓名和具体身份",
    "- 第一章公开压力场",
    "- 第一个可验证的小胜",
    "- 第一卷阶段目标",
    ""
  ].join("\n");
}

function renderProjectMemory(project: NovelProject): string {
  return [
    `# ${project.title} 写作记忆`,
    "",
    "## 固定承诺",
    "",
    `- 题材方向：${project.genreDirection}`,
    "- 第一章必须快速给出身份、压力、误判和一次小胜。",
    "- 只迁移结构，不照搬榜单作品或样本文本。",
    "",
    "## 连续性记录",
    "",
    "- 暂无章节草稿。",
    "",
    "## 避坑",
    "",
    "- 不要把设定解释写成长段说明。",
    "- 不要让第一章只有铺垫没有收益。",
    "- 不要让主角优势一次性封顶。",
    ""
  ].join("\n");
}

async function ensureProjectTarget(root: string, force: boolean): Promise<void> {
  try {
    const entries = await fs.readdir(root);
    if (entries.length > 0 && !force) {
      throw new Error(`Project already exists: ${root}. Use --force to overwrite files.`);
    }
  } catch (error) {
    if (isMissingFile(error)) return;
    throw error;
  }
}

function readRecipeMeta(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function readRecipeValue(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function makeProjectSlug(title: string, recipeMarkdown: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const hash = crypto.createHash("sha1").update(recipeMarkdown).digest("hex").slice(0, 8);

  return ascii ? `${ascii}-${hash}` : `novel-${hash}`;
}

function trim(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
