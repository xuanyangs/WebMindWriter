import fs from "node:fs/promises";
import path from "node:path";
import {
  readNovelProject,
  updateNovelProject,
  type NovelProject
} from "../projects/novelProjectStore.js";

export type ProjectDetailServicePaths = {
  projectDir: string;
};

export type ProjectDetailChapter = {
  fileName: string;
  chapterNumber?: number;
  path: string;
  sizeBytes: number;
  updatedAt: string;
  excerpt: string;
};

export type ProjectDetailResult = {
  project: NovelProject;
  outlinePreview: string;
  memoryPreview: string;
  chapters: ProjectDetailChapter[];
};

export type ProjectMemorySections = {
  characters: string;
  world: string;
  chapterSummaries: string;
  futurePlot: string;
  synopsis: string;
};

export type ProjectMemoryReadResult = {
  project: NovelProject;
  memory: {
    path: string;
    sizeBytes: number;
    updatedAt: string;
    content: string;
    sections: ProjectMemorySections;
  };
};

export type ProjectChapterReadResult = {
  project: NovelProject;
  chapter: ProjectDetailChapter & {
    content: string;
  };
};

export type ProjectChapterSaveResult = ProjectChapterReadResult & {
  revisionPath?: string;
  note?: string;
};

export type ProjectChapterRevision = {
  fileName: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
  excerpt: string;
};

export type ProjectChapterRevisionResult = {
  project: NovelProject;
  chapterNumber: number;
  revisions: ProjectChapterRevision[];
};

export type ProjectChapterRevisionReadResult = {
  project: NovelProject;
  chapterNumber: number;
  revision: ProjectChapterRevision & {
    content: string;
  };
};

export type ProjectChapterRevisionRestoreResult = ProjectChapterSaveResult & {
  restoredFromRevision: ProjectChapterRevision & {
    content: string;
  };
};

const memorySectionMap = {
  characters: "人物库",
  world: "世界观",
  chapterSummaries: "章节摘要",
  futurePlot: "后续剧情规划",
  synopsis: "简介"
} as const;

export async function runProjectDetailService(
  paths: ProjectDetailServicePaths,
  options: { projectId: string }
): Promise<ProjectDetailResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const [outlinePreview, memoryPreview, chapters] = await Promise.all([
    readPreview(project.paths.outline, 1200),
    readPreview(project.paths.memory, 1200),
    readChapters(project)
  ]);

  return {
    project,
    outlinePreview,
    memoryPreview,
    chapters
  };
}

export async function runProjectChapterReadService(
  paths: ProjectDetailServicePaths,
  options: { projectId: string; chapterNumber: number }
): Promise<ProjectChapterReadResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const chapterPath = path.join(
    project.paths.chaptersDir,
    `chapter-${String(options.chapterNumber).padStart(3, "0")}.md`
  );

  try {
    const [stat, content] = await Promise.all([
      fs.stat(chapterPath),
      fs.readFile(chapterPath, "utf8")
    ]);

    return {
      project,
      chapter: {
        fileName: path.basename(chapterPath),
        chapterNumber: options.chapterNumber,
        path: chapterPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        excerpt: trimPreview(content, 500),
        content
      }
    };
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`Chapter not found: ${options.projectId}#${options.chapterNumber}`);
    }

    throw error;
  }
}

export async function runProjectMemoryReadService(
  paths: ProjectDetailServicePaths,
  options: { projectId: string }
): Promise<ProjectMemoryReadResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const rawContent = await readMemoryFile(project);
  const content = ensureMemorySections(rawContent);
  const stat = await statMemory(project, content);

  return {
    project,
    memory: {
      path: project.paths.memory,
      sizeBytes: stat.sizeBytes,
      updatedAt: stat.updatedAt,
      content,
      sections: readMemorySections(content)
    }
  };
}

export async function runProjectMemorySaveService(
  paths: ProjectDetailServicePaths,
  options: {
    projectId: string;
    content?: string;
    sections?: Partial<ProjectMemorySections>;
  }
): Promise<ProjectMemoryReadResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const previous = ensureMemorySections(await readMemoryFile(project));
  const content = options.content !== undefined
    ? ensureMemorySections(options.content)
    : writeMemorySections(previous, options.sections ?? {});

  await fs.writeFile(project.paths.memory, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await updateNovelProject(project, { status: "drafting" });

  return runProjectMemoryReadService(paths, { projectId: options.projectId });
}

