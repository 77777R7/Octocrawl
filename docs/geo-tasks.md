# GEO 任务清单（AI 助手里的可见度）

依据：Howard 2026-11-09 的要求（"现在专注于优化 GEO，把计划写成 task md"），以及已有的计划：[核心 SEO 框架](seo/core-seo-framework.md) §4.7、§4.8、§5，[GEO 观测协议](seo/library/geo-protocol.md)，[决定记录](seo/library/decisions.md)（G-10 至 G-16），[题库](seo/library/geo-prompts.md)，[GEO 研究记录](../research/seo/2026-10-27-geo-research.md)。现状是 2026-11-09 在 `main` 的 `c059d36f` 上、对线上 octocrawl.dev 重新核查的（经代理）；原始读数和临时脚本存在 `~/Code/w2l/.w2l/seo/manual-reads/2026-11-09/geo-audit/`（git 忽略，不入库）。标"未知"的没有量到，不是 0。

这份清单把上面几份文件里已有的 GEO 计划，按 2026-11-09 的实测重新排了顺序，并补上 10-28 之后才看到的事实。框架和协议本身不改；决定照旧记进 decisions.md。

做完一项勾一项，发现新的补上。看进度读这个文件，不翻对话记录。

## 为什么顺序变了

10-28 写计划时，GEO 还没有任何流量数据，所以计划从"先搭测量、再试点"开始。两周后的数据改变了重点：

1. **ChatGPT 是唯一有量的渠道。** 11-02 至 11-08 站内 92 次页面浏览里有 32 次带 `utm_source=chatgpt.com`（标记率 100%）；Google 搜索 4 周可见品牌词仍是 0。
2. **ChatGPT 送来的人落在免费工具页。** 那 32 次里：`/tools/link-extractor/` 16、`/tools/` 7、`/tools/website-to-text/` 6、首页 2、`/docs/` 1。其中 `/tools/` 和 `/tools/website-to-text/` 在 Google 还没收录，所以 ChatGPT 的检索不靠 Google 收录（它用 Bing 和自己的索引，Bing 收录状态未知）。
3. **漏点在转化，不在曝光。** 近 30 天外部注册 14 个：首次来源 chatgpt.com 5、direct 3、没记录 6。有 key 或 MCP 连接的 4 个，调用过 hosted 的 8 个（这个数把 Playground 也算进去了），跑过 hosted 任务的 0 个。以上来自 `scripts/hosted/funnel.mjs`。另做了一次只读的 Firestore 交叉统计（只出计数，输出存在上面的目录 `cross-output.txt`）：5 个 ChatGPT 来源的注册里 0 个拿 key 或接 MCP，4 个调用过 hosted（含 Playground）；而 6 个没记录来源的注册（10-29 至 11-09）里有 3 个拿了 key 或接了 MCP，也就是最投入的那批人来源反而不知道。
4. **AI 爬虫在来。** 源站请求日志 11-02 00:17Z 至 11-09 14:11Z（去掉我们自己 11-09 14:11–14:14Z 用这些 UA 做的测试）：`OAI-SearchBot` 80 次、`ChatGPT-User` 53、`Claude-User` 5（这 5 次都是 claude-code 2.1.3xx，可能是我们自己的会话，未确认）。这是下限：Worker 前面有 4 小时缓存，Cloudflare 边缘的数据没读。

所以先做的是：**弄清 ChatGPT 为什么引用我们的工具页，把这些页变成通往 API/MCP 的入口，并能量出转化**。G-13（Markdown 协商）、目录补登这类，影响的是目前几乎没有量的 Claude 和 coding agent 渠道，排在后面。

## 和 ROADMAP 当前阶段的关系

当前阶段是"十个外部用户"（2026-11-01 至 11-29），规则是"站点工作只做降低试用成本的，SEO 周复盘照旧，不开新的大项"。这份清单是 Howard 明确要求的，但每一项仍按同一个问题排序：**它能不能让一个从 AI 助手来的人开始用、并且留下来？** 不能直接回答这个问题的项（大规模题库采集、对比页、多语言）留在后面或不做。

