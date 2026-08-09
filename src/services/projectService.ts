import fs from "node:fs/promises";
import path from "node:path";
import {
  createNovelProject,
  writeProjectReport,
  type NovelProject
} from "../projects/novelProjectStore.js";

export type ProjectServicePaths = {
  reportDir: string;
  projectDir: string;
};

export type ProjectServiceOptions = {
  slug?: string;
  title?: string;
  force?: boolean;
  reuseExisting?: boolean;
};

export type ProjectServiceResult = {
  project: NovelProject;
  reportPath: string;
  recipePath: string;
};

export async function runProjectService(
  paths: ProjectServicePaths,
  options: ProjectServiceOptions
): Promise<ProjectServiceResult> {
  const recipePath = path.join(paths.reportDir, "latest-recipe.md");
  const recipeMarkdown = await fs.readFile(recipePath, "utf8");
  const project = await createNovelProject({
    projectDir: paths.projectDir,
    recipePath,
    recipeMarkdown,
    slug: options.slug,
    title: options.title,
    force: options.force,
    reuseExisting: options.reuseExisting
  });
  const reportPath = await writeProjectReport(project, paths.reportDir);

  return {
    project,
    reportPath,
    recipePath
  };
}
