import fs from "node:fs/promises";
import path from "node:path";
import type { BatchAnalysis, RankChange } from "../analysis/rankDiff.js";
import type { FeedbackRecord } from "../feedback/feedbackTypes.js";
import type { BookOpeningSample } from "../samples/sampleStore.js";
import type { RankBatch } from "../types.js";
import type { SourceReport } from "./reportContext.js";

type IdeaCard = {
  title: string;
  genreDirection: string;
  targetReader: string;
  corePleasure: string;
  openingHook: string;
  mainConflict: string;
  differentiation: string;
  transferableStructure: string[];
  evidence: string[];
  risk: string;
  recommendationScore: number;
};

export async function writeIdeaReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  outputDir: string;
  limit: number;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const content = renderIdeaReport(options);
  const latestPath = path.join(options.outputDir, "latest-idea-report.md");
  const archivePath = path.join(options.outputDir, `${options.batch.id}-idea-report.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export async function writeIdeasReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  sourceReports: SourceReport[];
  outputDir: string;
  limit: number;
}): Promise<string> {
  await fs.mkdir(options.outputDir, { recursive: true });

  const content = renderIdeaReport(options);
  const latestPath = path.join(options.outputDir, "latest-ideas.md");
  const archivePath = path.join(options.outputDir, `${options.batch.id}-ideas.md`);

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderIdeaReport(options: {
  batch: RankBatch;
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  sourceReports?: SourceReport[];
  limit: number;
}): string {
  const ideas = buildIdeaCards(options);
  const feedbackHint = summarizeFeedback(options.feedback);
  const sourceReports = options.sourceReports ?? [];

  return [
    "# IdeaAgent 选题卡",
    "",
    `- 批次：${options.batch.id}`,
    `- 采集时间：${options.batch.capturedAt}`,
    `- 榜单样本：${options.analysis.snapshotCount} 个榜单，${options.analysis.itemCount} 条作品记录`,
    `- 本地开局样本：${options.samples.length} 份`,
    `- 反馈记忆：${options.feedback.length} 条`,
    `- 上游报告：${sourceReports.filter((report) => report.exists).length}/${sourceReports.length || 0} 份`,
    "",
    "## 本轮判断",
    "",
    buildOneLine(options.analysis, options.samples, options.feedback),
    "",
    "## 反馈偏好",
    "",
    feedbackHint,
    "",
    "## 上游报告记忆",
    "",
    renderSourceReports(sourceReports),
    "",
    "## 选题卡",
    "",
    ideas.length > 0
      ? ideas.flatMap((idea, index) => renderIdeaCard(idea, index + 1)).join("\n")
      : "暂时没有足够信号生成选题卡。建议先运行 crawl:all 或补充本地开局样本。",
    "",
    "## 下一步",
    "",
    "1. 从上面的选题卡里挑 1 个最想写的方向，记录 `feedback:add --type idea --rating 4/5`。",
    "2. 对该方向补 3 个不同主角身份、3 个第一章危机、3 个爽点兑现方式。",
    "3. 下一轮接 RecipeAgent，把高分选题卡扩展成 10 章节奏表和第一章大纲。",
    ""
  ].join("\n");
}

function buildIdeaCards(options: {
  analysis: BatchAnalysis;
  samples: BookOpeningSample[];
  feedback: FeedbackRecord[];
  sourceReports?: SourceReport[];
  limit: number;
}): IdeaCard[] {
  const hotCategories = pickHotCategories(options.analysis);
  const hotTags = options.analysis.tagCounts.slice(0, 8).map((item) => item.name);
  const sampleSignals = extractSampleSignals(options.samples);
  const reportSignals = extractReportSignals(options.sourceReports ?? []);
  const feedbackSignals = options.feedback
    .filter((item) => item.rating >= 4)
    .map((item) => item.note)
    .filter(Boolean) as string[];

  return hotCategories.slice(0, Math.max(1, options.limit)).map((category, index) => {
    const tag = hotTags[index % Math.max(1, hotTags.length)] ?? "强反差";
    const sampleSignal = sampleSignals[index % Math.max(1, sampleSignals.length)] ?? "开局快速给身份、困境和收益";
    const reportSignal = pickReportSignal(category.name, reportSignals);
    const feedbackSignal = feedbackSignals[index % Math.max(1, feedbackSignals.length)] ?? "优先保留清晰钩子和冲突信号";
    const seed = pickSeedChange(options.analysis, category.name, index);

    return {
      title: makeIdeaTitle(category.name, tag, index),
      genreDirection: category.name,
      targetReader: makeTargetReader(category.name, tag),
      corePleasure: makeCorePleasure(category.name, tag),
      openingHook: `${sampleSignal}。第一屏要让读者立刻知道主角是谁、被谁误判、马上能赢回什么。`,
      mainConflict: makeConflict(category.name, seed),
      differentiation: makeDifferentiation(category.name, tag, reportSignal),
      transferableStructure: makeTransferableStructure(category.name),
      evidence: makeEvidence(category, seed, feedbackSignal, reportSignal),
      risk: `不要照搬榜单书名、人物和设定；只迁移“读者期待、冲突结构、爽点兑现节奏”。${category.movementCount < 2 ? "当前变化样本偏少，需要下一轮榜单复核。" : ""}`,
      recommendationScore: recommendationScore(category, index)
    };
  });
}

function pickHotCategories(
  analysis: BatchAnalysis
): Array<{ name: string; totalCount: number; movementCount: number }> {
  const movementCounts = new Map<string, number>();

  for (const change of [...analysis.risers, ...analysis.newEntries]) {
    const name = change.categoryName;
    if (!name) continue;
    movementCounts.set(name, (movementCounts.get(name) ?? 0) + 1);
  }

  return analysis.categoryCounts
    .map((category) => ({
      name: category.name,
      totalCount: category.count,
      movementCount: movementCounts.get(category.name) ?? 0
    }))
    .sort((a, b) =>
      b.movementCount - a.movementCount ||
      b.totalCount - a.totalCount ||
      a.name.localeCompare(b.name)
    )
    .filter((item) => item.movementCount > 0 || item.totalCount >= 10)
    .slice(0, 12);
}

function pickSeedChange(
  analysis: BatchAnalysis,
  categoryName: string,
  offset: number
): RankChange | undefined {
  const candidates = [...analysis.risers, ...analysis.newEntries].filter(
    (item) => item.categoryName === categoryName
  );

  return candidates[offset % Math.max(1, candidates.length)];
}

function extractSampleSignals(samples: BookOpeningSample[]): string[] {
  const signals = samples.map((sample) => {
    const text = `${sample.title ?? ""} ${sample.content.slice(0, 1200)}`;

    if (/高考|考试|满分|检讨|课堂|老师|学生/.test(text)) {
      return "开局把公共场合压力和能力证明绑在一起";
    }

    if (/全网|直播|综艺|热搜|网友|爆火/.test(text)) {
      return "开局用围观视角制造外部评价压力";
    }

    if (/心声|误会|语音包|全家|仙尊/.test(text)) {
      return "开局用信息错位制造连续误解和反差笑点";
    }

    if (/登月|科研|发明|实验|工程/.test(text)) {
      return "开局用不被相信的大目标制造强钩子";
    }

    return "开局快速给身份、困境和收益";
  });

  return [...new Set(signals)];
}

function summarizeFeedback(feedback: FeedbackRecord[]): string {
  if (feedback.length === 0) {
    return "暂无反馈记忆。本轮选题卡会按默认标准生成：钩子清晰、冲突前置、爽点可持续。";
  }

  const high = feedback.filter((item) => item.rating >= 4);
  const low = feedback.filter((item) => item.rating <= 2);
  const lines = [
    `- 高分反馈：${high.length} 条`,
    `- 低分反馈：${low.length} 条`
  ];

  const notes = feedback
    .map((item) => item.note)
    .filter(Boolean)
    .slice(0, 5);

  if (notes.length > 0) {
    lines.push(`- 最近备注：${notes.join("；")}`);
  }

  return lines.join("\n");
}

function renderSourceReports(reports: SourceReport[]): string {
  if (reports.length === 0) {
    return "未配置上游报告读取，本轮只使用数据库、样本和反馈。";
  }

  return reports.map((report, index) => {
    if (!report.exists) {
      return `${index + 1}. ${report.name}：缺失（${report.path}）`;
    }

    return `${index + 1}. ${report.name}：已读取 ${report.content.length} 字（${report.path}）`;
  }).join("\n");
}

function extractReportSignals(reports: SourceReport[]): string[] {
  const text = reports
    .filter((report) => report.exists)
    .map((report) => report.content)
    .join("\n");
  const signals: string[] = [];

  if (/历史古代|朝堂|文臣|武斗/.test(text)) {
    signals.push("上游报告提示历史古代有密集变化，适合做公开压力场和权力翻盘");
  }

  if (/都市种田|投资|重生2009|财富/.test(text)) {
    signals.push("上游报告提示都市种田可迁移信息差、决策和收益兑现链路");
  }

  if (/游戏体育|求生|浮岛|资源短缺/.test(text)) {
    signals.push("上游报告提示求生/游戏方向适合资源短缺、规则发现和稳定产出");
  }

  if (/动漫衍生|衍生|无敌/.test(text)) {
    signals.push("上游报告提示衍生方向的核心是熟悉期待上的反常选择");
  }

  if (/开局钩子|冲突信号|第一钩/.test(text)) {
    signals.push("上游报告和反馈共同强调：第一屏必须同时给钩子和冲突");
  }

  return [...new Set(signals)];
}

function pickReportSignal(category: string, signals: string[]): string {
  const matched = signals.find((signal) => signal.includes(category));
  if (matched) return matched;

  if (/历史|军事|抗战|谍战/.test(category)) {
    return signals.find((signal) => /历史|权力|公开压力/.test(signal)) ?? defaultReportSignal();
  }

  if (/都市|种田/.test(category)) {
    return signals.find((signal) => /都市|信息差|收益/.test(signal)) ?? defaultReportSignal();
  }

  if (/游戏|求生|末世|科幻/.test(category)) {
    return signals.find((signal) => /求生|游戏|资源/.test(signal)) ?? defaultReportSignal();
  }

  if (/衍生|动漫/.test(category)) {
    return signals.find((signal) => /衍生|反常选择/.test(signal)) ?? defaultReportSignal();
  }

  return signals[0] ?? defaultReportSignal();
}

function defaultReportSignal(): string {
  return "上游报告强调：优先迁移承诺方式、冲突结构和兑现节奏";
}

function buildOneLine(
  analysis: BatchAnalysis,
  samples: BookOpeningSample[],
  feedback: FeedbackRecord[]
): string {
  const topCategory = pickHotCategories(analysis)[0]?.name ?? "未识别方向";
  const sampleText = samples.length > 0 ? `已纳入 ${samples.length} 份本地开局样本` : "尚未纳入本地开局样本";
  const feedbackText = feedback.length > 0 ? `已有 ${feedback.length} 条反馈可影响取舍` : "还没有足够反馈记忆";

  return `本轮优先围绕“${topCategory}”生成原创选题卡；${sampleText}，${feedbackText}。`;
}

function renderIdeaCard(idea: IdeaCard, index: number): string[] {
  return [
    `### ${index}. ${idea.title}`,
    "",
    `- 题材方向：${idea.genreDirection}`,
    `- 目标读者：${idea.targetReader}`,
    `- 核心爽点：${idea.corePleasure}`,
    `- 开局钩子：${idea.openingHook}`,
    `- 主冲突：${idea.mainConflict}`,
    `- 差异化卖点：${idea.differentiation}`,
    `- 风险提醒：${idea.risk}`,
    `- 推荐指数：${idea.recommendationScore}/5`,
    "",
    "可借鉴结构：",
    "",
    ...idea.transferableStructure.map((beat, beatIndex) => `${beatIndex + 1}. ${beat}`),
    "",
    "证据来源：",
    "",
    ...idea.evidence.map((item, evidenceIndex) => `${evidenceIndex + 1}. ${item}`),
    ""
  ];
}

