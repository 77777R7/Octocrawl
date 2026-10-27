# 页面追踪表

状态：活表，v0.1，2026-10-27 建立。对应 [核心框架](../core-seo-framework.md) §6.3：每个页面一行，记录主承接词、何时收录、何时第一次有展示、近 28 天的展示、点击、位置。
空格里写「未知」，不写 0。

## 现有 29 页（基线）

- 「发布日 / 首次入库日」：博客文章是 `apps/public-web/scripts/blogPosts.mjs` 里的发布日（文章第一次上线的那天）；其他页面是源文件第一次被提交的日期（`git log --follow`，含合并进 main 之前在分支上的提交），**不是上线日**。真正的上线日要看部署记录，仓库里没有统一记录，所以仍然是未知，不要把入库日当上线日写进别处。
- 「收录」：URL Inspection 的结论（通过、中性、未通过）加读取日。读不到的页面保持上次的值，不改成「未知」也不改成未收录。2026-10-13 对 24 个 URL 的那次读数在研究记录 `research/blog/find-all-pages-on-a-website/runs/2026-10-13-guide/gsc-url-inspection-octocrawl-dev.json`。
- 「28 天」：GSC 页面表的展示 / 点击 / 平均位置，只算 `https://octocrawl.dev` 规范地址，地址里的 `#` 片段和查询串并入同一页（首页因此是 34，不是只数裸地址的 33）；页面表里没有这一行写「页面表无此行（未知，不是 0）」。页面表合计与属性级总数口径不同，不要强行对齐。
- 更新：`NODE_USE_ENV_PROXY=1 W2L_PROJECT_ID=<项目> node scripts/seo/snapshot.mjs --update-tracker`（见 [data-sources.md](data-sources.md)；只在默认的 28 天窗口、完整克隆、sitemap 全在 `https://octocrawl.dev` 下才会改表）。脚本只改「发布日 / 首次入库日」「收录」「28 天」三列、sitemap 里新出现的页面（追加一行，主承接词写「未知（待填）」）和下面的数据行；类型、主承接词、备注和「新页面」表由人写。数据行按列写明各自的来源和日期，本次没读到的列保持上一次的说明。每次快照留在 `.w2l/seo/snapshots/`，指标序列在 `.w2l/seo/series.jsonl`。

数据（脚本写入）：日期列：尚未由脚本写入；收录列：尚未由脚本写入；28 天列：尚未由脚本写入，下面三列是 2026-10-27 手工取数的值；未随本次更新的行：无

| URL | 类型 | 主承接词 | 上线日 | 收录 | 28 天 展示 / 点击 / 位置 | 备注 |
|---|---|---|---|---|---|---|
| / | 首页 | 品牌词；品类定义 | 未知 | 通过（2026-10-13） | 33 / 5 / 4.2 |  |
| /scrape/ | 产品页 | A 组：web scraping api、website to markdown api | 未知 | 中性（2026-10-13：URL is unknown to Google） | 30 / 1 / 27.9 |  |
| /tools/ | 工具总览 | 工具总览 | 未知 | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |
| /tools/link-extractor/ | 工具 | C 组：extract all links、url extractor | 未知 | 未知（2026-10-13 未检查） | 562 / 0 / 80.0 |  |
| /tools/url-to-markdown/ | 工具 | C 组：url to markdown | 未知 | 通过（2026-10-13） | 2 / 0 / 92.0 |  |
| /tools/website-to-text/ | 工具 | C 组：webpage to text | 未知 | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |
| /docs/ | 文档 | — | 未知 | 通过（2026-10-13） | 19 / 1 / 4.1 |  |
| /docs/acceptable-use/ | 文档 | — | 未知 | 通过（2026-10-13） | 5 / 0 / 9.0 |  |
| /docs/connect-mcp/ | 文档 | connect octocrawl to <agent> | 未知 | 通过（2026-10-13） | 19 / 0 / 7.2 |  |
| /docs/contact/ | 文档 | — | 未知 | 通过（2026-10-13） | 5 / 0 / 8.4 |  |
| /docs/guides/amazon-product/ | 文档 | — | 未知 | 通过（2026-10-13） | 4 / 0 / 12.5 |  |
| /docs/guides/monitor-webhook/ | 文档 | — | 未知 | 通过（2026-10-13） | 6 / 0 / 14.0 |  |
| /docs/integrations/ai-sdk/ | 文档 | — | 未知 | 通过（2026-10-13） | 11 / 0 / 45.3 |  |
| /docs/limits/ | 文档 | 限制与结果状态 | 未知 | 通过（2026-10-13） | 7 / 0 / 4.4 |  |
| /docs/privacy/ | 文档 | — | 未知 | 通过（2026-10-13） | 7 / 0 / 6.4 |  |
| /docs/reference/ | 文档 | API 参考 | 未知 | 通过（2026-10-13） | 22 / 0 / 15.8 |  |
| /docs/scrape/ | 文档 | — | 未知 | 未知（2026-10-13 未检查） | 1 / 0 / 7.0 |  |
| /docs/terms/ | 文档 | — | 未知 | 通过（2026-10-13） | 5 / 0 / 6.4 |  |
| /blog/ | 博客总览 | — | 未知 | 通过（2026-10-13） | 8 / 0 / 17.1 |  |
| /blog/claude-code-web-scraping/ | 博客 | D 组：claude code web scraping | 未知 | 通过（2026-10-13） | 21 / 0 / 67.9 |  |
| /blog/extract-structured-data-from-web-page/ | 博客 | D 组：extract structured data from web page | 未知 | 通过（2026-10-13） | 13 / 0 / 48.3 |  |
| /blog/find-all-pages-on-a-website/ | 博客 | 链路二：find all pages of a website | 未知 | 通过（2026-10-13） | 17176 / 0 / 72.7 |  |
| /blog/firecrawl-v1-migration/ | 博客 | 迁移（Firecrawl v1） | 未知 | 未知（2026-10-13 未检查） | 2 / 0 / 15.0 |  |
| /blog/hosted-crawl-and-batch-jobs/ | 博客 | 发布说明（不为某个词写） | 未知 | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |
| /blog/http-200-task-completion/ | 博客 | 质量案例（不为某个词写） | 未知 | 未知（2026-10-13 未检查） | 页面表无此行（未知，不是 0） |  |
| /blog/scrape-list-of-urls/ | 博客 | D 组：scrape list of urls | 未知 | 通过（2026-10-13） | 9 / 1 / 21.4 |  |
| /blog/scrape-website-with-login/ | 博客 | D 组：scrape website with login | 未知 | 通过（2026-10-13） | 17 / 0 / 28.4 |  |
| /blog/web-scraping-for-rag/ | 博客 | D 组：web scraping for rag | 未知 | 通过（2026-10-13） | 2 / 0 / 14.5 |  |
| /changelog/ | changelog | — | 未知 | 通过（2026-10-13） | 35 / 0 / 5.3 |  |


## 新页面（上线后逐行追加）

| URL | 主承接词组 | 上线日 | IndexNow 日 | 首次收录日 | 首次展示日 / 首个查询 | 28 天 展示 / 点击 / 位置 | 备注 |
|---|---|---|---|---|---|---|---|

复查节奏：上线后第 2、4、8 周集中检查；位置变化至少等 4 周、且页面组至少 100 次展示再下结论（框架 §6.4）。

