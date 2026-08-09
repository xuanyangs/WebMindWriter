import fs from "node:fs/promises";
import path from "node:path";
import type { FeedbackRecord } from "../feedback/feedbackTypes.js";

export type IdeaBrief = {
  index: number;
  title: string;
  genreDirection: string;
  targetReader: string;
  corePleasure: string;
  openingHook: string;
  mainConflict: string;
  differentiation: string;
  risk: string;
  recommendationScore: number;
  transferableStructure: string[];
  evidence: string[];
  raw: string;
};

export type RecipeReportInput = {
  ideasPath: string;
  ideasMarkdown: string;
  feedback: FeedbackRecord[];
  outputDir: string;
  ideaIndex?: number;
};

export async function writeRecipeReport(
  input: RecipeReportInput
): Promise<string> {
  await fs.mkdir(input.outputDir, { recursive: true });

  const content = renderRecipeReport(input);
  const latestPath = path.join(input.outputDir, "latest-recipe.md");
  const archivePath = path.join(
    input.outputDir,
    `${compactTime(new Date().toISOString())}-recipe.md`
  );

  await fs.writeFile(latestPath, content, "utf8");
  await fs.writeFile(archivePath, content, "utf8");

  return latestPath;
}

export function renderRecipeReport(input: RecipeReportInput): string {
  const ideas = parseIdeaCards(input.ideasMarkdown);
  const selected = selectIdea(ideas, input.ideaIndex);

  if (!selected) {
    return [
      "# RecipeAgent 写作配方",
      "",
      `- 来源：${input.ideasPath}`,
      "- 状态：没有解析到可用选题卡",
      "",
      "## 下一步",
      "",
      "1. 先运行 `npm run agent:ideas -- --limit 5` 生成选题卡。",
      "2. 再运行 `npm run agent:recipe` 生成写作配方。",
      ""
    ].join("\n");
  }

  return [
    "# RecipeAgent 写作配方",
    "",
    `- 来源：${input.ideasPath}`,
    `- 选题卡：${selected.index}. ${selected.title}`,
    `- 题材方向：${selected.genreDirection}`,
    `- 推荐指数：${selected.recommendationScore}/5`,
    `- 反馈记忆：${input.feedback.length} 条`,
    "",
    "## 选题摘要",
    "",
    `- 目标读者：${selected.targetReader}`,
    `- 核心爽点：${selected.corePleasure}`,
    `- 开局钩子：${selected.openingHook}`,
    `- 主冲突：${selected.mainConflict}`,
    `- 差异化卖点：${selected.differentiation}`,
    `- 风险提示：${selected.risk}`,
    "",
    "## 写作配方",
    "",
    `- 暂定书名：${selected.title}`,
    `- 一句话卖点：${buildLogline(selected)}`,
    `- 主角定位：${buildProtagonist(selected)}`,
    `- 第一章压力场：${buildPressureField(selected)}`,
    `- 爽点兑现方式：${buildPayoff(selected)}`,
    `- 长线驱动力：${buildLongArc(selected)}`,
    "",
    "## 前三章大纲",
    "",
    ...buildFirstThreeChapters(selected).flatMap((chapter) => [
      `### 第 ${chapter.chapter} 章：${chapter.title}`,
      "",
      `- 目标：${chapter.goal}`,
      `- 冲突：${chapter.conflict}`,
      `- 爽点：${chapter.payoff}`,
      `- 章尾钩子：${chapter.cliffhanger}`,
      ""
    ]),
    "## 10 章节奏表",
    "",
    "| 章节 | 功能 | 关键事件 | 爽点兑现 | 章尾推动 |",
    "| --- | --- | --- | --- | --- |",
    ...buildTenChapterPlan(selected).map((row) =>
      `| ${row.chapter} | ${row.function} | ${row.event} | ${row.payoff} | ${row.next} |`
    ),
    "",
    "## 第一章写作任务",
    "",
    "1. 前 300 字写出主角身份、公开压力和被误判的理由。",
    "2. 前 800 字制造一次当场冲突，让读者明确站到主角一边。",
    "3. 中段只展示一个可验证的小优势，不要提前解释完整金手指。",
    "4. 结尾让小胜引出更大麻烦，保证第二章有立刻阅读理由。",
    "",
    "## 检查清单",
    "",
    "- 标题、第一段、第一章冲突是否都服务同一个读者承诺。",
    "- 第一章是否出现了可见收益，而不是只铺设定。",
    "- 主角优势是否能连续使用，并且每次使用都会带来新问题。",
    "- 是否避开了榜单作品和本地样本的具体书名、人设、情节照搬。",
    "",
    "## 反馈入口",
    "",
    `满意这份配方时可记录：\`npm run feedback:add -- --target recipe-${selected.index} --type recipe --rating 5 --note \"配方可写\"\``,
    ""
  ].join("\n");
}

