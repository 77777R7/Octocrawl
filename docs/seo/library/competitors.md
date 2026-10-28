# 竞品与市场数据表

状态：活表，v0.1，2026-10-27 取数。来源与方法见 [研究记录](../../../research/seo/2026-10-27-core-seo-framework-research.md) §4、§7。
**sitemap 条目不等于收录，也不说明流量。**Semrush 数字是第三方估算，只有 4 个域名读得到。npm 与 PyPI 下载包含 CI 和镜像。

刷新方法见 [data-sources.md](data-sources.md)。刷新时新增一份带日期的研究记录，再更新本表并标注取数日期。

## 站点结构（sitemap 计数，2026-10-27）

| 站点 | 主机 | URL 数 | 最大的几组 |
|---|---|---|---|
| Firecrawl | firecrawl.dev | 2,827 | docs.firecrawl.dev/{es,fr,ja,pt-BR,zh}/... 1,235；/alexandria/<provider-slug> 383；/blog 350；docs.firecrawl.dev/ (English, all) 250 |
| Jina AI (Reader) | jina.ai | 1,510 | locale mirrors /{de,fr,es,it,zh-CN,zh-TW,ja,ko,ru}/ (cross-cutting view) 1,305；/news/ (all 10 locales) 1,060；/models/ (all 10 locales) 310；/api-dashboard/ (pricing, playground) 20 |
| Apify | apify.com | 827,662 | /<owner>/<actor>/examples/<slug> 117,445；/<owner>/<actor> 100,528；/<owner>/<actor>/api 98,239；/<owner>/<actor>/api/cli 98,239 |
| ScrapingBee | scrapingbee.com | 1,136 | /scrapers/ 431；/blog/ 392；/webscraping-questions/ 163；/tutorials/ 47 |
| ZenRows | zenrows.com | 840 | /blog 435；/glossary 98；/use-cases 61；/scrape 58 |
| Crawl4AI | docs.crawl4ai.com | 89 | /core/ 23；/blog/releases/ 18；/advanced/ 16；/api/ 9 |
| Spider | spider.cloud | 340 | /scrapers 91；/proxy-locations 71；/docs 46；/blog 41 |
| Tavily | tavily.com | 296 | docs.tavily.com/documentation/* 83；tavily.com/blog 81；docs.tavily.com/documentation/integrations 51；tavily.com/integrations 42 |
| Context7 (Upstash) | context7.com | 142,921 | /<owner>/<repo> 93,934；/websites/<slug> 45,090；/llmstxt/<slug> 2,851；/soenneker/* 1,054 |
| Octoparse | octoparse.com | 1,719 | /template/<slug> 681；/blog/<slug> 478；/docs/en/ 199；/docs/jp/ 162 |
| Axiom.ai | axiom.ai | 693 | /docs/no-code-tool/ 258；/guides/ 91；/docs/no-code-tool/reference/steps/ 90；/blog/ 80 |

## 采用度指标（API 直接读取，不是估算）

npm 数字用明确的日期范围 2026-09-27 至 2026-10-26（`/last-month` 接口当天返回过期窗口，不要用）。
| 对象 | npm 30 天 | PyPI 近一个月 | GitHub 星 |
|---|---|---|---|
| Firecrawl | 4,154,811（js）；528,008（mcp） | 5,339,910 | 195,932 |
| Crawl4AI | — | 1,275,996 | 86,387 |
| Context7 | 2,423,982 | — | 63,761 |
| Tavily | 1,313,340 | 9,588,826（疑有尖峰） | — |
| mcp-server-fetch（官方参考） | — | 506,506 | — |
| Jina Reader | — | — | 12,197（最后推送 2026-05-22） |
| Octocrawl（含自己的 CI 与镜像） | 944（octocrawl）；1,676（mcp）；1,332（sdk） | 124 | 2 |

## Semrush 免费页估算（2026-09 数据月；估算，不是测量）

| 域名 | 月访问 | 有机搜索访问 | 权威分 | 引用域名 | 反链 |
|---|---|---|---|---|---|
| firecrawl.dev | 2,160,000 | 152,870 | 44 | 10,160 | 453,840 |
| context7.com | 680,580 | 69,660 | 45 | 3,460 | 49,470 |
| tavily.com | 1,260,000 | 41,260 | 45 | 5,930 | 67.64K（页面打印值，研究记录笔记里读出，未单独复核） |
| octoparse.com | 244,800 | 43,460 | 39 | 5,480 | 78.75K（页面打印值，研究记录笔记里读出，未单独复核） |

未取得：jina.ai、scrapingbee.com、zenrows.com、apify.com、spider.cloud、crawl4ai.com 在 Semrush 免费页返回 404；Similarweb 403；Ahrefs 无 JavaScript 不显示数字。这些是**未知**，不是 0。

## 对 Octocrawl 有用的结构观察（【推】，来自样本页，不是全量）

- Firecrawl 有 `/alternatives` 22 页、`/use-cases` 20 页、`/integrations` 23 页、`/tools` 13 页，术语页 233 页，`/alexandria` 383 页（一个数据源一页）。
- Spider 的 `/scrapers/<站点>` 90 页，抽样的 2 页都嵌入一次真实抓取的响应。
- Octoparse 的 `/template/<站点>` 681 页，抽样页约 640 到 700 词，有该页独有的字段表和一行真实示例 JSON。
- Context7 一库一页（142,921 个 URL 里 99.1% 是库页面），页面主体是真实抽取的文档片段。
- Crawl4AI 文档站 89 个 URL，全部手写文档。

