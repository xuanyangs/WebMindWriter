import fs from "node:fs/promises";
import path from "node:path";
import type { BatchAnalysis } from "../analysis/rankDiff.js";
import type { RankBatch } from "../types.js";
import { ModelClient, type ModelConfig } from "./modelClient.js";
import { buildScanPrompt } from "./prompts/scanPrompt.js";

export async function writeAiScanReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  outputDir: string;
  modelConfig: ModelConfig;
  dryRun: boolean;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const messages = buildScanPrompt(options.batch, options.analysis);

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-agent-scan-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-agent-scan-ai.md");
  const archivePath = path.join(options.outputDir, `${options.batch.id}-agent-scan-ai.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

function renderPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `# ${message.role}\n\n${message.content}`)
    .join("\n\n---\n\n");
}