## 现状（2026-11-09 核查）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| `robots.txt` 不拦任何 AI 或搜索爬虫 | 通过 | 只有 `User-agent: *` / `Allow: /` / `Disallow: /api/` |
| 用 AI 爬虫的 UA 访问 6 个页面 | 30 次全是 200，无挑战 | 只证明没有按 UA 的规则；真爬虫按 IP 判断，要看 Cloudflare（G-16，未知） |
| Cloudflare 的 AI 爬虫与 Agent 访问策略 | **未知** | 仪表盘未登录，token 403。Cloudflare 2026-11-04 加了按 Agent 的开关 |
| `Accept: text/markdown` 返回 Markdown | 没有 | `/`、`/docs/`、`/docs/connect-mcp/`、博客都返回 HTML，无 `Vary`、无 `Link` 头。抽查 22 个站，15 个返回 Markdown（Firecrawl、Tavily、Exa、Apify、Vercel、Stripe、Cursor、OpenAI、Anthropic 等）；Jina Reader、Supabase、MDN、Google Search 文档等没有 |
| `.md` 孪生页 | 部分 | docs、博客、changelog 有；首页、`/scrape/`、`/blog/`、`/tools/*` 没有 |
| `llms.txt` / `llms-full.txt` | 部分 | 有，开头的 hosted 与 local 说明是对的；没列 `/scrape/` 和 `/tools/*`；Limits 的描述写错了结果状态（见 C1） |
| JSON-LD | 有 | 首页 Organization、WebSite、SoftwareApplication、FAQPage；`sameAs` 没有 npm、PyPI、MCP Registry |
| 首页的身份定义句 | 缺 | 只在 meta 和 JSON-LD 里；10-16 的 AI 回答把 Octocrawl 说成 Octoparse |
| 回答"在 ChatGPT / claude.ai 里怎么连"的页面 | 缺 | 两种连接 10-16 都实测成功过（`research/hosted/2026-10-16-mcp-oauth-clients-adee17f2.md`），官网没写 |
| `/scrape/` 页的文字 | 约 61% 是演示内容（章鱼百科等） | 助手读这页时，产品事实被稀释 |
| ChatGPT 实际怎么回答 | **未知** | 从没测过。`geo-run.mjs` 只支持 Claude API，没跑过 |
| 每周快照能否看出 AI 来源落在哪页 | 不能 | 原始日志有 `path` 和 `utm_source`，缺交叉统计 |
| 官方 MCP Registry | 正确，0.8.11 | — |
| GitHub MCP Registry（VS Code 一键安装的来源） | 不在 | 771 个条目里没有 Octocrawl；Firecrawl、Tavily、Apify 等在 |
| LobeHub | 错 | 两个重复条目，标题都是旧名 "W2L — Web-to-LLM Context Extraction"，描述停在 0.3.x，不链 octocrawl.dev |
| Smithery | 已消失 | 页面 404，Smithery 10-31 关了托管，只留精选目录 |
| GitHub 仓库 About 与 Releases | 过时 | 描述只写 self-host；最新 Release 是 0.4.1（tag 到了 v0.8.11）；README 示例写着 "real output of octocrawl 0.4.1"，Glama 镜像的 README 里也是这句 |
| PyPI 上的 `octocrawl` | 是别人的包 | 我们的是 `octocrawl-client`；助手可能让人 `pip install octocrawl` |
| 排在 "best web scraping MCP server"、"firecrawl alternative" 的榜单页 | 17 页：读到的 15 页 0 页提到 Octocrawl；2 页被 Vercel 安全检查拦住，未知 | 这些是助手回答选型题时引用的页面 |
| 站外的非目录提及（博客、HN、Reddit、dev.to） | 没找到 | 一次 WebSearch，一个美国索引 |

## 待 Howard 决定

没决定的按"默认"一栏先做，或者先做不受影响的部分。

