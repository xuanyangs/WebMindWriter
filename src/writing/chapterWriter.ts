import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "../projects/novelProjectStore.js";
import { updateNovelProject } from "../projects/novelProjectStore.js";

export type ChapterDraftResult = {
  project: NovelProject;
  chapterNumber: number;
  chapterPath: string;
  reportPath: string;
  wroteDraft: boolean;
};

export async function writeChapterDraft(options: {
  project: NovelProject;
  outlineMarkdown: string;
  memoryMarkdown: string;
  outputDir: string;
  chapterNumber: number;
  force: boolean;
}): Promise<ChapterDraftResult> {
  await fs.mkdir(options.project.paths.chaptersDir, { recursive: true });
  await fs.mkdir(options.outputDir, { recursive: true });

  const chapterPath = path.join(
    options.project.paths.chaptersDir,
    `chapter-${String(options.chapterNumber).padStart(3, "0")}.md`
  );
  const exists = await fileExists(chapterPath);
  let wroteDraft = false;

  if (!exists || options.force) {
    await fs.writeFile(
      chapterPath,
      renderChapterDraft({
        project: options.project,
        outlineMarkdown: options.outlineMarkdown,
        memoryMarkdown: options.memoryMarkdown,
        chapterNumber: options.chapterNumber
      }),
      "utf8"
    );
    wroteDraft = true;
    await appendMemory(options.project, options.chapterNumber, chapterPath);
    await updateNovelProject(options.project, { status: "drafting" });
  }

  const reportPath = path.join(options.outputDir, "latest-writing.md");
  await fs.writeFile(
    reportPath,
    renderWritingReport({
      project: options.project,
      chapterNumber: options.chapterNumber,
      chapterPath,
      wroteDraft,
      force: options.force
    }),
    "utf8"
  );

  return {
    project: options.project,
    chapterNumber: options.chapterNumber,
    chapterPath,
    reportPath,
    wroteDraft
  };
}

function renderChapterDraft(options: {
  project: NovelProject;
  outlineMarkdown: string;
  memoryMarkdown: string;
  chapterNumber: number;
}): string {
  const chapter = extractChapterPlan(options.outlineMarkdown, options.chapterNumber);
  const promise = readBullet(options.outlineMarkdown, "一句话卖点");
  const protagonist = readBullet(options.outlineMarkdown, "主角定位");
  const pressure = readBullet(options.outlineMarkdown, "第一章压力场");
  const payoff = readBullet(options.outlineMarkdown, "爽点兑现方式");
  const protagonistText = stripTerminalPunctuation(
    protagonist || "他知道别人不知道的一条规则"
  );

  return [
    `# 第 ${options.chapterNumber} 章：${chapter.title || "公开误判与第一次小胜"}`,
    "",
    `- 项目：${options.project.title}`,
    `- 题材方向：${options.project.genreDirection}`,
    `- 生成状态：草稿`,
    "",
    "## 写作目标",
    "",
    `- 一句话卖点：${promise || "被误判 -> 立刻证明 -> 引出更大麻烦"}`,
    `- 主角定位：${protagonist || "低位但有判断力的人"}`,
    `- 本章目标：${chapter.goal || "建立主角身份、压力场和读者承诺"}`,
    `- 本章冲突：${chapter.conflict || pressure || "公开误判主角"}`,
    `- 本章爽点：${chapter.payoff || payoff || "第一次小胜"}`,
    `- 章尾钩子：${chapter.cliffhanger || "小胜之后引出更大麻烦"}`,
    "",
    "## 正文草稿",
    "",
    "【待定主角】站在人群中央时，四周的声音先一步压了下来。",
    "",
    "那些目光并不锋利，却足够让一个普通人退后半步。有人等着看笑话，有人已经替他下了结论：这种位置、这种身份、这种局面，他不可能翻得过来。",
    "",
    "可【待定主角】没有退。他看见的不是羞辱，而是一道可以被验证的题。只要把最关键的那一点说出来，眼前这些人的判断就会当场裂开。",
    "",
    `他想起自己的优势：${protagonistText}。这不是能立刻横推一切的底牌，却足够让他在这一刻赢下一次。`,
    "",
    "质疑声越来越近，负责裁定的人也终于开口，要他给出解释。",
    "",
    "【待定主角】抬头，先没有辩解，只把所有人都忽略的细节摆到台面上。第一句话落下，人群安静了一瞬；第二句话落下，最先嘲笑他的人脸色变了。",
    "",
    "这一次小胜并不漂亮，甚至还有些冒险。但它足够清楚：他不是在硬撑，他真的看懂了局势里最要命的那条线。",
    "",
    "就在众人以为事情到此为止时，更高处传来新的命令。",
    "",
    "刚刚那道题，只是入场券。",
    "",
    "## 修订提示",
    "",
    "- 把【待定主角】替换成具体姓名和身份。",
    "- 把“关键细节”替换成你设定里的可验证证据。",
    "- 保留公开压力、当场证明、小胜引出大麻烦的结构。",
    "- 如果正文超过 2000 字，再补一段对手反应和主角代价。",
    "",
    "## 写作记忆摘录",
    "",
    trim(options.memoryMarkdown, 1200),
    ""
  ].join("\n");
}

function renderWritingReport(options: {
  project: NovelProject;
  chapterNumber: number;
  chapterPath: string;
  wroteDraft: boolean;
  force: boolean;
}): string {
  return [
    "# WritingAgent 章节报告",
    "",
    `- 项目：${options.project.id}`,
    `- 标题：${options.project.title}`,
    `- 章节：${options.chapterNumber}`,
    `- 章节文件：${options.chapterPath}`,
    `- 状态：${options.wroteDraft ? "已生成草稿" : "章节已存在，已跳过"}`,
    `- force：${options.force ? "true" : "false"}`,
    "",
    "## 下一步",
    "",
    "1. 打开章节文件，把【待定主角】和关键证据替换成具体设定。",
    "2. 人工扩写到 1800-2500 字，保留“公开误判 -> 当场证明 -> 更大麻烦”的结构。",
    "3. 修改后记录 `feedback:add --type recipe` 或后续 writing 反馈，帮助下一轮生成更贴近偏好。",
    ""
  ].join("\n");
}

function extractChapterPlan(markdown: string, chapterNumber: number): {
  title?: string;
  goal?: string;
  conflict?: string;
  payoff?: string;
  cliffhanger?: string;
} {
  const match = markdown.match(
    new RegExp(`### 第 ${chapterNumber} 章：(.+?)(?=\\n\\n### 第 |\\n\\n## |$)`, "s")
  );
  const raw = match?.[0] ?? "";

  return {
    title: match?.[1]?.split(/\r?\n/)[0]?.trim(),
    goal: readBullet(raw, "目标"),
    conflict: readBullet(raw, "冲突"),
    payoff: readBullet(raw, "爽点"),
    cliffhanger: readBullet(raw, "章尾钩子")
  };
}

function readBullet(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}：(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

async function appendMemory(
  project: NovelProject,
  chapterNumber: number,
  chapterPath: string
): Promise<void> {
  const note = [
    "",
    `- ${new Date().toISOString()}：WritingAgent 生成第 ${chapterNumber} 章草稿：${chapterPath}`
  ].join("\n");

  await fs.appendFile(project.paths.memory, `${note}\n`, "utf8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

function trim(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
}

function stripTerminalPunctuation(value: string): string {
  return value.replace(/[。！？.!?]+$/g, "");
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
