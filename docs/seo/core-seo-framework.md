# Octocrawl 核心 SEO 框架

状态：v0.1，2026-10-27。Howard 当天确认它是 Octocrawl SEO 的核心框架，后续优化都围绕它做；§8.1 里的各项具体决定仍待定。
写法参照一份参考 SEO 计划（另一个产品团队的内部文档，不入库；由主文档、关键词规划表、全站内链架构三部分组成）的章节顺序，内容按 Octocrawl 的实测数据和已有决定重写。
证据在 [research/seo/2026-10-27-core-seo-framework-research.md](../../research/seo/2026-10-27-core-seo-framework-research.md)（下称「研究记录」，括号里写 R§n）。那份记录是一次性的、不再修改；本文可以改。

读法：每条陈述带标签。**【测】** 当天从 API、页面或仓库读到的；**【估】** 第三方估算（Semrush 免费页）；**【推】** 我从证据推出来的；**【议】** 提议，需要 Howard 决定；**【未知】** 没有数据，不是 0。
本文不改变 ROADMAP 的当前阶段（local 先到位，再换掉 Steel，再做 hosted 对齐）。所有「做」都是提议，逐项批准后才实施。

---

## 0. 一页摘要

1. **现状：有曝光，没有可见度。**【测】Search Console 近 28 天（2026-09-28 至 10-25）17,465 次展示、6 次点击、平均位置 72.2。其中约 98.6% 的展示（17,227 / 17,465；占查询表列出的 17,303 次展示的 99.6%）来自约 77 个「find / list / see all pages of a website」变体（按正则归类，数量是近似值），位置约 64 至 99（多数在 64 至 84，即第 7 到 9 页），0 次点击。展示在 2026-10-10 和 10-13 前后猛增而位置不变，原因【未知】。点击只出现在首页（5）、`/docs/`、`/scrape/`、一篇教程（各 1）这四个页面上（页面表合计 8，属性级总数是 6，口径差异 GSC 没有解释），它们展示极少、位置靠前，对应的查询被 Google 匿名化，看不到。可见查询里没有任何一个含「octocrawl」。（R§3）
2. **规模差距是量级的。**【估】Firecrawl 月访问约 216 万、npm 下载 415 万/月；【测】Octocrawl 的 npm 下载 944 至 1,676/月（含自己的 CI 和镜像），GitHub 2 颗星。所以瓶颈是权威度和信任，不是页面数量。（R§7）
3. **不照搬参考文档的「批量场景页」。**【测】sitemap 计数：Crawl4AI 的文档站 89 个 URL，Tavily 296 个。【推】页面数不是进入这个品类的必要条件，但它们的流量和排名没有测到（Crawl4AI 在 Semrush 免费页上是 404；Tavily 的月访问是 Semrush 估算），页面数和权威度混在一起，拆不开。【测】Reddit、LinkedIn、X 的 robots.txt 都是 `Disallow: /`，hosted 版会拒绝。【推】Amazon 这类有防护的大型零售站很可能是弱项（没有单独量过，amazon.com 的 HTTP 通道没测过，【未知】）。场景页只能是「有真实运行记录的证据页」，先试点 ≤5 页。（R§4、R§5、R§9）
4. **页面顺序（提议）**：先补「接入页」（每个 coding agent 一页）和 2 个免费工具，再写「给 coding agent 的文档」用例页和术语页，证据页试点，**对比页继续暂停**。
5. **外链**（参考文档此节为空，这里补上）：只走可证明的登记处和生态入口；Vercel AI SDK 工具注册表的前置条件已满足；Cursor 市场的条款禁止 AGPL 组件，需先书面确认。（R§8）
6. **效果追踪**要把「展示」和「可见度」分开：页面表里平均位置 ≤20 的展示是 193 次（占页面表合计 18,035 的 1.1%，21 个页面，集中在首页、changelog、`/docs/` 等）；查询 × 页面表里位置 ≤20 的只有 2 行、各 1 次展示，因为排名靠前页面的查询被 Google 匿名化，所以不能用那张表度量可见度。（§6）
7. **要 Howard 决定的**见 §8；本次**没做成**的调研：Reddit（所有路径被拦）、搜索量和关键词难度、反链数据、固定地区的 Google SERP。

---

## 1. 核心目标

**先吸引谁**（沿用 GTM 与 ROADMAP 的表述，不新增）：

1. 用 Claude Code、Codex、Cursor、OpenCode 的开发者，需要把网页或文档变成干净的 Markdown 并保留来源。这是 GTM 的楔子：「给你的 coding agent 它从 Context7 拿不到的文档，是干净的 Markdown，并带每一页的来源」。
2. 本来会选 Firecrawl 的开发者、RAG 构建者。
3. 之后：ROADMAP 在 2026-10-03 把受众加宽到不写代码、本来会用 Octoparse 的人，以及研究者。SEO 侧对这批人**没有证据**（【未知】），而且 Google AI Mode 曾把 Octocrawl 说成 Octoparse，主动承接这类词会加重混淆。本期不碰。

**本期重点**（对应参考文档的「为官网 SEO 的基础做文章」）：

- 让搜索引擎和 AI 助手知道这个站属于哪一类：**面向 AI agent 的网页转 Markdown / 抓取工具，结果带来源记录**。措辞顺序遵守 Howard 的规则：先 Markdown 和省 token 的格式，再 Evidence Record；不以「被拦的页面如实报告」开头。
- 把已有的曝光变成点击，并让站点不再被当成 Octoparse。
- 在同类工具的用户常卡住的地方补页面：接入和排错。别家 MCP 仓库的 GitHub 问题里，「MCP 安装/连接/鉴权」按条数排第一（469 个里 61 个，与垃圾/推广类的 60 个只差一个，在规则分类的误差内；这些问题来自 context7、apify 等别家的仓库，不是 Octocrawl 用户；GitHub 问题本身是弱需求信号）。Octocrawl 自己唯一量到的接入页 `/docs/connect-mcp/` 是 19 展示、0 点击、位置 7.2。（R§6.2）

**本期不做**：对比页（Howard 2026-10-09 暂停，PR #263 未合并）；批量「scrape <site>」页；多语言镜像（Jina 86% 的 URL 是翻译页，那是大品牌的做法）；付费外链；Reddit/LinkedIn/X/Google 搜索结果的抓取页；Monitor 产品页（hosted 还没有 Monitor）。

**成功与停手**：SEO 不单独设增长目标，沿用 GTM 的复盘点（第 45 天 2026-12-06 复盘；第 16 周 2027-01-17：三个付费用户或十个周活跃）。SEO 层面只定「怎么判断该继续还是停」（见 §6.4）。

