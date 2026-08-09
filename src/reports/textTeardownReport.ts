import fs from "node:fs/promises";
import path from "node:path";
import type { BookOpeningSample } from "../samples/sampleStore.js";
import type { RankingItem } from "../types.js";

export async function writeTextTeardownReport(options: {
  sample: BookOpeningSample;
  item?: RankingItem;
  outputDir: string;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const content = renderTextTeardownReport(options.sample, options.item);
  const latestPath = path.join(options.outputDir, "latest-text-teardown.md");
  const archivePath = path.join(
    options.outputDir,
    `${options.sample.bookId}-text-teardown.md`
  );

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderTextTeardownReport(
  sample: BookOpeningSample,
  item?: RankingItem
): string {
  const paragraphs = splitParagraphs(sample.content);
  const firstParagraph = paragraphs[0] ?? "";
  const hooks = inferHooks(sample.content, item);
  const conflicts = inferConflicts(sample.content);
  const promise = inferPromise(sample, item);

  return [
    `# 开局文本拆书报告`,
    ``,
    `- bookId：${sample.bookId}`,
    `- 标题：${sample.title || item?.title || "未知"}`,
    item?.author ? `- 作者：${item.author}` : "",
    item?.category ? `- 分类：${item.category}` : "",
    item?.tags.length ? `- 标签：${item.tags.join("、")}` : "",
    sample.sourceUrl ? `- 链接：${sample.sourceUrl}` : item?.sourceUrl ? `- 链接：${item.sourceUrl}` : "",
    `- 样本文本字数：${sample.content.length}`,
    ``,
    `## 题材承诺`,
    ``,
    promise,
    ``,
    `## 开局第一钩`,
    ``,
    firstParagraph ? trim(firstParagraph, 360) : "样本文本为空或缺少明显段落。",
    ``,
    `## 冲突信号`,
    ``,
    renderList(conflicts, "没有从样本文本里识别到明显冲突词，需要人工阅读确认。"),
    ``,
    `## 爽点/期待信号`,
    ``,
    renderList(hooks, "没有从样本文本里识别到明显爽点词，需要人工阅读确认。"),
    ``,
    `## 节奏判断`,
    ``,
    rhythmAdvice(sample.content, paragraphs.length),
    ``,
    `## 可迁移写法`,
    ``,
    `1. 把第一段拆成“身份 + 困境 + 反差/收益”三项，确认它是否足够快。`,
    `2. 记录第一个明确冲突出现的位置，如果超过 800 字才出现，开局可能偏慢。`,
    `3. 把样本里的具体设定替换成自己的世界观，只保留承诺方式和兑现节奏。`,
    `4. 手动补充前三章节点后，再交给 AI 深拆会更稳。`,
    ``,
    `## 给 AI 深拆的补充建议`,
    ``,
    `如果要跑 \`agent:teardown:text:ai\`，建议样本文本控制在开局 3000-10000 字，并补全 title/sourceUrl 元数据。`,
    ``
  ].filter(Boolean).join("\n");
}

function inferPromise(sample: BookOpeningSample, item?: RankingItem): string {
  const title = sample.title || item?.title || "这本书";
  const tags = item?.tags.length ? `，标签包含 ${item.tags.join("、")}` : "";
  const category = item?.category ? `，分类是 ${item.category}` : "";

  return `《${title}》的公开元数据${category}${tags}。开局文本需要验证：它是否快速兑现了标题和简介承诺。`;
}

function inferHooks(text: string, item?: RankingItem): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/重生|上一世|前世|这一世/, "重生/前世信息差"],
    [/系统|面板|任务|奖励/, "系统奖励或规则收益"],
    [/穿越|醒来|睁眼|异世/, "穿越后的身份反差"],
    [/危机|死亡|追杀|破产|饥饿|灾|怪物/, "生存危机或外部压力"],
    [/投资|赚钱|财富|首富|资本/, "财富增长和信息差"],
    [/朝堂|皇|军阀|谍|抗战|权/, "权力博弈或时代压力"],
    [/无敌|天赋|金色|神级|SSS|S级/, "强能力前置"]
  ];
  const found = patterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);

  return [...new Set([...(item?.tags ?? []), ...found])].slice(0, 10);
}

function inferConflicts(text: string): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/穷|破产|欠债|缺钱/, "资源不足"],
    [/死|杀|追|逃|危险/, "生命威胁"],
    [/退婚|背叛|羞辱|看不起/, "关系压迫或身份羞辱"],
    [/敌|战|军|谍|局势/, "阵营冲突"],
    [/饥饿|怪物|天灾|求生/, "生存规则压力"],
    [/考试|科举|朝堂|官/, "制度或权力压力"]
  ];

  return patterns.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

function rhythmAdvice(text: string, paragraphCount: number): string {
  if (text.length < 800) {
    return `样本文本较短，只能判断第一钩。建议补到至少 3000 字，再看第一次爽点兑现。`;
  }

  if (paragraphCount <= 3) {
    return `段落较少，可能是整段粘贴。建议保留原段落，这样更容易判断节奏。`;
  }

  if (text.length <= 5000) {
    return `样本文本适合看“第一章承诺”：身份、危机和第一个收益是否都出现。`;
  }

  return `样本文本足够做开局节奏判断：可以标出 1/3/5/10 章节点，观察爽点兑现间隔。`;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderList(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function trim(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}
