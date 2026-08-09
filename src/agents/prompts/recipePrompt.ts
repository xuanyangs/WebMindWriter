import type { FeedbackRecord } from "../../feedback/feedbackTypes.js";
import type { IdeaBrief } from "../../reports/recipeReport.js";
import type { ModelMessage } from "../modelClient.js";

export function buildRecipePrompt(options: {
  idea: IdeaBrief;
  ideasPath: string;
  feedback: FeedbackRecord[];
}): ModelMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是网文写作配方 Agent。",
        "你的输入是一张原创选题卡，不是已有作品正文。",
        "你要把选题卡扩展成作者今天就能执行的写作配方。",
        "不要照搬榜单作品或样本文本，不要声称读过原文。",
        "输出 Markdown，中文，具体、可执行。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "# 来源",
        options.ideasPath,
        "",
        "# 选题卡",
        options.idea.raw,
        "",
        "# 反馈记忆",
        renderFeedback(options.feedback),
        "",
        "# 请输出",
        "1. 一句话卖点",
        "2. 主角定位",
        "3. 世界/行业规则",
        "4. 核心爽点循环",
        "5. 前三章大纲",
        "6. 10 章节奏表",
        "7. 第一章写作任务",
        "8. 避坑清单",
        "9. 可用于下一轮 Novel Project 的项目资料摘要"
      ].join("\n")
    }
  ];
}

function renderFeedback(feedback: FeedbackRecord[]): string {
  if (feedback.length === 0) return "暂无反馈。";

  return feedback.map((item, index) => {
    const note = item.note ? `，备注：${item.note}` : "";
    return `${index + 1}. ${item.type} | ${item.target} | ${item.rating}/5${note}`;
  }).join("\n");
}
