import fs from "node:fs/promises";
import path from "node:path";
import type { BatchAnalysis, RankChange } from "../analysis/rankDiff.js";
import type { RankBatch, RankingItem } from "../types.js";

type TeardownTarget = RankChange & {
  tags: string[];
  description?: string;
  status?: string;
  wordCount?: string;
  heat?: string;
};

export async function writeBookTeardownReport(
  batch: RankBatch,
  analysis: BatchAnalysis,
  outputDir: string,
  limit: number
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });

  const content = renderBookTeardownReport(batch, analysis, limit);
  const latestPath = path.join(outputDir, "latest-book-teardown.md");
  const archivePath = path.join(outputDir, `${batch.id}-book-teardown.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderBookTeardownReport(
  batch: RankBatch,
  analysis: BatchAnalysis,
  limit: number
): string {
  const targets = pickTeardownTargets(batch, analysis, limit);

  return [
    `# 拆书 Agent 报告`,
    ``,
    `- 批次：${batch.id}`,
    `- 采集时间：${batch.capturedAt}`,
    `- 样本数：${targets.length}`,
    `- 选择逻辑：优先选择上升作品，再补充新上榜作品；只使用公开榜单元数据，不采集正文。`,
    ``,
    `## 使用方式`,
    ``,
    `这份报告不是让你照抄设定，而是把榜单样本拆成可迁移的写作结构。每本书先看标题、榜单、标签和简介，再决定是否人工阅读开局 3 章。`,
    ``,
    ...targets.flatMap((target, index) => renderTarget(target, index + 1)),
    `## 下一步给模型的提示词`,
    ``,
    renderPromptTemplate(targets)
  ].join("\n");
}

