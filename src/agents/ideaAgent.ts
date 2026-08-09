import fs from "node:fs/promises";
import path from "node:path";
import type { BatchAnalysis } from "../analysis/rankDiff.js";
import type { FeedbackRecord } from "../feedback/feedbackTypes.js";
import type { SourceReport } from "../reports/reportContext.js";
import type { BookOpeningSample } from "../samples/sampleStore.js";
import type { RankBatch } from "../types.js";
import { ModelClient, type ModelConfig } from "./modelClient.js";
import { buildIdeaPrompt } from "./prompts/ideaPrompt.js";

export async function writeAiIdeaReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  sourceReports?: SourceReport[];
  outputDir: string;
  modelConfig: ModelConfig;
  dryRun: boolean;
  limit: number;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const messages = buildIdeaPrompt({
    batch: options.batch,
    analysis: options.analysis,
    samples: options.samples,
    feedback: options.feedback,
    sourceReports: options.sourceReports,
    limit: options.limit
  });

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-idea-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-idea-ai.md");
  const archivePath = path.join(options.outputDir, `${options.batch.id}-idea-ai.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export async function writeAiIdeasReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  sourceReports: SourceReport[];
  outputDir: string;
  modelConfig: ModelConfig;
  dryRun: boolean;
  limit: number;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const messages = buildIdeaPrompt({
    batch: options.batch,
    analysis: options.analysis,
    samples: options.samples,
    feedback: options.feedback,
    sourceReports: options.sourceReports,
    limit: options.limit
  });

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-ideas-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-ideas-ai.md");
  const archivePath = path.join(options.outputDir, `${options.batch.id}-ideas-ai.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

function renderPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `# ${message.role}\n\n${message.content}`)
    .join("\n\n---\n\n");
}
