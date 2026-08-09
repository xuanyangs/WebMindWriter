# fanqie-loop

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

## 输出位置

```text
data/latest-rank-batch.json
data/latest-rank-batch.csv
data/rank-batches.jsonl
data/rank-snapshots.json
data/fanqie-loop.sqlite
reports/latest-scan-report.md
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
```

不建议提交：

```text
node_modules/
data/*.json
data/*.jsonl
data/*.csv
data/*.sqlite
reports/*.md
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

## 下一步

1. 连续采集至少两轮，验证排名变化分析。
2. 增加“爆款样本拆解”命令，把上升最快和新上榜作品交给拆书 Agent。
3. 提供本地查询 API，给桌面端或 Web 端调用。
