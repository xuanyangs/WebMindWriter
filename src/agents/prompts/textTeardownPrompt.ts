import type { RankingItem } from "../../types.js";
import type { ModelMessage } from "../modelClient.js";
import type { BookOpeningSample } from "../../samples/sampleStore.js";

export function buildTextTeardownPrompt(options: {
  sample: BookOpeningSample;
  item?: RankingItem;
}): ModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是网文开局文本拆书 Agent。",
        "用户提供的是人工整理的样本文本。你可以基于文本做结构分析，但不要输出长篇原文复述。",
        "你的目标是拆解开局如何抓读者，并给出可迁移写法。",
        "输出 Markdown，中文，避免照抄式建议。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 样本元数据",
        `bookId: ${options.sample.bookId}`,
        `title: ${options.sample.title || options.item?.title || "未知"}`,
        options.item?.author ? `author: ${options.item.author}` : "",
        options.item?.category ? `category: ${options.item.category}` : "",
        options.item?.tags.length ? `tags: ${options.item.tags.join("、")}` : "",
        options.sample.sourceUrl || options.item?.sourceUrl
          ? `sourceUrl: ${options.sample.sourceUrl || options.item?.sourceUrl}`
          : "",
        "",
        "# 样本文本",
        trim(options.sample.content, 12_000),
        "",
        "# 请输出",
        "1. 开局一句话判断",
        "2. 第一钩是什么",
        "3. 第一章主要冲突",
        "4. 主角欲望",
        "5. 金手指/信息差/差异点",
        "6. 爽点兑现节奏",
        "7. 可以迁移到原创作品的结构",
        "8. 不建议照抄的具体元素",
        "9. 给作者的三条改写练习"
      ].filter(Boolean).join("\n")
    }
  ];
}

function trim(value: string, limit: number): string {
  const compact = value.trim();
  return compact.length > limit ? `${compact.slice(0, limit)}\n\n[已截断]` : compact;
}