function makeTargetReader(category: string, tag: string): string {
  if (/女频|现言|古言|幻想言情/.test(category)) {
    return `喜欢${category}里关系拉扯、身份反差和快速情绪兑现的女性读者，同时吃${tag}标签。`;
  }

  if (/历史|军事|抗战|谍战/.test(category)) {
    return `喜欢局势博弈、身份压迫和小人物翻盘的男频读者，需要第一章就看到判断力收益。`;
  }

  if (/都市/.test(category)) {
    return `喜欢现实压力、财富/能力跃迁和公开打脸的都市读者，希望爽点能被验证。`;
  }

  if (/游戏|求生|末世|科幻/.test(category)) {
    return `喜欢规则探索、资源积累和生存升级的读者，期待主角优势能持续扩大。`;
  }

  return `喜欢${category}明确类型承诺的读者，重点要钩子快、冲突清楚、收益可持续。`;
}

function makeCorePleasure(category: string, tag: string): string {
  if (/都市|种田/.test(category)) {
    return `${tag}带来的信息差被当场验证，主角从被看低到拿到第一笔确定收益。`;
  }

  if (/历史|军事|抗战|谍战/.test(category)) {
    return `主角用现代认知或关键情报压过旧秩序，让质疑者在公开场合改变态度。`;
  }

  if (/游戏|求生|末世|科幻/.test(category)) {
    return `别人还在摸规则，主角先发现稳定产出路径，把危机变成资源增长。`;
  }

  return `${tag}承诺快速兑现，主角优势不是口号，而是在第一章改变局面。`;
}

