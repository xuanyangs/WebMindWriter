import fs from "node:fs/promises";
import path from "node:path";
import type { RankingItem } from "../types.js";
import type { BookOpeningSample } from "../samples/sampleStore.js";
import { ModelClient, type ModelConfig } from "./modelClient.js";
import { buildTextTeardownPrompt } from "./prompts/textTeardownPrompt.js";

export async function writeAiTextTeardownReport(options: {
  sample: BookOpeningSample;
  item?: RankingItem;
  outputDir: string;
  modelConfig: ModelConfig;
  dryRun: boolean;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });
  const messages = buildTextTeardownPrompt({
    sample: options.sample,
    item: options.item
  });

  if (options.dryRun) {
    const promptPath = path.join(options.outputDir, "latest-text-teardown-ai.prompt.md");
    await fs.writeFile(promptPath, renderPrompt(messages), "utf8");
    return promptPath;
  }

  const client = new ModelClient(options.modelConfig);
  const content = await client.generate(messages);
  const latestPath = path.join(options.outputDir, "latest-text-teardown-ai.md");
  const archivePath = path.join(
    options.outputDir,
    `${options.sample.bookId}-text-teardown-ai.md`
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