export async function runProjectChapterSaveService(
  paths: ProjectDetailServicePaths,
  options: {
    projectId: string;
    chapterNumber: number;
    content: string;
    note?: string;
  }
): Promise<ProjectChapterSaveResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  await fs.mkdir(project.paths.chaptersDir, { recursive: true });
  const chapterPath = path.join(
    project.paths.chaptersDir,
    `chapter-${String(options.chapterNumber).padStart(3, "0")}.md`
  );
  const revisionPath = await writeRevision(chapterPath, project, options.chapterNumber);
  const content = options.content.endsWith("\n") ? options.content : `${options.content}\n`;

  await fs.writeFile(chapterPath, content, "utf8");
  const nextProject = await updateNovelProject(project, { status: "drafting" });
  const stat = await fs.stat(chapterPath);

  return {
    project: nextProject,
    revisionPath,
    note: options.note,
    chapter: {
      fileName: path.basename(chapterPath),
      chapterNumber: options.chapterNumber,
      path: chapterPath,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
      excerpt: trimPreview(content, 500),
      content
    }
  };
}

export async function runProjectChapterRevisionService(
  paths: ProjectDetailServicePaths,
  options: { projectId: string; chapterNumber: number; limit: number }
): Promise<ProjectChapterRevisionResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const revisionDir = path.join(project.paths.chaptersDir, ".revisions");
  const prefix = `chapter-${String(options.chapterNumber).padStart(3, "0")}-`;

  try {
    const entries = await fs.readdir(revisionDir, { withFileTypes: true });
    const revisionFiles = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, options.limit);

    const revisions = await Promise.all(
      revisionFiles.map(async (fileName) => {
        const revisionPath = path.join(revisionDir, fileName);
        const [stat, excerpt] = await Promise.all([
          fs.stat(revisionPath),
          readPreview(revisionPath, 500)
        ]);

        return {
          fileName,
          path: revisionPath,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          excerpt
        };
      })
    );

    return {
      project,
      chapterNumber: options.chapterNumber,
      revisions
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        project,
        chapterNumber: options.chapterNumber,
        revisions: []
      };
    }

    throw error;
  }
}

export async function runProjectChapterRevisionReadService(
  paths: ProjectDetailServicePaths,
  options: { projectId: string; chapterNumber: number; revisionFile: string }
): Promise<ProjectChapterRevisionReadResult> {
  const project = await readNovelProject(paths.projectDir, options.projectId);
  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const revisionPath = path.join(project.paths.chaptersDir, ".revisions", options.revisionFile);

  try {
    const [stat, content] = await Promise.all([
      fs.stat(revisionPath),
      fs.readFile(revisionPath, "utf8")
    ]);

    return {
      project,
      chapterNumber: options.chapterNumber,
      revision: {
        fileName: options.revisionFile,
        path: revisionPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        excerpt: trimPreview(content, 500),
        content
      }
    };
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(
        `Revision not found: ${options.projectId}#${options.chapterNumber}/${options.revisionFile}`
      );
    }

    throw error;
  }
}

export async function runProjectChapterRevisionRestoreService(
  paths: ProjectDetailServicePaths,
  options: {
    projectId: string;
    chapterNumber: number;
    revisionFile: string;
    note?: string;
  }
): Promise<ProjectChapterRevisionRestoreResult> {
  const revision = await runProjectChapterRevisionReadService(paths, {
    projectId: options.projectId,
    chapterNumber: options.chapterNumber,
    revisionFile: options.revisionFile
  });
  const saved = await runProjectChapterSaveService(paths, {
    projectId: options.projectId,
    chapterNumber: options.chapterNumber,
    content: revision.revision.content,
    note: options.note
  });

  return {
    ...saved,
    restoredFromRevision: revision.revision
  };
}

