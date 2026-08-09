import fs from "node:fs/promises";
import {
  readLatestNovelProject,
  readNovelProject,
  type NovelProject
} from "../projects/novelProjectStore.js";
import { writeChapterDraft, type ChapterDraftResult } from "../writing/chapterWriter.js";

export type WritingServicePaths = {
  reportDir: string;
  projectDir: string;
};

export type WritingServiceOptions = {
  projectId?: string;
  chapterNumber: number;
  force: boolean;
};

export type WritingServiceResult = ChapterDraftResult & {
  project: NovelProject;
};

export async function runWritingService(
  paths: WritingServicePaths,
  options: WritingServiceOptions
): Promise<WritingServiceResult> {
  const project = options.projectId
    ? await readNovelProject(paths.projectDir, options.projectId)
    : await readLatestNovelProject(paths.projectDir);

  if (!project) {
    throw new Error(
      options.projectId
        ? `Project not found: ${options.projectId}`
        : "No local novel project found. Run agent:project:create first."
    );
  }

  const outlineMarkdown = await fs.readFile(project.paths.outline, "utf8");
  const memoryMarkdown = await fs.readFile(project.paths.memory, "utf8");

  return writeChapterDraft({
    project,
    outlineMarkdown,
    memoryMarkdown,
    outputDir: paths.reportDir,
    chapterNumber: options.chapterNumber,
    force: options.force
  });
}