function pickTeardownTargets(
  batch: RankBatch,
  analysis: BatchAnalysis,
  limit: number
): TeardownTarget[] {
  const itemByKey = indexItems(batch);
  const seen = new Set<string>();
  const candidates = [
    ...analysis.risers.filter((item) => (item.delta ?? 0) >= 2),
    ...analysis.risers.slice(0, limit * 2),
    ...analysis.newEntries.filter((item) => item.currentRank <= 20)
  ];

  return candidates
    .map((change) => enrich(change, itemByKey))
    .filter((target) => {
      const key = target.bookId ?? `${target.rankName}:${target.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, limit));
}

function renderTarget(target: TeardownTarget, index: number): string[] {
  const movement = target.delta === undefined
    ? `新上榜，第 ${target.currentRank} 名`
    : `上升 ${target.delta} 名，第 ${target.previousRank} -> ${target.currentRank}`;
  const tags = target.tags.length > 0 ? target.tags.join("、") : "暂无标签";
  const hook = inferHook(target);
  const desire = inferDesire(target);
  const difference = inferDifference(target);
  const pace = inferPace(target);
  const transfer = inferTransfer(target);

  return [
    `## ${index}. 《${target.title}》`,
    ``,
    `- 榜单信号：${target.rankName}，${movement}`,
    `- 作者：${target.author ?? "未知"}`,
    `- 标签：${tags}`,
    `- 元数据：${[target.wordCount, target.status, target.heat].filter(Boolean).join("；") || "暂无"}`,
    target.sourceUrl ? `- 链接：${target.sourceUrl}` : "",
    ``,
    `### 题材承诺`,
    ``,
    `读者第一眼看到的是“${target.categoryName ?? target.rankName}”方向里的 ${hook}。标题需要在 10 秒内告诉读者：主角是谁、处境是什么、爽点从哪里来。`,
    ``,
    `### 开局钩子`,
    ``,
    `可以重点拆：${hook}。看它是否在开局迅速给出身份反差、危机压迫或利益诱惑。`,
    ``,
    `### 主角欲望`,
    ``,
    `${desire}`,
    ``,
    `### 差异点`,
    ``,
    `${difference}`,
    ``,
    `### 爽点节奏`,
    ``,
    `${pace}`,
    ``,
    `### 可迁移写法`,
    ``,
    `${transfer}`,
    ``,
    `### 避坑`,
    ``,
    `不要直接搬运书名、人设或金手指。只抽象“承诺方式、冲突结构、兑现节奏”，再换成自己的题材、人物和世界观。`,
    target.description ? [``, `### 简介摘录`, ``, trimDescription(target.description)].join("\n") : "",
    ``
  ].filter(Boolean);
}

function inferHook(target: TeardownTarget): string {
  const title = target.title;
  const parts = [
    title.includes("重生") ? "重生后改写命运" : "",
    title.includes("开局") ? "开局即给强钩子" : "",
    title.includes("系统") ? "系统能力带来确定收益" : "",
    title.includes("无敌") ? "强者爽感前置" : "",
    title.includes("求生") ? "生存压力驱动升级" : "",
    title.includes("军阀") || title.includes("抗战") || title.includes("谍战")
      ? "时代压力和权力博弈"
      : "",
    title.includes("赘婿") ? "低身份反打" : "",
    title.includes("领主") ? "经营扩张和势力养成" : ""
  ].filter(Boolean);

  return parts[0] ?? `明确的类型承诺和榜单定位`;
}

function inferDesire(target: TeardownTarget): string {
  const text = `${target.title} ${target.description ?? ""}`;

  if (/投资|首富|赚钱|财富/.test(text)) {
    return `主角欲望很可能是财富增长和阶层跃迁，适合拆“信息差 -> 决策 -> 收益兑现”的链路。`;
  }

  if (/求生|领主|村落|浮岛/.test(text)) {
    return `主角欲望很可能是活下去并扩大资源优势，适合拆“资源短缺 -> 规则发现 -> 稳定产出”的链路。`;
  }

  if (/朝堂|大秦|大明|军阀|谍战|抗战/.test(text)) {
    return `主角欲望很可能是权力、安全和历史节点改写，适合拆“身份站位 -> 阵营冲突 -> 局势翻盘”的链路。`;
  }

  if (/神雕|龙族|斩神|漫威|国运/.test(text)) {
    return `主角欲望很可能来自读者熟悉 IP 的二创反差，适合拆“原设期待 -> 反常选择 -> 新爽点”的链路。`;
  }

  return `主角欲望需要人工阅读前三章确认，优先记录主角当下最想解决的问题和第一笔收益。`;
}

function inferDifference(target: TeardownTarget): string {
  const signals = [
    ...target.tags,
    target.categoryName,
    target.rankName
  ].filter(Boolean).join("、");

  if (target.delta !== undefined && target.delta >= 2) {
    return `它不是静态榜首，而是短期上升样本。差异点要重点看：标题承诺是否更清晰，开局兑现是否更快，或者题材组合是否更新。当前信号：${signals || "暂无"}`;
  }

  if (target.delta === undefined) {
    return `它是新上榜样本。差异点要重点看：为什么能从榜外进入 Top 20，是标题、题材、简介卖点，还是新书曝光带来的短期机会。当前信号：${signals || "暂无"}`;
  }

  return `它的变化幅度不大，差异点可能比较细。建议和同榜前后作品并排看标题和简介，找出承诺表达差别。当前信号：${signals || "暂无"}`;
}

function inferPace(target: TeardownTarget): string {
  if (target.status === "已完结") {
    return `已完结作品仍在榜上，说明存量吸引力不错。拆的时候重点看开局承诺是否稳，以及中后段题材卖点是否足够长线。`;
  }

  if (target.wordCount?.includes("万")) {
    return `连载或中长篇样本适合看节奏密度：前三章给钩子，前十章完成一次明确收益，随后扩展更大的目标。`;
  }

  return `先按新书节奏拆：标题承诺要快，第一章冲突要明确，前三章最好完成一次小爽点兑现。`;
}

function inferTransfer(target: TeardownTarget): string {
  const category = target.categoryName ?? "当前分类";
  const tagText = target.tags.length > 0 ? `，再叠加 ${target.tags.slice(0, 3).join("、")} 标签` : "";

  return `可以迁移的是“${category} 的读者期待${tagText} + 一个更快兑现的开局”。做新选题时先写 3 个不同主角身份，再给每个身份配一个第一章危机。`;
}

function renderPromptTemplate(targets: TeardownTarget[]): string {
  const titles = targets.slice(0, 5).map((target) => `《${target.title}》`).join("、");

  return [
    `把以下榜单样本当作公开元数据，不要复述或照搬正文：${titles || "暂无样本"}。`,
    `请基于书名、榜单、标签、简介和排名变化，输出：`,
    `1. 每本书的题材承诺`,
    `2. 可能的开局冲突`,
    `3. 主角欲望和金手指/差异点`,
    `4. 可迁移到原创选题的写法`,
    `5. 明确不能照抄的部分`
  ].join("\n");
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
  itemByKey: Map<string, RankingItem>
): TeardownTarget {
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

function trimDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim().slice(0, 260);
}

function changeKey(rankName: string, title: string, bookId?: string): string {
  return `${rankName}:${bookId ?? title}`;
}
