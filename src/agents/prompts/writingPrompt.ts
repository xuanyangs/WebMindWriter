import type { NovelProject } from "../../projects/novelProjectStore.js";
import type { ModelMessage } from "../modelClient.js";

export function buildWritingPrompt(options: {
  project: NovelProject;
  outlineMarkdown: string;
  memoryMarkdown: string;
  chapterNumber: number;
}): ModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是网文章节写作 Agent。",
        "你会读取本地小说项目的大纲和记忆，生成指定章节草稿。",
        "不要照搬榜单作品或样本文本；只使用项目资料里的原创设定与结构。",
        "输出 Markdown，中文。正文草稿要可继续人工改写，避免空泛讲解。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 项目",
        `项目 ID：${options.project.id}`,
        `标题：${options.project.title}`,
        `题材方向：${options.project.genreDirection}`,
        "",
        "# 要写的章节",
        `第 ${options.chapterNumber} 章`,
        "",
        "# 大纲",
        trim(options.outlineMarkdown, 7000),
        "",
        "# 写作记忆",
        trim(options.memoryMarkdown, 3000),
        "",
        "# 输出要求",
        "1. 先给本章写作目标。",
        "2. 再输出 1800-2500 字正文草稿。",
        "3. 第一屏必须出现身份、压力场、误判和明确冲突。",
        "4. 本章必须有一次小爽点兑现。",
        "5. 结尾必须引出更大麻烦。",
        "6. 最后列出需要人工补全的具体设定。"
      ].join("\n")
    }
  ];
}

function trim(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
}