---

## 2. 计划简述：两条关键词链路

参考文档把找词分成两条链路。Octocrawl 沿用，并用已测数据填内容。

### 链路一：目标用户搜索（页面本身要能促成使用）

| 关键词组 | 例子 | 页面类型 | 已测证据（R§5，SERP 来自搜索工具列表，只作线索） |
|---|---|---|---|
| A 品类词 | `web scraping api for ai agents`、`scrape website to markdown`、`website to markdown api` | 首页、`/scrape/` | 调研 agent 对 12 个词里的 7 个判为「可能」。这是判断，不是名次证据：它把小站、目录页和不匹配意图的页面都算作弱竞争（例如 `web scraping api for ai agents` 前五名全是抓取厂商）；`web scraping api`、`web crawler api` 被大厂商占满，`web scraping mcp server` 被目录（mcpservers.org）和中型厂商占满，判为难 |
| B 楔子：给 coding agent 的文档 | `give claude code access to documentation`、`scrape documentation website for llm`、`crawl docs site for rag`、`context7 rate limit` | 用例页、教程 | 调研 agent 对 11 个词里的 8 个判为「可能」（同样是判断）。列表里多是 GitHub 小仓库、目录页、小博客，其中 `give claude code access to documentation` 约一半是不匹配意图的页面（镜像 Claude Code 自己的文档），不能当作「空档」；`context7 alternative`、`context7 rate limit` 两行来自 DuckDuckGo，第二个来源没能复现；`mcp server for documentation` 被 Glama 与 mcpservers.org 占 8/9 |
| C 免费工具 | `extract all links from a website`、`can i scrape this website`、`webpage token counter`、`count tokens in a url` | `/tools/` | `extract all links…` 前 9 个里没有专用在线工具；但我们已有的 `/tools/link-extractor/` 28 天 562 展示、位置 80，这些展示对应的是「find all pages」类查询（33 行、559 次），不是「extract all links」类，所以这条「可能」没有被我们自己的数据验证；`can i scrape…` 全是法律解释文；`webpage to text` 前三名都是专用工具页（Firecrawl、Geekflare、Olostep），`sitemap url extractor` 10 个里 6 个是专用工具，判为难；`url to markdown` 9 个里只有 3 个专用工具页（其中 1 个只凭搜索工具的描述判断），其余是 Apify 列表、G2、Glama、PyPI 等成熟平台域名，判为难；`html to markdown` 9 个里只有 2 个专用在线工具，其余是库、GitHub 仓库和文档站，且 Octocrawl 读 URL、不转换粘贴的 HTML，适配度「弱」，判为难 |
| D 教程 | `claude code web scraping`、`scrape website for rag`、`scrape list of urls` | 博客 | 调研 agent 对 12 个里的 7 个判为「可能」（`extract structured data from web page` 的列表里 5 个是学术库页面，不匹配意图，不算弱竞争）；被量过的 24 个页面厚薄差得很大，约 170 到 5,120 词、0 到 29 个代码块：Python、RAG、Claude Code 教程词上的厂商教程多在约 2,000 到 5,100 词、7 到 29 个代码块；同批里也有薄页（ParseHub 约 610 词无代码，排第 3；Octoparse 领头页约 400 词无代码；ZenRows 的 Cursor 页约 190 词；Olostep 词条约 170 词）。我们现有的 `scrape website with login` 约 1,425 词 |
| E 对比 / 替代 | `firecrawl alternative`、`firecrawl vs jina reader`、`jina reader alternative` | **暂停** | 调研 agent 对 12 个里的 9 个判为难、3 个判为「可能」（其中 `jina reader alternative` 的列表几乎全是漫画和电子书页面，要先人工核对，不当作机会）：厂商自己写榜单并把自己排第一；`octoparse alternative` 不要碰 |
| F 场景 / 具体站点 | `scrape hacker news`、`scrape ecommerce product pages to json` | 证据页（试点，仅限有记录运行的站点） | 见 §4.3；`scrape reddit/linkedin/twitter/google search results` 的 Octocrawl 适配度判为「无」；`scrape amazon product data` 判为「弱」且无对应页面类型，ROADMAP 暂停表里有「Further Amazon.sg adapter work」，不做证据页 |

### 链路二：关联度流量捕获（先把人吸进站，再靠内链送到链路一）

- **已有信号**：「find all pages of a website」一类，28 天约 17,227 次展示（【测】，R§3）。这是 Octocrawl 的 `map` 与 `/tools/link-extractor/` 的邻域。位置在 64 至 99（多数 64 至 84，第 7 到 9 页）、0 次点击；展示在 2026-10-10 和 10-13 前后上涨约十倍而位置不变，原因【未知】（旧记录怀疑一篇博文加一个扫描器，未重新核实）。所以这只说明 Google 把我们放进了这些查询的结果里，**不是**「有人在找这类页面」的证据；需求要看点击、排到前 20 位之后的展示，或第一方分析里的来访。
- **候选主题**：llms.txt 与 `Accept: text/markdown`（HN 12 条）、网页的 token 成本（HN 9 条、GitHub 上 MCP 工具定义的 token 成本 30 条）、「该不该抓这个站」（robots.txt、条款）。判据沿用参考文档：关联度够不够支撑一次自然的内链、有没有真实需求信号、SERP 是否薄。
- 注意：Google 官方说它**忽略** llms.txt 和专门的 AI 标记（R§9）。llms.txt 这个主题的价值是「读者在搜它」，不是「文件对 Google 有帮助」。

### 找词与验证：这次能做什么，不能做什么

| 手段 | 能回答 | 不能回答 |
|---|---|---|
| Search Console API | 我们自己的真实展示、点击、位置 | 竞品、没排上的词 |
| Google / Bing 自动补全 | 有没有出现以这个短语开头、或包含它的相邻查询（Google 会把输入的短语原样回显为第一条，只有回显不算需求证据，要看有没有真正的扩展词） | 量；单靠回显的「有」不能说明有人在输入 |
| 搜索工具返回的结果列表（9 到 10 条） | 谁占据这个词、页面类型、深度 | 真实名次、地区、People Also Ask、AI 回答框 |
| HN（Algolia API）、GitHub issue（`gh`） | 开发者抱怨什么、点名谁 | 量；Reddit 完全没有（R§6.3） |
| Semrush 免费页 | 4 个域名的月访问、反链估算 | 其余 6 个域名；关键词表只有 3 到 5 行 |
| **没有** | **搜索量、关键词难度、反链、固定地区 Google SERP** | — |

