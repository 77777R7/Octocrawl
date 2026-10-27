# 数据来源与刷新方法

状态：v0.1，2026-10-27。核心框架里的每个数字都要能回到这里的某一行重新取一遍。
规则：**每次刷新新增一份带日期的研究记录**（`research/seo/<日期>-<主题>.md`），再更新库里的活表；不改旧记录。命令、源提交、直连还是代理都要记（仓库 AGENTS.md「真实站点运行」一节的要求）。
所有 `curl`、`gh`、`gcloud` 调用在这台机器上走 shell 代理（`HTTPS_PROXY`）；`WebSearch` 与 `WebFetch` 工具不走。结果可能因路线不同而不同，记录里要写。

| 数据 | 回答什么 | 取法 | 限制与注意 | 上次取数 |
|---|---|---|---|---|
| Search Console（我们自己的展示、点击、位置） | 28 天表现、哪些查询、哪些页面 | `gcloud auth application-default print-access-token` 取令牌（不要把令牌写进任何文件）；每次请求带 `x-goog-user-project: $W2L_PROJECT_ID`；`POST https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aoctocrawl.dev/searchAnalytics/query`，维度分别取：无（总数）、`query`、`page`、`query`+`page`、`date`、`country`（`rowLimit` 要够大，上次取 15 导致国家分布不完整）、`device` | 数据滞后约 2 天；查询被 Google 匿名化，页面表合计与属性级总数口径不同（18,035 对 17,465）；「请求编入索引」只能在网页界面做 | 2026-10-27 |
| 收录状态 | 哪些 URL 被收录 | `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`（每站每天 2,000 次） | 之后没有更新数据；上次只查了 24 个 URL | 2026-10-13 |
| 竞品站点结构 | 每个站点有哪些页面类型、各多少页 | 读 `<站点>/robots.txt` 里的 `Sitemap:`，递归读 index，用 `python3 -I` 数 `<loc>` 按路径分组；抽样页面看标题、H1、H2、词数、JSON-LD | sitemap 条目不等于收录；抽样每站 7 到 15 页，不是全量 | 2026-10-27 |
| 采用度 | 包下载、GitHub 星 | npm：`https://api.npmjs.org/downloads/point/<起>:<止>/<包>`（**不要用 `/last-month`**，上次返回过期窗口）；PyPI：`https://pypistats.org/api/packages/<包>/recent`；GitHub：`gh api repos/<owner>/<repo>`（只读） | 下载含 CI、镜像、机器人；Octocrawl 自己的安装也在里面，无法分开 | 2026-10-27 |
| 第三方流量估算 | 竞品月访问、反链估算 | `https://www.semrush.com/website/<域名>/overview/`（免费、不登录） | 只有 4 个域名读得到，其余 404；Similarweb 403；Ahrefs 需要 JavaScript；这是估算 | 2026-10-27 |
| 自动补全 | 有没有这个短语的扩展查询 | `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=<词>`；`https://api.bing.com/osjson.aspx?query=<词>&mkt=en-US` | Google 会把输入原样回显为第一条；没有量 | 2026-10-27 |
| SERP 结果 | 谁占着这个词、页面类型、深度 | 搜索工具（`WebSearch`）的结果列表 | **不是名次**：9 到 10 条、无地区控制、看不到 People Also Ask 和 AI 回答框。Bing 经 curl 返回无关结果，DuckDuckGo html 返回 202。**不请求 google.com/search**：Google 政策禁止自动化查询，且约 6 次后要求验证（政策 G20） | 2026-10-27 |
| 社区信号：Hacker News | 开发者抱怨什么、点名谁 | Algolia：`https://hn.algolia.com/api/v1/search?query=<q>&tags=story`、`search_by_date`、`tags=comment`；单条用 `https://hn.algolia.com/api/v1/items/<id>` | 评论的分数 API 不给；相关性搜索模糊，要人工筛 | 2026-10-27 |
| 社区信号：GitHub issue | 同类工具的用户抱怨什么 | `gh search issues --repo <r> --sort reactions --limit 30`，以及按关键词；`gh issue view` | 互动量低（最高 11 个反应）；约 11% 到 13% 是自动化推广；主题归类是规则匹配，有误差 | 2026-10-27 |
| 社区信号：Reddit | 用户在哪里讨论、抱怨什么 | **目前读不到**：直连无法连通，经代理 `curl` 返回 403，`agent-reach` 的 Reddit 后端 forbidden，`WebFetch` 与 `WebSearch` 拒绝 reddit.com，内置浏览器拒绝 reddit.com | 需要换网络环境，或由 Howard 提供导出；在那之前，库里没有 Reddit 来源的条目 | 2026-10-27（失败） |
| 站内链接 | 29 个页面当前的入链与出链 | 对 `sitemap.xml` 里每个 URL 做 `curl`，解析 `<a href>`，按所在标签区分页头、页脚、正文 | 区域按标签判断；不含 sitemap 之外的页面 | 2026-10-27 |
| 第一方分析 | 访客、来源、预览结果、注册来源 | `node scripts/public-preview/weekly-report.mjs`（合并 Cloud Logging、Firestore、GitHub、npm、PyPI、GSC；设了 `BING_WEBMASTER_API_KEY` 才读 Bing） | 日志保留 30 天；没读到的来源报告「未读」，不报 0 | 随周报 |
| IndexNow | 通知 Bing 等有新页面 | `node scripts/public-preview/indexnow.mjs`（部署后手工跑）：只发新增或有变化的地址和已返回 404 或 410 的地址；`--dry-run` 先看会发什么，`--all` 只用于迁移 | 状态与每次响应的日志在主检出 `.w2l/seo/` 的 `indexnow-state.json`、`indexnow-log.jsonl`；第一次运行没有状态，会发一次整站；200 不代表收录；IndexNow 只到 Bing 及其合作方，不到 Google | 部署后 |
| GEO 研究的原始 JSON | 研究记录里被截断的单元格与文中引用的数字的完整原文 | `.w2l/seo/2026-10-27/geo/`（`geo_official`、`geo_studies`、`geo_tools`、`geo_coding`、各 `geoVerify_*`、`prompts`、`promptVerify`，git 忽略）；文中引用的数字原文见 [GEO 研究记录](../../../research/seo/2026-10-27-geo-research.md) §10 | git 忽略，删除 worktree 前要归档 | 2026-10-27 |
| AI 回答样本 | 助手是否提到、引用 Octocrawl | 见 [geo-protocol.md](geo-protocol.md) | 单次样本不能下结论；需要已登录的网页版会话：内置浏览器 2026-10-28 能打开 ChatGPT、Claude、Perplexity，但都没有登录 | 2026-10-16（Google AI Mode，12 题） |

## 不要做的取数方式
- 不抓 Google 搜索结果做排名跟踪或词研究（政策 G20）。需求数据用 Search Console。
- 不绕过验证码、不绕过登录墙、不注册账号。被拦就写「被拦」并换来源。
- 不把令牌、密钥、账号写进库里的任何文件。