| # | 问题 | 影响 | 默认 |
| --- | --- | --- | --- |
| D1 | **ChatGPT 回答怎么测。** 协议规则 5 不让我们写脚本自动问网页版。选项：①你在 ChatGPT 网页版用临时对话手工问 14 题、每题 3 次（42 条回答，估计 1.5 到 2 小时，没测），我出题和记录表，只有这一项完全符合规则 5；②我在内置浏览器里用你已登录的 ChatGPT 提问：这是规则 5 的例外（协议 §8 第 1 项，服务条款与自动化的问题），要你明确接受，选了就在 decisions.md 新增一行记下；③等 OpenAI API key，用 `geo-run.mjs` 加 ChatGPT 适配器（API 结果只能复现网页版约 26% 到 28% 的引用 URL） | M6 | **已定 2026-11-09：①，Howard 在桌面 app 里问**（decisions.md G-17 第二行） |
| D2 | **GEO 的方向**：把 ChatGPT 已在引用的工具页做成通往 API/MCP 的入口（工具页加"在你的 agent 里做同一件事"），还是把引用往 docs 和 MCP 页引？两者不冲突，问的是先后 | T1、T2、C 组 | 先工具页 |
| D3 | G-13：对 `Accept: text/markdown` 返回 Markdown，加 `Vary: Accept` 和 `Link` 头。改动在 `packages/public-preview/src/server.ts` 的 `serveStatic()`，约 20 到 30 行加测试，Worker 不用改。效果没有研究证明，但成本低，抽查的同类站多数做了 | S1 | 批准，排在 T 组之后 |
| D4 | G-16：读 Cloudflare 的 AI 爬虫与 Agent 访问策略、Bot Fight / BIC 设置和近 7 天被拦的已验证爬虫数。需要你登录仪表盘或给一个只读 token。只读，不改设置 | M8 | 你登录后我只读 |
| D5 | 一页事实型的"What is Octocrawl"（是什么、给谁用、hosted 与本地各能做什么）。和 Firecrawl / Jina Reader / Crawl4AI 的差异属于对比页的内容（框架 §4.2），S-10 解除前不写；要不要提前写，归入 S-10 一起决定，写的话按政策 G7（自己测过、有日期和版本、含我们输的项） | C8 | 只写 Octocrawl 自己的事实，不写和别家的差异 |
| D6 | 仓库设置和站外账号：改 GitHub About、为 v0.8.x 建 Releases、用你的账号认领 LobeHub 条目、看 Claude Connectors Directory 和 ChatGPT 插件后台的状态。这些都要你登录或授权 | O1、O2、O5、O6 | 我起草文字，你操作 |
| D7 | 站外外联：给 15 个榜单页的作者发邮件求收录、在 dev.to 转一篇已有博客、Show HN 或 r/mcp 发帖。每一条对外发出前都给你看 | O9、O10 | 先只做 O9 的名单和草稿 |
| D8 | 周复盘的 GEO 小节：任务提示和 [weekly-review.md](seo/library/weekly-review.md) 的流程与模板都规定协议批准前写"未启动"。改成报告 AI 来源落地页、AI 爬虫计数、试点状态，协议里的指标在批准前仍写未启动 | M9 | 改 |
| D9 | G-12 试点（API 采集）继续放着，还是完成 Anthropic 组织验证、提供 OpenAI key 后开跑？ | P1 | 继续放着，D1 的手工样本先行 |
| D10 | `robots.txt` 是否显式加 `User-agent: Google-Extended` / `Allow: /`。Google 10-30 说"明确允许 Google-Extended"的站可以在 Gemini 里被引用；通配的 Allow 算不算，Google 没说 | S2 | 加，两行，零风险 |

## 定下的方向

1. **先测、再改。** 改页面之前先有 ChatGPT 的回答样本（M6）和落地页数据（M1），改完同样的设置再测。单次回答不下结论，按协议在题组层面汇总。
2. **加强已有的引用，比从零争取新的便宜。** ChatGPT 已在送人到工具页，先把这几页做好。
3. **说对比被提到重要。** 先改我们自己站上和 `llms.txt` 里说错的地方，再去改第三方目录（协议 §4"说错了"一行）。
4. **转化是衡量标准。** GEO 的效果看"AI 来源访问 → 注册 → 拿 key 或接 MCP → 跑通一个任务"，不只看提及率。
5. 协议 §5 的规则照旧：题目里不加品牌名，追问的回答不进指标，不做操纵和付费发帖，不写只给 bot 看的内容，AI 起草的页面要有人跑过命令、核对断言。