优先级判据（本文自拟；参考文档的三项调研是「目标人群会搜什么」「品类相关词与竞品词」「高频场景与排名机会」，这里没有逐项照搬，只借用链路二的「关联度、真实需求、竞争度低」的思路）：①需求信号（GSC 位置 >50 的展示不算）；②SERP 是否可赢；③Octocrawl 能否**真实做到**（能力、robots、有没有测过）；④是否触碰暂停项或红线。四项都过才进「做」。

---

## 3. 目标用户

痛点后面的数字是「相关条数」，来自 HN 94 条、GitHub 469 个 issue（R§6）；GitHub 的主题归类是规则匹配，有误差。条数是线索不是需求量。

| 画像 | 想解决什么（证据） | 会搜什么 | 落到哪 |
|---|---|---|---|
| **P1 用 Claude Code / Codex / Cursor 的开发者** | agent 读不了网页或文档：HN 上有发帖者声称 Claude Code 自带的 WebFetch 会卡住、没有超时、读不到 JS 渲染的内容（2 条，发帖者都在推广自己的替代工具；**我们没有自己测过 WebFetch**，这是待验证的说法）；MCP 装不上、连不上、鉴权怪（GitHub 61）；MCP 工具定义占 token，Firecrawl MCP 一例报告每个会话约 18.5k token（GitHub，单个 issue，报告者自测）；Context7 收录缺失或过期（GitHub 51） | B、D 组 | 接入页、用例页、教程 |
| **P2 在评估或已在用 Firecrawl / Crawl4AI 的人** | 价格与额度（HN 13、GitHub 23）；自托管运维（GitHub 45，Firecrawl 25、Crawl4AI 17）；被拦页面时无限重试、没有终态（GitHub 13、HN 10；该主题互动最高的是 Firecrawl #2350：10 个反应、25 条评论；全集反应最高的是 crawl4ai #1924，11 个，与此主题无关） | A、E 组 | 首页、`/scrape/`；对比页暂停 |
| **P3 做 RAG / LLM 应用的开发者** | Markdown 质量与 JS 渲染（GitHub 43）；HTML 的 token 成本（HN 9，数字有争议）；对爬虫身份、robots 与来源记录的态度（HN 10，两种立场并存：有站点运营者批评 Firecrawl 身份规避，也有人说遵守 robots 让工具没用；**没有人点名要 Evidence Record**） | A、D 组 | 教程、`/scrape/`、Evidence Record 说明 |
| **P4 不写代码的人、研究者（以后）** | **【未知】**——没有 SEO 证据；与 Octoparse 混淆风险 | — | 本期不承接 |

---

## 4. 网站规划

### 4.1 页面类型与状态

现有 29 个 sitemap URL：首页 1、`/scrape/` 1、工具 3 + 工具总览 1、docs 12、博客总览 1 + 文章 9、`/changelog/` 1。没有对比、替代、用例、集成、定价页。（【测】仓库源码，2026-10-27 读取：`apps/public-web/scripts/build-docs.mjs`、`docsPages.mjs`、`blogPosts.mjs`；盘点全文在 `.w2l/seo/2026-10-27/ground-site-inventory.md`，未入库）

| 页面类型 | 现状 | 状态 | 依据 |
|---|---|---|---|
| 首页 `/` | 33 次展示、5 次点击、位置 4.2（【测】） | 做（维护） | 品类与品牌 |
| `/scrape/` | 30 展示、1 点击、位置 27.9 | 做（维护） | A 组「website to markdown api」等 |
| 接入页（每个 agent 一页） | 只有 `/docs/connect-mcp/`（19 展示，位置 7.2） | **议：先做 1 到 2 页，看 §6.4 的判断，再决定是否做满 4 到 6 页** | 别家 MCP 仓库的 GitHub 问题里条数最多的一类（61 对 60，差在误差内；不是 Octocrawl 用户的需求证据；本站接入页 19 展示、0 点击）；竞品大多有（ZenRows 39 页、Firecrawl 23、Tavily 41+50、Context7 14；Crawl4AI、Jina 没有） |
| `/tools/` | 总览 + 3 个工具 | 做（优化现有）+ **议：新增最多 2 个** | C 组 |
| `/blog/` | 9 篇 | 做（先加深现有，再加新） | D 组 |
| 用例页（给 coding agent 的文档等） | 无 | **议：新建 3 到 5 页** | B 组；竞品都有（Firecrawl 20、ZenRows 61、Apify 32、Spider 12） |
| 术语页 `/glossary/` | 无 | **议：试点 5 到 8 页** | Firecrawl 233、ZenRows 98、ScrapingBee 163（问答）；HN 的 llms.txt 主题 |
| 证据页（命名待定，如 `/examples/<站点>/`） | 无 | **议：试点 ≤5 页，需先批准** | F 组 + 政策 G1–G3 |
| `/compare/` | 无；PR #263 未合并 | **暂停**（Howard 2026-10-09） | 解除条件见 §4.2 |
| `/crawl/`、`/monitor/` | 无 | `/crawl/` 条件可能已满足（hosted 抓取任务 2026-10-22 起对所有账号开放，【推】）；`/monitor/` 仍受阻（hosted 无 Monitor） | 产品菜单研究（2026-10-13）的前置条件 |

### 4.2 各类页面承接什么、不承接什么

沿用参考文档的「四件事」：承接哪组词、建立什么认知、**不**承接什么（防止自己人抢排名）、需要什么支撑。

