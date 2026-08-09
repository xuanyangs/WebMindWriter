import fs from "node:fs/promises";
import path from "node:path";
import type { FeedbackRecord } from "../feedback/feedbackTypes.js";
import type { IdeaBrief } from "../reports/recipeReport.js";
import { ModelClient, type ModelConfig } from "./modelClient.js";
import { buildRecipePrompt } from "./prompts/recipePrompt.js";

export async function writeAiRecipeReport(options: {
  idea: IdeaBrief;
  ideasPath: string;
  feedback: FeedbackRecord[];
  outputDir: string;
  modelConfig: ModelConfig;
  dryRun: boolean;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const messages = buildRecipePrompt({
    idea: options.idea,
    ideasPath: options.ideasPath,
    feedback: options.feedback
  });

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-recipe-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-recipe-ai.md");
  const archivePath = path.join(
    options.outputDir,
    `${compactTime(new Date().toISOString())}-recipe-ai.md`
  );

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

function renderPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `# ${message.role}\n\n${message.content}`)
    .join("\n\n---\n\n");
}

function compactTime(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}
