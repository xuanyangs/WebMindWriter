import fs from "node:fs/promises";
import path from "node:path";
import type { RankBatch } from "../types.js";
import type { BatchAnalysis, RankChange } from "../analysis/rankDiff.js";

export async function writeScanReport(
  batch: RankBatch,
  analysis: BatchAnalysis,
  outputDir: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = renderScanReport(batch, analysis);
  const latestPath = path.join(outputDir, "latest-scan-report.md");
  const archivePath = path.join(outputDir, `${batch.id}.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderScanReport(
  batch: RankBatch,
  analysis: BatchAnalysis
): string {
  return [
    `# 番茄公开榜单扫榜报告`,
    ``,
    `- 批次：${batch.id}`,
    `- 采集时间：${batch.capturedAt}`,
    `- 榜单数：${analysis.snapshotCount}`,
    `- 作品数：${analysis.itemCount}`,
    `- 已对比历史榜单：${analysis.comparedSnapshotCount}`,
    `- 采集失败：${batch.failures.length}`,
    ``,
    `## 今日观察`,
    ``,
    observation(analysis),
    ``,
    `## 上升最快`,
    ``,
    renderChanges(analysis.risers.slice(0, 15), "暂无可对比的上升作品。"),
    ``,
    `## 新上榜`,
    ``,
    renderChanges(analysis.newEntries.slice(0, 15), "暂无新上榜作品。"),
    ``,
    `## 下降明显`,
    ``,
    renderChanges(analysis.fallers.slice(0, 10), "暂无可对比的下降作品。"),
    ``,
    `## 热门分类`,
    ``,
    renderCounts(analysis.categoryCounts.slice(0, 15), "暂无分类数据。"),
    ``,
    `## 高频标签`,
    ``,
    renderCounts(analysis.tagCounts.slice(0, 15), "暂无标签数据。"),
    ``,
    `## 写作方向提示`,
    ``,
    `1. 优先看“新上榜”和“上升最快”的交集，它们更接近近期平台偏好。`,
    `2. 分类热度只能说明供给和曝光，不等于可以直接跟写；要结合简介、字数、完结状态判断。`,
    `3. 下一个版本可以把上升作品自动交给拆书 Agent，输出题材、开局、金手指、冲突模板。`,
    ``
  ].join("\n");
}

function observation(analysis: BatchAnalysis): string {
  const topCategory = analysis.categoryCounts[0];
  const topTag = analysis.tagCounts[0];

  return [
    `本次采集覆盖 ${analysis.snapshotCount} 个榜单、${analysis.itemCount} 条作品记录。`,
    topCategory ? `当前出现最多的分类是“${topCategory.name}”，共 ${topCategory.count} 条。` : "",
    topTag ? `当前最高频标签是“${topTag.name}”，共 ${topTag.count} 次。` : "",
    analysis.comparedSnapshotCount > 0
      ? `已有 ${analysis.comparedSnapshotCount} 个榜单完成历史对比，可以观察排名变化。`
      : `还没有足够的历史批次，先连续采集两轮后再看排名变化。`
  ].filter(Boolean).join("\n\n");
}

function renderChanges(items: RankChange[], emptyText: string): string {
  if (items.length === 0) return emptyText;

  return items.map((item, index) => {
    const delta = item.delta === undefined
      ? "新上榜"
      : item.delta > 0
        ? `上升 ${item.delta} 名`
        : `下降 ${Math.abs(item.delta)} 名`;
    const author = item.author ? `，作者：${item.author}` : "";
    const previous = item.previousRank ? `，原排名：${item.previousRank}` : "";
    const link = item.sourceUrl ? `，[链接](${item.sourceUrl})` : "";

    return `${index + 1}. ${item.title}（${item.rankName}，当前：${item.currentRank}，${delta}${previous}${author}${link}）`;
  }).join("\n");
}

function renderCounts(
  counts: Array<{ name: string; count: number }>,
  emptyText: string
): string {
  if (counts.length === 0) return emptyText;
  return counts
    .map((item, index) => `${index + 1}. ${item.name}：${item.count}`)
    .join("\n");
}
