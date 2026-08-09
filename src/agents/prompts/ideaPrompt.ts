import type { BatchAnalysis, RankChange } from "../../analysis/rankDiff.js";
import type { FeedbackRecord } from "../../feedback/feedbackTypes.js";
import type { BookOpeningSample } from "../../samples/sampleStore.js";
import type { RankBatch } from "../../types.js";
import type { ModelMessage } from "../modelClient.js";

export function buildIdeaPrompt(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  limit: number;
}): ModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是网文原创选题 Agent。",
        "你只能基于用户提供的公开榜单元数据、本地授权样本文本摘要和反馈记录做分析。",
        "不要声称读过榜单作品正文，不要复述或照搬样本文本。",
        "你的任务是生成可原创开发的新书选题卡，重点是读者承诺、开局冲突、主角优势和风险提醒。",
        "输出 Markdown，中文，具体、可执行。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 目标",
        `生成 ${options.limit} 张原创网文选题卡。`,
        "",
        "# 榜单批次",
        `批次：${options.batch.id}`,
        `采集时间：${options.batch.capturedAt}`,
        `榜单数：${options.analysis.snapshotCount}`,
        `作品记录数：${options.analysis.itemCount}`,
        `已对比历史榜单：${options.analysis.comparedSnapshotCount}`,
        "",
        "# 热门分类",
        renderCounts(options.analysis.categoryCounts.slice(0, 12)),
        "",
        "# 高频标签",
        renderCounts(options.analysis.tagCounts.slice(0, 12)),
        "",
        "# 上升最快",
        renderChanges(options.analysis.risers.slice(0, 12)),
        "",
        "# 新上榜",
        renderChanges(options.analysis.newEntries.slice(0, 12)),
        "",
        "# 本地开局样本摘要",
        renderSamples(options.samples.slice(0, 8)),
        "",
        "# 反馈记忆",
        renderFeedback(options.feedback.slice(0, 12)),
        "",
        "# 输出格式",
        "请输出：",
        "1. 本轮选题判断，一句话。",
        "2. 每张选题卡包含：临时书名、类型方向、读者承诺、开局第一屏、核心冲突、主角优势、前三章节奏、证据来源、避坑提醒。",
        "3. 最后给出你最推荐先开发的一张，并说明为什么。",
        "4. 明确说明这些是原创选题方向，不可照搬榜单作品或本地样本文本。"
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
      ? `新上榜，当前 #${item.currentRank}`
      : `#${item.previousRank} -> #${item.currentRank}，上升 ${item.delta}`;
    const author = item.author ? `，作者：${item.author}` : "";

    return `${index + 1}. 《${item.title}》：${item.rankName}，${movement}${author}`;
  }).join("\n");
}

function renderSamples(samples: BookOpeningSample[]): string {
  if (samples.length === 0) return "暂无本地样本。";

  return samples.map((sample, index) => [
    `${index + 1}. ${sample.title ?? sample.bookId}`,
    `bookId: ${sample.bookId}`,
    `字数：${sample.content.length}`,
    `开头摘要：${trim(sample.content, 260)}`
  ].join("\n")).join("\n\n");
}

function renderFeedback(feedback: FeedbackRecord[]): string {
  if (feedback.length === 0) return "暂无反馈。";

  return feedback.map((item, index) => {
    const note = item.note ? `，备注：${item.note}` : "";
    return `${index + 1}. ${item.type} | ${item.target} | ${item.rating}/5${note}`;
  }).join("\n");
}

function trim(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}
