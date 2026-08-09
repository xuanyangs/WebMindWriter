# WebMindWriter / fanqie-loop

番茄小说公开榜单采集与扫榜分析的最小 Loop 工程。

当前版本只采集公开榜单上的作品元信息，用来支持后续“扫榜 Agent”。不要采集正文，不绕登录、验证码、付费墙或接口限制。

## 当前闭环

```text
采集公开榜单
-> 保存 JSON/CSV 快照
-> 写入本地 SQLite
-> 对比历史排名变化
-> 生成 Markdown 扫榜报告
-> 给查询命令和后续 Agent 使用
```

## 安装

运行环境：Node.js 22.5+。本地已用 Node.js 24 验证。SQLite 使用 Node 自带的 `node:sqlite`，运行时可能会看到 experimental warning，不影响当前 MVP 使用。

```bash
npm install
```

## 常用命令

单榜采集：

```bash
npm run crawl
```

批量采集全部内置公开榜单，并生成报告：

```bash
npm run crawl:all
```

循环采集单榜：

```bash
npm run loop -- --interval-minutes 60
```

循环采集全部榜单：

```bash
npm run loop:all -- --limit 20 --interval-minutes 360
```

把已有 `data` JSON 导入 SQLite：

```bash
npm run db:import
```

查询最新批次：

```bash
npm run query:latest
```

查询指定榜单或日期：

```bash
npm run query:rank -- --date 2026-08-09
npm run query:rank -- --rank-name 男频阅读榜-东方仙侠
```

查询一本书的历史排名：

```bash
npm run query:book -- --book-id 7653392559628094488
```

重新生成最新扫榜报告：

```bash
npm run report
```

生成作者决策版扫榜 Agent 报告：

```bash
npm run agent:scan
```

生成拆书 Agent 报告：

```bash
npm run agent:teardown -- --limit 5
```

创建一个人工开局样本文本模板：

```bash
npm run sample:add -- --book-id 7656411449241111576 --title "重生2009：我靠投资成首富"
```

从本地文件导入人工样本文本：

```bash
npm run sample:add -- --book-id 7656411449241111576 --title "重生2009：我靠投资成首富" --file ./my-opening.md
```

从本地目录批量导入 txt 开局样本，每本只取前 8000 字：

```bash
npm run sample:import-dir -- --dir F:\Agent\ceshi --limit-chars 8000
```

基于人工样本文本生成规则版深度拆书报告：

```bash
npm run agent:teardown:text -- --book-id 7656411449241111576
```

批量生成规则版深度拆书报告：

```bash
npm run agent:teardown:text:batch
```

基于人工样本文本生成 AI prompt，不调用模型：

```bash
npm run agent:teardown:text:ai -- --book-id 7656411449241111576 --dry-run
```

记录报告反馈：

```bash
npm run feedback:add -- --target local-b18e553753 --type text-teardown --rating 5 --note "第一钩判断有用"
```

查看反馈：

```bash
npm run feedback:list
npm run feedback:list -- --summary
```

生成 AI 扫榜 prompt，不调用模型：

```bash
npm run agent:scan:ai -- --dry-run
```

生成 AI 拆书 prompt，不调用模型：

```bash
npm run agent:teardown:ai -- --limit 5 --dry-run
```

生成规则版原创选题卡：

```bash
npm run agent:ideas -- --limit 5
npm run agent:idea -- --limit 5
```

`agent:ideas` 会读取最新扫榜报告、榜单拆书报告、本地文本拆书报告和 feedback 反馈，输出 `reports/latest-ideas.md`。

生成 AI 原创选题 prompt，不调用模型：

```bash
npm run agent:ideas:ai -- --limit 5 --dry-run
npm run agent:idea:ai -- --limit 5 --dry-run
```

把推荐指数最高的选题卡扩展成写作配方：

```bash
npm run agent:recipe
```

指定某张选题卡生成配方：

```bash
npm run agent:recipe -- --idea-index 2
```

生成 AI 写作配方 prompt，不调用模型：

```bash
npm run agent:recipe:ai -- --dry-run
```

从最新写作配方创建本地小说项目：

```bash
npm run agent:project:create
```

指定项目目录名：

```bash
npm run agent:project:create -- --slug my-novel
```

读取本地小说项目，生成第一章草稿：

```bash
npm run agent:write:chapter
```

指定项目和章节：