| 页面 | 承接 | 不承接 | 支撑与内链 |
|---|---|---|---|
| 首页 | 品牌词；品类定义（网页转 Markdown / 抓取，给 AI agent，带来源记录） | 具体教程词、工具词 | 出链到 `/scrape/`、`/tools/`、docs、博客；入链来自所有页面的页头页脚 |
| `/scrape/` | `web scraping api`、`website to markdown api` 这类产品词 | 教程词 | 入链来自教程与接入页 |
| 接入页 | `<agent> + web scraping mcp`、`connect octocrawl to <agent>` | 品类词 | 每页：安装命令（已有文档原样）、一个跑通的例子、常见错误；回链 docs 参考与限制页 |
| 免费工具页 | 该工具的名字词（如 extract links、can I scrape） | 教程词、品类词 | 工具页 ↔ 对应教程（已有）；工具结果页加「用 MCP / API 跑」入口（商业计划已写） |
| 教程（博客） | D 组长尾词；链路二的关联词 | 本应由首页、`/scrape/`、工具页承接的词 | 每篇必须有明确的出链去向；文末链到产品页或接入页；相关阅读互链 |
| 用例页 | B 组楔子词 | 教程词 | 链到接入页与教程；被教程反向链入 |
| 术语页 | 「what is …」定义词 | 产品词 | 每页链到一个真实功能或工具；不做目标词清单式页脚 |
| 证据页 | 「scrape <站点> to markdown」，**仅限有记录运行的站点** | 任何 robots 禁止或被反爬的站点 | 从一个总览页（hub）按真实 `<a href>` 链入；回链到 `/tools/`、`/scrape/` |
| 对比页（暂停） | `X vs Y`、`X alternative` | 品类词 | 解除条件：Howard 决定是否发布 PA 基线，以及发布哪一组数字。仓库里的记录：PA 第 9 项窗口 1（2026-10-09，源提交 3cde6e8，`research/access/runs/2026-10-09-pa9-w1-baseline-3cde6e8.md`）冻结 50 个任务上通过验证 Firecrawl 35、Octocrawl 最佳路线 6，那是旧快照，已被取代。较新的是 ROADMAP「The bar on 2026-10-22: not met」（K1：`installed_chrome` 25、31 对 Firecrawl Cloud 33、34）和 2026-10-25/26 的 combined 两个窗口（`research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md`：冻结 50 个任务 combined 34、35 对 Firecrawl 33、34）。这些都是本机 local、一台 Mac、一个代理出口的结果；hosted 没有这类路径（2026-10-27 hosted 对齐窗口，51 个任务：hosted 15、local 23、local 加授权 37；16 个挑战页任务 0、0、9，`research/hosted/2026-10-27-parity-window-21edea41.md`）。页面必须含我们自己的、有日期和版本的测试，包括 Octocrawl 输的项（政策 G7）；重读竞品价格（上次 2026-10-07） |

### 4.3 为什么这样做：竞品结构（R§4）

【测】11 个站点的 sitemap 计数（2026-10-27）：

| 站点 | URL 数 | 页面结构要点 |
|---|---|---|
| Firecrawl | 2,827（www + docs） | `/alexandria/` 383 页（每页一个数据源；抽样的一页约 1,577 词，内容是该数据源特有的）、博客 350、术语 233、`/alternatives` 22、`/use-cases` 20、`/integrations` 23、`/tools` 13 |
| Jina | 1,510 | 86% 是翻译镜像；没有对比、用例、集成页；单个 Reader 页约 5,188 词 |
| Apify | 827,662 | 98.7% 是用户生成的 Actor 页；营销页只有约 1,605；`/alternatives` 27、`/use-cases` 32、`/integrations` 108 |
| ScrapingBee | 1,136 | `/scrapers/` 431 页（15 个 H2 骨架换站点名，两页样本 8 词短语重合 72%）、博客 392、`/<竞品>-alternative/` 35 |
| ZenRows | 840 | 博客 435、术语 98、用例 61、`/scrape/<站点>` 58（每页约 3,400 词）、集成 39、替代 21+11 |
| Crawl4AI | 89（文档站） | 全部手写文档；GitHub 86,387 颗星带来权威度 |
| Spider | 340 | `/scrapers/<站点>` 90 页；抽样的 2 页都嵌入了一次真实抓取的响应（状态、耗时、大小、费用、日期） |
| Tavily | 296 | 集成：营销页 41 个（约 260 词）+ 文档页 50 个（1,300 到 2,100 词，带代码） |
| Context7 | 142,921 | 99.1% 是一库一页，页面主体是真实抽取的文档片段；集成页 14 个、约 460 词 |
| Octoparse | 1,719 | `/template/<站点>` 681 页（抽样页约 640 到 700 词，有该页独有的字段表和一行真实示例 JSON）、博客 478 |
| axiom.ai | 693 | `/scrape/` 10 页 + `/automate/` 27 页，共 37 页（5.3%）；文档 351 页（50.6%） |

【推】给 Octocrawl 的结论：

1. **页面数不是必要条件，但也没有证据说它没用。**Crawl4AI 的文档站只有 89 个 URL，它的项目有 86,387 颗星、PyPI 月下载 1,275,996（【测】）；文档站本身的流量和排名没有测到（【未知】）。Tavily 296 个 URL，月访问约 126 万、引用域名 5,930（Semrush 估算）。Firecrawl（2,827 个 URL、约 216 万月访问，估算）、Context7、Apify 页面多、流量也高，同样与权威度混在一起。所以只能说：规模不是 Octocrawl 现阶段最先要补的东西，权威度和页面实质更先（【推】）。
2. **可借鉴的是「单位」，不是「文案」。**Spider 的单位是「一次真实抓取的响应」，Octoparse 的单位是「字段表 + 一行真实 JSON」，Context7 的单位是「真实抽取的片段」。Octocrawl 对应的单位是 **Evidence Record**：最终 URL、状态、robots 决定、内容哈希。ScrapingBee 的 72% 重合模板和 Octoparse 的 640 词薄页是要避免的写法。
3. **对 Octocrawl 的限制比竞品多。**hosted 版遵守 robots.txt；`reddit.com`、`linkedin.com`、`x.com` 的 robots.txt 都以 `User-agent: *` 加 `Disallow: /` 结尾（【测】2026-10-27）。有防护页面：hosted 做不到（2026-10-27 hosted 对齐窗口，51 个任务：hosted 15、local 23、local 加授权 37；16 个挑战页任务 0、0、9）；本机授权路径与 Firecrawl 接近（2026-10-25/26，冻结 50 个任务：combined 34、35 对 Firecrawl 33、34；仅 local，一台 Mac，一个代理出口）。所以证据页只能做 Octocrawl 真能读的站点，并如实写失败。候选（线索，未测）：Hacker News、Wikipedia、新闻文章、Shopify 类店铺与电商商品页转 JSON、文档站。
4. **核对参考文档的一个论断。**参考文档说 axiom.ai 的 `/scraper/` 和 `/automate/` 撑起了大部分自然流量。实测：`/scraper/` 返回 404，文件夹是 `/scrape/`；两个文件夹合计占 sitemap 的 5.3%；axiom.ai 的流量取不到，所以「撑起大部分流量」**无法从 sitemap 验证**。
5. **政策边界**（R§9）：Google 和 Bing 都把「为排名批量生成、每页没有独有价值」的页面列为垃圾内容，且没有页数阈值。证据页必须通过 G1–G3：每页有自己的运行记录（命令、源提交、日期、是否走代理、真实 Evidence Record）；先发约 5 页，等 Search Console 的收录与展示数据再扩；被拦、为空、错误或不完整的结果要写出来并计入批次。

