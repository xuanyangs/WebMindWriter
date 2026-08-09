import type { BatchAnalysis, RankChange } from "../../analysis/rankDiff.js";
import type { RankBatch } from "../../types.js";
import type { ModelMessage } from "../modelClient.js";

export function buildScanPrompt(
  batch: RankBatch,
  analysis: BatchAnalysis
): ModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是网文作者的扫榜分析 Agent。",
        "你只基于用户提供的公开榜单元数据分析，不编造正文内容，不声称读过原文。",
        "你的目标是帮助作者判断题材方向、拆解样本优先级和下一步行动。",
        "输出 Markdown，中文，结论要具体，避免空泛鸡汤。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 榜单批次",
        `批次：${batch.id}`,
        `采集时间：${batch.capturedAt}`,
        `榜单数：${analysis.snapshotCount}`,
        `作品记录数：${analysis.itemCount}`,
        `已对比历史榜单：${analysis.comparedSnapshotCount}`,
        "",
        "# 热门分类",
        renderCounts(analysis.categoryCounts.slice(0, 15)),
        "",
        "# 高频标签",
        renderCounts(analysis.tagCounts.slice(0, 15)),
        "",
        "# 上升最快",
        renderChanges(analysis.risers.slice(0, 20)),
        "",
        "# 新上榜",
        renderChanges(analysis.newEntries.slice(0, 20)),
        "",
        "# 下降明显",
        renderChanges(analysis.fallers.slice(0, 10)),
        "",
        "# 请输出",
        "1. 一句话结论",
        "2. 今天哪些方向在动，按优先级排序",
        "3. 哪些书值得拆，说明原因",
        "4. 新人作者可以参考的写法",
        "5. 不建议盲跟的方向",
        "6. 下一轮采集应该重点观察什么"
      ].join("\n")
    }
  ];
}

function renderCounts(items: Array<{ name: string; count: number }>): string {
  if (items.length === 0) return "暂无";
  return items.map((item, index) => `${index + 1}. ${item.name}: ${item.count}`).join("\n");
}

function renderChanges(items: RankChange[]): string {
  if (items.length === 0) return "暂无";

  return items.map((item, index) => {
    const movement = item.delta === undefined
      ? `新上榜，当前第 ${item.currentRank}`
      : `${item.previousRank} -> ${item.currentRank}，变化 ${item.delta}`;
    const author = item.author ? `，作者：${item.author}` : "";
    const link = item.sourceUrl ? `，链接：${item.sourceUrl}` : "";

    return `${index + 1}. 《${item.title}》｜${item.rankName}｜${movement}${author}${link}`;
  }).join("\n");
}
