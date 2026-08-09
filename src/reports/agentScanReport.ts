import fs from "node:fs/promises";
import path from "node:path";
import type { BatchAnalysis, RankChange } from "../analysis/rankDiff.js";
import type { RankBatch, RankingItem } from "../types.js";

type EnrichedChange = RankChange & {
  tags: string[];
  description?: string;
  status?: string;
  wordCount?: string;
  heat?: string;
};

export async function writeAgentScanReport(
  batch: RankBatch,
  analysis: BatchAnalysis,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = renderAgentScanReport(batch, analysis);
  const latestPath = path.join(outputDir, "latest-agent-scan.md");
  const archivePath = path.join(outputDir, `${batch.id}-agent-scan.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderAgentScanReport(
  batch: RankBatch,
  analysis: BatchAnalysis
): string {
  const enriched = buildEnrichedChanges(batch, analysis);
  const tearDownTargets = pickTearDownTargets(enriched);
  const opportunities = buildOpportunities(analysis, enriched);
  const cautions = buildCautions(analysis, enriched);

  return [
    `# 扫榜 Agent 报告`,
    ``,
    `- 批次：${batch.id}`,
    `- 采集时间：${batch.capturedAt}`,
    `- 覆盖：${analysis.snapshotCount} 个榜单，${analysis.itemCount} 条作品记录`,
    `- 历史对比：${analysis.comparedSnapshotCount} 个榜单`,
    ``,
    `## 一句话结论`,
    ``,
    oneLineConclusion(analysis, enriched),
    ``,
    `## 今天哪些方向在动`,
    ``,
    renderOpportunities(opportunities),
    ``,
    `## 优先拆的书`,
    ``,
    renderTearDownTargets(tearDownTargets),
    ``,
    `## 可以参考的写法`,
    ``,
    renderWritingRecipes(tearDownTargets, opportunities),
    ``,
    `## 不建议盲跟`,
    ``,
    renderCautions(cautions),
    ``,
    `## 给新人作者的行动清单`,
    ``,
    `1. 先从“上升最快”和“新上榜”各挑 3 本，看开局 3 章，而不是只看榜首。`,
    `2. 每本只记录 4 件事：题材承诺、主角欲望、开局冲突、金手指或差异点。`,
    `3. 如果一个方向只有高存量、没有新上榜或上升信号，先观察，不急着开新坑。`,
    `4. 下一轮采集后，重点看同一批书是否连续上升；连续上升比单次波动更值得拆。`,
    ``,
    `## 原始变化摘录`,
    ``,
    `### 上升最快`,
    ``,
    renderChangeList(enriched.risers.slice(0, 10), "暂无上升样本。"),
    ``,
    `### 新上榜`,
    ``,
    renderChangeList(enriched.newEntries.slice(0, 10), "暂无新上榜样本。"),
    ``
  ].join("\n");
}

function buildEnrichedChanges(
  batch: RankBatch,
  analysis: BatchAnalysis
): {
  risers: EnrichedChange[];
  newEntries: EnrichedChange[];
  fallers: EnrichedChange[];
} {
  const itemByKey = new Map<string, RankingItem>();

  for (const snapshot of batch.snapshots) {
    for (const item of snapshot.items) {
      itemByKey.set(changeKey(snapshot.rankName, item.title, item.bookId), item);
    }
  }

  return {
    risers: analysis.risers.map((change) => enrichChange(change, itemByKey)),
    newEntries: analysis.newEntries.map((change) => enrichChange(change, itemByKey)),
    fallers: analysis.fallers.map((change) => enrichChange(change, itemByKey))
  };
}

function enrichChange(
  change: RankChange,
  itemByKey: Map<string, RankingItem>
): EnrichedChange {
  const item = itemByKey.get(changeKey(change.rankName, change.title, change.bookId));

  return {
    ...change,
    tags: item?.tags ?? [],
    description: item?.description,
    status: item?.status,
    wordCount: item?.wordCount,
    heat: item?.heat
  };
}