### 4.4 页面模板（模块 / 作用）

**接入页（每个 agent 一页）**

| 模块 | 作用 |
|---|---|
| Title / Meta | 用搜索词原文（`Connect Octocrawl MCP to <agent>`），不用口号 |
| H1 + 一句话定位 | 这个 agent 用 Octocrawl 做什么（读网页和文档为 Markdown） |
| 安装（文档里已有的命令，原样） | 先给最短路径：hosted 无需 key 的 `scrape` 和 `map`；有账号才有 crawl 与 batch |
| 一个跑通的例子 | 必须在这个 agent 里实际跑过；未测的客户端不写 |
| 常见错误 | 来自 GitHub 上同类 MCP 的问题（Node 版本、鉴权、被拦页面的状态） |
| 限制 | 链到 `/docs/limits/`；写明 hosted 与 local 的差别 |
| 下一步 | 教程与用例页 |

**免费工具页**

| 模块 | 作用 |
|---|---|
| 工具本体在首屏 | 页面的价值是它能用（政策 G10：能完成所述任务） |
| 结果区 + 「用 MCP / API 跑」入口 | 承接转化 |
| 方法说明 | 它读了什么、没读什么（如 robots.txt 决定、一次真实抓取），不给「分数」 |
| 对应教程入口 | 内链 |

**教程（博客）**：沿用 `research/blog/` 的简报流程（查询与检查日期、主任务、相邻问题、边界与不写什么、规范页检查、前五名对照表、缺口、产品连接契约、待核实的断言、视觉计划）。D 组的新证据是：厚度因词而异——Python、RAG、Claude Code 教程词上，被量过的前排厂商页面约 2,000 到 5,100 词、7 到 29 个代码块；集成页和词条词上前排页面很薄（约 170 到 610 词）。下一次改写按词区别对待，以「有可运行代码、有真实输出」为目标，而不是加字数。

**证据页（试点）**

| 模块 | 作用 |
|---|---|
| 标题 | 站点名 + 任务（如 `Hacker News to Markdown`） |
| 这次运行 | 命令、日期、Octocrawl 版本、走代理还是直连、状态 |
| Evidence Record 字段 | 最终 URL、HTTP 状态、robots 决定、内容哈希（来自真实运行） |
| 结果摘录 | 只放短摘录，不复制目标页全文（政策 G6） |
| 什么情况下读不了 | 如实写；失败也要在批次里出现 |
| 相邻站点 | 回 hub，不做站点清单式页脚（政策 G5） |

**对比页（暂停时的预案模块，沿用参考文档）**：Title/Meta、H1 「Octocrawl vs X」、一句话定位、CTA、差异化亮点（抓竞品最大短板，且必须是我们自己测过的）、功能对比表（按用户在意的维度，包括我们输的）、从 X 迁移的路径（Firecrawl 迁移已有文章 `/blog/firecrawl-v1-migration/`）、支撑博客入口、FAQ。

### 4.5 站内链接规划

参考文档把内链单独成文，要求「任何页面，入链来自谁、出链去往谁，一页一页上线或批量上线都能查到」。Octocrawl 沿用这条规则。

1. **【议】先建登记表**：`docs/seo/internal-links.md`，在第一批新页面上线**之前**创建，每个页面登记「入链来自 / 出链去向 / 主承接词」。现在还没有，所以现有 29 页的入链和出链关系是【未知】（只知道：博客文末固定 3 篇相关文章；docs 有侧栏与上一页、下一页；工具页链到对应博文；页脚有 Product、Docs、Legal、Contact 四列）。
2. **层级**：首页 → `/scrape/`、`/tools/`、docs、博客；教程 → 接入页或产品页；接入页 → docs 参考与限制页；证据页 → 总览页 → 工具与产品页。
3. **同一个词只有一个主页面。**「find all pages」现在博客（17,176 展示）和工具页（562 展示）并存：博客主承接「how to find…」类信息词，工具页主承接「extractor」类工具词。
4. 每篇文章里不同段落各带一条链接，不重复同一锚文本（参考文档的要求）。
5. 链接必须是真实 `<a href>`，页面要能从 hub 按层级走到（政策 G4，避免被当成门页）。
6. sitemap：29 个 URL 一个文件足够；超过 50,000 URL 或 50 MB 才需要 index（政策）。页面类型变多后，按类型拆 sitemap，便于 Search Console 分类型观察。

### 4.6 外链规划（参考文档此节为空，这里补）

规则（政策 G14，R§9）：只做编辑性的、可对搜索引擎坦白披露的登记；不买链接、不做链接交换、不用工具自动发帖、不做批量目录提交；付费或赞助链接要带 `rel="sponsored"`。GTM 的闸门（R1/R2/R3/R5）通过前不发任何公开帖子，Reddit 由 Howard 本人写。

【测】2026-10-27 我亲自核对的一项：**punkpeye/awesome-mcp-servers 的 PR #16029 已于 2026-10-23 合并，README 第 529 行有 Octocrawl**（之前记录的「等 Glama 徽章」已过时）。其余来自 2026-10-09 至 22 的记录，**没有重新核对**：官方 MCP Registry、Smithery、awesome-remote-mcp-servers（#1567 已合并）；待定的 Glama、mcp.so、mcpservers.org、Cline marketplace、mcp.directory、MCP Market、AlternativeTo；商业计划还写着 Claude connector 目录 2026-10-18 已提交，状态未核对。

【测】新候选（只读了官方说明，没有提交任何东西）：

