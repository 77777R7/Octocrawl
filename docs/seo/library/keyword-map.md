# 关键词与页面映射

状态：活表，v0.1，2026-10-27 建立。决定在 [核心框架](../core-seo-framework.md)；本表只记「哪个词归哪个页面、现状如何」。
数据来源：[研究记录](../../../research/seo/2026-10-27-core-seo-framework-research.md) §5，共 71 个词，6 个簇。

读之前：
- **没有搜索量、关键词难度、CPC。**没有工具；这些列不存在，不是 0。
- 「判断」列是调研 agent 对「一个月大的新域名能不能进前排」的**定性判断**，依据是搜索工具返回的 9 到 10 条结果列表，**不是** Google 或 Bing 的名次。`context7 alternative`、`context7 rate limit` 两行来自 DuckDuckGo，第二个来源没能复现。
- 「补全」列：Google 会把输入的短语原样回显为第一条，所以「是」可能只是回显，不是有人在输入的证据。
- 「状态」列：「现有」指页面已上线；「候选（待批）」「证据页试点（待批）」需要 Howard 批准后才实施；「暂停」见框架 §4.2。

维护：每次重做 SERP 读取，**新增一份带日期的研究记录**，再来这里更新「判断」和「状态」，在 [decisions.md](decisions.md) 记一行；不改旧记录。新增关键词要写依据（GSC 查询、自动补全或社区条目）。