async function readChapters(project: NovelProject): Promise<ProjectDetailChapter[]> {
  try {
    const entries = await fs.readdir(project.paths.chaptersDir, { withFileTypes: true });
    const markdownFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();

    const chapters = await Promise.all(
      markdownFiles.map(async (fileName) => {
        const chapterPath = path.join(project.paths.chaptersDir, fileName);
        const [stat, excerpt] = await Promise.all([
          fs.stat(chapterPath),
          readPreview(chapterPath, 500)
        ]);

        return {
          fileName,
          chapterNumber: parseChapterNumber(fileName),
          path: chapterPath,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          excerpt
        };
      })
    );

    return chapters.sort((a, b) => {
      const aNumber = a.chapterNumber ?? Number.MAX_SAFE_INTEGER;
      const bNumber = b.chapterNumber ?? Number.MAX_SAFE_INTEGER;
      return aNumber - bNumber || a.fileName.localeCompare(b.fileName);
    });
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

async function readMemoryFile(project: NovelProject): Promise<string> {
  try {
    return await fs.readFile(project.paths.memory, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return "# 写作记忆\n";
    throw error;
  }
}

async function statMemory(
  project: NovelProject,
  fallbackContent: string
): Promise<{ sizeBytes: number; updatedAt: string }> {
  try {
    const stat = await fs.stat(project.paths.memory);
    return {
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        sizeBytes: Buffer.byteLength(fallbackContent, "utf8"),
        updatedAt: new Date().toISOString()
      };
    }

    throw error;
  }
}

function ensureMemorySections(content: string): string {
  const lines = [content.trim() || "# 写作记忆"];
  for (const title of Object.values(memorySectionMap)) {
    if (!new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, "m").test(lines[0])) {
      lines.push("", `## ${title}`, "", "- 待补充。");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function readMemorySections(content: string): ProjectMemorySections {
  return {
    characters: readMarkdownSection(content, memorySectionMap.characters),
    world: readMarkdownSection(content, memorySectionMap.world),
    chapterSummaries: readMarkdownSection(content, memorySectionMap.chapterSummaries),
    futurePlot: readMarkdownSection(content, memorySectionMap.futurePlot),
    synopsis: readMarkdownSection(content, memorySectionMap.synopsis)
  };
}

function writeMemorySections(
  content: string,
  sections: Partial<ProjectMemorySections>
): string {
  let next = ensureMemorySections(content);
  if (sections.characters !== undefined) {
    next = replaceMarkdownSection(next, memorySectionMap.characters, sections.characters);
  }
  if (sections.world !== undefined) {
    next = replaceMarkdownSection(next, memorySectionMap.world, sections.world);
  }
  if (sections.chapterSummaries !== undefined) {
    next = replaceMarkdownSection(
      next,
      memorySectionMap.chapterSummaries,
      sections.chapterSummaries
    );
  }
  if (sections.futurePlot !== undefined) {
    next = replaceMarkdownSection(next, memorySectionMap.futurePlot, sections.futurePlot);
  }
  if (sections.synopsis !== undefined) {
    next = replaceMarkdownSection(next, memorySectionMap.synopsis, sections.synopsis);
  }

  return next;
}

function readMarkdownSection(content: string, title: string): string {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "m"
  );
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function replaceMarkdownSection(content: string, title: string, value: string): string {
  const section = `## ${title}\n\n${value.trim() || "- 待补充。"}\n`;
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(title)}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`,
    "m"
  );
  if (pattern.test(content)) {
    return content.replace(pattern, section.trimEnd());
  }

  return `${content.trim()}\n\n${section}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeRevision(
  chapterPath: string,
  project: NovelProject,
  chapterNumber: number
): Promise<string | undefined> {
  try {
    const previous = await fs.readFile(chapterPath, "utf8");
    const revisionDir = path.join(project.paths.chaptersDir, ".revisions");
    await fs.mkdir(revisionDir, { recursive: true });
    const revisionPath = path.join(
      revisionDir,
      `chapter-${String(chapterNumber).padStart(3, "0")}-${compactTime(new Date().toISOString())}-${process.hrtime.bigint().toString(36)}.md`
    );
    await fs.writeFile(revisionPath, previous, "utf8");
    return revisionPath;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function compactTime(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function readPreview(filePath: string, limit: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return trimPreview(content, limit);
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
}

function trimPreview(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
}

function parseChapterNumber(fileName: string): number | undefined {
  const match = fileName.match(/chapter-(\d+)\.md$/);
  if (!match) return undefined;
  return Number(match[1]);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