## 不做的事

- 不用脚本或 agent 自动问 ChatGPT、Claude、Perplexity 的网页版（协议规则 5），除非 Howard 在 decisions.md 里记下了例外（D1 ②）。
- 不做对比页（S-10 暂停）；C8 是只写 Octocrawl 自己的事实页，不写竞品差异。
- 不为提高提及率改题目、改营销措辞；做不到的事记成产品需求，不写成能做到。
- 不付费登记（S-16），不买"GEO 发帖"。
- 不加统计数字、FAQ 标记去"喂"AI：研究显示前者多数情况下让排名下降，后者在 Google 已无富结果（框架 §4.7、§4.8）。
- 不做多语言页：没有非英语受众的证据。

## 任务

编号：M 测量，T 工具页，C 站内内容，S 站点技术，O 站外，P 试点。每项一个 PR（同一页的小改可以合并），从当时的 `origin/main` 拉分支；站点改动随下一次 preview 部署，只在 Howard 要求时部署。

### 第一步：测量（先做）

- [ ] **M1 AI 来源的落地页进每周快照。** 在 `scripts/public-preview/weekly-report.mjs` 的 `summarizeSiteEvents` 加"助手 × 落地路径"和同日后续动作（是否点了 `/signin/`、`/docs/connect-mcp/`），由 `scripts/seo/snapshot-lib.mjs` 的 `firstPartySummary` 带进 `series.jsonl` 和 `summary.md`；补单元测试。完成：周快照里能读到 ChatGPT 访客的落地页分布。
- [ ] **M2 转化交叉表。** 给 `scripts/hosted/funnel.mjs` 加"首次来源 × 落地路径 × 有 key 或 MCP × 真的调用过 API"的计数（只输出计数，不出 uid），接进周复盘。
- [ ] **M3 分开 Playground 和 API。** 现在"called the hosted API"含 Playground 用量。定义"第一次 API 或 MCP 调用"，在 `creditUsage` 或请求日志里能分出来。
- [ ] **M4 查 6 个没有首次来源的注册。** 10-29 至 11-09 的外部注册有 6 个没有 `firstSource`，其中 3 个拿了 key 或接了 MCP：Do Not Track、`w2l_src` cookie 丢失、记录代码当时还没部署到线上，还是 OAuth MCP 或 CLI 的登录路径没有记录？修掉能修的那条。
- [ ] **M5 AI 爬虫计数进周复盘。** 从源站请求日志按周统计 `OAI-SearchBot`、`ChatGPT-User`、`GPTBot`、`Claude-SearchBot`、`Claude-User`、`ClaudeBot`、`Claude-Agent`（2026-11-04 新增）、`PerplexityBot`、`Perplexity-User` 的次数和路径，注明 4 小时缓存造成的下限；排除我们自己用这些 UA 做的测试，并标出可能是我们自己 Claude Code 会话的 `Claude-User`。
- [ ] **M6 ChatGPT 回答样本（D1）。** 14 题、每题 3 次，按协议 §3 记录：工具意图 6 题（如 find all pages on a website、extract all links from a page、website to text）、开发者意图 6 题（如 web scraping MCP server for Claude Code、convert docs site to markdown for an agent）、2 题不应提及。题目里不出现品牌名（协议规则 1）；说法对不对只从自然提到 Octocrawl 的回答里看。记录是否点名 Octocrawl、是否引用 octocrawl.dev、引用哪页、同一答案里有哪些竞品、说法对不对。题目从 `geo-prompts.md` 核心集里挑，补的题注明来源。结果写成 `research/seo/<日期>-geo-run-chatgpt-web.md`，原始回答放 `.w2l/seo/geo-runs/`。
- [ ] **M7 Bing 收录。** 在 Bing Webmaster Tools 里查 `/tools/*`、首页、`/docs/connect-mcp/` 的收录状态，读一次 AI Performance（Howard 操作，或给 `BING_WEBMASTER_API_KEY` 让快照自己读）。
- [ ] **M8 Cloudflare 只读核对（D4，G-16）。** 确认 `OAI-SearchBot`、`ChatGPT-User`、`Claude-SearchBot`、`Claude-User`、`Claude-Agent`、`PerplexityBot`、`Perplexity-User`、`Googlebot`、`Bingbot` 没被拦或挑战；记下"训练"一项的设置（选 Block 会连 Googlebot、Bingbot 一起封）。
- [ ] **M9 周复盘的 GEO 小节（D8）。** 同一个 PR 里改任务提示和 `docs/seo/library/weekly-review.md`（第 6 步与模板的 GEO 标题），报告 M1、M5 的数字和试点状态，协议指标批准前仍写未启动；决定记进 decisions.md；顺带处理还开着的 #810、#905 两份周复盘 PR（合并或关闭由 Howard 定）。
- [ ] **M10 AI Mode 12 题重测。** 执行日志排了 11-13、11-20，但没有执行者也没有定时任务。定下谁做；B3 的判分按新事实（有账户时 hosted crawl ≤500 页、batch ≤1,000 个网址），写进新的带日期记录，不改 10-16 的旧记录。