| 去处 | 途径 | 状态与限制 |
|---|---|---|
| Vercel AI SDK 工具注册表 | 向 `vercel/ai` 提 PR，加一个对象 | 前置条件已满足（`@octocrawl/ai-sdk` 在 npm，`/docs/integrations/ai-sdk/` 返回 200）；链接不带 nofollow；指南未写审核时长与费用。**首选** |
| Claude 插件 / 目录 | 自有插件市场（已有）；Anthropic 目录 | 官方说明：Anthropic 目录需要付费的 claude.ai 方案并有人工审核，描述必须与实际功能一致。connector 目录已提交（见上），这一条要核对的是审核状态 |
| Cursor Marketplace | 提交到 cursor.com/marketplace/publish | **发布条款（2026-05-06）写明插件只能含宽松许可证，GPL、AGPL、LGPL 不得包含**；Octocrawl 的服务端、CLI、MCP 包是 AGPL-3.0，客户端库是 MIT。只指向 hosted MCP 地址的插件算不算「包含」，条款没写。**需书面确认**（GTM 计划已有此项） |
| LangChain、Haystack | 要先发布独立的集成包（`langchain-octocrawl` 之类），再提单 | 现在没有这个包，工作量大 |
| Dify、n8n | 做插件或社区节点；Dify 把「抓取任意 URL」的插件归为高风险类，额外审核 | 工作量大；GTM 计划的顺序是 AI SDK、Dify、n8n |
| LlamaIndex | 未找到第三方上架途径 | 【未知】 |
| 第三方榜单（Proxyway、Geekflare、各厂商博客） | 页面上没有提交入口；收录由作者决定 | 14 个是厂商博客，都把自己排第一；Proxyway 页面写明含联盟链接。**不建议付费**（mcpservers.org Premium 一次性 $39；claudemarket.ai 一次性 $10，页面自相矛盾） |
| awesome-web-scraping（lorien） | PR | 明确限制 AI agent / MCP 工具与网络服务，不适合 |

【推】权威度是瓶颈（§0.2），所以这条线应该**与页面工作并行**，而不是排在它后面。这里没有「大批量外链」的路，只有少量有质量的登记。

### 4.7 技术 SEO 前置条件

均来自代码与官方页面（R§3 前的站点盘点，R§9）。**这些是待办，不是这次任务做的改动**。

- **新页面类型要先有生成器。**每个工具页要手工加 `tools/<slug>/index.html`、`TOOL_PAGES`、`build-docs.mjs` 里的 `TOOL_LOCATIONS`；导航与页脚是固定数组；博客「相关阅读」必须正好 3 篇；每篇博客要 4 张图。Phase 1 的页数少，手工可以；同一类型超过约 20 页之前要有生成器（【议】阈值）。
- **CSP** `style-src 'self'`：模板里不能有 `style=""`；测试用 `public:preview:local`（端口 8798）。
- **IndexNow** 现在每次提交全部 URL；Bing 的指南建议只提交新增、变更、删除的 URL，且尽量逐条提交。29 个 URL 影响小，页面变多后要改。IndexNow 救不了薄页面。
- **FAQPage 标记**：Google 的 FAQ 富结果已于 2026-05-07 停止显示。首页和 `/scrape/` 现有的 FAQPage 标记没有害处，也没有收益；不要为富结果新增。
- **SoftwareApplication 标记**：Google 的软件应用富结果要求 `aggregateRating` 或 `review`；仓库里没有评分标记（grep 未发现）。不要伪造。
- **Googlebot、Bingbot 不能被 CDN 或 Worker 拦**：Cloudflare 的机器人规则只给「已验证的 AI 助手」开过一条例外，对 Google 与 Bing 的影响**没有确认**（`docs/seo/cloudflare-access-2026-10-16.md`）；建议每周用 URL Inspection 抽样。
- **`llms.txt` / `llms-full.txt`** 只列文档与博客，不含首页、`/scrape/`、工具页。对 coding agent 有用就补；对 Google 没用。
- **`shareHead()`** 把 `og:type` 固定为 `article`，博客总览和 changelog 也是；无 hreflang（只有英文，当前合适）。
- 没有 Core Web Vitals 的实地数据；站点分析只有第一方的 `w2l_web_event`。

### 4.8 AI 搜索与助手里的可见度

- 【测】Google 官方：AI Overviews 与 AI Mode 没有额外技术要求，不需要专门的标记或文件；llms.txt 被 Google Search 忽略。（R§9）
- 【测】2026-10-16 的 Google AI Mode 样本（12 个固定问题，单次）：6/12 提到 Octocrawl 这个名字，0/12 引用了 Octocrawl 官方页面；有实体、安装和 hosted 限制的错误，包括把它说成 Octoparse。重测排在 2026-11-13 和 11-20。`ai-answer-sample` 里关于「hosted 抓取和批量被拒绝」的判断已过时（hosted 任务 2026-10-19 至 22 起开放）。
- 【估】Semrush 的 AI 流量块：Context7 的 6 个月 AI 助手引荐中 Claude 约 3.1 万、ChatGPT 约 1.1 万；Firecrawl 是 ChatGPT 7.8 万、Claude 5.8 万。【测】Octocrawl 的第一个外部注册账号（2026-10-26）来自 `utm_source=chatgpt.com`。【推】开发者工具会从助手那里获得流量，值得追踪，但样本太小，不能当结论。
- 【议】行动：①实体澄清（Octocrawl 不是 Octoparse）继续作为首要事项；②让别人（登记处、生态目录）准确描述我们——描述必须与实际功能一致；③保持 `docs/seo/claim-evidence.md` 的断言纪律。

---

## 5. 优先级与阶段

阶段之间用「入口条件」衔接，不用日期。每个「做」都要 Howard 批准。

| 阶段 | 内容 | 入口条件 | 判断做完 |
|---|---|---|---|
| **0 先别加新页，把现有的做对** | 持续：GSC 周报；实体澄清重测（2026-11-13、11-20）；「find all pages」两个页面（博客与工具）至少观察 4 周后再决定是否重写——同一篇博客重写前位置约 75、现在 72.7（窗口不同），没有实质改善，内容层面的改动对一个很新的域名不太可能起作用（【推】，原简报也是这么判断的）；建立 `internal-links.md` | 无 | 基线周报跑满 4 周；内链登记表建成 |
| **1 接入与工具** | 接入页 4 到 6 个（Claude Code、Codex、Cursor、OpenCode、Cline、claude.ai / ChatGPT 连接——**每个都要实际连过**）；工具：`can i scrape this website` 检查器、网页 token 计数器（HN 与 GitHub 都提到 token 成本，数字有争议，所以工具显示用户自己 URL 的前后对比，不给百分比） | Howard 批准；阶段 0 的登记表就绪 | 每页：已收录（URL Inspection）；无遗留的未验证断言 |
| **2 用例、术语与证据试点** | 给 coding agent 的文档：3 到 5 页（例：把文档站变成 Markdown 给 Claude Code；替换 Claude Code 的 WebFetch——页面要写的每条 WebFetch 行为，须先由人在页面注明的版本上实测并记录，红线 8，未测不写；文档站入 RAG 前的抓取与哈希）；术语页 5 到 8 页；证据页 ≤5 页（先做真实站点运行并记录） | 阶段 1 至少有一批页面被收录；证据页另需 Howard 批准 | 试点页等 ≥4 周后看收录与展示，再决定是否加量（§6.4） |
| **3 有条件** | 对比页（解除暂停 + G7 证据）；`/crawl/` 页；扩大证据页；框架生态的包（LangChain 等） | 各自的解除条件 | — |
| **外链（并行）** | Vercel AI SDK 注册表 PR；Cursor 条款书面确认；Anthropic 目录是否订阅付费方案；回查 2026-10-22 之后的待定登记 | Howard 批准 | 登记表里每项有状态与日期 |