function makeIdeaTitle(category: string, tag: string, index: number): string {
  const templates = [
    `被全场看低后，我把${category}玩成公开证明题`,
    `${tag}失控当天，我用一条隐藏规则翻盘`,
    `别人还在卷套路，我先把${category}的收益兑现了`,
    `开局被误判成废牌，其实我手握${tag}底层逻辑`
  ];

  return templates[index % templates.length];
}

function makeConflict(category: string, seed?: RankChange): string {
  const seedText = seed ? `参考信号来自《${seed.title}》所在榜单的变化，但不复用其具体设定。` : "暂无单书变化信号，先按分类读者期待设计冲突。";

  return `主角在${category}读者熟悉的压力场里被公开质疑，必须在第一章内拿出一次小胜证明自己。${seedText}`;
}

function makeAdvantage(category: string, tag: string): string {
  if (/都市|职场|学霸|娱乐/.test(category)) {
    return `信息差 + 可验证能力：主角知道别人忽略的规则，并能当场兑现一个结果。标签侧重 ${tag}。`;
  }

  if (/玄幻|仙侠|科幻|末世/.test(category)) {
    return `规则理解 + 成长资源：主角不是无敌，而是更早看懂世界规则，第一章先兑现小收益。标签侧重 ${tag}。`;
  }

  if (/历史|军事|悬疑/.test(category)) {
    return `局势判断 + 关键证据：主角用一条别人不信的信息改变局面，制造阵营冲突。标签侧重 ${tag}。`;
  }

  return `稳定优势 + 公开压力：优势必须能连续使用，且每次使用都会带来新麻烦。标签侧重 ${tag}。`;
}

