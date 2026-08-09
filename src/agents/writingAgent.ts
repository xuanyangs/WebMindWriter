import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "../projects/novelProjectStore.js";
import { ModelClient, type ModelConfig } from "./modelClient.js";
import { buildWritingPrompt } from "./prompts/writingPrompt.js";

export async function writeAiChapterDraft(options: {
  project: NovelProject;
  outlineMarkdown: string;
  memoryMarkdown: string;
  outputDir: string;
  chapterNumber: number;
  modelConfig: ModelConfig;
  dryRun: boolean;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const messages = buildWritingPrompt({
    project: options.project,
    outlineMarkdown: options.outlineMarkdown,
    memoryMarkdown: options.memoryMarkdown,
    chapterNumber: options.chapterNumber
  });

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-writing-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-writing-ai.md");
  const archivePath = path.join(
    options.outputDir,
    `${options.project.id}-chapter-${String(options.chapterNumber).padStart(3, "0")}-ai.md`
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