**不会因为这份框架而改变的**：ROADMAP 当前阶段、暂停表、Howard 的措辞规则（Markdown 与省 token 在前、不说「能读任何站点」、不写未测的百分比）。

---

## 6. 效果追踪

### 6.1 基线（2026-10-27 取数，R§3）

| 指标 | 值 | 来源与口径 |
|---|---|---|
| 28 天展示 / 点击 / 平均位置 | 17,465 / 6 / 72.2 | GSC API，2026-09-28 至 10-25 |
| 最近 14 天 | 17,086 展示、6 点击、位置 72.3 | 同上（6 次点击全落在这 14 天） |
| 每周展示 | 5、374、7,594、9,492（点击 0、0、3、3） | 日表求和；第一周只有 09-30 至 10-04 |
| 展示集中度 | `find-all-pages` 博客 17,176（98.3%），位置 72.7，0 点击；工具页 562，位置 80 | 页面表 |
| 页面平均位置 ≤20 的展示 | **193 / 18,035（1.1%）**，21 个页面：首页 33（4.2）、changelog 35（5.3）、`/docs/` 19（4.1）、`connect-mcp` 19（7.2）、`reference` 22（15.8）等 | GSC 页面表；页面平均位置是各查询的混合值；页面表合计 18,035，与属性级 17,465 口径不同 |
| 位置 ≤20 的展示（查询 × 页面表） | 2 行、各 1 展示（`http://127.0.0.1:8791`、`octoscrape`） | 排名靠前页面的查询被 Google 匿名化，这张表看不到它们，所以不能度量可见度 |
| 品牌词 | 可见查询中**没有**含 octocrawl 的 | 可能被匿名化隐藏，**未知** |
| 收录（2026-10-12） | 24 已收录、9 未收录；URL Inspection（10-13）21 通过、3 中性 | 较新的数据**未找到** |
| 第一方分析（9-16 至 10-13） | 453 次页面浏览；来源 Bing 5、无来源 444 | `measurement.md` |
| AI Mode 样本（10-16） | 6/12 提名字，0/12 引用官方页面 | `ai-visibility.md` |
| 包下载（含自己的 CI 与镜像，30 天） | `octocrawl` 944、`@octocrawl/mcp` 1,676、`@octocrawl/sdk` 1,332、`@octocrawl/cli` 1,431；PyPI `octocrawl-client` 124；GitHub 2 星 | npm / PyPI / GitHub API；GTM 记录说这些不算增长信号，仅作背景 |

### 6.2 指标与节奏

| 指标 | 来源 | 周期 | 说明 |
|---|---|---|---|
| 每个新页面：何时被收录、何时第一次有展示、第一个查询 | URL Inspection API（每天每站 2,000 次）、GSC | 每周 | 用 §6.3 的页面追踪表 |
| 按页面组的展示、点击、位置 | GSC（页面 × 日期） | 每周 | **展示要同时看位置**；位置 >50 的展示不当作可见度 |
| 页面平均位置 ≤20 的展示 | GSC 页面表（按页面汇总；不要用查询 × 页面表） | 每周 | 看「可见度」，不是「曝光」。查询 × 页面表会漏掉排名最好页面的匿名化查询（本次只剩 2 行、各 1 展示），所以不能当 KPI。页面平均位置是各查询的混合值，要与按页面组的展示一起看 |
| 品牌词与首页点击 | GSC | 每周 | 匿名化会漏；看趋势不看绝对值 |
| 第一方访客与来源 | `weekly-report.mjs` | 每周 | 已有 |
| 注册来源（首次接触） | R5 闸门已加的字段 | 每周 | 第一个外部注册 2026-10-26，来源 chatgpt.com |
| AI 回答样本 | `ai-visibility.md` 的 12 个问题 | 2026-11-13、11-20，之后每月 | 单次样本；ChatGPT 与 Perplexity 当时被拦 |
| 外链 | GSC「链接」报告手工快照 + 登记表 | 每周 | **没有反链工具**；登记表记录状态与日期 |

### 6.3 每个页面一行的追踪表（对应参考文档「每个上线页面……」）

| URL | 主承接词组 | 上线日 | IndexNow 日 | 首次收录日 | 首次展示日 / 首个查询 | 28 天展示 / 点击 / 位置 | 备注 |
|---|---|---|---|---|---|---|---|

放在 `docs/seo/` 下的单独文件，随批次更新；空格里写「未知」不写 0。

### 6.4 继续还是停（【议】，阈值是内部提议，不是来源）

- 一批页面上线后至少等 **4 周**、且每个页面组至少 **100 次展示**，才评价位置变化；更短或更少的数据不下结论。
- 证据页试点：4 周后如果过半数页面是「已抓取，尚未编入索引」或仍无展示，**不加量**，先检查页面是否真有独有内容（G1）。
- 任何一批页面的大多数被 Google 判为重复或软 404，停发，检查模板（G4、G17）。
- 若 GTM 第 45 天复盘触发「切换楔子到 RAG 构建者」，B 组（给 coding agent 的文档）的页面优先级下调，D 组（RAG）上调。

### 6.5 数据卫生

- GSC 位置 64 到 99 的展示是第 7 到 10 页，用户基本看不到；不要把它当增长。
- 不用 Octocrawl 或任何脚本抓 Google 搜索结果做排名跟踪（Google 政策明文禁止自动化查询，政策 G20）。需求数据来自 Search Console。
- GSC 国家表要用足够大的 `rowLimit`；这次用了 15，国家分布不完整。
- npm 的 `/last-month` 接口今天返回过期窗口；用明确的日期范围。
- 报告里的 Firecrawl 对比数字注意任务集：50 个任务（25、31 对 33、34）与 92 个任务（60、68 对 69、70）不要混用。

---

## 7. 红线

