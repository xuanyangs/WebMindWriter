import fs from "node:fs/promises";
import path from "node:path";
import { readNovelProject, type NovelProject } from "../projects/novelProjectStore.js";

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

async function readPreview(filePath: string, limit: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const compact = content.trim();
    return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
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
