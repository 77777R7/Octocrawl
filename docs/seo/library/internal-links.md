# 站内链接登记表

状态：活表，v0.1，2026-10-27 建立。规则在 [核心框架](../core-seo-framework.md) §4.5：**任何页面上线前，先在这里登记它的入链来自谁、出链去往谁、主承接词**。

## 现状（2026-10-27 抓线上站点，29 个 sitemap URL，全部返回 200）

方法：用 `curl` 抓 `https://octocrawl.dev/sitemap.xml` 里的每个 URL，解析 `<a href>`，只算站内链接。「正文」指落在 `<main>` 或 `<article>` 里的链接（含博客末尾的相关阅读块、文档页的上一页下一页）；页头、页脚、导航里的链接单独看。区域按标签判断，不是人工逐个核对。
`/signin/`、`/dashboard/*`、`/llms.txt`、`/blog/category/*` 不在 sitemap 里，不进表。

要点：
- 29 个页面都至少有一条入链（来自页头页脚）。
- **正文里没有任何入链的页面有 2 个：`/changelog/`、`/docs/terms/`。**
- 正文入链最少的其余页面：`/blog/hosted-crawl-and-batch-jobs/`（1）、`/docs/`（1）、`/docs/integrations/ai-sdk/`（1）、`/docs/guides/monitor-webhook/`（2）、`/blog/http-200-task-completion/`（2）。
- 正文入链最多：`/docs/connect-mcp/`（17）、`/docs/limits/`（15）、`/docs/reference/`（12）。
- 原始数据：`.w2l/seo/2026-10-27/internal-links.json`（git 忽略）。