### 第二步：ChatGPT 已在引用的工具页

- [ ] **T1 工具页加定义句和"在 agent 里做同一件事"。** `/tools/link-extractor/`、`/tools/website-to-text/`、`/tools/url-to-markdown/`、`/tools/`：首屏一句可引用的定义（这个工具做什么，由 Octocrawl 提供）；结果下方一步桥接：`claude mcp add` 一行、REST 一行、"不用 key 也能试"的额度说明。11-03 至 11-09 工具页的下一步区块 29 次浏览（18 个访客），到 `/docs/connect-mcp/` 只有 1 次点击。完成：四页上线；M1 能看到桥接的点击。
- [ ] **T2 首页、`/scrape/`、`/tools/*` 的 Markdown 孪生页。** 由生成页面的同一份源文件生成，不手写，免得和 HTML 不一致；列进 `llms.txt` 和 `llms-full.txt`（`apps/public-web/scripts/build-docs.mjs:394-406`）。
- [ ] **T3 改完再测。** T1、T2 上线后至少隔一个完整采集周期，用 M6 的同一组题和设置再测一次，对照 M1、M2 的数字。每题 3 次的样本区间很宽（协议 §3），前后差别只当线索，记录里写出区间，不据此宣布效果。

### 第三步：站内说对

- [ ] **C1 结果状态写错了。** `llms.txt`、`llms-full.txt` 和 `/docs/limits/` 的描述写着 "success, blocked, failed, timeout or incomplete"（`apps/public-web/scripts/docsPages.mjs:14`），页内 "Interpret the status" 表是 Playground 预览的状态（`incomplete`、`timeout`、`quota_exceeded`）。改成 API 和 MCP 的真实状态：单页读取是 `success`、`partial`、`empty_verified`、`blocked`、`failed`；crawl 和 batch 的条目还可能是 `cancelled`、`budget_exceeded`、`duplicate`（来源 `packages/contracts/src/status.ts` 的 `RESULT_STATUS`，`packages/mcp/src/hostedJobWorker.ts`）。预览的表改名为 "Preview result states"。
- [ ] **C2 无 key 的每日总量。** `/docs/limits/` 只写了没有账户的调用方合计每天 1,500 页，漏了无 key 调用方合计 500 页（`packages/mcp/src/hostedApi.ts:170`、`:175`）。
- [ ] **C3 `llms.txt` 补价格事实和链接。** 无 key 每个地址每天 20 页；登录免费、每月 1,000 credits；HTTP 页 1 credit、浏览器页 5 credits；额度包还没开卖。Get started 组加 `/scrape/` 和 `/tools/*`。动手前对照 `hostedCredits.ts` 和 `hostedApi.ts` 再核一遍数字。
- [ ] **C4 在 ChatGPT 和 claude.ai 里怎么连。** `apps/public-web/content/connect-mcp.md` 的 "Sign in instead of a key" 下加两节（claude.ai：Settings › Connectors › Add custom connector，URL 用 `/mcp-oauth`；ChatGPT：添加自定义 MCP 服务器，OAuth）。写之前在当时的产品上各重连一次并记录，10-16 的记录已经三周多了。
- [ ] **C5 首页的身份定义句。** hero 下方一句可见的话，例如 "Octocrawl is an open-source web scraper for AI agents: public pages as Markdown with an Evidence Record, hosted or on your own computer"。措辞遵守 Markdown 在前的规则，不说"能读任何站点"。
- [ ] **C6 JSON-LD 的 `sameAs` 和版本。** 加 npm（`octocrawl`、`@octocrawl/mcp`）、PyPI `octocrawl-client`、MCP Registry 条目；`softwareVersion` 构建时取自 `package.json`。CI 的 JSON-LD 检查只允许 github.com 和 schema.org（`scripts/seo/check-jsonld.mjs` 的 `EXTERNAL_HOSTS`），同一个 PR 里把 `www.npmjs.com`、`pypi.org`、`registry.modelcontextprotocol.io` 加进去、补测试，并更新 `policy-gates.md` 里 G11 列出的允许主机。效果没有证据，只是消歧的锚点。
- [ ] **C7 `/scrape/` 的演示内容。** 把演示用的第三方全文（章鱼百科、书评、原始 HTML）默认折叠或截短，让产品事实成为这页的主体。
- [ ] **C8 "What is Octocrawl" 事实页（D5）。** 新开 `/docs/about/` 或在 Introduction 加一节；首页 FAQ "How is Octocrawl different…" 改链到这页（现在链到一份正文仍用旧产品名的内部文档 `benchmark-gate.md`）。
- [ ] **C9 PyPI 消歧。** README、`/docs/` 的 Python 段落和 `llms.txt` 各加一句："The Python package is `octocrawl-client`; `pip install octocrawl` is a different project."
- [ ] **C10 OAuth 登录账户有没有浏览器通道。** 核实 `hostedApi.ts` 里 `record.browser` 对 OAuth 账户的默认值；如果有，把 `/scrape/` FAQ 的 "browser reads need an API key" 改成 "need an account"。
- [ ] **C11 README 的示例输出。** 第 123 行附近 "real output of octocrawl 0.4.1" 换成当前版本的真实运行。Glama 镜像 README，页面上也显示 0.4.1。

