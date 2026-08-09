import type { BatchAnalysis, RankChange } from "../../analysis/rankDiff.js";
import type { RankBatch, RankingItem } from "../../types.js";
import type { ModelMessage } from "../modelClient.js";

type PromptTarget = RankChange & {
  tags: string[];
  description?: string;
  status?: string;
  wordCount?: string;
  heat?: string;
};

export function buildTeardownPrompt(
  batch: RankBatch,
  analysis: BatchAnalysis,
  limit: number
): ModelMessage[] {
  const targets = pickTargets(batch, analysis, limit);

  return [
    {
      role: "system",
      content: [
        "你是网文拆书 Agent。",
        "你只基于公开榜单元数据、书名、标签和简介做结构推断，不采集正文，不编造具体章节情节。",
        "你的任务是把样本拆成可迁移的写作结构，而不是让作者照抄。",
        "输出 Markdown，中文，重点给出可执行的拆解表。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 拆解样本",
        renderTargets(targets),
        "",
        "# 请输出",
        "对每本书分别输出：",
        "1. 题材承诺",
        "2. 开局钩子",
        "3. 主角欲望",
        "4. 金手指或差异点",
        "5. 爽点节奏",
        "6. 可迁移写法",
        "7. 不能照抄的部分",
        "",
        "最后输出一个原创选题练习：基于这些样本，给出 5 个不侵权、不照搬的新选题方向。"
      ].join("\n")
    }
  ];
}

function pickTargets(
  batch: RankBatch,
  analysis: BatchAnalysis,
  limit: number
): PromptTarget[] {
  const items = indexItems(batch);
  const seen = new Set<string>();
  const changes = [
    ...analysis.risers.filter((item) => (item.delta ?? 0) >= 2),
    ...analysis.risers.slice(0, limit * 2),
    ...analysis.newEntries.filter((item) => item.currentRank <= 20)
  ];

  return changes
    .map((change) => enrich(change, items))
    .filter((target) => {
      const key = target.bookId ?? `${target.rankName}:${target.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, limit));
}

function renderTargets(targets: PromptTarget[]): string {
  if (targets.length === 0) return "暂无样本。";

  return targets.map((target, index) => {
    const movement = target.delta === undefined
      ? `新上榜，当前第 ${target.currentRank}`
      : `第 ${target.previousRank} -> ${target.currentRank}，变化 ${target.delta}`;

    return [
      `## ${index + 1}. 《${target.title}》`,
      `- 榜单：${target.rankName}`,
      `- 变化：${movement}`,
      `- 作者：${target.author ?? "未知"}`,
      `- 分类：${target.categoryName ?? "未知"}`,
      `- 标签：${target.tags.join("、") || "暂无"}`,
      `- 元数据：${[target.wordCount, target.status, target.heat].filter(Boolean).join("；") || "暂无"}`,
      target.sourceUrl ? `- 链接：${target.sourceUrl}` : "",
      target.description ? `- 简介：${trim(target.description, 500)}` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function indexItems(batch: RankBatch): Map<string, RankingItem> {
  const result = new Map<string, RankingItem>();

  for (const snapshot of batch.snapshots) {
    for (const item of snapshot.items) {
      result.set(changeKey(snapshot.rankName, item.title, item.bookId), item);
    }
  }

  return result;
}

function enrich(
  change: RankChange,
  items: Map<string, RankingItem>
): PromptTarget {
  const item = items.get(changeKey(change.rankName, change.title, change.bookId));

  return {
    ...change,
    tags: item?.tags ?? [],
    description: item?.description,
    status: item?.status,
    wordCount: item?.wordCount,
    heat: item?.heat
  };
}

function changeKey(rankName: string, title: string, bookId?: string): string {
  return `${rankName}:${bookId ?? title}`;
}

function trim(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}