```bash
npm run agent:write:chapter -- --project-id novel-15c8e71c --chapter 1
```

生成 AI 章节写作 prompt，不调用模型：

```bash
npm run agent:write:chapter:ai -- --dry-run
```

运行 Agent Orchestrator，一次编排扫榜、榜单拆书、本地文本拆书和反馈汇总：

```bash
npm run agent:run -- --goal daily
```

只跑某一个目标：

```bash
npm run agent:run -- --goal scan
npm run agent:run -- --goal teardown --limit 5
npm run agent:run -- --goal text-teardown --sample-limit 6
npm run agent:run -- --goal feedback-review
npm run agent:run -- --goal idea
npm run agent:run -- --goal recipe
npm run agent:run -- --goal project
npm run agent:run -- --goal writing
```

默认不会重新抓取，也不会真实调用模型。需要联网抓榜时加 `--crawl`，需要真实调用模型时加 `--live-ai`：

```bash
npm run agent:run -- --goal daily --crawl
npm run agent:run -- --goal daily --live-ai
```

配置 `MODEL_API_KEY` 后调用 OpenAI-compatible 模型：

```bash
npm run agent:scan:ai
npm run agent:teardown:ai -- --limit 5
npm run agent:ideas:ai -- --limit 5
npm run agent:idea:ai -- --limit 5
npm run agent:recipe:ai
npm run agent:write:chapter:ai
```

## 输出位置

```text
data/latest-rank-batch.json
data/latest-rank-batch.csv
data/rank-batches.jsonl
data/rank-snapshots.json
data/fanqie-loop.sqlite
reports/latest-scan-report.md
reports/latest-agent-scan.md
reports/latest-book-teardown.md
reports/latest-agent-scan-ai.md
reports/latest-agent-scan-ai.prompt.md
reports/latest-book-teardown-ai.md
reports/latest-book-teardown-ai.prompt.md
reports/latest-text-teardown.md
reports/latest-text-teardown-ai.md
reports/latest-text-teardown-ai.prompt.md
reports/latest-ideas.md
reports/latest-ideas-ai.md
reports/latest-ideas-ai.prompt.md
reports/latest-idea-report.md
reports/latest-idea-ai.md
reports/latest-idea-ai.prompt.md
reports/latest-recipe.md
reports/latest-recipe-ai.md
reports/latest-recipe-ai.prompt.md
reports/latest-project.md
reports/latest-writing.md
reports/latest-writing-ai.md
reports/latest-writing-ai.prompt.md
reports/latest-agent-run.md
projects/<project-id>/
projects/<project-id>/chapters/chapter-001.md
samples/book-openings/*.md
feedback/feedback.jsonl
```

## 需要提交和不需要提交

建议提交：

```text
src/
fixtures/sample-rank-batch.json
tests/
README.md
package.json
package-lock.json
.env.example
.gitignore
tsconfig.json
```

不建议提交：

```text
node_modules/
data/*.json
data/*.jsonl
data/*.csv
data/*.sqlite
reports/*.md
samples/book-openings/*.md
feedback/*.jsonl
feedback/*.json
projects/*
.env
```

## 数据结构

```ts
type RankingItem = {
  rank: number;
  title: string;
  author?: string;
  category?: string;
  tags: string[];
  description?: string;
  wordCount?: string;
  status?: string;
  heat?: string;
  bookId?: string;
  sourceUrl?: string;
};
```

SQLite 表：

```text
rank_batches
rank_snapshots
rank_items
```

详细结构见 `src/storage/schema.sql`。

## 验证

```bash
npm run check
npm test
```

AI 命令可以先用 dry-run 验证 prompt，不需要 API Key：

```bash
npm run agent:scan:ai -- --dry-run
npm run agent:teardown:ai -- --dry-run
npm run agent:teardown:text:ai -- --book-id 7656411449241111576 --dry-run
npm run agent:ideas:ai -- --dry-run
npm run agent:recipe:ai -- --dry-run
npm run agent:write:chapter:ai -- --dry-run
```

## 下一步

1. 连续采集至少两轮，验证排名变化分析。
2. 配置 `MODEL_API_KEY`，跑通真实 AI 扫榜和 AI 拆书报告。
3. 连续记录 10 条反馈，找出最有用和最没用的报告段落。
4. 做原创选题 Loop，把高分拆书报告转成新书选题和写作配方。
5. 提供本地查询 API，给桌面端或 Web 端调用。
