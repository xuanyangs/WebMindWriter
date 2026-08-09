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
      `chapter-${String(chapterNumber).padStart(3, "0")}-${compactTime(new Date().toISOString())}.md`
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