export function parseIdeaCards(markdown: string): IdeaBrief[] {
  const matches = [...markdown.matchAll(/^###\s+(\d+)\.\s+(.+)$/gm)];
  return matches.map((match, position) => {
    const start = match.index ?? 0;
    const end = matches[position + 1]?.index ?? markdown.length;
    const raw = markdown.slice(start, end).trim();

    return {
      index: Number(match[1]),
      title: match[2].trim(),
      genreDirection: readBullet(raw, "题材方向"),
      targetReader: readBullet(raw, "目标读者"),
      corePleasure: readBullet(raw, "核心爽点"),
      openingHook: readBullet(raw, "开局钩子"),
      mainConflict: readBullet(raw, "主冲突"),
      differentiation: readBullet(raw, "差异化卖点"),
      risk: readBullet(raw, "风险提醒") || readBullet(raw, "风险提示"),
      recommendationScore: Number(readBullet(raw, "推荐指数").replace("/5", "")) || 0,
      transferableStructure: readNumberedSection(raw, "可借鉴结构"),
      evidence: readNumberedSection(raw, "证据来源"),
      raw
    };
  });
}

function selectIdea(
  ideas: IdeaBrief[],
  requestedIndex?: number
): IdeaBrief | undefined {
  if (requestedIndex !== undefined) {
    return ideas.find((idea) => idea.index === requestedIndex);
  }

  return [...ideas].sort(
    (a, b) => b.recommendationScore - a.recommendationScore || a.index - b.index
  )[0];
}

function readBullet(raw: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function readNumberedSection(raw: string, heading: string): string[] {
  const start = raw.indexOf(`${heading}：`);
  if (start === -1) return [];

  const rest = raw.slice(start + heading.length + 1);
  const end = rest.search(/\n(?:###|##|[^\n]+：)\n/);
  const section = end === -1 ? rest : rest.slice(0, end);

  return section
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+\.\s*/, ""))
    .filter(Boolean)
    .filter((line) => !line.endsWith("："));
}

function buildLogline(idea: IdeaBrief): string {
  return `${idea.targetReader}会被一个“被误判 -> 立刻证明 -> 引出更大麻烦”的开局拉住，核心爽点是${idea.corePleasure}`;
}

function buildProtagonist(idea: IdeaBrief): string {
  if (/历史|军事|抗战|谍战/.test(idea.genreDirection)) {
    return "低位但有判断力的人，掌握一条别人不信的关键信息，必须在公开场合证明自己。";
  }

  if (/都市/.test(idea.genreDirection)) {
    return "被现实关系或阶层压力压住的人，拥有可验证的信息差或能力差。";
  }

  if (/游戏|求生|末世|科幻/.test(idea.genreDirection)) {
    return "初始资源不足的人，比别人更快理解规则，并把第一次危机转成资源。";
  }

  return "处在低估位置的人，有一个可持续放大的优势，但每次使用都会制造新麻烦。";
}

function buildPressureField(idea: IdeaBrief): string {
  return `${idea.openingHook} 场景要尽量公开，让质疑、旁观和即时结果同时存在。`;
}

function buildPayoff(idea: IdeaBrief): string {
  return `第一章只兑现一个小结果：让读者确认“${idea.corePleasure}”是真的，但保留更大的规则和代价。`;
}

function buildLongArc(idea: IdeaBrief): string {
  return `长线围绕“${idea.mainConflict}”升级：每次胜利都扩大主角筹码，同时引来更强对手或更大规则压力。`;
}

function buildFirstThreeChapters(idea: IdeaBrief): Array<{
  chapter: number;
  title: string;
  goal: string;
  conflict: string;
  payoff: string;
  cliffhanger: string;
}> {
  return [
    {
      chapter: 1,
      title: "公开误判与第一次小胜",
      goal: "建立主角身份、压力场和读者承诺。",
      conflict: idea.mainConflict,
      payoff: `兑现一次${idea.corePleasure}`,
      cliffhanger: "小胜暴露主角优势，引来更高层级的质疑或任务。"
    },
    {
      chapter: 2,
      title: "优势试用与代价出现",
      goal: "让主角优势从偶然变成可重复的能力。",
      conflict: "旁观者开始试探，原本的小麻烦升级成必须处理的局面。",
      payoff: "主角第二次使用优势，但付出信息、资源或关系代价。",
      cliffhanger: "出现一个能识破或利用主角优势的新对手。"
    },
    {
      chapter: 3,
      title: "第一次完整闭环",
      goal: "完成一个小剧情闭环，证明这本书能持续爽。",
      conflict: "主角必须在更公开、更高风险的场景里再次选择。",
      payoff: "收益升级，同时把读者期待从短线爽点推向长线目标。",
      cliffhanger: "主角发现更大的规则或隐藏利益入口。"
    }
  ];
}

function buildTenChapterPlan(idea: IdeaBrief): Array<{
  chapter: number;
  function: string;
  event: string;
  payoff: string;
  next: string;
}> {
  const base = [
    ["开局钩子", "公开误判主角", "第一次小胜", "更大麻烦出现"],
    ["能力确认", "主角验证优势边界", "第二次收益", "有人开始盯上主角"],
    ["小闭环", "主角处理第一组危机", "收益升级", "发现隐藏入口"],
    ["关系压力", "盟友或对手提出条件", "主角掌握主动权", "进入更大场"],
    ["规则扩展", "展示世界或行业规则", "优势可复制", "代价被放大"],
    ["反打准备", "对手设置陷阱", "主角提前布局", "陷阱启动"],
    ["第一次反打", "主角公开破局", "打脸与资源双收", "幕后对手露头"],
    ["目标升级", "主角选择更大目标", "读者看到长线收益", "旧秩序施压"],
    ["阶段危机", "主角优势被限制", "用新办法绕开限制", "最终验证场到来"],
    ["阶段高潮", "完成第一卷小高潮", "兑现核心爽点", "抛出第二卷目标"]
  ];

  return base.map(([chapterFunction, event, payoff, next], index) => ({
    chapter: index + 1,
    function: chapterFunction,
    event: `${event}，服务于“${idea.genreDirection}”读者期待`,
    payoff,
    next
  }));
}

function compactTime(value: string): string {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}