### 第四步：站点技术

- [ ] **S1 Markdown 协商（D3，G-13）。** `serveStatic()`：请求的 `Accept` 优先 `text/markdown`、且目录下有 `index.md` 时，返回它（`text/markdown`，`no-store`）；有孪生页的页面加 `Vary: Accept`；HTML 回应加 `Link: <…/index.md>; rel="alternate"; type="text/markdown"` 和 `Link: </llms.txt>; rel="llms-txt"`。测试用 Claude Code WebFetch 的原样请求头。上线后确认 Cloudflare 没有按 URL 缓存而忽略 `Vary`（HTML 现在是 `cf-cache-status: DYNAMIC`，应当没问题，要实测）。
- [ ] **S2 `robots.txt` 显式允许 Google-Extended（D10）。** `build-docs.mjs:453`。

### 第五步：站外

- [ ] **O1 GitHub 仓库 About 和 Releases（D6）。** 描述写上 hosted MCP/API 和本地 `npx`，例如 "Web pages as Markdown and JSON for AI agents, each with an Evidence Record. Hosted MCP and API at octocrawl.dev, or run it locally with npx octocrawl."；为 v0.8.x 的 tag 建 Release，至少 v0.8.11。mcp.so、Enterprise DNA 原样抄这段描述。
- [ ] **O2 LobeHub（D6）。** 按 `lobehub.com/publish-mcp/skill.md` 用 Octocrawl 的名字和 0.8.11 的描述重新发布，请 LobeHub 删掉或转向 `77777r7-w2l` 重复条目。
- [ ] **O3 vercel/ai #24433。** 审稿人 11-06 列了三点：rebase、描述缩到两三句白话、贴一次真实模型调用。做完回复审稿人（回复前给 Howard 看）。
- [ ] **O4 GitHub MCP Registry。** 先从 GitHub 自己的页面确认现在怎么收录（是否仍是写信给 partnerships@github.com），再申请。它决定 VS Code 里能不能一键安装。
- [ ] **O5 Claude Connectors Directory（D6）。** 在后台看 Octocrawl 是否是公开条目（[2026-10-18 的商业计划](launch/2026-10-18-hosted-business-plan.md) 记录当天已提交插件包和 MCP connector 各一份）；本次搜到的空描述条目很可能是 Howard 账户里的自定义连接器，不能当作目录状态。
- [ ] **O6 ChatGPT / Codex 插件目录（D6）。** 准备提交包：OAuth 主机的 `mcp.json`、在 `mcp.octocrawl.dev` 上放域名验证、审核用测试账户、5 个正例 3 个反例、演示视频；审核规则里有"不得未经授权抓取外部网站"一条，提交说明要先回答它（只读公开页面、遵守 robots.txt、每次读取有 Evidence Record）。Howard 的身份验证状态先确认。
- [ ] **O7 Smithery。** 看新的 Smithery 精选目录是否接受提交；不接受就从外链记录和记忆里去掉 "live"。
- [ ] **O8 npm 关键词。** 下次发版时给 `octocrawl`、`@octocrawl/mcp` 加 `mcp`、`mcp-server`、`model-context-protocol`、`firecrawl-alternative`；考虑把 `octocrawl` 包的 README 标题从 `@octocrawl/cli` 改成 Octocrawl。
- [ ] **O9 榜单页名单和草稿（D7）。** 排在 "best web scraping MCP server"、"firecrawl alternative" 的 17 个页面（2 个被 Vercel 安全检查拦住，先用浏览器读）（Olostep、ZenRows、Scrapfly、webscraping.ai、scrape.do、opensourcealternatives.to 等）：逐页记下作者是否中立、有没有提交入口，起草请求收录的信；AlternativeTo 和 mcpservers.org 的 Web Scraping 主题页（86 个服务器，第一页没有我们）走它们自己的免费入口。发出前给 Howard 看。
- [ ] **O10 第一个非目录提及（D7）。** 把一篇已有博客（例如 Claude Code 网页抓取）转到 dev.to 或 Hashnode，带 canonical；Show HN 或 r/mcp 等 Howard 定时机。
- [ ] **O11 停滞的提交。** awesome-remote-mcp-servers #2175（三周没人看）、cline/marketplace #218（9 月以来没有合并）、public-apis #8720 与 #8721（同一产品两个 PR，可能合并成一个更好）：各决定催一次、合并还是放弃。

### 之后再说

- [ ] **P1 G-12 的 API 试点（D9）。** Anthropic 组织验证完成、有 OpenAI key 后，给 `geo-run.mjs` 加 ChatGPT 适配器，跑核心集 28 条两周。结果标明是 API，不和 M6 的网页版数据合并。
- [ ] **P2 题库 v0.0.2。** 按 M6 学到的东西补"问法变体"（协议 §3），并列一张"题目 → 承接页面"的对照表，缺页从题目推出来，不凭直觉列。

## 建议的顺序

1. M6（ChatGPT 样本，需要 D1）和 M1、M2（落地页与转化统计）并行，这周内。
2. T1、T2，然后 C1、C2、C3（小改动，可以一个 PR）。
3. C4、C5、C9，然后 S1、S2。
4. O1、O3、O4 先做（受众最大）；其余 O 项按 Howard 的时间。
5. T3 复测：T 组上线一个采集周期以后。

## 下次从这里继续

先看"待 Howard 决定"里哪些已经有答案，把答案记进 [decisions.md](seo/library/decisions.md)（新增一行，不改旧行），再从"建议的顺序"第一条没勾的开始。