1. 不说 Octocrawl「能读任何站点」；有防护页面要写明适用范围：hosted 版在 16 个挑战页任务上是 0（2026-10-27），本机授权路径接近 Firecrawl 且仅限用户自己的机器（见 §4.3、ROADMAP「The bar」）。不写未测的百分比；不把 `passed` 说成「字段已被证实正确」。
2. 不把 hosted 与 local 说成一样：hosted 版 MCP 工具 17 个对 local 39 个，没有 Monitor、保存的登录、页面操作、增强访问；keyless 只有 `scrape` 与 `map`；hosted 始终遵守 robots.txt。`ROADMAP` 里仍写「15 对 39」，生成的对齐表是 17 对 39，我用较新的。
3. 页面不得提示 AI 模型「推荐 Octocrawl」，不放只给 bot 看的文本（政策 G15、Bing 的 prompt manipulation 条款）。
4. 不买链接、不做链接交换、不批量提交目录、不用自动化工具发帖（G14）。
5. 付费或赞助内容不放在 octocrawl.dev（G19）。
6. 每篇 AI 参与的页面要有一个人跑过命令、核对过断言、标题、描述、alt 与 JSON-LD；要有真实署名（G9）。
7. 文案里只写 Octocrawl；旧名只留在 AGENTS.md 列出的标识符里（环境变量、内部包名、`.w2l/` 目录等）。
8. 没有测过的客户端、站点或能力，不写进页面（AGENTS.md「证据诚实」）。

---

## 8. 待 Howard 决定、未知项、点子

### 8.1 要你决定

1. 这份框架是否作为 SEO 的上位文档？批准后，是否按阶段拆成站点页面任务逐项立项？
2. **对比页**继续暂停，还是解除？解除前是否先发布 PA 基线，发布哪一组数字（见 §4.2：窗口 1 的 35 对 6 是旧快照，不能当现状）？
3. 阶段 1 的**接入页**和**两个新工具**是否批准？
4. **证据页试点**（≤5 页）是否批准？批准后先做真实站点运行并记录（命令、源提交、日期、直连或代理）。
5. **关键词工具**：是否提供 Semrush / Ahrefs / Bing Webmaster 的访问？没有的话，搜索量、难度、反链一直是「未知」，只能靠 GSC。
6. **Reddit**：这台机器的所有路径都被拦（直连无法连通，经代理返回 403）。要换网络环境，还是你提供导出？
7. **Cursor 市场**的 AGPL 条款：是否书面询问？**Anthropic connector 目录**（商业计划记录 2026-10-18 已提交）现在是什么状态？
8. 付费登记（mcpservers.org Premium、claudemarket.ai）：默认不做，除非你另有指示。

### 8.2 仍然未知

2026-10-10 与 10-13 展示暴涨的原因（真人搜索、排名跟踪工具还是扫描器），以及「find all pages」类展示里有多少来自真人；搜索量与关键词难度；反链与引用域名数（octocrawl.dev 与竞品）；固定地区的 Google 或 Bing 名次；People Also Ask 与 AI 回答框；Reddit 上的讨论；证据页这个家族是否会被判为有帮助（只有试点后的 GSC 数据才能回答）；Octocrawl 的 npm 与 PyPI 下载里有多少来自外部用户；2026-10-23 的收录检查结果（`docs/seo` 里没有找到）；hosted 版在 92 个任务上的成功率（从未运行过，所以不能对外引用）。

### 8.3 点子（参考文档的「头脑风暴」一节的对应物，**尚未调研**）

参考计划里的点子是「给同类工具逐个做 XX replacement 落地页」。Octocrawl 的对应：「替换 X」页，X 取自开发者已经在用、又有明确抱怨的东西：Claude Code 自带的 WebFetch（HN 上有「没有超时、不渲染 JS」的点名，也有人在问替代品）、`mcp-server-fetch`（PyPI 每月约 50.6 万下载）、Jina Reader（GitHub 上最后一次推送 2026-05-22，5 个月无更新）、自托管的 Firecrawl。这些页面不是对比页（不涉及暂停项），而是「如何把 X 换成本地的 Octocrawl」的教程；是否值得做，需要先列清单并做 SERP 核对。

---

## 附录 A：与参考文档的对照

| 参考文档章节 | 本文 | 变化与原因 |
|---|---|---|
| 核心目标 | §1 | 增加「不做什么」和与 ROADMAP 的关系；楔子沿用 GTM；P4 受众因没有证据而不承接 |
| 计划简述（两条链路、三项调研） | §2 | 两条链路沿用；三项调研**没有照搬**，改为自拟的四项判据（需求信号、SERP 是否可赢、能否真实做到、是否触碰红线）；补上「这次能与不能验证什么」 |
| 关键词规划表（搜索量 / 难度 / CPC / 意图，逐组 SERP 核实） | §2「找词与验证」 | **未沿用**：没有付费关键词工具，没有搜索量、难度和 CPC；改用 GSC 实测展示加搜索工具列表里的 SERP 线索判断「可能」，这些是定性线索，不能替代量化优先级 |
| 目标用户 | §3 | 每条痛点带可追溯的条数；明确标出 P4 无证据 |
| 网站结构 | §4.1 | 增加「状态」列：做 / 议 / 暂停；对比页暂停 |
| 各网页具体内容 | §4.2 | 保留「不承接什么」；对比页写出解除条件 |
| 为什么这样做（PSEO 依据） | §4.3 | 用 11 个站点的实测替换单个例子；更正对 axiom.ai 的一个论断；加入政策边界 |
| 网页具体结构 | §4.4 | 模板换成 Octocrawl 的页面类型；增加证据页 |
| 站内链接规划 | §4.5 | 参考文档是独立文档；这里先给规则，并**要求**先建登记表 |
| 外链规划（空） | §4.6 | 补全：已有、新候选、限制、不建议的做法 |
| （无） | §4.7、§4.8 | 技术 SEO 与 AI 可见度，参考文档没有 |
| 效果追踪 | §6 | 增加基线、可见度与曝光分离、停手判据、数据卫生。**未沿用**参考文档的「核心关键词排名」「域名权重」（没有工具；抓 Google 结果做排名跟踪违反政策 G20）、「GEO 索引」（只以 12 题 AI 回答样本代替，不是同一指标）和「下载转化」（目前只有注册来源这一首次接触字段，没有下载转化事件） |
| 头脑风暴 | §8.3 | 对应的点子，同样标为未调研 |

## 附录 B：参考文档里我没读到的部分

主文档与「全站内链架构」正文已完整读取。「SEO 规划表」只读了「首页」「场景页」「Article」三个 sheet 的表头和前几行；「Solution 页面」「对比页」两个 sheet 没有打开。主文档里的「过往半年流量占比」图片没有读到。参考文档面向另一个产品，只借框架，不借内容或数字。