function pickTearDownTargets(enriched: {
  risers: EnrichedChange[];
  newEntries: EnrichedChange[];
}): EnrichedChange[] {
  const seen = new Set<string>();
  const candidates = [
    ...enriched.risers.filter((item) => (item.delta ?? 0) >= 2),
    ...enriched.risers.slice(0, 8),
    ...enriched.newEntries.filter((item) => item.currentRank <= 20)
  ];

  return candidates.filter((item) => {
    const key = item.bookId ?? `${item.rankName}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function buildOpportunities(
  analysis: BatchAnalysis,
  enriched: { risers: EnrichedChange[]; newEntries: EnrichedChange[] }
): Array<{ name: string; signal: string; evidence: number }> {
  const movementByCategory = countByCategory([
    ...enriched.risers,
    ...enriched.newEntries
  ]);

  return analysis.categoryCounts
    .map((category) => ({
      name: category.name,
      evidence: movementByCategory.get(category.name) ?? 0,
      signal: signalText(category.count, movementByCategory.get(category.name) ?? 0)
    }))
    .filter((item) => item.evidence > 0)
    .sort((a, b) => b.evidence - a.evidence || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function buildCautions(
  analysis: BatchAnalysis,
  enriched: { risers: EnrichedChange[]; newEntries: EnrichedChange[] }
): Array<{ name: string; reason: string }> {
  const movementByCategory = countByCategory([
    ...enriched.risers,
    ...enriched.newEntries
  ]);

  return analysis.categoryCounts
    .filter((category) => category.count >= 40 && !movementByCategory.has(category.name))
    .slice(0, 5)
    .map((category) => ({
      name: category.name,
      reason: `样本量高但本轮缺少明显上升或新上榜信号，可能只是存量供给大。`
    }));
}

function oneLineConclusion(
  analysis: BatchAnalysis,
  enriched: { risers: EnrichedChange[]; newEntries: EnrichedChange[] }
): string {
  const topOpportunity = buildOpportunities(analysis, enriched)[0];
  const topRiser = enriched.risers[0];

  if (topOpportunity && topRiser) {
    return `本轮最值得先看的方向是“${topOpportunity.name}”，同时优先拆《${topRiser.title}》这类正在上升的样本。`;
  }

  if (topOpportunity) {
    return `本轮最值得先看的方向是“${topOpportunity.name}”，但还需要下一轮数据确认是否持续。`;
  }

  return `本轮已有 ${analysis.itemCount} 条作品记录，但强变化信号还不够密集，建议继续采集一轮后再下判断。`;
}

function renderOpportunities(
  opportunities: Array<{ name: string; signal: string; evidence: number }>
): string {
  if (opportunities.length === 0) {
    return `暂无足够明确的方向信号。先继续采集，等连续变化出现。`;
  }

  return opportunities.map((item, index) =>
    `${index + 1}. ${item.name}：${item.signal}（变化样本 ${item.evidence} 个）`
  ).join("\n");
}

function renderTearDownTargets(items: EnrichedChange[]): string {
  if (items.length === 0) {
    return `暂无优先拆解对象。建议再采集一轮。`;
  }

  return items.map((item, index) => {
    const reason = item.delta === undefined
      ? `新上榜到第 ${item.currentRank} 名`
      : `从第 ${item.previousRank} 名升到第 ${item.currentRank} 名`;
    const tags = item.tags.length > 0 ? `；标签：${item.tags.join("、")}` : "";
    const meta = [item.wordCount, item.status, item.heat].filter(Boolean).join("；");

    return `${index + 1}. 《${item.title}》：${reason}，来自 ${item.rankName}${tags}${meta ? `；${meta}` : ""}`;
  }).join("\n");
}

function renderWritingRecipes(
  targets: EnrichedChange[],
  opportunities: Array<{ name: string }>
): string {
  const topCategories = opportunities.slice(0, 3).map((item) => item.name);
  const topTags = [...new Set(targets.flatMap((item) => item.tags))].slice(0, 6);

  return [
    topCategories.length > 0
      ? `1. 题材选择：优先围绕 ${topCategories.join("、")} 做选题池，每个方向先列 5 个差异化卖点。`
      : `1. 题材选择：先不要急着定方向，等下一轮确认连续上升信号。`,
    topTags.length > 0
      ? `2. 设定组合：本轮可观察标签包括 ${topTags.join("、")}，适合用来组合开局承诺。`
      : `2. 设定组合：标签信号暂弱，先从榜单名和简介里拆开局承诺。`,
    `3. 开局策略：拆上升样本时优先看前 3000 字如何给出身份、危机、收益和爽点兑现。`,
    `4. 避免误区：不要照搬书名和设定，应该抽象成“读者期待 + 冲突结构 + 节奏密度”。`
  ].join("\n");
}

function renderCautions(items: Array<{ name: string; reason: string }>): string {
  if (items.length === 0) {
    return `暂无明显需要避开的方向；但所有单轮信号都需要用下一轮数据复核。`;
  }

  return items.map((item, index) =>
    `${index + 1}. ${item.name}：${item.reason}`
  ).join("\n");
}

function renderChangeList(items: EnrichedChange[], emptyText: string): string {
  if (items.length === 0) return emptyText;

  return items.map((item, index) => {
    const movement = item.delta === undefined
      ? `新上榜，第 ${item.currentRank} 名`
      : `上升 ${item.delta} 名，第 ${item.previousRank} -> ${item.currentRank}`;
    const link = item.sourceUrl ? `，[链接](${item.sourceUrl})` : "";

    return `${index + 1}. 《${item.title}》：${movement}，${item.rankName}${link}`;
  }).join("\n");
}

function countByCategory(items: EnrichedChange[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const category = item.categoryName;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return counts;
}

function signalText(totalCount: number, movementCount: number): string {
  if (movementCount >= 5) return `变化密集，适合作为本轮重点观察方向`;
  if (movementCount >= 2) return `有多个变化样本，可以挑书拆解`;
  if (totalCount >= 40) return `存量高且出现单点变化，先观察是否连续`;
  return `出现单点变化，适合放入候选池`;
}

function changeKey(rankName: string, title: string, bookId?: string): string {
  return `${rankName}:${bookId ?? title}`;
}