function makeDifferentiation(category: string, tag: string, reportSignal: string): string {
  return `不把${category}+${tag}停留在设定层，而是设计一个第一章可验证的小胜场景。${reportSignal}`;
}

function makeTransferableStructure(category: string): string[] {
  return [
    `前 300 字：给出${category}读者能秒懂的身份和压力场。`,
    "前 800 字：让主角遭遇一次公开误判，制造读者替主角不服的情绪。",
    "中段：抛出主角优势，但只兑现一个小结果，避免一章封顶。",
    "结尾：小胜之后带来更大的麻烦，把第二章阅读理由钉住。"
  ];
}

function makeEvidence(
  category: { name: string; totalCount: number; movementCount: number },
  seed: RankChange | undefined,
  feedbackSignal: string,
  reportSignal: string
): string[] {
  const lines = [
    `${category.name} 在当前榜单中有 ${category.totalCount} 条记录，变化样本 ${category.movementCount} 条。`,
    `反馈偏好：${feedbackSignal}`,
    `报告信号：${reportSignal}`
  ];

  if (seed) {
    const movement = seed.delta === undefined
      ? `新上榜 #${seed.currentRank}`
      : `从 #${seed.previousRank} 到 #${seed.currentRank}`;
    lines.push(`榜单变化样本：《${seed.title}》，${movement}，来自 ${seed.rankName}。`);
  }

  return lines;
}

function recommendationScore(
  category: { totalCount: number; movementCount: number },
  index: number
): number {
  const movementScore = Math.min(2, category.movementCount / 2);
  const volumeScore = Math.min(1.5, category.totalCount / 40);
  const freshnessPenalty = index * 0.15;
  const score = 2 + movementScore + volumeScore - freshnessPenalty;

  return Math.max(3, Math.min(5, Math.round(score * 10) / 10));
}
