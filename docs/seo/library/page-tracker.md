# 页面追踪表

状态：活表，v0.1，2026-10-27 建立。对应 [核心框架](../core-seo-framework.md) §6.3：每个页面一行，记录主承接词、何时收录、何时第一次有展示、近 28 天的展示、点击、位置。
空格里写「未知」，不写 0。

## 现有 29 页（基线）

- 「收录」来自 2026-10-13 对 24 个 URL 的 URL Inspection（研究记录 `research/blog/find-all-pages-on-a-website/runs/2026-10-13-guide/gsc-url-inspection-octocrawl-dev.json`）：21 通过、3 中性（`/scrape/`、`/llms.txt`、`/signin/`）。**这之后没有更新的数据。**这 24 个 URL 里有 22 个在本表（`/llms.txt` 与 `/signin/` 不在 sitemap 里），其余 7 个页面——`/tools/`、`/tools/link-extractor/`、`/tools/website-to-text/`、`/docs/scrape/`、`/blog/firecrawl-v1-migration/`、`/blog/hosted-crawl-and-batch-jobs/`、`/blog/http-200-task-completion/`——当时没有检查，收录情况**未知**。其中 `/tools/link-extractor/` 近 28 天有 562 次展示，应优先补查。
- 「28 天」指 2026-09-28 至 10-25 的 GSC 页面表：展示 / 点击 / 平均位置。页面表合计 18,035，与属性级 17,465 口径不同。
- 上线日：仓库里没有一份统一记录，这里留「未知」，从 `git log` 或 `apps/public-web/scripts` 的页面条目补。

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