| 簇 | 关键词 | 补全有该短语 | Octocrawl 适配度 | 归属页面类型 | 判断 | 现有页面 | 状态 |
|---|---|---|---|---|---|---|---|
| A 品类 | web scraping api | 是 | direct | product-page | 难 | /scrape/、/ | 现有 |
| A 品类 | web scraping api for ai agents | 否 | direct | product-page | 可能 | /scrape/、/ | 现有 |
| A 品类 | web scraper for llm | 是 | direct | product-page | 可能 | — | 现有（`/scrape/`） |
| A 品类 | scrape website to markdown | 是 | direct | blog-tutorial | 可能 | /scrape/、/tools/url-to-markdown/ | 现有 |
| A 品类 | website to markdown api | 是 | direct | product-page | 可能 | /scrape/ | 现有 |
| A 品类 | web crawler api | 是 | direct | product-page | 难 | — | 现有（`/scrape/`） |
| A 品类 | crawl website to markdown | 是 | direct | blog-tutorial | 可能 | — | 候选（待批） |
| A 品类 | web scraping mcp server | 是 | direct | product-page | 难 | — | 现有（`/scrape/`） |
| A 品类 | mcp server web scraping | 否 | direct | product-page | 难 | — | 现有（`/scrape/`） |
| A 品类 | best mcp server for web scraping | 否 | direct | listicle-target | 难 | — | 外链目标，不建页 |
| A 品类 | open source web scraping api | 是 | direct | home | 可能 | — | 现有（首页） |
| A 品类 | web data api for ai agents | 否 | adjacent | home | 可能 | — | 现有（首页） |
| B 楔子（coding agent 的文档） | context7 alternative | 是 | adjacent | compare-page | 难 | — | 暂停（PR #263） |
| B 楔子（coding agent 的文档） | context7 rate limit | 是 | weak | blog-tutorial | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | llms.txt generator | 是 | adjacent | free-tool | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | convert documentation to markdown for llm | 否 | direct | blog-tutorial | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | scrape documentation website for llm | 否 | direct | blog-tutorial | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | give claude code access to documentation | 是 | direct | scenario-page | 可能 | — | 证据页试点（待批） |
| B 楔子（coding agent 的文档） | mcp server for documentation | 是 | adjacent | listicle-target | 难 | — | 外链目标，不建页 |
| B 楔子（coding agent 的文档） | claude code cannot read website | 否 | adjacent | blog-tutorial | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | cursor docs alternative | 否 | weak | none | 难 | — | 不做 |
| B 楔子（coding agent 的文档） | crawl docs site for rag | 否 | direct | blog-tutorial | 可能 | — | 候选（待批） |
| B 楔子（coding agent 的文档） | documentation scraper markdown | 否 | direct | scenario-page | 可能 | — | 证据页试点（待批） |
| C 免费工具 | url to markdown | 是 | direct | free-tool | 难 | /tools/url-to-markdown/ | 现有 |
| C 免费工具 | website to markdown | 是 | direct | free-tool | 难 | /tools/url-to-markdown/ | 现有 |
| C 免费工具 | webpage to text | 是 | direct | free-tool | 难 | /tools/website-to-text/ | 现有 |
| C 免费工具 | extract all links from a website | 是 | direct | free-tool | 可能 | /tools/link-extractor/ | 现有 |
| C 免费工具 | url extractor | 是 | adjacent | free-tool | 可能 | /tools/link-extractor/ | 现有 |
| C 免费工具 | can i scrape this website | 否 | adjacent | free-tool | 可能 | — | 候选（待批） |
| C 免费工具 | is web scraping allowed on this website | 否 | adjacent | blog-tutorial | 可能 | — | 候选（待批） |
| C 免费工具 | robots.txt checker | 是 | weak | free-tool | 可能 | — | 候选（待批） |
| C 免费工具 | webpage token counter | 否 | adjacent | free-tool | 可能 | — | 候选（待批） |
| C 免费工具 | count tokens in a url | 否 | adjacent | free-tool | 可能 | — | 候选（待批） |
| C 免费工具 | html to markdown | 是 | weak | none | 难 | — | 不做 |
| C 免费工具 | sitemap url extractor | 是 | adjacent | free-tool | 难 | /tools/link-extractor/ | 现有 |
| D 教程 | claude code web scraping | 是 | direct | blog-tutorial | 可能 | /blog/claude-code-web-scraping/ | 现有 |
| D 教程 | web scraping for rag | 是 | direct | blog-tutorial | 难 | /blog/web-scraping-for-rag/ | 现有 |
| D 教程 | scrape website for rag | 是 | direct | blog-tutorial | 可能 | /blog/web-scraping-for-rag/ | 现有 |
| D 教程 | scrape website with login | 否 | adjacent | blog-tutorial | 难 | /blog/scrape-website-with-login/ | 现有 |
| D 教程 | scrape list of urls | 是 | direct | blog-tutorial | 可能 | /blog/scrape-list-of-urls/ | 现有 |
| D 教程 | extract structured data from web page | 是 | direct | blog-tutorial | 可能 | /blog/extract-structured-data-from-web-page/ | 现有 |
| D 教程 | web scraping with claude code mcp | 否 | direct | scenario-page | 可能 | /blog/claude-code-web-scraping/、/docs/connect-mcp/ | 现有 |
| D 教程 | scrape website with cursor | 否 | adjacent | scenario-page | 难 | — | 证据页试点（待批） |
| D 教程 | ai agent web scraping | 是 | adjacent | listicle-target | 难 | — | 外链目标，不建页 |
| D 教程 | crawl a website to markdown python | 否 | adjacent | blog-tutorial | 可能 | — | 候选（待批） |
| D 教程 | scrape javascript rendered website | 否 | direct | blog-tutorial | 难 | — | 候选（待批） |
| D 教程 | give ai agent access to the web | 否 | adjacent | blog-tutorial | 可能 | — | 候选（待批） |
| E 对比 | firecrawl alternative | 是 | direct | compare-page | 难 | — | 暂停（PR #263） |
| E 对比 | firecrawl alternatives open source | 是 | direct | listicle-target | 难 | — | 外链目标，不建页 |
| E 对比 | firecrawl vs crawl4ai | 是 | weak | none | 难 | — | 不做 |
| E 对比 | firecrawl vs jina reader | 是 | adjacent | compare-page | 可能 | — | 暂停（PR #263） |
| E 对比 | jina reader alternative | 否 | direct | compare-page | 可能 | — | 暂停（PR #263） |
| E 对比 | crawl4ai alternative | 是 | direct | compare-page | 难 | — | 暂停（PR #263） |
| E 对比 | firecrawl pricing | 是 | weak | none | 难 | — | 不做 |
| E 对比 | best web scraping api for llm | 否 | direct | listicle-target | 难 | — | 外链目标，不建页 |
| E 对比 | best web scraping api 2026 | 是 | adjacent | listicle-target | 难 | — | 外链目标，不建页 |
| E 对比 | scrapingbee alternative | 是 | weak | none | 可能 | — | 不做 |
| E 对比 | apify alternative | 是 | weak | none | 难 | — | 不做 |
| E 对比 | octoparse alternative | 是 | weak | none | 难 | — | 不做 |
| F 场景 | scrape amazon product data | 是 | weak | none | 难 | — | 不做 |
| F 场景 | scrape reddit | 是 | none | none | 难 | — | 不做 |
| F 场景 | scrape hacker news | 是 | direct | scenario-page | 可能 | — | 证据页试点（待批） |
| F 场景 | scrape wikipedia | 是 | direct | scenario-page | 难 | — | 证据页试点（待批） |
| F 场景 | scrape github repository | 否 | adjacent | blog-tutorial | 可能 | — | 候选（待批） |
| F 场景 | scrape youtube transcript | 是 | weak | none | 难 | — | 不做 |
| F 场景 | scrape google search results | 是 | none | none | 难 | — | 不做 |
| F 场景 | scrape news articles | 是 | direct | blog-tutorial | 难 | — | 候选（待批） |
| F 场景 | scrape linkedin | 是 | none | none | 难 | — | 不做 |
| F 场景 | scrape twitter | 是 | none | none | 难 | — | 不做 |
| F 场景 | scrape shopify store | 是 | adjacent | scenario-page | 可能 | — | 证据页试点（待批） |
| F 场景 | scrape ecommerce product pages to json | 否 | direct | scenario-page | 可能 | — | 证据页试点（待批） |
