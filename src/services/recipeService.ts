import fs from "node:fs/promises";
import path from "node:path";
import { FeedbackStore } from "../feedback/feedbackStore.js";
import { parseIdeaCards, writeRecipeReport } from "../reports/recipeReport.js";

export type RecipeServicePaths = {
  reportDir: string;
  feedbackDir: string;
};

export type RecipeServiceOptions = {
  ideaIndex?: number;
  feedbackLimit: number;
};

export type RecipeServiceResult = {
  reportPath: string;
  ideasPath: string;
  selectedIdeaIndex?: number;
  selectedIdeaTitle?: string;
  ideaCount: number;
  feedbackCount: number;
};

export async function runRecipeService(
  paths: RecipeServicePaths,
  options: RecipeServiceOptions
): Promise<RecipeServiceResult> {
  const ideasPath = path.join(paths.reportDir, "latest-ideas.md");
  const ideasMarkdown = await fs.readFile(ideasPath, "utf8");
  const ideas = parseIdeaCards(ideasMarkdown);
  const selected = selectIdea(ideas, options.ideaIndex);
  const feedback = await new FeedbackStore(paths.feedbackDir).list({
    limit: options.feedbackLimit
  });
  const reportPath = await writeRecipeReport({
    ideasPath,
    ideasMarkdown,
    feedback,
    outputDir: paths.reportDir,
    ideaIndex: options.ideaIndex
  });

  return {
    reportPath,
    ideasPath,
    selectedIdeaIndex: selected?.index,
    selectedIdeaTitle: selected?.title,
    ideaCount: ideas.length,
    feedbackCount: feedback.length
  };
}

function selectIdea(
  ideas: Array<{ index: number; recommendationScore: number; title: string }>,
  ideaIndex?: number
) {
  if (ideaIndex !== undefined) {
    return ideas.find((idea) => idea.index === ideaIndex);
  }

  return [...ideas].sort(
    (a, b) => b.recommendationScore - a.recommendationScore || a.index - b.index
  )[0];
}