| 页面 | 类型 | 正文入链数 | 全部入链数 | 正文出链（站内、在 sitemap 内） |
|---|---|---|---|---|
| / | 首页 | 7 | 28 | /blog/extract-structured-data-from-web-page/、/blog/firecrawl-v1-migration/、/docs/connect-mcp/、/docs/limits/、/docs/privacy/、/docs/reference/ |
| /scrape/ | 产品页 | 3 | 28 | /、/docs/limits/、/docs/scrape/ |
| /tools/ | 工具总览 | 3 | 28 | /docs/connect-mcp/、/docs/reference/、/docs/scrape/、/tools/link-extractor/、/tools/url-to-markdown/、/tools/website-to-text/ |
| /tools/link-extractor/ | 工具 | 6 | 28 | /blog/find-all-pages-on-a-website/、/docs/connect-mcp/、/docs/reference/、/scrape/、/tools/、/tools/url-to-markdown/、/tools/website-to-text/ |
| /tools/url-to-markdown/ | 工具 | 4 | 28 | /blog/web-scraping-for-rag/、/docs/connect-mcp/、/docs/limits/、/docs/privacy/、/docs/reference/、/docs/scrape/、/scrape/、/tools/… |
| /tools/website-to-text/ | 工具 | 3 | 28 | /docs/connect-mcp/、/docs/limits/、/docs/privacy/、/docs/reference/、/docs/scrape/、/scrape/、/tools/、/tools/link-extractor/… |
| /docs/ | 文档 | 1 | 28 | /、/blog/extract-structured-data-from-web-page/、/docs/connect-mcp/、/docs/guides/amazon-product/、/docs/guides/monitor-webhook/、/docs/limits/、/docs/reference/ |
| /docs/acceptable-use/ | 文档 | 2 | 18 | /docs/contact/ |
| /docs/connect-mcp/ | 文档 | 17 | 28 | /、/blog/claude-code-web-scraping/、/blog/find-all-pages-on-a-website/、/docs/、/docs/guides/amazon-product/、/docs/guides/monitor-webhook/、/docs/limits/、/docs/privacy/… |
| /docs/contact/ | 文档 | 3 | 18 | /docs/acceptable-use/、/docs/limits/、/docs/privacy/ |
| /docs/guides/amazon-product/ | 文档 | 3 | 28 | /、/docs/connect-mcp/、/docs/limits/ |
| /docs/guides/monitor-webhook/ | 文档 | 2 | 28 | /docs/connect-mcp/、/docs/reference/ |
| /docs/integrations/ai-sdk/ | 文档 | 1 | 28 | /docs/connect-mcp/、/docs/limits/ |
| /docs/limits/ | 文档 | 15 | 28 | /、/docs/guides/amazon-product/ |
| /docs/privacy/ | 文档 | 6 | 18 | /docs/contact/ |
| /docs/reference/ | 文档 | 12 | 28 | /blog/find-all-pages-on-a-website/、/docs/connect-mcp/、/docs/limits/、/tools/link-extractor/ |
| /docs/scrape/ | 文档 | 4 | 28 | /docs/connect-mcp/、/docs/limits/、/docs/reference/ |
| /docs/terms/ | 文档 | 0 | 18 | /docs/acceptable-use/、/docs/contact/、/docs/limits/、/docs/privacy/ |
| /blog/ | 博客总览 | 9 | 28 | /blog/claude-code-web-scraping/、/blog/extract-structured-data-from-web-page/、/blog/find-all-pages-on-a-website/、/blog/firecrawl-v1-migration/、/blog/hosted-crawl-and-batch-jobs/、/blog/http-200-task-completion/、/blog/scrape-list-of-urls/、/blog/scrape-website-with-login/… |
| /blog/claude-code-web-scraping/ | 博客 | 5 | 5 | /blog/、/blog/find-all-pages-on-a-website/、/blog/scrape-website-with-login/、/blog/web-scraping-for-rag/、/docs/connect-mcp/ |
| /blog/extract-structured-data-from-web-page/ | 博客 | 6 | 6 | /、/blog/、/blog/find-all-pages-on-a-website/、/blog/scrape-list-of-urls/、/blog/scrape-website-with-login/、/blog/web-scraping-for-rag/、/docs/reference/ |
| /blog/find-all-pages-on-a-website/ | 博客 | 9 | 9 | /blog/、/blog/claude-code-web-scraping/、/blog/scrape-list-of-urls/、/blog/web-scraping-for-rag/、/docs/limits/、/tools/link-extractor/ |
| /blog/firecrawl-v1-migration/ | 博客 | 3 | 3 | /blog/、/blog/http-200-task-completion/、/blog/scrape-list-of-urls/、/blog/web-scraping-for-rag/、/docs/connect-mcp/、/docs/reference/、/tools/url-to-markdown/ |
| /blog/hosted-crawl-and-batch-jobs/ | 博客 | 1 | 1 | /blog/、/blog/claude-code-web-scraping/、/blog/find-all-pages-on-a-website/、/blog/scrape-list-of-urls/、/docs/connect-mcp/ |
| /blog/http-200-task-completion/ | 博客 | 2 | 2 | /blog/、/blog/extract-structured-data-from-web-page/、/blog/firecrawl-v1-migration/、/blog/web-scraping-for-rag/、/docs/connect-mcp/、/docs/limits/ |
| /blog/scrape-list-of-urls/ | 博客 | 7 | 28 | /blog/、/blog/find-all-pages-on-a-website/、/blog/scrape-website-with-login/、/blog/web-scraping-for-rag/ |
| /blog/scrape-website-with-login/ | 博客 | 4 | 28 | /blog/、/blog/claude-code-web-scraping/、/blog/extract-structured-data-from-web-page/、/blog/scrape-list-of-urls/、/docs/connect-mcp/、/docs/limits/ |
| /blog/web-scraping-for-rag/ | 博客 | 8 | 8 | /、/blog/、/blog/extract-structured-data-from-web-page/、/blog/find-all-pages-on-a-website/、/blog/scrape-list-of-urls/、/docs/reference/ |
| /changelog/ | changelog | 0 | 28 | /docs/connect-mcp/、/docs/integrations/ai-sdk/ |


## 新页面登记模板

上线前复制一行，填完再上线。「入链」必须是真实 `<a href>`，写明放在哪个页面的哪一段。

| 新页面 URL | 类型 | 主承接词 | 入链来自（页面 + 位置） | 出链去向 | 回链到 hub | 不承接的词（防抢排名） | 登记日期 |
|---|---|---|---|---|---|---|---|

## 规则（摘自框架 §4.5 与政策 G4）
1. 同一个词只有一个主页面。
2. 每篇文章里不同段落各带一条链接，不重复同一锚文本。
3. 页面必须能从 hub 按真实链接层级走到，不能只靠 sitemap。
4. 不做目标词清单式页脚（G5）。
5. sitemap：不到 50,000 个 URL 一个文件就够；页面类型多了按类型拆分，方便 Search Console 分类型观察。

