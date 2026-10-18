# Octocrawl 云端版功能规划（2026-10-18）

**怎么来的：** 一共 14 个 agent。
- 22 家竞品的云端功能，分 4 组调研：面向 agent 的 API、抓取平台、无代码和可视化工具、浏览器基础设施。
- 需求证据：GitHub、评测网站、社区讨论、企业采购要求。
- 仓库技术盘点：读的是 origin/main。
- GCP 架构选型、Firecrawl Alexandria 专项。
- 汇总成一张功能候选清单，3 个角度各写一版规划，评审合成一版，最后由 critic 审查。
- 另外我自己读了 30 天的线上日志，看实际需求信号。

**不含任何定价。**

**这份文件的结构：**
1. 「最终建议」：我根据 critic 的意见和线上日志修订后的结论，**读这一节就够了**；
2. 「规划正文」：评审合成的完整版，写错的地方已经更正，标了【审查更正】；
3. 附录 A：critic 的完整意见；
4. 附录 B：功能候选清单的全文。

---

# 最终建议（审查后修订）

## 一句话

**云端版的定位：给 AI agent 和小团队用的「网页数据后端」。** crawl、batch 和并行任务在云端可靠地跑完，结果持久保存、可以回调、导出，也可以在表格里审阅，每一格都能追溯到来源。

**但现在还不能开建大底座。** 线上几乎没有外部需求信号，规划里的几个关键假设也都还没测。先用 2–3 周、小成本把需求和技术风险验证掉，再决定建多大的底座。

## 线上的真实信号（我读了 30 天的 Cloud Logging，只读）

- **托管 crawl 和 batch 被拒绝（`403`）的请求一共 34 次。** 其中 32 次是 `curl/8.7.1`，很可能是我们自己测试时发的（未核实）。只有 1 次来自 Python SDK 0.4.2、1 次来自 Windows 浏览器，**这两次可能是外部用户**。
- **账户扣费事件一共 98 次，只来自 2 个账户**：你的主账号和那个审核账号。
- 结论：**目前几乎没有外部用户在用托管版，也几乎没人来要托管 crawl。**
- ROADMAP 里 PH 第 1 阶段的 Exit 条件还没达成：要有 5 把外部 key 在用，并且写好两周的成本记录。外部试用闸门的状态也未知。

## 你的四个想法：结论

| 想法 | 结论 | 时机 |
|---|---|---|
| **并行任务** | 做，这是云端最基本的价值。分三层：账户的并发上限（HTTP 和浏览器两条通道分开算）、单个任务的并发、同一站点全平台限速 | 先用小方案验证（见下），之后再上完整底座 |
| **可视化画布** | 三种分开处理：<br>① **结果表格**（像 Exa Websets、Clay 那样）是主画布：每一行是一页或一条记录，每一格都能点开看 Evidence。这是这个领域真正做出来、和收入挂钩的可视化形态<br>② **任务实时进度页**：所有画布的地基<br>③ **站点路径树**：成本低，但需求弱<br>④ **n8n 式节点画布：不自建**，用 n8n 节点和「线性管道模板」代替 | ② 跟着第一批云端任务一起做；① 先出只读 v0 来验证；③ 往后放；④ 等有付费用户点名要再说 |
| **团队（邀请同事）** | 数据从第一天起就带 `workspace_id`，避免以后整体返工。邀请和角色（Owner、Admin、Member、Viewer）要**和计费一起做**，否则团队 workspace 没有额度来源，邀请进来的人用不了。免费额度按人发，不按 workspace 发，防止刷额度 | 计费阶段 |
| **类 Alexandria 目录** | 后期做「已验证 adapter 目录」：每项能力都附真实站点测试的通过率，这正好补上 Firecrawl 的短板（它一个月从 88 个数据源涨到 278 个，质量不透明）。授权数据商和分成要 100–300 人天，放最后。热门社交平台和人员数据不做 | 第 3 期以后；开工要先把它从 ROADMAP 的 Paused 表里拿出来 |

## 相对正文，审查后改了这 7 处

1. **第 0 步改成「先测，不建」，2–3 周：**
   - **需求：** 联系那 2 个可能的外部用户和现有的 key 持有人，问他们要不要托管 batch 或 crawl、单次规模多大。
   - **成本：** 写两周的成本记录（PH item 3），实测 Cloud Run 上浏览器页的耗时。正文假设每页 8 秒，但云端唯一的实测是 40 秒左右（增强访问路径），**如果真是 40 秒，浏览器成本和并发规格都要重算**。
   - **出口成功率：** 在 parity 站点集上，分别用 Cloud Run 直连和 Webshare 出口跑一遍。之前的实测是 2/16 对 7/16。如果大量站点都挡 Google 的 IP 段，托管 crawl 就是「可靠但抓不到」，出口代理就得提前做。
   - **agent 行为：** 用本地原型测 Claude Code、Codex、ChatGPT 会不会自己轮询 job id，取回 200 页结果要占多少 token。
   - **技术 spike：** 在 Cloud SQL 小机型上测 Postgres 队列：2 万个 URL、3 个 worker、中途 `kill -9`，看会不会丢任务、会不会重复。
2. **先做小方案，再上大底座：**
   - 先做 ≤1,000 个 URL 的托管 batch 和小规模 crawl（比如 ≤500 页），用 Cloud Tasks + GCS + Firestore 的 job 文档实现，大约是完整底座 1/3 的工作量，用来验证有没有人用、有没有人付钱。
   - 有了信号再做完整底座：Postgres + worker pool + 全平台限速，现实估计 15–25 人天，正文写的 8–14 太乐观。
3. **定时任务和 Monitor 放到计费之后：** 它们会无限放大成本，免费用户的 monitor 没有付费门槛就会一直跑。
4. **低需求项不进第 2 期：** 站点路径树、Evidence Pack、n8n 节点，都等第 1 期的使用数据出来再定。
5. **要提前处理的硬约束：**
   - 全站每天只能服务 1,500 页（`W2L_SITE_DAILY`），一个大 crawl 当天就会用光，要先把这个上限拆开；
   - 每个地址每分钟 120 个请求，MCP 轮询容易撞上；
   - 托管端的缓存是关闭的，而缓存是 crawl 和 monitor 降成本的主要手段；
   - 文件大小上限 5 MiB，会影响 PDF 类任务。
6. **加上运维和法律的预算：**
   - 一个人长期运维要每周 0.5–1.5 天（估算），这部分会挤占开发时间；
   - 托管 crawl 之后，Octocrawl 就成了实际的抓取方，站点方的投诉会直接发给 Google Cloud，可能连整个 GCP 项目一起被停。上线前要准备好 abuse 联系邮箱、处理时限、按域名封禁，并把托管 API 和官网拆到不同的 GCP 项目。
7. **时间要实事求是：** PA 还是第一优先级，所以第 1 期大约要 10–16 周，不是 6–8 周。

## 修订后的顺序

| 阶段 | 做什么 | 进入下一步的条件 |
|---|---|---|
| **0（2–3 周）** | 上面第 1 条的 5 项测量；先拆开全站日上限；准备 abuse 处理流程 | 至少 2–3 个外部用户明确要托管 batch 或 crawl；成本和出口的数字支持继续 |
| **1a（约 2–3 周）** | 小方案：托管 batch（≤1,000 URL）和小 crawl、按账户的并发和排队、幂等和单任务预算、MCP 异步工具、持久结果和导出、任务 webhook、最小任务进度页；所有数据带 `workspace_id` | 有外部用户持续在用；有付费意向 |
| **1b（3–5 周）** | 完整底座（Postgres、worker pool、全平台限速、GCS），把 1a 迁上去，放开规模 | 小方案顶不住用量 |
| **2（和计费一起）** | 团队邀请和角色、key 的 scope 和预算、结果表格 v0（只读）、定时任务和 Monitor | — |
| **3 以后** | 结果表格 v1（加列、自带 key 的 LLM 列）、托管 search、线性管道模板、已验证 adapter 目录、托管增强访问 | 看第 2 期的数据 |

## 需要你决定的 4 件事

1. **第 0 步要不要现在开始、和 PA 怎么分时间。** 第 0 步大部分是测量，可以和 PA 并行。
2. **类 Alexandria 目录要不要从 Paused 表里拿出来，单独排期**（排在后期）。
3. **自带的 LLM key 能不能保存下来，给定时任务和表格用。** 这和 ROADMAP 里「key 不落库」的原则冲突。
4. **托管专用的代码**（比如 Postgres 存储）**放不放进 AGPL 公开仓库。**

---

# 规划正文（评审合成版，已按审查更正）

# Octocrawl 云端版功能规划（终稿，2026-10-18）

> **依据**：本次调研的四组竞品材料（agent API、抓取平台、无代码和可视化、浏览器基础设施）、需求信号调研、内部技术审计、云架构调研、Alexandria 专项、功能候选清单和三份草案。仓库事实以 `origin/main` `efdfb11c`（2026-10-18 fetch）为准。
> **标注**：标"估算"的是推算，不是实测。人天按"一个开发者加 AI agents"计，包含真实站点验证和部署。校准依据是 `docs/roadmap/week6-calibration-2026-10-13.md:25-29`：写代码只占估算的 5–9%，每项真实站点验证要 1–3 天。标"未核实"的是这次没能确认的，标"未知"的是查不到的。
> **范围**：不提定价建议，只写成本由什么决定，以及每个架构阶段的固定月费（估算，新加坡 asia-southeast1 牌价，没有扣免费额度和折扣）。

---

# 结论

**云端版的定位**：给 AI agent 和小团队用的网页数据后端，结果都能追溯到来源。用户用一把 key 或一个 OAuth 连接，从 Claude、ChatGPT、Codex、Cursor 或自己的代码发起 crawl、batch 和并行任务。客户端超时或者电脑合上，任务都会接着跑。结果持久保存，可以分页取、回调、导出，也可以在表格里逐格审阅。每一页都带 Evidence Record（`ROADMAP.md:11` 对产品的定义是"每一行都能追溯到来源网页的表"）。

**和本地版的区别**：两边用同一个引擎、同一套契约、同一个 `w2l.evidence/1`。本地版已经完整（38 个 MCP 工具，crawl、batch、monitor、delivery 都能跑），但它是单进程加本地 SQLite 加内存状态的设计（审计 B2、B3）。云端版多出的是运维层面的东西：任务不会丢、可以多 worker 并行、调度一直在线、团队共享额度和 key、网页版客户端能直接连 MCP。云端代码也在 AGPL 仓库里，所以护城河是运维、容量、出口和有人维护的 adapter，不是闭源代码。Firecrawl、Steel、Browserless 也是这样分的：Steel 本地 1 个并发，云端 100 个以上（docs.steel.dev/overview/self-hosting/steel-local-vs-steel-cloud）。

**现状为什么撑不起云端功能**：
- 任务目录放在内存 `/tmp`，10 分钟清一次（`packages/mcp/src/hostedApi.ts:164`）。
- hosted 关掉了事件流（`hostedApi.ts:482`）。
- crawl 和 batch 路由被 gate 拒绝（`hostedApi.ts:551-556`）。
- 全站最多同时读 6 页；同一把 key 同一时间只能开 1 个浏览器页，第二个请求返回 `429 browser_busy`（`research/hosted/2026-10-13-key-limits-live-h12leases.md`；租约代码在 `hostedApi.ts:943-951`）。

**三期要做什么**（工作量都是估算）：

| 期 | 内容 | 人天 |
|---|---|---|
| 第 1 期（6–8 周） | 云端任务底座（Postgres、GCS、worker pool、全平台站点限速、按 job 预留 credits）；数据模型从第一天就带 `workspace_id`；滥用控制；托管 crawl 和 batch；按 workspace 的并发和排队；幂等和单任务预算；MCP 异步工具；持久结果和导出；任务 webhook；最小任务页 | 必须做的部分 24–41，全做 30–49 |
| 第 2 期 | 团队邀请和角色、OAuth 时选择 workspace；key 的 scope 和预算；审计日志界面；定时任务和 Monitor；任务控制补全；只读结果表格 v0；站点路径树；Evidence Pack；下架流程；n8n 节点 | 26–42 |
| 第 3 期及以后 | 结果表格 v1（加列、自带 key 的 LLM 列）、自带 key 的抽取、托管 search、线性管道模板、已验证 adapter 目录、托管增强访问；更后面是官方数据连接器、企业控制、授权数据商 | 第 3 期 26–49；授权数据商另需 100–300 |

**你的四个想法怎么处理**：
1. **并行任务**：第 1 期就做，是底座的直接产物。分三层：workspace 层（HTTP 和浏览器两条通道分开限）、job 层、站点层（全平台跨租户限速）。
2. **可视化画布**：做三种，不做一种。
   - 任务实时进度页：第 1 期，所有画布的地基。
   - **结果表格**（Clay、Websets 那种）：这是主画布。第 2 期出只读 v0，用来低成本验证需求；第 3 期 v1 支持加列。
   - 站点路径树：第 2 期，成本低，附带做。
   - **n8n 式节点画布不自建**，用 n8n 节点和线性管道模板代替。
3. **团队**：`workspace_id` 第 1 期就进所有表，个人账户零拷贝迁成 `workspaceId = uid`；邀请和角色放第 2 期第一项。免费额度**按人发，不按 workspace 发**，否则一个人建 N 个 workspace 就能刷 N 份。
4. **类 Alexandria 目录**：第 3 期只做"已验证 adapter 目录"，每项能力附真实站点测试通过率。授权数据商和给数据方分成放到最后。它多半落在 Paused 表 `ROADMAP.md:440` 这一行，开工要你先把它重新打开。

**开工前提（不是技术问题）**：
- PH 第 2 阶段的开启条件是"P4 第一笔付款，或有 key 持有人提出需要并愿意付费"（`ROADMAP.md:332-335`）。目前没有记录显示已满足。当前第一优先级是 PA（`ROADMAP.md:21` 起）。
- 外部试用闸门的截止日是 2026-10-17。origin/main 上没有 `research/trials/`，ROADMAP 也没写通过或没通过；`ROADMAP.md:29` 规定试用开始前其他工作都不算进展。试用状态**未知**。
- 所以本文是规划，开工需要你明确决定。

---

# 一、竞品云端功能全景

| 厂商 | 云端核心功能 | 团队 | 并发和限额 | 画布或可视化 | 数据目录 | 来源 |
|---|---|---|---|---|---|---|
| Firecrawl | 异步 crawl、batch、extract、agent；API 结果保留 24 h；`/crawl/{id}/errors` 带 robotsBlocked；/monitor（最小间隔 5 min，快照保留 30–365 d）；Browser Sandbox；签名 webhook（1/5/15 min 重试）；Activity 里有"Debug issue"按钮 | 一个 team，Admin 和 Member；企业版有 SSO、SCIM、多 team 组织、SIEM | 并发浏览器 2/5/25/50/100+；排队上限 5 万到 20 万+，排队 48 h 过期（定价页的数字和文档不一致，以文档为准） | 不自建画布，交给 n8n、Dify 等；Parallel Agents 用 CSV 结果表格，格子分绿、黄、红三色 | Alexandria：2026-10-18 页面显示 278 个数据源、1,672 项能力，发布时是 88 个、504 项；组织管理员要先接受条款 | docs.firecrawl.dev/rate-limits、/features/crawl、/features/monitor、firecrawl.dev/alexandria、firecrawl.dev/blog/introducing-parallel-agents |
| Tavily | Search、Extract、同步 Crawl、异步 Research、Logs | Owner、Admin、Member | 开发 key 100 RPM，生产 key 1,000 RPM | 无 | 无 | docs.tavily.com/documentation/rate-limits |
| Exa | Agent API、Monitors（最小间隔 1 h）、Batch（JSONL）、Websets、Team Management API、每把 key 可设 `budgetCents` | 可建多个 team，邀请链接；企业版有组织、SSO | Agent 50 个运行；`/v0/teams/me` 能查并发和排队 | **Websets 结果表格**（行是实体，列是补充字段，每格附来源） | Exa Connect，约 9 家合作方 | exa.ai/docs/websets/overview、exa.ai/docs/admin/team-management.md |
| Jina | Reader、DeepSearch | 无，靠共享 key | 按 key 分 RPM | 无 | 无 | jina.ai/api-dashboard/rate-limit |
| Crawl4AI Cloud | scrape、batch（50）、jobs（1 万，只重试失败项）、`/v1/estimate`、每个响应带 ladder | 无 | 2/10/20/50 并发 | 只有 playground | Recipes 还没发布 | crawl4ai.com/llms.txt |
| Parallel | Task Groups（每次 1,000）、FindAll、Monitor、Data Connectors、按 app 设花费上限 | Admin、Member，权限写得最清楚 | Task 2,000/min | 无 | Data Connectors（授权、按次付费、免费、BYOL） | docs.parallel.ai/resources/organization-roles-and-permissions.md |
| Apify | Actors、runs、schedules（6 字段 cron）、数据集导出 7 种格式、监控告警 | 所有套餐都有 Organization，按资源设权限 | 25/32/128/256 个运行（免费档在定价页写的是 5，有冲突）加内存池 | 数据集表格视图、Live View | Store 91,148 个条目 | docs.apify.com/platform/limits、api.apify.com/v2/store |
| Bright Data | Scraper API（快照保留 30 d）、Studio、Datasets、Archive、Deep Lookup | 6 级权限，SSO、SCIM | 每个数据集 5,000 个任务 | Crawl inspector（列表）；Deep Lookup 表格 | 1,000+ 数据集 | docs.brightdata.com/products/scrapers/limits |
| Zyte | Scrapy Cloud（免费保留 7 d，付费 120 d） | 组织加项目，成员不限 | 按 unit 计 | IDE | 数据集目录 | docs.zyte.com/scrapy-cloud/usage/units.html |
| ScraperAPI | Async（每批 5 万）、DataPipeline（10 万）、Crawler | 没找到团队功能 | 20–500+ 线程 | 表单 | 无 | docs.scraperapi.com |
| ZenRows | Batch：Job/Run/Task 三层、幂等键、只重试失败项、暂停和续跑、提交前估价、HMAC 签名、保留 14 d | 没找到团队功能 | 5–1,000+；每个响应带 `Concurrency-Limit` 头；默认 3 个活跃 job | 无 | 无 | docs.zenrows.com/batch/introduction |
| ScrapingBee | API；batch 和调度在本地 CLI 里 | Business 档 15 人，可设单成员额度 | 25–900 | 无 | 无 | help.scrapingbee.com |
| Browse AI | robot、bulk run（50 万）、monitor、两个 robot 串联 | 3/3/10 个成员，Owner、Admin、Member | 未公布 | 表单配置，结果用表格 | 250+ 预置 robot | help.browse.ai |
| Octoparse | 桌面端构建、云端节点 | 企业版才有 | 3 或 6 / 20（单位冲突） | 线性步骤列表 | Data Hub | octoparse.com/pricing |
| Kadoa | 对话式构建、触发器链、Observability、Data Explorer | Owner、Admin、Member、Viewer、Compliance Officer | 未公布 | 只读的 Pipeline 视图和表格 | 模板 | docs.kadoa.com |
| Gumloop | agents；画布标成"Workflows (Legacy)" | 不限席位，角色是叠加式 | 5 个工作流、25 个 agent | 节点画布（Legacy） | — | gumloop.com/pricing |
| n8n | 通用节点画布 | 按项目分角色 | 5/20–50/200+ | 节点画布（整个产品就是它） | 模板 | docs.n8n.io/deploy/use-n8n-cloud/understand-concurrency/ |
| Clay | Tables、Workflows（2026-08 上线） | 不限席位 | 未公布 | 结果表格加节点画布 | 100+ 数据提供方 | clay.com/changelog |
| Browserbase | 会话、Live View、回放、Functions、Director | Admin、Contributor、Viewer，可按项目授权 | 3/25/100/250+，超限返回 429 不排队 | Director（自然语言构建） | 无 | docs.browserbase.com/optimizations/concurrency/overview.md |
| Steel | 会话、Agent Traces、Credentials API | 3 个席位或不限 | 10/100/1,000+；Local 只有 1 | 会话查看器 | 无 | docs.steel.dev/overview/pricinglimits |
| Browserless | /map、异步 /crawl（保留 24 h）、hybrid live URL | 企业版有角色 | 2–100+，超限排队 | BrowserQL IDE | 预置 Zillow 爬虫 | docs.browserless.io/rest-apis/crawl.md |
| Browser Use | 会话、每把 key 有月度花费上限 | 不清楚 | 按累计消费从 10 涨到 1,000 | 无 | 无 | docs.browser-use.com/cloud/guides/concurrency.md |
| Anchor | Automation Tasks（分段图）、batch sessions | 项目级 | 5/25/50/200/500+ | **分段图**（本次调研里唯一的图形视图） | Action Index | docs.anchorbrowser.io/tasks/overview.md |

**规律**（出自四组竞品材料的 patterns 段）：
- **基本都有的**：
  - 持久的异步任务对象，带 job id、轮询、webhook 和有期限的保留期。
  - 并发是主要的分档手段，所有 key 共享，超限返回 429。
  - key 级预算或上限。
  - 团队工作区：邮件邀请，2–4 个角色，大多不限席位。
  - 托管 MCP，通常有免 key 档加 OAuth 档。
  - SSO、SCIM、ZDR、审计日志放在企业档。
- **差异化的地方**：monitor 和 diff；结果表格（Exa Websets、Firecrawl Parallel Agents、Clay，这是这个领域真正做出来的"画布"）；数据源市场（Alexandria、Exa Connect、Parallel、Apify Store）；单条结果的出处（Crawl4AI ladder、Parallel Basis、Exa grounding）。**把 robots 判定和内容 hash 一起附在每条结果上的，竞品里没看到**（Firecrawl 的 `/crawl/{id}/errors` 有 robotsBlocked 列表；Octocrawl 是否"签名"未核实，不作卖点）【审查更正】。
- **抓取类厂商基本没有自建节点式工作流画布**，大多交给 n8n、Make、Zapier、Dify；例外和近似：Clay Workflows（2026-08，数据补全类）、Octoparse 线性步骤设计器、Anchor 分段图【审查更正】。**也没有一家做 map 或 crawl 的可视化站点图。** 这是根据各家文档得出的观察，不是厂商自己的说法。

---

# 二、需求证据（按强弱排）

| # | 需求 | 强度 | 证据和来源 |
|---|---|---|---|
| 1 | 并行、批量的异步任务 | 强 | 所有竞品都按并发分档（上表）；MCP TypeScript SDK 默认 60 s 超时，Claude Desktop 约 60 s 会取消调用（需求调研）；r/webscraping 上"小团队每天抓 15 万个站"的帖子 137 分（reddit.com/r/webscraping/comments/1jg94ha/）；我们自己实测撞上 `429 browser_busy`；MCP Tasks（SEP-1686）已移出核心协议（modelcontextprotocol.io/seps/1686），没法依赖 |
| 2 | 持久结果、运行历史、webhook 投递日志 | 中强 | 竞品普遍拿保留期分档；有人要求查看和重发失败的 webhook（github.com/firecrawl/firecrawl/issues/4774）；有人希望结果好了直接推送（firecrawl-mcp-server/issues/21）；Browse AI 评论里有人要"一个汇总所有运行的页面" |
| 3 | 结果表格画布 | 商业用户中强；开发者和 agent 用户**没验证过** | Exa Launch HN 412 分（news.ycombinator.com/item?id=43906841，评论抱怨"卡在 Verifying、看不到进度"）；Clay 估值 71 亿美元（来源口径不一）；Firecrawl Parallel Agents |
| 4 | key 的 scope 和单 key 预算 | 中强 | Exa、ZenRows、Browser Use、Parallel、Hyperbrowser 都有（上表） |
| 5 | 托管 search 和抽取 | 中强 | 几乎所有 agent API 都有（上表） |
| 6 | 定时任务和 Monitor | 无代码用户中，开发者弱 | 开发者多半自己用 cron 或 GitHub Actions（reddit.com/r/webscraping/comments/1gi6p4g/）；Firecrawl 的 /monitor 请求只有 2 票（discussions/4201） |
| 7 | 团队 | 中，属于标配 | Firecrawl、Tavily、Exa、Parallel、Apify、Browse AI、Gumloop 都有；Claude Team 由 Owner 加 connector、成员各自 OAuth（support.claude.com/en/articles/11175166）；ChatGPT Business 由管理员发布 app（help.openai.com/en/articles/12584461） |
| 8 | 企业控制（SSO、SCIM、ZDR、SOC 2） | 现在弱，进企业市场时强 | Firecrawl 在上线约 15 个月后才做 SSO（firecrawl.dev/changelog）；"50–100 席位的单子会问 SSO"是 WorkOS 的说法，有卖方立场 |
| 9 | 类 Alexandria 目录 | 市场强，但集中在条款风险高的平台 | Apify Store：Google Maps 爬虫 655,292 个用户，Instagram 436,306，TikTok 344,696（api.apify.com/v2/store，2026-10-18） |
| 10 | 自建节点式工作流画布 | 弱 | `@mendable/n8n-nodes-firecrawl` 月下载 34,139，只有 Firecrawl SDK 5,175,225 的约 0.7%（npm，2026-09-17 到 10-16）；Gumloop 标成"Workflows (Legacy)"（gumloop.com/pricing）；仓库旧设计三处反对先做画布（`docs/roadmap/section-b-technical-design-v1.md:1527`、`section-c-delivery.md:47`、`dual-flow-mvp-gates.md:38`） |
| 11 | 可视化站点图 | 弱或没有 | 只找到 Screaming Frog 这类 SEO 工具；GSC 上"find all pages"的搜索需求要的是链接列表 |
| — | MCP 上下文开销 | 中（设计约束） | Firecrawl MCP 26 个工具每次会话约 1.85 万 token（firecrawl-mcp-server/issues/309）；r/mcp 高赞回复是"每多一个 MCP 就多占上下文"（reddit.com/r/mcp/comments/1njy19g/） |
| — | **Octocrawl 托管服务的真实用量** | **未知** | 仓库里没有外部用量记录；Cloud Logging 的 `hosted_usage` 日志这次没读 |

GitHub issues 和 discussions 里，云端相关请求都不超过 3 票（需求调研用 `gh` 统计）。云端需求主要是从竞品的实际动作和付费用户身上看出来的。

---

# 三、云端功能清单

人天都是估算。"本地"一栏写本地版是否已有，附路径。

**F 底座和安全**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| F0 云端任务底座 | 强 | Firecrawl NuQ（Postgres）、ZenRows Job/Run/Task | 有接口：`runtime/src/taskStore.ts`；租约和 fencing 在 `monitorStore.ts`；ADR 0003 预期用 Postgres | 实现 `PostgresTaskStore`；把 `engine.ts` 里 14 处直接打开 SQLite、2 处扫目录收回接口后面；GCS 存正文；worker pool 用 `SKIP LOCKED` 加 fencing 领任务；新建 `host_state` 表做全平台站点限速；credits 按 job 预留 | 8–14 | Cloud SQL 固定费、worker vCPU 时长 | 无 |
| D1 workspace 数据模型 | 中（决定后面要不要返工） | Exa 每人从"Personal" team 开始 | 现在全按 uid 存（`public-preview/src/account.ts:172`） | 新增 workspaces、memberships、audit_events 表；`workspaceId = uid` 零拷贝迁移 | 2–3 | 几乎没有 | 和 F0 同时 |
| L0 滥用控制 | 硬前提 | Firecrawl 排队上限；Bright Data 封 IP | `http-core/src/robots.ts`、`hostedNetworkPolicy` | 免 key 永远不能 crawl；单任务页数上限（`api/src/listen.ts:173` 默认 100）；额度按 uid 发；全局停机开关 | 2–3 | — | 和 F0、A1 同时上线 |
| L1–L4 企业控制 | 现在弱 | 竞品全放企业档 | 无 | Identity Platform 多租户、ZDR、IP 白名单、SOC 2 | 5–8 / 2–4 / 1 / 审计费 | 审计、法务 | D2 |

**A 任务和并行**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| A1、A2 托管 crawl 和 batch | 强 | Firecrawl、ZenRows、Crawl4AI、Browserless | crawl 引擎在 `engine.ts:1945-2010`；batch 最多 1,000 个 URL（`contracts/src/api.ts:2172`） | 放行 gate；frontier 持久化；不用 Cloud Run Jobs | 3–5 | 浏览器页占比、出站流量 | F0、L0 |
| A3 并发、排队、队列状态 | 强 | Firecrawl、ZenRows 响应头、Exa `/teams/me` | `maxConcurrency`（`engine.ts:1958-1961`） | 领任务时同时检查 workspace 通道上限、job 子上限、站点 `next_allowed_at`，并按 workspace 轮转公平 | 1–2 | 承诺给用户的并发等于要预留的资源 | F0、D1 |
| A4 幂等、单任务预算、估价、只重试失败项、暂停和续跑 | 中 | ZenRows、ScraperAPI `max_cost`、Firecrawl `maxCredits` | `runtime/src/idempotencyStore.ts` | 状态机加 dry-run 估价 | 3–5（第 1 期先做 1–2） | — | A1 |
| A5 CSV 大批量输入 | 中 | ZenRows（50 MB）、DataPipeline（10 万） | `cli/src/run.ts:231-254` | GCS 预签名直传 | 1–2 | GCS | A2 |

**B 调度和投递**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| B1 定时任务 | 中（无代码）/ 弱（开发者） | Apify、ZenRows、Firecrawl | 调度循环在 `mcp/src/managedRuntime.ts:40-70`，hosted 进程里没有 | schedules 表，Cloud Scheduler 每分钟 tick | 2–3 | 频率乘页数 | A1 |
| B2 Monitor | 同上 | Firecrawl /monitor、Exa、Parallel | `monitorStore.ts`（524 行） | 迁到 Postgres；用 Octocrawl 原生契约（Firecrawl 形状的接口在 Paused `:446`） | 和 B3 合计 4–6 | 快照保留 | B1 |
| B3 签名 webhook、投递日志、重发 | 中强 | Firecrawl、ZenRows、Standard Webhooks | `deliveryStore.ts`、`deliveryWorker.ts`、`api/src/jobWebhooks.ts` | 签名密钥现在是环境变量名（`checkpoint.ts:72`），改成 KMS 加密 | 第 1 期任务事件部分 2–3 | 投递次数 | F0 |

**C 数据和导出**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| C1、C2 持久结果、保留期、导出 | 中强 | ZenRows 14 d、Bright Data 30 d、Zyte 7/120 d | CLI 的 JSONL、CSV、Markdown 输出 | Postgres 存 JSONB，GCS 加 lifecycle，签名下载 | 2–4 | 出站约 $0.12/GiB（架构调研） | F0 |
| C3 Evidence Pack | 差异化，没有直接需求数据 | 没有竞品做 | 格式定义在 `ROADMAP.md:431` | 打成可校验的包 | 2 | — | C1 |
| C5 删除和下架 | 法律硬要求 | — | 删除账户流程（`account.ts:245-280`） | 删 job 时同时删 GCS 对象；下架按 URL 或域名定位 | 2–3，另需律师审查 | 法务 | C1 |
| C4、C6 外部存储投递、共享缓存 | 中 / 弱 | Bright Data；Crawl4AI 缓存 | `pageCache.ts`（语义未核实） | KMS 保管凭据；缓存只对匿名页 | 2–5 / 2–4 | — | C1 |

**D 团队**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| D2、D3 邀请、角色、OAuth 时选 workspace | 中 | Firecrawl、Tavily、Browserbase、Kadoa | 每个 OAuth 连接一把 key，上限 10（`oauth.ts:43`） | 邀请 token 只存 hash；每次请求在服务端查角色，不放 custom claims | 4–6 | 邀请邮件 | D1 |
| D4、D5 key 的 scope 和预算、成员上限 | 中强 | Exa `budgetCents`、ZenRows、ScrapingBee | 每个账户最多 5 把 key（`account.ts:36`） | 在 job 预留 credits 时检查预算 | 2–5 | — | D2、A3 |
| D6 审计日志 | 现在弱 | Kadoa、Firecrawl SIEM | 无 | 只追加表，第 1 期就开始写，第 2 期做界面 | 2 | — | D1 |

**E 画布**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| E1 任务页和实时进度 | 中强 | Firecrawl Activity、Apify Runs | SSE 和 WS 流（`api/src/jobStream.ts`）；原则在 `apps/public-web/src/crawlModel.ts` | 第 1 期轮询，第 2 期 SSE 加 NOTIFY；遵守 CSP | 精简版 3–4，完整版 4–6 | 长连接占实例时长 | A1 |
| E2 结果表格 | 商业用户中强，开发者未验证 | Exa Websets、Clay、Parallel Agents | `fieldEvidence`（`ROADMAP.md:404`）、`api/src/structured.ts` | 服务端用 SQL 排序筛选；用已存正文重新抽取 | v0 3–4，v1 3–6 | LLM token（用户自带 key） | C1、E1 |
| E3 站点路径树和链接图 | 弱 | 没有竞品做 | `contracts/src/map.ts:33-53`、`apps/public-web/src/tools/mapResults.ts` | 按路径聚合；链接图要新建 `crawl_edges` 表 | 2–4 / 加 3–5 | 几乎没有 | map |
| E4 线性管道模板 | 中 | Browse AI、Kadoa、DataPipeline | recipe DSL（`contracts/src/recipe.ts:1-36`） | 表单配置，用 `run_pipeline` 工具调用 | 5–8 | 执行时长 | B1、B3 |
| E5 节点式画布 | 弱 | 抓取类厂商都没做 | 无 | DAG 执行器、React Flow（MIT） | 20–35 | 维护人力 | E4 |

**G、H、I、J、K 其他**

| 功能 | 需求 | 竞品 | 本地 | 技术方案 | 人天 | 成本因素 | 依赖 |
|---|---|---|---|---|---|---|---|
| G1、G2 MCP 异步工具和免 key 边界 | 强 | Apify `call-actor` 等 45 s；Crawl4AI jobs 工具 | 本地有 crawl 的 wait 和 get_pages | start、status、pages、cancel 几个工具，schema 控制在 Codex 5 KB 内（`mcp-client-ux-tasks.md` D10） | 2–3 | — | A1 |
| H1 托管 search | 中强 | 几乎所有 agent API | 无；P5 方案是 SearXNG 或用户自带 key（`ROADMAP.md:372`） | 失败返回 `cannot_verify`；不直接抓 SERP | 3–6 | 每次查询的上游费 | A2 |
| H2 自带 key 的抽取 | 中强 | Firecrawl /extract、Parallel Basis | `api/src/structured.ts` | key 不落库（`ROADMAP.md:373`）；防提示注入（`:375`） | 2–4，多 URL 带引用再加 4–7 | 用户的 token | A2 |
| I1 托管增强访问 | 中强 | Fire-engine、Crawl4AI 住宅代理 | `http-core/src/ledger.ts`、`accessGrant.ts`、`api/src/egressPool.ts` | 先修订 ADR 0005；按 key 授权并设预算 | 10–20 | 住宅代理流量、浏览器 vCPU | D4 |
| I4 区域和固定出口 | 中 | Crawl4AI 三区、Firecrawl 企业版 | 无 | Direct VPC egress 加 Cloud NAT（价格未核实） | 3–5 | NAT | F0 |
| J1 n8n 节点 | 中 | Firecrawl、Apify | SDK | 只调 REST | 3–5 | 维护 | A1 |
| K1 已验证 adapter 目录 | 市场强 | Alexandria、Apify Store | `extract-tf/src/adapters.ts`，3 个 beta adapter | `catalog.json` 加 `find_adapters`；附通过率，失败自动降级 | 3–5，不含新 adapter | adapter 维护人力 | B2 |
| K2、K3 官方数据和数据集索引 | 中 / 弱 | Alexandria、Parallel | `docs/public-web-adapters.md` 写明不调用官方 API | 先写 ADR；SEC 10 次/秒全租户共用令牌桶（sec.gov/os/accessing-edgar-data） | 8–15 / 3–5 | 法务 | K1、F0 |
| K4 授权数据商和分成 | 市场强 | Alexandria、Exa Connect、Apify 开发者拿 80% | 无 | 管理员接受条款；带幂等的账本 | 100–300 | 授权费、分成、KYC | D2 |

---

# 四、你的四个想法逐个分析

**1. 并行任务：第 1 期做，而且必须先建底座。**
- **对 agent 用户来说，"并行"有三层意思**：
  1. 一次调用提交上千个 URL，省 token 也省往返。
  2. 平台用多个 worker 同时跑。
  3. 不同账号之间公平，同一站点的抓取速度在全平台受控。
- **现状**：全站最多同时 6 页，每把 key 同时 1 个浏览器页，任务存在内存里 10 分钟就清空。不建底座的话，"并行"只能是把 3 个实例的上限调大，crawl 和 batch 一样会丢。
- **设计**（架构调研 §4）：
  - 在领任务的事务里同时检查 workspace 的通道上限（HTTP 和浏览器分开）、job 子上限、站点的 `next_allowed_at`，并按"该 workspace 上次被服务的时间"排序。
  - 排队满了返回 429 加 Retry-After。
  - 提供 `usage.concurrency` 和 `queue-status` 两个接口（ROADMAP P5），响应头里带剩余并发。
  - 同步 scrape 的优先级高于后台 job 的页面。这是 agent 草案提出的设计选择，避免一边跑 crawl 一边单页读取变慢。
- **容量参考**（估算）：每 1 vCPU / 2 GiB 并行 2 个浏览器页；给一个 workspace 25 个并发浏览器约需 13 vCPU；超过每区 100 个实例要申请配额。每档给多少并发，留到定价阶段再定。

**2. 可视化画布：两种含义分开处理。**

| 含义 | 决定 | 理由 |
|---|---|---|
| 数据和结果画布：**结果表格**（Clay、Websets 那种） | **做，作为主画布**。第 2 期出只读 v0（3–4 人天），第 3 期 v1 支持加列和自带 key 的 LLM 列 | 这是这个领域真正和收入挂钩的可视化形态（Exa、Clay、Firecrawl Parallel Agents）。Octocrawl 能做到格子级出处（`fieldEvidence`），没有竞品能做到。但它对开发者的需求没验证，所以 v0 先当作低成本的验证，用打开率和导出次数决定要不要做 v1。表格必须建在异步 batch 和持久正文之上，并显示进度（吸取 Exa"卡在 Verifying"的教训）。 |
| 站点图（map 和 crawl 的可视化） | 第 2 期做路径树（2–4 人天）；链接图看使用率再定 | 竞品都没有，成本低。它还有一个 agent 用法（agent 草案提出）：跑 crawl 前给 agent 一份按路径前缀聚合的计数摘要，几百 token 就够，agent 据此选出 `includePaths`；人看到的是一棵树。不要指望它带来收入。 |
| 任务实时进度页 | 第 1 期做精简版 | 所有画布的地基；Exa 的用户抱怨过"看不到进度"。 |
| 流程画布：**节点式工作流**（n8n、Gumloop 那种） | **不自建** | 抓取类竞品都没做；Gumloop 已标成 Legacy；n8n 节点的下载量只有 SDK 的 0.7%；仓库旧设计三处反对；MVP 要 20–35 人天，还有连接器凭据的安全面。替代方案是 n8n 节点（第 2 期）和线性管道模板（第 3 期，可以发布成一个 MCP 工具）。等有付费用户点名要、并且线性模板确实表达不了时再重新评估。 |

**3. 团队：数据模型第 1 期，邀请和角色放第 2 期第一项。**
- **为什么要这个顺序**：如果先按 uid 建任务表，以后加团队就要把所有表返工一遍。
- **第 1 期**：所有表带 `workspace_id`；`workspaceId = uid` 零拷贝迁移；`audit_events` 从这时开始写；job 记录 `origin`（dashboard、api、mcp、schedule）和 `actor`（团队草案提出）。
- **第 2 期**：
  - 邀请链接，Owner、Admin、Member、Viewer 四种角色。
  - OAuth 同意页选择 workspace。这正对上 Claude Team 和 ChatGPT Business"管理员装 connector、成员各自 OAuth"的分发方式。
  - key 的 scope 和预算；审计日志界面。
  - 移除成员时同步撤销他的 OAuth 连接和成员 key。
- **两条硬规则**（团队草案提出）：免费额度按人（uid）发，新建的团队 workspace 不自带额度；每个 GET 路由都要有跨租户负面测试，因为现在 API 引擎的 GET 路由没有归属检查（审计 §6）。
- **定位要实事求是**：团队功能便宜（合计约 10–15 人天，估算），能让产品不落后，但拉不开差距。席位几乎不产生成本，大多数竞品不限席位。

**4. 类 Alexandria 目录：排后期，用"已验证"来区分。**
- **Firecrawl 的现状**：一个月从 88 个涨到 278 个数据源，质量不透明。其中有不少是网页连接器：Walmart 读的是 `__NEXT_DATA__`（firecrawl.dev/alexandria/walmart-com），Substack 读的是 archive 接口。开源网关只是转发，数据源本身在闭源的 Exchange 服务里（读了 `firecrawl/firecrawl` 的 `apps/api/src/services/alexandria/README.md`）。
- **Octocrawl 的路线**：
  1. K1：已验证 adapter 目录，第 3 期，不用改政策。
  2. K2：官方开放数据，要先写 ADR。FRED 禁止缓存（fred.stlouisfed.org/legal），OpenSanctions 是 CC BY-NC（opensanctions.org/licensing），这两个暂不接。
  3. K3：只收元数据的数据集索引。
  4. K4：授权数据商和分成，放最后。前提是团队的管理员接受条款、带幂等的账本、合同都已经具备。
- **不追的方向**：Google Maps、Instagram、TikTok 这类热门平台，服务条款风险和托管版"全面遵守 robots"（`ROADMAP.md:107`）冲突；人员和联系人数据涉及 GDPR。

---

# 五、三阶段路线图

真实站点运行都按 AGENTS.md 记录命令、源码 commit，以及是走代理还是直连。

## 第 1 期（6–8 周）：长任务变得可靠，并行可用

| # | 功能 | 用户故事 | 退出条件 | 人天 |
|---|---|---|---|---|
| 1.1 | 任务底座（F0） | 我提交一个 2 万页的任务，期间实例缩容、重新部署或崩溃，它都能跑完，不丢页，每页只扣一次费；三天后在另一个会话里还能用 job id 取回结果 | 2 万个 URL、3 个 worker、中途 `kill -9`：0 丢失、0 重复（`ROADMAP.md:374`）；3 个 worker 打同一个 fixture 站点，从服务器日志看并发不超过 2、间隔不小于 250 ms（`contracts/src/policy.ts:95-96`）；1 万页任务对 credits 文档的写入不超过"页数 ÷ 100 + 常数"，结束时对账误差为 0；本地 `npm test` 和 `npm run typecheck` 不受影响 | 8–14 |
| 1.2 | workspace 数据模型和审计事件（D1、D6 写入） | 我的账户、key 和 credits 升级后原样能用 | 在生产数据副本上 dry-run 迁移通过；所有任务表的 `workspace_id` 都非空；跨租户负面测试覆盖每一个 GET 路由 | 2–3 |
| 1.3 | 滥用控制（L0、G2） | 作为运营方，我不希望 Octocrawl 变成从 Google IP 段出发的抓取放大器，也不希望被刷免费额度 | 免 key 调 crawl 时被拒，并返回 `agentHints`；robots 拒绝的 URL 进错误列表，不被抓取；内网和元数据地址被拒；全局开关打开后 1 分钟内不再有新 task 开始 | 2–3 |
| 1.4 | 托管 crawl 和 batch（A1、A2） | 在 Claude Code 里说"把 docs 下 /api/ 的页面都转成 Markdown"，拿到 job id，几分钟后分页取结果；在自己的代码里一次 POST 1,000 个 URL | `research/parity/sites.md` 选定的站点在托管端通过；1,000 URL 的 batch 7 天后从任意实例都能读回；TS 和 Python SDK 的托管 batch 端到端测试通过 | 3–5 |
| 1.5 | 并发、排队、队列状态（A3） | 我同时开 5 个任务，知道还能开几个、自己排第几，不再收到一个看不懂的 `browser_busy` | 在上限内同一把 key 的 N 个浏览器 scrape 不再返回 429；公平性测试：A 排了 1 万个 task，B 的第一个 task 在一个调度周期内开始；后台跑满时同步 scrape 的 p95 延迟有测量记录 | 1–2 |
| 1.6 | 幂等、单任务预算、提交前估价（A4 的一部分） | agent 会重试，同一个请求发两次不应产生两个 job；到预算就停，并把已完成的部分交给我 | 同一个 `Idempotency-Key` 重放 100 次只产生 1 个 job；实际扣费不超过 `maxCredits`；估价不低于实际扣费 | 1–2 |
| 1.7 | MCP 异步工具 | ChatGPT 或 Codex 里的 agent 最多等 45 s 就拿到 job id 和下一步提示，结果分页取，不会一下塞满上下文 | Claude Code、Codex、Cursor、ChatGPT developer mode、claude.ai 各跑通一次"启动 200 页 crawl → 轮询 → 取完"，记录客户端版本；工具 schema 不超过 5 KB，各客户端的 token 占用有实测；重跑 E2 固定任务集，不再出现 crawl 504 | 2–3 |
| 1.8 | 持久结果、导出、用户删除（C1、C2、C5 最小版） | 第二天我的后端还能下载 JSONL 和 CSV；不想要了可以自己删 | 过了保留期自动清除，读取时返回明确的过期状态；签名链接过期失效；删除后 GCS 上没有残留 | 3–6 |
| 1.9 | 任务生命周期 webhook（B3 的一部分） | 我的服务端不想轮询，事件推过来、签名可以校验，失败的投递能重发 | 端点返回 5xx 时按退避重试；最终失败的在日志里可见，可以重发；`http://` 和内网地址被拒 | 2–3 |
| 1.10 | 最小任务页和按任务汇总的 Activity（E1 精简版、F1） | agent 说"有 12 页被 robots 拒绝"，我在 dashboard 点开能看是哪些页、为什么 | 先在 `public:preview:local`（带 CSP）通过；计数和 API 一致；进度永远不超过服务器状态；1 万页任务在 Activity 里只有 1 条记录 | 5–6 |

- **必须做的**：1.1 到 1.9，合计 24–41 人天。1.10 可以推到第 2 期初，推迟期间状态先通过 API 和 MCP 查看。
- **周排期**（估算）：
  - 第 0 周：处理开工前提，写一份托管任务底座的 ADR。
  - 第 1–3 周：1.1、1.2、1.3。
  - 第 4–5 周：1.4、1.5、1.6、1.9。
  - 第 6 周：1.7、1.8。
  - 第 7–8 周：1.10、真实站点运行记录、部署（tagged revision，执行 `update-traffic` 并确认线上 revision）。
- 如果 PA 仍然占一半以上的时间，第 1 期大约要 10–16 周（估算）。
- **上线方式**：先邀请制，只开放给少数设计伙伴（团队草案提出），一边上线一边测成本。

## 第 2 期：团队、调度、表格 v0

| # | 功能 | 用户故事 | 退出条件 | 人天 |
|---|---|---|---|---|
| 2.1 | 邀请、角色、workspace 切换（D2、D3） | 我是 Claude Team 的 Owner，装好 connector 后，同事各自 OAuth 进同一个 workspace，共用额度；我可以邀请和移除人 | 三种登录方式都走通完整邀请流程；角色矩阵测试和跨租户测试通过；成员被移除后下一次请求就失效；claude.ai 和 ChatGPT 连接团队 workspace 的过程有记录 | 4–6 |
| 2.2 | key 的 scope、预算、用量告警（D4、D5） | 我给 CI 一把只能 scrape 的 key，设月度上限，用到 80% 收到提醒 | 越过 scope 返回 403；超出预算返回 402，不能再启动新 job；告警邮件按阈值送达 | 2–5 |
| 2.3 | 审计日志界面（D6） | Admin 能查到谁建了 key、谁导出了数据 | 每类事件都能按用户和时间筛选；记录里没有页面正文 | 2 |
| 2.4 | 定时任务（B1） | 每天早上 9 点（新加坡时间）重跑这批定价页，不需要任何人开着电脑 | 连续 7 天都在到期后 1 分钟内触发；tick 重复调用不产生重复运行；连续失败自动暂停 | 2–3 |
| 2.5 | Monitor 和投递完整版（B2、B3） | 页面一有变化，就收到带 diff 的签名 webhook 或邮件 | 真实站点连续跑 7 天，假变化率写进记录；重发不产生重复的事件 id | 3–5 |
| 2.6 | 任务控制补全和 CSV 输入（A4、A5） | 上传一份 10 万行的 CSV，先看估价，跑完只重试失败的项 | 估价只允许多估，不允许少估；失败项能单独重试，只对重试部分扣费 | 2–4 |
| 2.7 | 只读结果表格 v0（E2） | batch 跑完，结果显示成表格，每个格子能点开看它的 Evidence，可以排序、筛选、导出 | 1,000 行的表可以按任意列在服务端排序；每格都能链到 evidence；表格的打开率和导出次数有记录（v1 的决策依据） | 3–4 |
| 2.8 | 站点路径树（E3 第一档） | crawl 前 agent 拿到一份按路径聚合的摘要来选范围；人看到的是一棵树 | 摘要的 token 数有记录，并且明显少于原始 URL 列表；5 万个 URL 能流畅展开；使用率有埋点 | 2–4 |
| 2.9 | Evidence Pack 和下架流程（C3、C5） | 我把任务的全部证据打成包交给审计方；权利人提出下架时能执行 | 独立脚本能校验 hash，篡改后校验失败；一次下架演练有完整记录 | 3–4 |
| 2.10 | n8n 节点（J1） | 已经在用 n8n 的团队把 Octocrawl 拖进自己的流程 | 通过 n8n 社区节点审核；月下载量有记录（决定要不要做 Zapier 和 Make） | 3–5 |

第 2 期合计 26–42 人天。实时进度在这一期从轮询升级为 SSE 加 Postgres NOTIFY；前提是先在 preview 环境实测 Cloudflare 透传 SSE 的行为（未核实）。

## 第 3 期及以后

| # | 功能 | 用户故事 | 退出条件 | 人天 | 开工条件 |
|---|---|---|---|---|---|
| 3.1 | 结果表格 v1 | 加一列"价格"，用已存的正文重新抽取，不重新抓；再加一列自由文本问题，用我自己的 key 回答 | 加列不触发重新抓取；超出预算停在部分结果；分享链接撤销后失效 | 3–6 | v0 的数据显示有人在用 |
| 3.2 | 自带 key 的 LLM 抽取（H2） | 500 个商品页按 schema 抽成 500 行 JSON，每个字段带来源 | 用户的 key 不出现在日志和存储里；引用能对回原页 | 2–4，多 URL 带引用再加 4–7 | — |
| 3.3 | 托管 search（H1） | agent 搜一下，读过的每一页都带 Evidence | 后端失败时返回 `cannot_verify`；固定查询集上没有编造的结果 | 3–6 | SearXNG 的条款审查完成 |
| 3.4 | 线性管道模板（E4） | 用表单配"map → 过滤 → batch → 抽取 → webhook"，每天跑，也能作为 MCP 工具调用 | 3 个模板各连续跑 7 天；schema 仍在 5 KB 预算内 | 5–8 | — |
| 3.5 | 已验证 adapter 目录（K1） | agent 免费查有哪些能力和通过率，再调用 | 故意让一个 adapter 失败，它会自动降级；每一项都附记录链接 | 3–5 | 你把它从 Paused `:440` 拆出来 |
| 3.6 | 托管增强访问（I1） | 被 Cloudflare 挡住的页面，付费 key 在授权和预算内改走代理，记录走了哪条路、花了多少 | 在 PA item 1 的冻结任务集上，托管端 verified 数不低于本地，假成功不增加；ledger 和 credits 对得上 | 10–20 | ADR 0005 修订完、P4 律师审查完 |
| 以后 | K2、K3 官方数据和数据集索引；I4 区域；C4 外部存储；L1–L4 企业控制；F2–F4 可观测性；K4 授权数据商 | — | — | 见第三节 | 写好 ADR、企业买家主动来问、团队和账本已经具备 |

第 3 期合计 26–49 人天，K4 另算 100–300 人天。

---

# 六、技术架构

```
客户端：Claude / ChatGPT / Codex / Cursor（MCP）· SDK / REST · dashboard
        │ Cloudflare Worker（api. / mcp.octocrawl.dev，SSE 路由 no-store）
        ▼
控制面：Cloud Run service（不装 Chromium，并发 40–80）
  REST · MCP · OAuth · 估价 · 轮询 / SSE · Scheduler tick · 每 15 s 调 Admin API 扩缩
        │                                      │
Cloud SQL Postgres                         Firestore（账户、key、credits；阶段 1 不迁）
workspaces / jobs / tasks / host_state /
schedules / deliveries / audit_events / 表格格子
        ▲ FOR UPDATE SKIP LOCKED + 租约 + fencing
执行面：Cloud Run worker pool（HTTP 通道 + Chromium）──► GCS {workspaceId}/{jobId}/（lifecycle）
```

**关键选型**（理由出自架构调研）：

| 决定 | 采用 | 不采用 | 理由 |
|---|---|---|---|
| 任务状态 | Postgres | Firestore | 需要 `SKIP LOCKED`、事务、任意列排序（表格要用）；ADR 0003 本来就预期用 Postgres；Firestore 有热点文档问题（审计 B5，平台限额未核实） |
| 执行面 | worker pool | Cloud Run Jobs | 1 vCPU + 2 GiB 常驻一个月：worker pool $43.2，instance-based $69.4，request-based $106.7（Billing Catalog API，2026-10-18）；Jobs 的 task 数在启动时就固定，不适合 crawl |
| 页级队列 | 自研 Postgres 队列（可评估 MIT 许可的 DBOS） | Temporal、Inngest、Trigger.dev | 它们按 action 或 run 计费，以 Temporal 为例约每千页 $0.05–0.15（估算），和自建浏览器每千页约 $0.066（估算）同一个量级 |
| 扩缩容 | 控制面自己算实例数，调 Admin API | CREMA | CREMA 已验证的扩缩依据里没有 Postgres（github.com/GoogleCloudPlatform/cloud-run-external-metrics-autoscaling） |
| 限速和信号量 | 先用 Postgres | Redis、Valkey | 抢槽位每秒超过约 1–2 千次再上（估算） |
| 浏览器 | 自建 Chromium | 以托管浏览器为主 | 托管每千页约 $0.7–1.0（估算）；PA 实验里自建 Webshare 网关在 23 个任务中拿到 4 个 verified，四组里最多（`research/access/runs/2026-10-11-pa4-3arm-c-webshare-d65614d.md`） |
| 鉴权 | 单一用户池，角色存数据库 | custom claims、Identity Platform 多租户 | token 一小时才刷新，撤权会延迟；多租户只在企业要接自己的 IdP 时才需要 |

**分阶段固定月费**（估算，新加坡牌价，不含按量部分）：

| 阶段 | 对应 | 组件 | 月固定成本 | 进入下一阶段的触发条件 |
|---|---|---|---|---|
| 0 现状 | 今天 | 单体 Cloud Run 加 Firestore | 约 $0（有 $40 预算告警） | 第 1 期开工 |
| 1 | 第 1–2 期 | 控制面 min 0（min 1 约 $18）；worker 空闲缩到 0（常驻 1 个 2 vCPU / 4 GiB 约 $86）；Cloud SQL f1-micro 约 $15.5、g1-small 约 $40.5、1 vCPU 独占约 $74；GCS 和 Scheduler 约 $0–5 | **约 $16–60**；常驻时约 **$100–180** | Cloud SQL CPU 长期超过 60%；worker 平均超过 3 个实例；表格 v1 上线；Monitor 开始被依赖 7×24 在线（届时改用独占机型，因为 shared-core 是否在 SLA 内未核实） |
| 2 | 第 3 期 | Cloud SQL 2 vCPU / 8 GB 加 100 GB 约 $165（HA 约 $330）；worker 常驻 1–2 个 $86–173；API min 1 约 $18；Valkey nano 约 $29（按需）；托管浏览器订阅 $20–250（可选） | **约 $300–600** | 浏览器负载长期超过约 14 vCPU 全天候（每月约 1 万 vCPU·小时） |
| 3 | 量起来以后 | Spot E2 / T2D 的 MIG 或 GKE Autopilot、HA 数据库、Memorystore Standard | **约 $800–2,000+** | 这个量级下 worker pool 约 $605/月，换成 Spot E2 约 $209（超出 Cloud Run 的浏览器集群在 Paused `:445`） |

**成本因素**（只列项）：
1. 浏览器秒数，以及承诺给用户的并发（最大的一项）。
2. 住宅代理流量、验证码。
3. LLM token，原则上由用户自带 key 承担。
4. Monitor 和定时任务的频率乘以页数。
5. 固定资源：数据库、常驻实例。
6. 出站流量。
7. 保留时长（主要影响数据库体积）。
8. adapter 维护和每天的真实站点测试。
9. 数据源授权费和分成。
10. SOC 2 和法务。

**每千页的实际成本：未知**，ROADMAP PH 第 3 项要求的两周成本记录还没写。

---

# 七、不做什么及原因

| 不做 | 原因 | 什么时候重新考虑 |
|---|---|---|
| 自建节点式工作流画布 | 抓取类竞品基本没做；Gumloop 定价页把画布标为"Workflows (Legacy)"（官方没声明转向）【审查更正】；仓库旧设计三处反对；20–35 人天加长期维护 | 有付费用户明确要求，并且线性模板表达不了 |
| fork n8n | 许可证不是标准开源许可（NOASSERTION，架构调研 §8） | 不考虑 |
| 托管 agent、深度研究 | Paused `ROADMAP.md:440` | 你把它重新打开 |
| 托管登录态、my-browser、actions | hosted 在隔离审查前拒绝 actions（`engine.ts:786-787`）；Firecrawl 出过全局 CookieJar 跨用户泄漏（github.com/firecrawl/firecrawl/issues/4295） | 写好新 ADR 并完成隔离审查 |
| 浏览器实时画面、超出 Cloud Run 的浏览器集群 | Paused `:445`；实时画面的 URL 相当于 bearer 密钥 | 达到阶段 3 的触发线 |
| Firecrawl 形状的 Monitor 接口 | Paused `:446` | 你把它重新打开 |
| 直接抓 SERP | 违反条款；记忆记录里 Google 约 6 次就封 | 不考虑 |
| 热门社交和地图 adapter、人员联系人数据 | 服务条款、GDPR，和 robots 政策冲突 | 不考虑 |
| 现在就做 SSO、SCIM、SOC 2 | 还没有买家问过 | 企业买家主动来问 |
| 现在就做授权数据商和分成 | 商务、法务、付款、KYC 一个人负担不了 | 有付费用户点名要，并且团队和账本已经具备 |
| 用 Firestore 做任务队列、按页预留 credits | 热点文档（审计 B5） | 不考虑 |
| 用按页计费的工作流引擎跑页级任务 | 引擎费和页面算力同一个量级 | 只用于运行级的粗编排 |
| 用 Cloud Run Jobs 跑 crawl | task 数在启动时就固定 | 只用于一次性的大 batch |
| 跨租户共享带登录态页面的缓存 | 会泄漏信息 | 只对匿名页考虑，并在证据里标明命中缓存 |
| 依赖 MCP Tasks 协议 | 已移出核心协议 | 协议稳定以后 |
| Octocrawl 出模型费 | 违反 P5 原则（`ROADMAP.md:373`） | 不考虑 |
| 收款相关（x402、低价延迟档等） | 按你的要求放到定价阶段 | 定价阶段 |

---

# 八、风险与对策

| 类别 | 风险 | 对策 | 哪一期落实 |
|---|---|---|---|
| 滥用 | 开放 crawl 后被当作从 Google IP 段放大抓取的工具；批量注册刷每月 1,000 免费 credits（`ROADMAP.md:315`）；团队功能会放大这一点；通过 URL 列表或 webhook 打 SSRF | 免 key 永远不能 crawl；单任务页数上限；额度按 uid 发；新账户逐步放开；全平台每站上限；排队有上限和过期；所有入口都过 `hostedNetworkPolicy`；全局停机开关 | 1 |
| robots 和法律 | 多实例后 Crawl-delay 失效；保存第三方内容副本带来版权、GDPR、欧盟数据库特殊权利问题；团队客户要 DPA；增强访问风险最高 | worker 层对所有 URL 遵守 robots，`host_state` 共享退避；默认保留期偏短；用户删除（第 1 期）和下架流程（第 2 期）；条款和 DPA 等 P4 的律师审查（`ROADMAP.md:360`）；增强访问先修订 ADR 0005 | 1–3 |
| 多租户隔离 | 现在 GET 路由没有归属检查；cookie 串号；签名链接外泄；被移除的成员保留连接 | 数据访问层强制带 workspace 范围；每个读取路由都有负面测试；每个 task 用全新的 browser context；签名链接短时效；移除成员时同步撤销连接 | 1 起 |
| 成本 | 每千页成本未知；定时任务被遗忘后长期消耗；monitor 噪音；浏览器很吃资源 | 先写两周成本记录；按 job 预留 credits 并设 `maxCredits`；提交前估价；连续失败自动暂停；空闲缩到 0；只在满足触发条件时升级阶段 | 1–2 |
| 一个人运维 | 新增的 Postgres 和 worker 带来新故障面；worker pool 实例最长连续运行 7 天会被重启（架构调研，GA 日期来自二手来源）；半夜没人值守 | 全部用托管服务；所有写入幂等，崩溃靠租约到期回收；告警（任务卡住、队列过深、投递失败率高）；按 AGENTS.md 用 tagged revision 发布并保留回滚 tag，部署后清 Cloudflare 缓存；先邀请制开放 | 全程 |
| 路线图 | 和 PA 第一优先级冲突；PH 第 1 阶段 Exit（5 个外部 key 在用、两周成本记录）和第 2 阶段条件都没满足；试用闸门状态未知 | 开工前由你决定；注意 P5 Hosted scale 在 ROADMAP 里就是 PH 第 2 阶段，受同一条件约束【审查更正】 | 开工前 |
| 需求 | 没有任何托管外部用量数据；表格对开发者的需求没验证；行业在转向 agent | 开工前先读 `hosted_usage`；表格 v0 当低成本验证；第 3 期每一项都要先看第 2 期的数据 | 0–2 |

---

# 九、未知项与先要验证的东西

**开工前先验证的**：
1. **外部试用闸门的状态**：`research/trials/` 不存在，ROADMAP 没写。这决定能不能开始任何新工作，需要你确认。
2. **托管服务的真实外部用量**：读 Cloud Logging 的 `hosted_usage`，这次没读生产日志。
3. **线上实际的并发配置**：ROADMAP PH item 3 写的是"concurrency 1"，`docs/hosted-api.md:64` 写的是并发 2，两处冲突，线上是哪个未核实。
4. **`GET /v1/scrapes/:id` 跨实例能不能读到**：审计推断可能读不到，没实测，现在就可以测。

**第 1 期里测的**：

| 未知项 | 怎么测 | 它决定什么 |
|---|---|---|
| 每千页成本，HTTP 和浏览器分开 | 两周成本记录（PH item 3） | 并发和保留期的默认值、阶段触发线 |
| Cloud Run 上的单页耗时和浏览器页占比 | 真实站点运行时记录。现在只有一组本地走代理的混合通道数据：p50 3.5 s、p95 10.5 s（`research/access/runs/2026-10-06-ab-A1-playwright-f052375.md`） | worker 规格 |
| Postgres 队列吞吐、Cloud SQL 的 `max_connections`、DBOS 在万页级扇出下的表现 | 在 2 万 URL 的验收里测 | 什么时候上 Valkey、数据库选哪个规格 |
| 各 MCP 客户端的真实超时和后台化行为（Claude Code 超过 2 分钟转后台、ChatGPT 约 60 s 超时都只见于二手来源） | 1.7 的客户端记录 | 等 45 s 是否合适 |
| Cloud Run 平台限额、Cloud SQL shared-core 是否在 SLA 内、Cloud NAT 价格 | 重读官方文档 | 底座细节、阶段 1 的数据库规格 |
| Cloudflare 透传 SSE 时是否缓存或超时 | 在 preview 环境实测 | 第 2 期改不改 SSE |

**第 2 期以后测的**：表格 v0 的打开率和导出次数（决定做不做 v1）；路径树的使用率（决定做不做链接图）；Monitor 的假变化率；邀请接受率和每个 workspace 的活跃成员数；n8n 节点的下载量；主动来问 SSO 和数据驻留的次数；托管端有多少任务被挡在 Cloudflare 或 bot 检查上（决定增强访问的优先级）；SearXNG 的条款和结果质量；`pageCache.ts` 和 `pdfFields.ts` 的实际能力（这次没读）。

**需要你决定的**：
1. 第 1 期要不要在 PA 之前开工，或者和 PA 并行。
2. 自带的 LLM key 能不能为定时任务和表格保存下来。这和 `ROADMAP.md:373`"key 不落库"冲突，团队草案指出了这一点。
3. 类 Alexandria 目录要不要从 Paused `:440` 里拆出来单独排期。
4. 托管专用代码（比如 `PostgresTaskStore`）要不要开源进 AGPL 仓库。本文按"契约和本地版一致"设计。

---

# 附：评审打分表

每项 1–10 分。

| 草案 | 证据可追溯 | 需求匹配 | 技术和分期 | 一个人能不能做 | 四个想法 | 合计 | 评语 |
|---|---|---|---|---|---|---|---|
| agent-developer-first | 9 | 8 | 9 | 8 | 8 | **42** | MCP 工具面最清楚：总数 7–8 个、同步请求优先、MCP 层幂等、预算和估价都放在第 1 期；路径摘要的 agent 用法是好点子。缺点是表格放到第 3 期、团队偏后，对你提出的画布和团队诉求回应偏弱 |
| team-workspace-first | 8 | 6 | 9 | 6 | 9 | **38** | 最贴合你的团队诉求，提出了"额度按人发"、审计事件第一天就写、自带 key 存储冲突、邀请制设计伙伴、`origin` 和 `actor` 字段。但团队需求只是中等，第 1 期 31–50 人天超出 6–8 周，砍线不够硬 |
| platform-architecture-first | 9 | 8 | 9 | 8 | 8 | **42** | 最均衡，还核对了试用闸门过期和 `hostedLeases` 的实际行号（`:943-951`）；表格 v0 放在第 2 期当低成本验证，节奏合适。本终稿以它为骨架 |

**终稿的取舍**：以 platform-architecture-first 的分期为骨架；吸收 agent-developer-first 的幂等和预算、同步请求优先、MCP 工具预算、路径摘要、任务 webhook 进第 1 期；吸收 team-workspace-first 的额度按人发、审计事件从第 1 期写、job 的 origin 和 actor 字段、邀请制上线、自带 key 存储冲突。团队邀请定为第 2 期第一项，而不是第 1 期，因为团队的需求强度只是中等，而第 1 期的工期已经很紧。

---


---

# 附录 A：Critic 审查意见（原文）


> 我在 origin/main `f13d8cfd`（2026-10-18 fetch）上抽查了几处。main 已经比档案用的 `efdfb11c` 新。抽查过的有：`ROADMAP.md` PH 段、`packages/mcp/src/hostedApi.ts`、`docs/hosted-api.md`。其余条目只以档案内容为依据。

## (1) 档案不支持、或与档案矛盾的说法和数字

1. **终稿的"行号更正"本身是错的。** 终稿 Found 写："审计里引用的 `hostedApi.ts:586`，在当前 main 上实际是 `:943-951`"。实际上 `:586-588` 是 gate 取租约、返回 `429 browser_busy` 的调用点，`:943-951` 是租约类的实现。两处都存在，审计引用的没错。
2. **浏览器单页 8 秒的假设和档案里唯一的云端实测冲突。** 终稿写"自建浏览器每千页约 $0.066"，并据此写"Temporal 每千页 $0.05–0.15……同一个量级"。这建立在"每页 8 s、1 vCPU 跑 2 页"上。档案里唯一的 Cloud Run 浏览器实测是"每页约 40 s，4 vCPU / 8 GiB"（`2026-10-14-installed-chrome-cloudrun-xvfb`）。那是增强访问路径，但至少说明 8 s 没有云端依据。如果实际是 5 倍，浏览器成本、"25 并发约需 13 vCPU"、阶段 3 的触发线都要跟着改。
3. **两处比较口径前后不一致。**
   - 架构调研的原话是：引擎费和"HTTP 页面本身的算力成本"同量级。终稿改成和"自建浏览器"比。按浏览器比，引擎费反而显得不贵，论证被削弱了。
   - 终稿第三节 E5 写"抓取类厂商都没做"节点画布，但同一份文档里列着 Clay Workflows（2026-08 上线的节点画布）、Octoparse 线性步骤设计器、Anchor 分段图。"Anchor 是本次调研里唯一的图形视图"这句也不对：这个说法只在浏览器基础设施这一组里成立。
4. **"竞品里没有一家给结果附签名 hash 和 robots 判定"有两处问题。**
   - Firecrawl 的 `/crawl/{id}/errors` 会返回 `robotsBlocked` 列表，所以 robots 判定并非独有。
   - 档案对 Evidence Record 的描述是"robots decision、hashes"，没有出现"签名"。Octocrawl 自己有没有签名，未核实，不能当卖点写。
5. **并发数冲突已证实，但终稿写的"concurrency 1"不完整。** `ROADMAP.md` PH item 1 写的是"a key enables the browser lane at concurrency 1"（按 key）；item 3 写的是"at most 3 instances, concurrency 1"（按服务）。`docs/hosted-api.md:64` 写的是 `--concurrency=2`。ROADMAP 内部是两种含义，终稿只记了一种。
6. **"开工前提"漏了 PH 第 1 阶段自己的 Exit 条件。** ROADMAP 原文："at least five keys issued and used by people other than the author; the two-week cost record written"。终稿只引用了"PH 第 2 阶段开启条件"。按 ROADMAP，PH 第 1 阶段本身还没退出，这比终稿写的更严格。
7. **"第 1 期本身就是 ROADMAP 已写明的 P5 Hosted scale"是偷换。** ROADMAP 里 P5 那一行的状态写的是"this row is PH's phase 2"。也就是说，它受的正是终稿想绕开的那个开启条件约束，不能拿来当开工理由。
8. **"结束时对账误差为 0"在终稿的架构下做不到。** credits 留在 Firestore，job 和预留放在 Postgres，跨两个库没有原子事务。要做到误差为 0，需要 outbox 或补偿流程。终稿没有设计这一层，F0 的工期也没算它。
9. **用 n8n 下载量证明"画布需求弱"的口径自相矛盾。**
   - 档案自己注明"下载量不等于用户数，n8n Cloud 装节点是否经过 npm 不确定"。
   - 同一份档案里 r/n8n 的 Firecrawl 工作流帖子有 1,582 分。
   - 终稿一边用这组下载量证明画布不值得做，一边在第 2 期排了 n8n 节点。逻辑上可以说通（"交给 n8n"），但这组数据本身证明不了什么。
10. **Gumloop "Legacy" 被当成了强证据。** 档案明确写了"Gumloop 没有正式声明过转向"，终稿第七节写"Gumloop 已标成 Legacy"，并作为不做画布的首要理由之一。
11. **阶段 1 月费"约 $16–60"漏项。** 没算 Cloud SQL 备份和 PITR、Cloud Logging（每页一条日志的话会明显）、Artifact Registry、Secret Manager 或 KMS、出站流量，以及 worker 连 Cloud SQL 用的 Connector 或 Serverless VPC。f1-micro 和 g1-small 都是 shared-core，档案也说了 SLA 未核实，却被拿来承载"不丢任务"的生产队列。
12. **"6–8 周"和档案自己的数字对不上。** 必做部分 24–41 人天、全做 30–49 人天，按单人全职算已经是 5–10 周。终稿又承认 PA 占一半时间时要 10–16 周。好几条退出条件要求"连续 7 天"，这是日历时间，没有计入。

## (2) 漏掉的竞品功能、用户需求和技术约束

**技术约束（仓库里已经存在，终稿没提）：**
- `W2L_SITE_DAILY`=1500：全站每天只服务 1500 页（`docs/hosted-api.md:16`）。一个 2 万页的验收任务，或者几个用户的 crawl，当天就会把全站配额用光。退出条件和容量规划都没处理这个上限。
- 每个地址每分钟 120 请求，而且在查 key 之前就生效。MCP 轮询和 SSE 重连会撞上它。
- 托管 MCP scrape 在 100 s 处截断（REST 是 300 s），终稿 1.7 设的"等 45 s"要和它对齐。
- hosted 把 `storeInCache` 固定关闭了，本地已有的 `maxAge` 缓存在托管端不能用。缓存是 crawl 和 monitor 降成本的主要手段，终稿只在 C6"共享缓存"里一笔带过。
- 文件大小上限 5 MiB。PDF 和文档类 batch 会受影响，竞品已经有 `/parse`。

**出口 IP 的成功率：**
- 档案的实测是 Cloud Run 自身出口 2/16，走 Webshare 7/16。
- 托管 crawl 和 batch 在没有增强访问（I1，排在第 3 期）的情况下，对普通站点的成功率是多少，终稿没有要求测。如果大量站点从 Google IP 段被挡，第 1 期交付的就是一个"可靠但抓不到"的服务。

**两套存储的长期维护：**
- 本地用 SQLite、托管用 Postgres，两套 TaskStore 要永久同步：每次 schema 改动做两遍，契约测试矩阵翻倍。
- `npm test` 要求离线能过，Postgres 测试要用 pg-mem 或嵌入式方案，这部分没有估工时。

**数据库与部署运维：**
- 从多个 worker 实例连 Cloud SQL，需要连接池（pgbouncer 或 Connector），`max_connections` 未核实。
- 控制面和 worker pool 跑的版本可能不同，schema 迁移要能兼容滚动发布。AGENTS.md 的 tagged-revision 发布流程现在只覆盖一个服务，以后要覆盖两个，worker pool 有没有同样的 tag 和流量机制，没有核实。
- worker pool 实例连续运行 7 天会被重启。终稿提了这一点，但没把长 crawl 在重启时的续跑写进验收。

**团队和计费：**
- 免费额度"按人发"，新建的团队 workspace 不自带额度。但计费（P4）在规划范围之外，团队 workspace 的额度从哪里来（个人转入？后台发放？），终稿没有写。

**法律与平台：**
- 托管 crawl 让 Octocrawl 成为实际的抓取方。站点方的滥用投诉会直接发给 Google Cloud，可能导致整个 GCP 项目被停用。这是单人公司的生存级风险，终稿没有专门对策（abuse 联系邮箱、投诉处理时限、按域名封禁）。
- ROADMAP PH item 4 要求 privacy、terms、acceptable-use、limits 页面先加 hosted 段落，终稿没把它列为第 1 期前置。

**竞品功能（档案里有，终稿没列）：**
- 每个响应带成本和余额：Crawl4AI 的 `x-c4-cost` / `x-c4-balance`，Tavily 的 `include_usage`。
- Exa 的 batch 结果用 JSONL 预签名文件整包下载，适合 agent 一次取完。
- webhook 测试事件（Anchor）。
- 公开状态页和 SLA（Exa、Browser Use）。
- Firecrawl Activity 的 "Debug issue"，以及失败原因的结构化分类。ZenRows 自己承认错误码还分不清 blocked、not-found、timeout，这正好是 Evidence Record 能做出差异的地方。
- agent 和 research 类异步端点（Firecrawl /agent、Exa Agent、Parallel Task）在 Paused 表里，这没问题，但终稿应该写明：市场的主流异步需求正在往这类端点移动，hosted crawl 可能只吃到一部分需求。

**用户需求：**
- agent 取回大结果时的上下文成本：分页、摘要、只取字段。档案有 MCP 上下文开销的证据，终稿只在 schema 预算里写了 5 KB，没覆盖结果体积。
- 新加坡单区对美国目标站点的延迟和地区内容差异（ADR 0007），被推到了"以后"。

## (3) 排序错误

1. **两周成本记录被放进第 1 期"边做边测"。** ROADMAP 明确写"allowances and `--max-instances` are adjusted from that record, not before"。它应该是第 0 步，因为并发默认值、worker 规格、阶段触发线都依赖它。
2. **在 PH 第 1 阶段 Exit（5 个外部 key 在用）和试用闸门都没确认时，就规划了 30–49 人天的底座。** 最便宜的需求探针现成就有：crawl、batch、Monitor 在托管端返回 `403 hosted_unavailable`。读 Cloud Logging 里这类 403 按 key 和 IP 的次数，就能直接回答"有没有人要托管 crawl"。终稿没用这个信号。
3. **团队邀请（2.1）排在计费之前。** 团队 workspace 没有额度来源，邀请进来的同事用不了。第 1 期写入 `workspace_id` 是对的，但邀请和角色应该和 P4 计费绑在一起，或者至少先定好额度从哪来。
4. **定时任务和 Monitor（2.4、2.5）排在计费和成本记录之前。** 定时任务会无限放大成本。免费用户的 monitor 在没有付费门槛时会一直跑，"连续失败自动暂停"只能挡住失败的任务，挡不住成功但没人看的那些。
5. **托管 crawl（1.4）排在出口方案之前。** 应该先在 `research/parity/sites.md` 的站点集上测 Cloud Run 出口的成功率，再决定第 1 期要不要带上最小的出口代理，而不是等到第 3 期的 I1。
6. **低需求项进了第 2 期，违反终稿自己"先证明需求"的原则。** 站点路径树（需求评级"弱或没有"）、Evidence Pack（"没有直接需求数据"）、n8n 节点，都排在第 2 期。
7. **底座方案一上来就是全量的 Postgres、GCS、worker pool、全局限速。** 没有评估更小的需求验证版：比如 ≤1,000 URL 的托管 batch，用 Cloud Tasks 加 GCS 加 Firestore 的 job 文档实现，单 worker、无需全局公平调度，大约 1/3 的工作量就能验证付费意愿。终稿第七节直接排除了"用 Firestore 做队列"，但那个理由针对的是万页级热点，不针对小规模验证。

## (4) 对单人创始人低估的工作量和运维负担

1. **F0 底座 8–14 人天偏乐观，现实估计 15–25 人天。** 要做的有：
   - 移植 503 行的 SQLite 存储；收回 engine 里 14 处直接打开 SQLite、10 处路径判断、2 处扫目录；
   - Postgres 迁移；GCS 正文存储；租约和 fencing；
   - 全局 `host_state` 限速；跨 Firestore 的 credits 预留和对账；
   - 用 Admin API 写自研扩缩器；Cloud SQL 的 IAM、网络、连接器；
   - 离线测试方案；在真实云环境做 2 万 URL、3 worker 的 `kill -9` 验收。
   
   工期校准说"写代码只占估算的 5–9%"，但上面大部分是基础设施配置和云上验收，这条校准不一定适用。
2. **多租户隔离的返工被压在 D1 的 2–3 天里。** 现在 API 引擎的 GET 路由完全没有归属检查。给每个路由加 workspace 范围和负面测试，再加上 batch、crawl、monitor、delivery 全部改成按租户的 id 命名空间，这是贯穿全仓的改动。
3. **"连续 7 天"类退出条件。** 2.4、2.5、3.4 都要求连续运行 7 天，期间出问题就要重新计时。终稿只算人天，没算日历时间，也没算期间的值守。
4. **长期运维没有任何人天预算。** 包括：
   - 两个 Cloud Run 服务加 Cloud SQL 的发布、回滚、维护窗口、备份恢复演练、版本升级；
   - 卡住的任务、队列积压、webhook 失败率告警，以及半夜没人值守时的处理；
   - 站点方的滥用投诉、下架请求、GDPR 删除请求、支持工单；
   - 每次部署后清 Cloudflare 缓存（记忆里已有这条流程）。
   
   保守估计每周 0.5–1.5 天。这部分直接挤占 PA 和第 2、3 期的开发时间，终稿完全没算。
5. **MCP 异步工具 1.7 只给了 2–3 人天。** 退出条件要求 5 个客户端（Claude Code、Codex、Cursor、ChatGPT developer mode、claude.ai）各跑通一次并记录版本，还要实测 token 占用、重跑 E2。参照 E2 每一轮的实际成本，这一项很可能翻倍。
6. **团队 2.1 只给了 4–6 人天。** 邀请邮件送达率（Firebase 邮件链接还是 Cloudflare Email 都没选定）、OAuth 同意页选 workspace、移除成员时撤销 OAuth 连接和 key、Owner 退出和删号的语义、角色矩阵测试、claude.ai 和 ChatGPT 的团队连接记录，合起来更接近 8–12 人天。
7. **法务（ToS、AUP、DPA、下架流程）依赖 P4 的律师审查。** 这是外部依赖，周期不受你控制，却被当作第 1 期和第 2 期的普通事项写了进去。

## (5) 动工前最该验证的 5 件事

1. **真实需求信号。**
   - 从 Cloud Logging 读：`hosted_usage` 的外部 key 数和调用量；crawl、batch、Monitor 收到 `403 hosted_unavailable` 的次数，按 key 和 IP 去重。
   - 对照 PH 第 1 阶段 Exit："5 个外部 key 在用"是否达成。
   - 直接问现有 key 持有人：愿不愿意为托管 batch、crawl 付费，单次规模多大。
   
   这一项决定第 1 期做不做。
2. **两周成本记录（PH item 3）。** 在 Cloud Run 上分 HTTP 和浏览器两条通道实测：每页耗时、每个 browser context 的内存、每千页成本。用实测替换"每页 8 s、1 vCPU 跑 2 页"的假设。这一项决定 worker 规格、并发默认值和阶段触发线。
3. **托管出口的成功率。** 用 `research/parity/sites.md` 的站点集（选 crawl 型站点），分别从 Cloud Run 直连和走 Webshare 跑，记录 verified 率和被 Cloudflare 或 bot 检查挡住的比例。这一项决定托管 crawl 在没有 I1 时值不值得上线，以及出口方案要不要提前到第 1 期。
4. **agent 客户端对异步任务的真实行为。** 不必先建底座，用本地 `serve --hosted` 加现有的 crawl wait 和 get_pages 原型就能测：
   - Claude Code、Codex、ChatGPT、claude.ai 会不会自己轮询 job id，任务完成率多少；
   - 取回 200 页结果时 token 占用多少；
   - 45 s 返回、100 s 截断、每分钟 120 请求这几个限制下能不能跑通。
   
   这一项决定 MCP 工具面怎么设计，以及"agent 需要托管长任务"这个核心假设成不成立。
5. **底座的关键技术风险，用最小 spike 验证。**
   - 在 Cloud SQL 小机型上：Postgres `SKIP LOCKED` 队列加 3 个 worker，2 万 URL、中途 `kill -9`、全局每站限速，测 0 丢失、0 重复和吞吐；
   - 验证 Firestore credits 与 Postgres job 的预留和结算能不能做到对账误差为 0；
   - 和"≤1,000 URL、Cloud Tasks 加 GCS 加 Firestore"的小方案比一下工作量。
   
   顺带确认 `GET /v1/scrapes/:id` 跨实例能不能读到，现在就能测。这一项决定 F0 的真实工期，以及是不是先做小方案来验证付费意愿。

---

# 附录 B：功能候选清单（原文）

# Octocrawl 云端功能候选清单（2026-10-18）

依据：上游四份调研（竞品云功能、需求信号、内部技术审计、云架构）和 Alexandria 专项调研。仓库路径以 `origin/main` `efdfb11c` 为准，本次用 `git cat-file` 核对过存在。审计里有两个路径写错了，已更正为 `packages/mcp/src/hostedCredits.ts` 和 `packages/api/src/structured.ts`。

**标注规则**
- 人天按"一个开发者加 AI agents"估，包含真实站点验证和部署，全部是**估算**。标"（本文估算）"的是本清单新补的，其余取自技术审计。依据 `docs/roadmap/week6-calibration-2026-10-13.md:25-29`：写代码的时间通常只占估算的 5–9%，真实站点验证每项要 1–3 天。
- 需求强度共五档：强（有付费或使用数据）、中强（多家竞品都做了并按它计费）、中（有人公开提出）、弱（只有零散的个人说法）、无。
- 只列成本由什么决定，不定价。

**路线图约束**：PH 第 2 阶段（托管 batch、crawl、Monitor）的开工条件是"P4 第一笔付款，或有 key 持有人提出需要并愿意付费"（`ROADMAP.md:332-335`）。目前没有记录显示这个条件已经满足。所以这份清单是规划；任何一项要开工，都需要 Howard 明确提出。Paused 表里相关的几行：`:440`（核心 29 项以外的 Firecrawl 功能，Alexandria 类功能多半属于这一行）、`:445`（超出 Cloud Run 实例上限的托管浏览器集群）、`:446`（Firecrawl 形状的 Monitor 接口）。

---

## 0. 你提的四项：直接评估

| 你的想法 | 需求证据 | 实话评估 | 建议位置 |
|---|---|---|---|
| **并行任务** | **强**。所有竞品都按并发分档：Firecrawl 2/5/25/50/100，Browserbase 3/25/100/250，ZenRows 5–1,000+。我们自己也撞上了：同一把 key 并行发两个浏览器 scrape，第二个立刻返回 `429 browser_busy`。 | 最该先做。但它不是一个独立功能，前提是先建好"云端任务底座"（F0）。现在全站同时最多读 6 页，每把 key 只能开 1 个浏览器页，任务目录存在内存里，10 分钟就清掉。 | 第一期，排在 F0 之后 |
| **可视化画布：结果表格**（Clay / Websets 那种） | 商业用户**中强**：Clay 估值 71 亿美元，Exa Websets 的 Launch HN 412 分，Firecrawl 用 Parallel Agents 表格展示结果。开发者和 agent 用户**没有验证过**。 | 这是四种画布里最适合 Octocrawl 的。每个格子都能带 `fieldEvidence` 和 Evidence Record，"每一行都能追溯到来源网页"本来就是 ROADMAP.md:11 对产品的定义，没有竞品能做到格子级出处。但它必须建在异步 batch 和持久化正文之上，还要显示长任务进度（Exa HN 评论里的主要抱怨就是"卡在 Verifying，看不到进度"）。 | 第三期 |
| **可视化画布：节点式工作流**（n8n / Gumloop 那种） | 作为自建功能是**弱**。十几家竞品没有一家自己做，都交给 n8n、Make、Zapier、Dify。Gumloop 把画布标成了"Workflows (Legacy)"。Firecrawl 的 n8n 节点月下载量只有它 SDK 的 0.7%。仓库旧设计文档三处明确反对先做画布（`docs/roadmap/section-b-technical-design-v1.md:1527`、`section-c-delivery.md:47`、`dual-flow-mvp-gates.md:38`）。 | 不建议自己做。MVP 要 20–35 人天，维护量大，还有连接器凭据的安全问题。替代方案：线性管道模板（表单配置）加 n8n 节点，合计 8–13 人天。 | 先做替代方案；自由画布等有付费需求再说 |
| **可视化画布：站点图**（map/crawl 的可视化） | **弱，没找到直接需求**。只有 SEO 工具（Screaming Frog）有这类功能。GSC 上"find all pages on a website"有搜索量，但用户要的是链接列表，不是图。 | 竞品都没有，做起来便宜（按路径画树 2–4 人天），可以给 `/tools/link-extractor/` 和 crawl 详情页加分。但不要指望它带来收入。 | 第三期，作为附带功能 |
| **团队**（邀请同事） | **中**，属于标配。Firecrawl、Tavily、Exa、Parallel、Apify、Browse AI、Gumloop、Kadoa 都有，席位大多不限。 | 便宜（6–10 人天），能让产品不落后，但拉不开差距，最大风险是跨租户越权。关键在顺序：**`workspaceId` 必须在 F0 的第一天就进数据模型**（个人账户迁成 `workspaceId = uid`），团队界面可以晚做；否则后面要返工所有任务表。它也正好对上 Claude Team 和 ChatGPT Business 的分发方式："管理员装 connector，成员各自 OAuth 登录"。 | 数据模型放第一期；邀请和角色放第二期 |
| **类 Alexandria 数据目录** | 市场需求**强**，但信号集中在少数平台：Apify Store 上 Google Maps 爬虫 65.5 万用户，Instagram 43.6 万，TikTok 34.5 万。这些平台大多有服务条款风险，和托管版"全面遵守 robots"的政策冲突。 | 对一个人的团队来说，BD 和法务成本最高。Firecrawl 宣称的"官方数据源"里，有不少其实是网页连接器：Walmart 读的是 `__NEXT_DATA__`，Substack 读的是 archive 接口，一个月从 88 涨到 278 个，质量不透明。Octocrawl 能打的点是"每个能力都附真实站点测试通过率"。可以从现有 adapter 注册表起步（3 个 beta adapter），授权数据商和给数据方分成放到最后。 | 第四期（Paused `:440`） |

---

## F0. 云端任务底座（几乎所有功能的前提）

- **说明**：一个多实例共享、持久、按租户隔离的任务层。控制面和执行面分开。
- **竞品**：Firecrawl 先用 Redis/BullMQ，后来换成 Postgres 上的 NuQ 队列，团队并发用 Redis 信号量；ZenRows Batch 是 Job/Run/Task 三层；Apify 是 runs；Crawl4AI 自托管用 Redis 队列。
- **需求**：强，是 A1–A5、B1–B3、C1、E1、E2 的前提。
- **本地已有**：
  - 存储接口：`packages/runtime/src/taskStore.ts`
  - SQLite 实现：`packages/runtime/src/sqliteStore.ts`
  - 带租约和 fencing 的存储：`packages/runtime/src/monitorStore.ts`、`deliveryStore.ts`
  - 断点续跑：`packages/runtime/src/orchestrator.ts`
  - 幂等：`packages/runtime/src/idempotencyStore.ts`
  - ADR 0003 早就预期托管场景用 Postgres（`docs/adr/0003-storage-behind-interface.md`）。
- **托管还缺**：
  - B1：任务目录在内存 `/tmp`，10 分钟清一次（`packages/mcp/src/hostedApi.ts:164`、`:404`）
  - B2：`packages/api/src/engine.ts` 绕过接口，有 14 处直接打开 SQLite、2 处扫目录；Task 上没有租户字段（`packages/contracts/src/checkpoint.ts:79-139`）
  - B3：取消和事件都在进程内
  - B5：Firestore 的 `credits/{uid}` 是热点文档
  - B6：按站点限速只在单进程内有效（`packages/bench/src/subjects/originScheduler.ts`）
- **技术方案**：
  1. Cloud SQL Postgres 实现 `PostgresTaskStore`，task、attempt、step 都加 `workspace_id`。
  2. GCS 存正文，路径 `{workspaceId}/{jobId}/`，配生命周期规则。
  3. Cloud Run worker pool 用 `FOR UPDATE SKIP LOCKED` 加 fencing token 领任务。
  4. 共享的 `host_state` 表做全平台按站点礼貌限速，跨所有租户生效，因为大家共用出口 IP。
  5. credits 按 job 一次性预留，每段结算一次。
  6. Cloud Scheduler 每分钟调一次 tick。
  7. 取消改为写库里的标记，worker 轮询。
  8. 账户、key、credits 第一阶段继续留在 Firestore。
- **人天**：8–14，包含 ROADMAP P5 的验收：20,000 个 URL、3 个 worker、中途 `kill -9`，0 丢失、0 重复（`ROADMAP.md:374`）。
- **成本驱动**：
  - Cloud SQL 的固定月费
  - worker 的 vCPU 和内存时长
  - 是否常驻最小实例
  - asia-southeast1 比 Tier 1 区贵 20–40%
- **风险**：
  - 每次读取都必须校验租户。现在 API 引擎的 GET 路由没有归属检查。
  - 推断，未实测：`GET /v1/scrapes/:id` 跨实例可能读不到。
  - CREMA 已验证的扩缩依据里没有 Postgres，得自己按队列深度调 Admin API。
- **依赖**：无，这是根节点。滥用控制（L0）必须和它同时上线。

---

## A. 任务与并行

### A1 托管异步 crawl
- **说明**：`POST /crawl` 返回 job id，支持轮询、webhook 和分页取结果，hosted MCP 提供"启动加查询"两个工具。
- **竞品**：Firecrawl（结果保留 24 h、`/errors` 返回 robotsBlocked 列表）、ZenRows（深度可到 100,000）、Browserless（beta）、Hyperbrowser（最多 100 页）、Tavily（同步）、ScraperAPI Crawler、Crawl4AI 旧版 site 接口。
- **需求**：强。MCP 客户端约 60 秒超时，长任务只能走异步；Reddit 上有人要每天抓几万页。
- **本地已有**：完整的 crawl 引擎（`packages/api/src/engine.ts:1945-2010`、`:1467-1692`），hosted 模式下默认 `defaultMaxPages: 100`（`packages/api/src/listen.ts:173`）。
- **托管还缺**：hosted gate 现在对这些路由返回 403（`hostedApi.ts:551-556`），需要放行，并补上归属检查、按任务计 credits、hosted MCP 工具。
- **技术方案**：frontier 持久化到 Postgres；crawl 会一边爬一边发现新 URL，所以不适合 Cloud Run Jobs（task 数在启动时就固定）。
- **人天**：在 F0 之上 3–5，和 A2 合计。
- **成本驱动**：worker vCPU 秒、浏览器页占比、出站流量、GCS 写操作。
- **风险**：在 Google IP 段上被当作抓取放大器；Crawl-delay 和 429 退避必须跨实例共享。
- **依赖**：F0、L0。

### A2 托管 batch scrape
- **说明**：一次提交多个 URL，可以追加、取消，有错误列表。
- **竞品**：Firecrawl、ZenRows（每个 job 最多 10 万）、ScraperAPI（5 万）、Crawl4AI（jobs 最多 1 万、只重试失败项）、Bright Data（单次 1 GB 输入）、Exa Batch（JSONL 加预签名链接）、Parallel Task Groups（每次最多 1,000）。
- **需求**：强。
- **本地已有**：batch、追加、取消、错误列表，最多 1,000 URL（`packages/contracts/src/api.ts:2172`）。
- **技术方案**：和 A1 共用页级 task 队列。
- **人天**：和 A1 合计 3–5。
- **成本驱动**和**风险**：同 A1。
- **依赖**：F0。

### A3 按 workspace 的并发上限、排队和队列状态（你提的"并行任务"的核心）
- **说明**：HTTP 通道和浏览器通道分开设在途上限；超出时排队，到排队上限返回 429 加 Retry-After；提供 `usage.concurrency` 和 `queue-status` 两个接口；账号之间轮转公平。
- **竞品**：
  - Firecrawl：按团队、所有 key 共享；排队上限 5 万到 20 万+；排队超过 48 h 过期。
  - Browserbase：超限直接丢弃，不排队。
  - Browserless：排队。
  - ZenRows：每个响应都带 `Concurrency-Limit` 头。
  - Exa：`/v0/teams/me` 能查 maxConcurrent 和 maxQueued。
  - Apify：按 run 数加内存池。
- **需求**：强。
- **本地已有**：`maxActiveBatches`（`engine.ts:414`、`:2058`）、单任务 `maxConcurrency`（`:1958-1961`）。现在 hosted 每把 key 同时只能 1 个浏览器页，靠 `hostedLeases` 实现（`hostedApi.ts:586`）。
- **技术方案**：领任务的事务里同时检查四个条件：workspace 在途数、job 子上限、站点 `next_allowed_at`、按"该 workspace 上次被服务的时间"排序。抢槽位超过约每秒 1–2 千次再上 Valkey（估算）。
- **人天**：1–2。
- **成本驱动**：承诺给用户的并发等于要预留的资源，每个浏览器槽约 0.5 vCPU 加 1 GiB（估算）。超过每区 100 实例要申请配额。
- **风险**：浏览器页很吃资源；一个大户可能把共享站点的礼貌额度占满。
- **依赖**：F0、D1（并发要挂在 workspace 上，不能挂在 uid 上）。

### A4 任务控制：取消、暂停/续跑、只重试失败项、幂等键、提交前估算费用
- **说明**：ZenRows Batch 是这方面最完整的参考。
- **竞品**：ZenRows（全都有）、Crawl4AI（只重试失败项、退还没答复的 URL）、Firecrawl（`maxCredits` 预算、返回部分结果）、ScraperAPI（`max_cost`）、Exa Agent（graceful stop）、Firecrawl /monitor（开启前显示月费估算）。
- **需求**：中。Browse AI 评论里有人要费用估算器；Firecrawl issue #4774 要求重发失败的 webhook。
- **本地已有**：取消、续跑（orchestrator 的 restoreFrontier）、`idempotencyStore.ts`。
- **技术方案**：用状态机字段加 dry-run 估价接口，按 `maxPages × 单页最高价` 估算。
- **人天**：2–3（本文估算）。
- **成本驱动**：几乎没有。
- **风险**：估价和实际扣费不一致，会引来计费投诉（Apify 的主要差评就是计费难预估）。
- **依赖**：F0、A1、A2。

### A5 大批量输入：CSV 上传、URL 列表文件
- **说明**：浏览器直传预签名 GCS 链接，服务端分片入队。
- **竞品**：ZenRows（50 MB / 10 万行）、ScraperAPI DataPipeline（10 万）、Browse AI（每次 bulk run 50 万）、Exa imports、Firecrawl Parallel Agents（CSV）。
- **需求**：中。
- **本地已有**：CLI 有批量输入输出（`packages/cli/src/run.ts:231-254`）。
- **人天**：1–2（本文估算）。
- **成本驱动**：GCS 写操作、出站流量。
- **风险**：批量注册刷免费额度；URL 列表可能指向内网，要走 `hostedNetworkPolicy`。
- **依赖**：A2、C1。

### A6 低价延迟档（不急的 batch）
- **说明**：用 Cloud Run Delayed Jobs（最多延后 12 h 开始，单价约为 worker pool 的 1.1 倍、instance-based 的 0.7 倍），或者在闲时消化。
- **竞品**：没有直接对应的。Exa Batch 和 Bright Data snapshot 都是异步交付，但不分价格档。
- **需求**：无。
- **人天**：2（本文估算）。
- **风险**：价格每 30 天可能浮动。
- **依赖**：F0。属于定价阶段再考虑的事，这里只记一笔。

---

## B. 调度与监控

### B1 定时任务（cron、时区、预设频率）
- **说明**：定时重跑某个 scrape、crawl 或 batch。
- **竞品**：Apify（6 字段 cron、最小间隔 10 s）、ZenRows（最小 60 min）、ScraperAPI、Zyte（仅付费档）、Firecrawl /monitor（最小 5 min）、Exa monitors（cron）、Browserbase Director、Kadoa、n8n、Make。
- **需求**：无代码用户**中**，开发者**弱**。r/webscraping 上的回答几乎都是自己搭 GitHub Actions 或 cron。
- **本地已有**：monitor 的 `next_run_at` 设计、trigger key 幂等。
- **托管还缺**：B9：调度循环在 `packages/mcp/src/managedRuntime.ts:40-70`，hosted API 进程里根本没有。
- **技术方案**：schedules 表、Cloud Scheduler 每分钟 tick 把到期项入队、调度管理 UI。
- **人天**：2–3。
- **成本驱动**：频率乘以页数，这是用量的放大器。
- **风险**：被遗忘的定时任务长期消耗额度。需要"连续失败 N 次自动暂停"和月费估算。
- **依赖**：F0、A1、A2。

### B2 变化监控（Monitor：added / changed / removed，Markdown diff，按字段 JSON diff）
- **竞品**：
  - Firecrawl /monitor：1–50 个目标；目标可以是页面、站点或搜索；有 goal judge；快照保留 30–365 天。
  - Parallel Monitor：1h–30d。
  - Exa Monitors：去重。
  - Browse AI：AI 判断变化。
  - Kadoa：字段条件、数据变化时触发下游。
  - Firecrawl Observer（开源）。
- **需求**：中（无代码）/ 弱（开发者）。Firecrawl discussion #4201 只有 2 票。
- **本地已有**：`packages/runtime/src/monitorStore.ts`（524 行），本地 38 个工具里包含 monitor。
- **托管还缺**：迁到 Postgres、monitor id 按租户命名空间、hosted 的调度循环。**Firecrawl 形状的 Monitor REST/MCP 接口在 Paused 表里（`ROADMAP.md:446`）。**
- **人天**：B2 和 B3 合计 4–6。
- **成本驱动**：页数 × 频率，加快照保留时长。
- **风险**：动态页面产生大量假变化，噪音会把额度耗光（Browse AI 评论里正有这条抱怨）。
- **依赖**：B1、C1、B3。

### B3 投递和通知：签名 webhook、重试、投递日志和手动重发、邮件、Slack
- **竞品**：
  - Firecrawl：HMAC 签名、1/5/15 分钟三次重试；Slack 只能在 dashboard 配。
  - ZenRows：HMAC，按组织分 key，分阶段轮换。
  - Parallel：遵循 Standard Webhooks 规范。
  - Anchor：保留 7 天投递历史。
  - Browserbase：8 次重试。
  - Bright Data：可投递到 S3、GCS、Snowflake。
- **需求**：中强。竞品普遍都有；Firecrawl issue #4774 要求重发失败事件，firecrawl-mcp-server #21 希望结果好了直接推送。
- **本地已有**：`packages/runtime/src/deliveryStore.ts`（336 行）、`deliveryWorker.ts`（244 行，DNS 固定、只走 HTTPS）、`packages/api/src/jobWebhooks.ts`。
- **托管还缺**：B7：签名密钥现在是"环境变量名"（`checkpoint.ts:72` `secretEnv`），要改成每个投递目标一个、用 KMS 加密的密钥。
- **技术方案**：投递表加上"重新投递"接口，邮件走 Firebase 或 Cloudflare Email Service。
- **人天**：和 B2 合计 4–6；Slack OAuth 另加 2（本文估算）。
- **成本驱动**：投递请求数、重试、邮件。
- **风险**：通过 webhook 打 SSRF（已有 `hostedNetworkPolicy` 防护）；密钥泄漏。
- **依赖**：F0、D1。

### B4 Monitor 的"目标判定"（LLM 过滤噪音变化）
- **竞品**：Firecrawl /monitor goal judge（每判定一次 +1 credit）、Kadoa 字段条件、Browse AI 的 AI 变化检测。
- **需求**：弱。
- **人天**：2–3（本文估算），用户自带 key。
- **成本驱动**：每个变化一次 LLM token。
- **风险**：判定错了会漏报；网页内容可能做提示注入（`ROADMAP.md:375`）。
- **依赖**：B2、H2。

---

## C. 数据、存储与导出

### C1 持久结果加分档保留期
- **竞品**：Firecrawl（API 24 h，monitor 30–365 d）、ZenRows 14 d、Bright Data 30 d、ScraperAPI 72 h / 7 d / 30 d、Zyte 7 d（免费）对 120 d（付费）、Browse AI 90 d、Browserbase 7 / 30 d、n8n 7 / 30 d / 不限。
- **需求**：中强，竞品普遍用保留期做分档。
- **本地已有**：SQLite 加本地文件。
- **托管还缺**：现在内存里放 10 分钟。
- **技术方案**：Postgres 存元数据和 Evidence Record（每条约 2 KB，JSONB），GCS 存正文；按 workspace 的套餐设 lifecycle。
- **人天**：包含在 F0 和 C2 里。
- **成本驱动**：存储量很小（1 万页约 300 MB、每月约 $0.006，估算），主要影响 Postgres 的体积。
- **风险**：**托管第三方内容的副本**会带来版权和 GDPR 问题，需要 C5 的删除流程。
- **依赖**：F0。

### C2 导出：JSONL、CSV、Markdown zip、签名下载；Parquet 和 XLSX
- **竞品**：Apify（7 种格式）、Bright Data（Parquet、XLSX）、ZenRows（ZIP 链接 12 h 有效）、Kadoa（Parquet）、Exa Websets（CSV）。
- **需求**：中强。
- **本地已有**：`results.jsonl`、`results.csv`、每页一个 Markdown、表格 CSV（`packages/cli/src/run.ts:231-254`）；Activity 页能导 CSV。
- **托管还缺**：GCS 签名下载。按 `ROADMAP.md:423`，Parquet 和 XLSX 是 Pro 功能，需要新增依赖。
- **人天**：2–4。
- **成本驱动**：出站流量（新加坡约 $0.12/GiB），截图多的话明显。
- **风险**：签名链接外泄。
- **依赖**：C1。

### C3 Evidence Pack 导出（Octocrawl 独有）
- **说明**：一个任务的全部 Evidence Record 加 hash 打成可校验的包（`ROADMAP.md:431` 有格式定义）。
- **竞品**：没有。Crawl4AI 的 ladder、Parallel 的 Basis、Exa 的字段 grounding 都只是同一方向的部分能力。
- **需求**：没有直接需求数据；这是差异化定位。
- **人天**：2。
- **依赖**：C1。

### C4 投递到外部存储（S3、GCS、Google Sheets、Snowflake）
- **竞品**：Bright Data（8 种目标）、Kadoa（Snowflake、Databricks）、Zyte feeds、Browse AI 和 Thunderbit（Sheets、Airtable）。
- **需求**：中，主要来自企业和无代码用户。
- **人天**：S3 和 GCS 2–3，Sheets 2（本文估算）。
- **风险**：要保管用户的云凭据，需要 KMS 和最小权限。
- **依赖**：B3、C1。

### C5 删除和下架流程，以及数据处理条款
- **说明**：用户可以删除任务和结果；接到权利人的下架请求能执行；持久化之后这是必需的。
- **竞品**：Tavily 和 Firecrawl 有 ZDR；其余竞品的公开文档里写得少。
- **需求**：持久化之后是法律硬要求。
- **本地已有**：删除账户的完整流程（`packages/public-preview/src/account.ts:245-280`）。
- **人天**：2–3（本文估算），另需 P4 的律师审查（`ROADMAP.md:360`）。
- **依赖**：C1。

### C6 共享缓存（同一 URL 在 maxAge 内复用）
- **竞品**：Crawl4AI（共享 archive 缓存，半价）、Jina（5 分钟缓存）、Exa（`maxAgeHours`）、Firecrawl（Lockdown 模式只读缓存）。
- **需求**：弱到中。r/LocalLLaMA 上有人要缓存、要同一页面扣费稳定。
- **本地已有**：`packages/runtime/src/pageCache.ts`，具体语义这次没读，**未核实**。
- **人天**：2–4（本文估算）。
- **风险**：跨租户共享缓存会泄漏信息，比如带 cookie 或登录态的页面绝不能共享（参考 Firecrawl 全局 CookieJar 泄漏事故，issue #4295）；Evidence Record 必须标明命中了缓存。
- **依赖**：C1。

---

## D. 工作区与团队（你提的第 3 项）

### D1 Workspace 数据模型和零拷贝迁移
- **说明**：新增 `workspaces`、`memberships`、`invitations` 三张表；key、credits、并发、任务、monitor、webhook 都挂在 `workspace_id` 下；每个现有 uid 生成个人 workspace，`workspaceId = uid`。
- **竞品**：Firecrawl、Tavily、Exa（人人从一个叫"Personal"的 team 开始）、Parallel、Apify、Browserbase、Gumloop、Kadoa。
- **需求**：中，属于标配。
- **本地和托管现状**：现在一切按 uid 存：`credits/{uid}`、`hostedApiKeys.uid`（`account.ts:172`）、`requestLog/{uid}`、OAuth 授权（`packages/public-preview/src/oauth.ts`）。
- **人天**：2–3，从 D 组 6–10 人天里拆出来（本文估算）。
- **风险**：owner 退出或删号时怎么办；跨租户越权。
- **依赖**：**必须在 F0 的同时落地**，否则任务表要返工。

### D2 邀请和角色（Owner / Admin / Member / Viewer）
- **竞品**：
  - Firecrawl：Admin 和 Member。
  - Tavily：Owner、Admin、Member。
  - Parallel：Admin 和 Member，各自权限写得很清楚。
  - Browserbase：Admin、Contributor、Viewer，可以按项目授权。
  - Kadoa：额外有 Viewer 和 Compliance Officer。
  - Apify：按资源类型设权限。
  - Browse AI：成员上限 3/3/10。
  - ScrapingBee：Business 档最多 15 人。
- **需求**：中。
- **技术方案**：
  - 邀请 token 只存 hash，有过期时间。
  - 角色每次请求由服务端查库，**不放进 custom claims**（token 一小时才刷新，撤权会延迟）。
  - 继续用单一 Identity Toolkit 用户池。
- **人天**：3–4（本文估算，属于 D 组 6–10 的一部分）。
- **成本驱动**：Firestore 读写、邀请邮件；席位本身几乎不花钱。
- **风险**：越权。需要专门写一组跨租户访问的负面测试。
- **依赖**：D1。

### D3 Workspace 切换器，OAuth 连接时选择 workspace
- **说明**：在 OAuth 同意页让用户选择这次连接属于哪个 workspace。这样能对上 Claude Team/Enterprise（Owner 添加 connector，成员各自 OAuth）和 ChatGPT Business（管理员发布 app）的组织分发方式。
- **竞品**：Exa 在左上角切换 team；Tavily 有账户切换器。
- **需求**：中，组织分发场景的直接需要。
- **本地已有**：每个 OAuth 连接是一把独立 key，上限 10 个（`oauth.ts:43`）。
- **人天**：1–2（本文估算）。
- **依赖**：D1、D2。

### D4 项目级 API key：scope 和单 key 消费上限
- **说明**：key 带 `projectId`、scope（只读、只能 scrape、允许 crawl）和单 key 的月度或日度预算。
- **竞品**：Exa（`rateLimit` 加 `budgetCents`，超出返回 402）、ZenRows（10 把 key，每把有 credit 上限，80% 和 100% 时告警）、Browser Use（每把 key 软性月度 USD 上限）、Parallel（按 app 设上限，只通知不拦截）、Anchor（按项目设成本上限）、Hyperbrowser（受限 key 带 scope）、Firecrawl 企业版（按 key 限格式和接口）。
- **需求**：中强，竞品普遍都有，团队场景最需要。
- **本地已有**：每个账户最多 5 把 key（`account.ts:36`），key 已经带 label、plan、browser、dailyLimit、kind。
- **人天**：1–3。
- **依赖**：D1。

### D5 单成员额度和并发上限、用量告警
- **竞品**：ScrapingBee（owner 给每个成员设额度和并发）、Gumloop（按角色设月度额度和单用户并发）、Clay（Credit Budgets、用量突增告警）、Bright Data（按用户设限）。
- **需求**：弱到中。
- **人天**：1–2（本文估算）。
- **依赖**：D2、A3。

### D6 应用层审计日志
- **说明**：记录登录、key 创建和撤销、成员变更、任务启动和取消、导出和下载、webhook 变更、credits 变动、OAuth 连接和断开。默认保留 90 天，定期导出到 GCS。
- **竞品**：Kadoa（活动日志可导出）、Gumloop 企业版、Firecrawl（SIEM 事件流，企业版）、n8n（企业版日志流）、ZenRows（企业版写了 audit）。大多数竞品没有公开文档。
- **需求**：现在弱，进企业市场时强。
- **人天**：2（本文估算）。
- **依赖**：D1。

---

## E. 可视化画布（你提的第 2 项，四种含义）

### E1 任务 dashboard 和实时进度（所有画布的基础）
- **说明**：任务列表和详情页、逐页表格（状态、耗时、robots 判定、错误原因）、取消、续跑、下载。
- **竞品**：Firecrawl Activity（有"Debug issue"按钮）、ZenRows、ScraperAPI 的任务详情页、Apify Runs、Kadoa Observability。
- **需求**：中强。Exa HN 评论抱怨看不到后台进度；Browse AI 评论希望有一个汇总所有运行的页面。
- **本地已有**：
  - SSE 和 WS 流，带游标重放（`packages/api/src/jobStream.ts`、`packages/api/src/jobEvents.ts`）
  - Playground 代理模式（`account.ts:424`）
  - "进度不跑在服务器之前"的原则（`apps/public-web/src/crawlModel.ts`）
- **托管还缺**：hosted 关掉了事件流（`hostedApi.ts:482` `jobStreams: false`）；B10：dashboard 是原生 JS（`apps/public-web/public/docs-assets/dashboard.js`，1241 行），CSP 是 `connect-src 'self'` 和 `style-src 'self'`，并且会丢掉 `style=""` 属性。
- **技术方案**：Postgres NOTIFY 只当"有更新"信号，客户端收到后按游标重读；每隔不到 100 s 发一次心跳；SSE 路由经过 Cloudflare Worker 时必须 `no-store`（Worker 会不会缓存这类请求，**未核实**）。
- **人天**：4–6。
- **成本驱动**：长连接占用实例时长，所以控制面并发要开高。
- **风险**：在 CSP 下表格库和画布库能不能用，要先验证。
- **依赖**：F0、A1、A2。

### E2 结果表格画布（行是实体，列是字段，每格带出处）
- **说明**：从 URL 列表、CSV 或 map 结果生成行；"加一列"就是加一个抽取字段；每格显示状态和 Evidence 链接；支持服务端排序、筛选、分页；可导出和分享。
- **竞品**：Exa Websets（最完整，但文档已引导新工作改用 Exa Agent）、Clay Tables、Firecrawl Parallel Agents（绿、黄、红三色格子）、Bright Data Deep Lookup、Kadoa Data Explorer（可以用 SQL 或自然语言查）、Apify 数据集表格视图。
- **需求**：商业用户中强，开发者和 agent 用户未验证。
- **本地已有**：`fieldEvidence`（`ROADMAP.md:404`）、JSON 抽取、tables、verify 契约（ADR 0006）、确定性抽取加 OpenAI 兼容补齐（`packages/api/src/structured.ts`）。
- **托管还缺**：虚拟滚动表格；用已保存的正文重新抽取（依赖 C1）；自由文本列要接 LLM（依赖 H2）。
- **人天**：6–10。
- **成本驱动**：每格一次重新抽取的计算；LLM token 占大头；正文保留。
- **风险**：长任务进度体验（参考 Exa 的"Verifying"抱怨）；LLM 成本失控，需要每次运行设预算；托管正文带来的版权问题。
- **依赖**：A2、C1、E1、H2（用于自由文本列）。

### E3 站点图（map/crawl 的可视化）
- **说明**：第一档按 URL 路径画树，不需要边；第二档画真正的链接图，需要记录父链接。
- **竞品**：本次调研的厂商里**没有一家做**。最接近的是 Bright Data Crawl inspector（列表形式）、Make Grid（自动化资产地图）、Screaming Frog（SEO 工具，2D 最多 1 万 URL、3D 最多 10 万）。
- **需求**：弱或无。
- **本地已有**：map 返回 `via`、`sitemapFile`、`lastmod`、`robots`（`packages/contracts/src/map.ts:33-53`）；工具页有 `apps/public-web/src/tools/mapResults.ts`；frontier 和 step 里现在只记录 `depth`（`checkpoint.ts:178-193`）。
- **技术方案**：新增 `crawl_edges` 表，只存首次发现的边，完整链接图存 GCS；超过一万个节点按路径前缀聚合；视觉上遵守站点的字形和 ASCII 风格约束。
- **人天**：路径树 2–4，链接图再加 3–5。
- **成本驱动**：基本没有。
- **风险**：几乎没有，主要是投入收不回来。
- **依赖**：路径树只要 map（已有）；链接图要 A1。

### E4 线性管道模板（替代节点画布）
- **说明**：用表单配置"map → 过滤 → batch → 抽取 → 投递"，可以保存、定时运行，也可以发布成一个 MCP 工具。
- **竞品**：Browse AI Workflows（两个 robot 串联，用表单配置）、Kadoa（触发器链，每个 workflow 最多 5 个、最多 15 层）、ScraperAPI DataPipeline、Apify saved tasks 加 Actor 串联。
- **需求**：中，无代码竞品普遍做表单而不做画布。
- **本地已有**：recipe 的纯数据 DSL，带不可变修订和 hash（`packages/contracts/src/recipe.ts:1-36`），还没接进 API。
- **人天**：5–8。
- **风险**：用户分不清 Workflows 和 Bulk Runs（Browse AI 评论里出现过）。
- **依赖**：A1、A2、B1、B3。

### E5 节点式工作流画布（n8n / Gumloop 形态）
- **说明**：带版本的 DAG JSON；节点类型包括 source、scrape、crawl、extract、filter、dedupe、enrich、diff、deliver；流式边；按"节点配置 hash + 输入 hash"缓存；先跑 5 行预览；每个节点有预算。
- **竞品**：抓取类厂商都没做。Anchor 有"由演示编译出的分段图"，是本次调研里唯一的图形视图；Clay 在 2026-08 加了 Workflows 画布，但创建主要靠 CLI 和对话；Gumloop 标成 Legacy；n8n 和 Make 是通用平台。
- **需求**：作为自建功能是**弱**。
- **托管还缺**：DAG 执行器、连接器凭据保管、图编辑器。前端可以用 React Flow（MIT）；n8n 的许可证不是标准开源许可，不能 fork 来商用。
- **人天**：MVP 20–35。
- **成本驱动**：执行时长、连接器、维护人力。
- **风险**：旧设计文档明确反对；维护量大；CSP；连接器的安全面；行业正在转向 agent 和对话式构建。
- **依赖**：E4（先跑通管道语义）、E2、F0。粗粒度编排可以以后挂 DBOS 或 Hatchet。**建议不做，等有付费需求再说。**

---

## F. 可观测性

### F1 Activity 按任务汇总、失败原因、robots 拦截列表
- **竞品**：Firecrawl（`/crawl/{id}/errors` 加 robotsBlocked）、Tavily Logs（最多 1 万条，不含输入输出）、ScraperAPI 错误日志、Browserless（单请求的计费单位明细）、Kadoa（成功率、MTTR、自动生成故障工单）。
- **需求**：中强。
- **本地已有**：dashboard Activity 页、按次写的 requestLog。
- **托管还缺**：改成每个任务一条汇总，不按页写，以绕开 B5（Firestore 单调 id 的写入热点）。
- **人天**：2（本文估算）。
- **依赖**：F0。

### F2 按域名的成功率和延迟分析、阈值告警
- **竞品**：ScraperAPI（domain analytics）、Zyte Stats（可接 Grafana）、Apify monitoring alerts、Kadoa Observability。
- **需求**：弱到中。
- **人天**：2–3（本文估算）。
- **依赖**：F1。

### F3 失败诊断和"为什么被拦"的解释
- **说明**：利用 Evidence Record 和 access ledger 自动给出原因和建议的下一步。
- **竞品**：Firecrawl"Debug issue"（会启动一个支持 agent）、Anchor（self-healing、一键应用修复）、Steel Agent Traces。
- **需求**：弱。
- **人天**：2–4（本文估算）。
- **依赖**：F1、I1。

### F4 可分享的运行链接（可撤销）
- **竞品**：Firecrawl Agent（可撤销的公开链接）、Exa Websets、Browser Use、Apify 存储签名 URL。
- **需求**：弱。Exa HN 评论里有人想分享结果。
- **人天**：1–2（本文估算）。
- **风险**：分享链接属于第三方内容的再分发，和 C5 有关。
- **依赖**：C1、D2。

---

## G. Agent 和 MCP 面

### G1 Hosted MCP 的异步任务工具
- **说明**：提供 `crawl_start`、`job_status`、`job_pages` 三类工具：等待不超过约 45 s 就返回 job id，结果分页取；工具 schema 要控制在 Codex 5 KB 的预算内（`mcp-client-ux-tasks.md` D10）。
- **竞品**：Firecrawl MCP（crawl 在工具内部轮询；agent 工具直接返回 id）、Apify MCP（`call-actor` 最多等 45 s）、Crawl4AI MCP（`jobs_submit`、`jobs_status`、`jobs_results`，带幂等键）、Parallel Task MCP。
- **需求**：强。客户端约 60 s 超时；MCP Tasks（SEP-1686）已移出核心协议，改为扩展，没法依赖。
- **本地已有**：本地 38 个工具里已经有 crawl 的 wait 和 get_pages；hosted 现在只有 scrape、map、scrape_product。
- **人天**：2–3，从 A1 里拆出来（本文估算）。
- **风险**：工具定义占上下文。Firecrawl MCP 26 个工具每次会话约 1.85 万 token（firecrawl-mcp-server #309），所以工具要少、描述要短。
- **依赖**：A1、A2。

### G2 免 key 档的边界
- **说明**：免 key 档永远不开 crawl、batch 和定时任务，只保留现在的 scrape 和 map。
- **竞品**：Firecrawl（按 IP 每天限额）、Exa MCP（3 QPS、每天 150 次）、Tavily、Parallel 免费 Search MCP。
- **本地已有**：`/mcp` 免 key 和 `/mcp-oauth` 已上线。
- **人天**：0.5，属于 L0。

### G3 Agent 自助开户和 x402 按次付费
- **竞品**：ZenRows（agent 可以先开未认领的账户，之后由人认领）、Bright Data（自注册协议）、Apify、ZenRows、Tavily、Exa（x402）。
- **需求**：弱到中，趋势明显。
- **说明**：涉及收款，按你的要求**放到定价阶段**，这里只记一笔。

---

## H. 搜索、抽取和 agent

### H1 托管 search（返回结果并带 Evidence Record）
- **竞品**：Firecrawl、Tavily、Exa、Parallel、Jina、Crawl4AI、Browserless、Browserbase（底层用 Parallel）、Hyperbrowser。
- **需求**：中强，几乎所有 agent API 都有。
- **本地已有**：没有。P5 定的方案是先自托管 SearXNG，其次用户自带 key（`ROADMAP.md:372`）。
- **人天**：3–6。
- **成本驱动**：每次查询的上游费用。
- **风险**：直接抓 SERP 违反条款，而且容易被封（memory 里记过 Google 约 6 次 SERP 后就封）；后端失败时必须返回 `cannot_verify`，不能编结果。
- **依赖**：A2（如果要对搜到的结果批量 scrape）。

### H2 LLM 抽取（用户自带 key）、多 URL 抽取带引用
- **竞品**：Firecrawl /extract 和 JSON 格式、Crawl4AI /extract、Jina（x-json-schema）、ScrapingBee（`ai_extract_rules`）、Parallel Basis（引用加置信度）。
- **需求**：中强。
- **本地已有**：确定性抽取加 OpenAI 兼容补齐，并记录 `modelUsage`（`packages/api/src/structured.ts`，用环境变量配置）。
- **托管还缺**：按请求传入的自带 key，P5 规定 key 不落库（`ROADMAP.md:373`）。
- **人天**：自带 key 2–4，多 URL 带引用再加 4–7。
- **风险**：网页内容做提示注入（`ROADMAP.md:375`）；"Octocrawl 不出模型费"这条原则。
- **依赖**：A2（多 URL 抽取需要）。

### H3 Agent 和深度研究
- **竞品**：Firecrawl /agent、Exa Agent（Ultra 档带预算）、Parallel Task 和 FindAll、Jina DeepSearch、Tavily Research。
- **需求**：中（市场），对 Octocrawl 未验证。
- **状态**：**Paused**（`ROADMAP.md:440`，"agent 和类似功能"）。不建议排进云端第一版。
- **依赖**：H1、H2、A2。

### H4 文档解析（PDF、Office 文件）
- **竞品**：Firecrawl /parse 和 Fire-PDF、Crawl4AI。
- **本地已有**：有 PDF 字段处理（`packages/api/src/pdfFields.ts`），覆盖范围**未核实**。
- **人天**：未知，没有评估。

---

## I. 访问和反爬

### I1 托管增强访问（代理、验证码、按 key 授权）
- **竞品**：Firecrawl Fire-engine（只在云端）、Crawl4AI（isp 和住宅代理按 2x/4x 计费）、ZenRows、ScraperAPI、Bright Data、Steel、Browserbase。
- **需求**：中强，竞品都把它放在云端独占。
- **本地已有**：
  - ledger：`packages/http-core/src/ledger.ts`
  - 授权：`packages/http-core/src/accessGrant.ts`
  - egress 池：`packages/api/src/egressPool.ts`
  - Steel 厂商接入：`packages/bench/src/vendors/steel.ts`
  - 访问契约：`packages/contracts/src/access.ts`
- **托管还缺**：B8：授权是进程级的，hosted 引擎启动时直接拒绝 PA 路线（`engine.ts:587-592`）；要先修订 ADR 0005。
- **实测**：Cloud Run 自身出口 2/16，走 Webshare 住宅代理 7/16，每页约 40 s，4 vCPU / 8 GiB（`research/access/runs/2026-10-14-installed-chrome-cloudrun-xvfb-ee53419e.md`）。PA 实验里自建 Webshare 网关最好，Steel 的代理和验证码没有增益。
- **人天**：10–20。
- **成本驱动**：住宅代理流量、厂商按毫秒计费、浏览器 vCPU。
- **风险**：**法律和条款风险最高**；出口 IP 的信誉。
- **依赖**：F0、A3、D4（按 key 授权和预算）。

### I2 托管的保存登录和浏览器 profile
- **竞品**：Steel Credentials API（KMS 加 TOTP）、Anchor Identities、Browserbase Contexts、Hyperbrowser profiles、Browser Use（本地 cookie 同步到云）、Gumloop。
- **需求**：中（市场），对 Octocrawl 未验证。
- **本地已有**：saved logins 和 my-browser 通道（`packages/cli/src/login.ts`、`packages/contracts/src/session.ts`）。
- **人天**：未评估，估计 ≥10（本文估算）。
- **风险**：凭据保管、跨租户 cookie 隔离（参考 Firecrawl #4295）。hosted 现在拒绝 actions（`engine.ts:786-787`），开放前要先审浏览器隔离。
- **依赖**：I1、L0；还需要一份新 ADR。

### I3 浏览器实时画面和人工接管
- **竞品**：Firecrawl Browser Sandbox（`interactiveLiveViewUrl`）、Browserbase、Steel、Hyperbrowser、Browserless（hybrid）、Anchor、Apify Live View。
- **需求**：中（浏览器基础设施类产品的标配）。
- **状态**：属于"托管浏览器集群"方向（Paused `ROADMAP.md:445`）。实时画面的 URL 普遍相当于 bearer 密钥，只读往往只在 UI 层限制。
- **人天**：未评估。**建议不做**。

### I4 区域和固定出口 IP
- **竞品**：Crawl4AI（EU、新加坡、美国三区）、Browserbase（4 区）、Firecrawl 企业版（固定出口 IP）、Anchor。
- **需求**：中，欧美买家可能会问数据驻留。
- **托管还缺**：现在只有 asia-southeast1；固定出口要走 Direct VPC egress 加 Cloud NAT（NAT 价格**未核实**）。执行面放到 us-central1 更便宜、离美国站更近，但会影响抓到的内容（ADR 0007）。
- **人天**：3–5（本文估算）。
- **依赖**：F0。

---

## J. 集成

### J1 n8n、Make、Zapier、Dify 节点（替代自建画布）
- **竞品**：Firecrawl（官方 n8n 节点，月下载 34,139；Zapier 7 个 action；Dify 插件）、Apify（n8n 月下载 18,250）、Exa、Parallel、Browse AI、ScrapingBee、Anchor、Browser Use（n8n）。
- **需求**：中。r/n8n 上用 Firecrawl 的工作流帖子 1,582 分；但节点下载量只有 SDK 的 0.7%，作为渠道体量不大。
- **本地已有**：SDK 和 CLI。
- **人天**：n8n 节点 3–5（本文估算），Zapier 和 Make 各 2–4（本文估算）。只有 scrape 和 map 时也能先上线。
- **风险**：第三方平台的审核和维护。
- **依赖**：功能越完整价值越高，最好在 A1 之后。

### J2 Google Sheets 函数或插件
- **竞品**：Exa for Sheets、Parallel（`PARALLEL_QUERY`）、Browse AI、Thunderbit。
- **需求**：弱到中。
- **人天**：3（本文估算）。
- **依赖**：A2。

---

## K. 数据目录（类 Alexandria，你提的第 4 项）

### K1 已验证 adapter 目录（`find_adapters` 加 `scrape(adapter=…)`）
- **说明**：一个 `catalog.json`，每项包括 provider、capability、版本、状态（generic、beta、verified）、输入输出 JSON Schema、读取通道、credit 单位、最近一次真实站点测试的记录链接和通过率；Monitor 每天跑少量测试，失败就自动降级。
- **竞品**：Firecrawl Alexandria（`firecrawl_find_tools` 分层浏览，查找免费，执行按能力标价）、Apify Store（91,148 个 Actor）、Octoparse Data Hub、Anchor Action Index、Browserless 预置的 Zillow 爬虫。
- **需求**：市场强，集中在 Google Maps、Instagram、TikTok 这类平台；Octocrawl 用户的需求未知。
- **本地已有**：adapter 注册表 `packages/extract-tf/src/adapters.ts`（`amazon-product@1.0.0`、`reddit-public@1.0.0`、`x-public@1.0.0`，都是 beta），并且已有升级门槛。
- **人天**：3–5（本文估算），不算新增 adapter；每新增一个 adapter 需要若干天，取决于站点。
- **成本驱动**：每个 adapter 的维护人力（随网站改版频率变化），每天真实站点测试的运行费用。
- **风险**：热门平台的服务条款；欧盟数据库特殊权利。
- **依赖**：B1、B2（自动降级要用）；可以先在没有 F0 的情况下作为单次调用上线。

### K2 开放官方数据连接器（SEC EDGAR 等）
- **说明**：Evidence Record 加 `source.kind=official_api`、`license`、`termsUrl`、`attribution`。
- **竞品**：Alexandria（SEC EDGAR、FRED、World Bank、Treasury 等）、Parallel 的免费连接器（PubMed、ClinicalTrials 等）。
- **需求**：中。
- **前提**：`docs/public-web-adapters.md` 写明 adapter "do not call official platform APIs"，所以要先写一份 ADR 改政策。
  - SEC EDGAR 已核实：上限 10 次/秒，必须声明 User-Agent，而且这个上限所有租户共用，需要全局令牌桶（F0 的 `host_state` 或 Valkey）。
  - FRED：条款禁止缓存。OpenSanctions：CC BY-NC。两者暂不接。
- **人天**：5–10 个源的试点 8–15。
- **依赖**：F0（全局限流）、K1。

### K3 公开数据集索引（只收元数据）
- **说明**：只收授权、更新频率、字段结构、落地页 URL，不托管数据，法律风险最低。
- **竞品**：Zyte Datasets 目录、Bright Data（卖数据本身，形态不同）。
- **需求**：弱。
- **人天**：3–5（本文估算）。
- **依赖**：K1。

### K4 授权数据商和给数据方分成
- **竞品**：Alexandria（Wikimedia Enterprise、Benzinga；组织管理员要先接受数据条款；自助分成系统还在 waitlist）、Exa Connect（约 9 家合作方）、Parallel Data Connectors（授权、按次付费、免费、BYOL 四类）、Apify（开发者拿 80%）。
- **需求**：市场强，但 BD 是硬门槛。
- **人天**：100+ 个源约 100–300，主要是商务和法务。
- **成本驱动**：上游授权费和最低承诺额、每次调用的上游费用、分成、付款和税务、KYC。
- **依赖**：D2（由管理员接受条款）、带幂等的账本（参考 Firecrawl 的 `sha256(teamId, x-request-id)`）、合同。**放在最后。**

---

## L. 平台安全和企业控制

### L0 滥用控制（不是企业功能，F0 上线时必须带）
- **说明**：
  - 全局每站并发上限
  - 免 key 档永远不能 crawl
  - 单任务页数上限
  - 新账户逐步放开额度
  - 防批量注册刷每月 1,000 免费 credits（`ROADMAP.md:315`）
  - worker 层继续遵守 robots（`ROADMAP.md:107`）
- **竞品**：Firecrawl（队列上限、48 h 过期）、Bright Data（25 次 429 就封 IP）。
- **本地已有**：robots 处理（`packages/http-core/src/robots.ts`）、`hostedNetworkPolicy`。
- **人天**：2–3（本文估算）。
- **依赖**：和 F0 同时上线。

### L1 SSO（SAML/OIDC）和 SCIM
- **竞品**：Firecrawl、Exa、Kadoa、Gumloop、Clay、ZenRows、Apify 都放在企业档；Browserbase 在 Scale 档；Bright Data 不分档。反方向：Tailscale 和 CISA Secure by Demand 主张 SSO 免费。
- **需求**：现在弱。WorkOS（卖方）的说法是 50–100 个席位的单子会问到；Firecrawl 在产品上线约 15 个月后才做。
- **技术方案**：Identity Platform 多租户，SAML/OIDC 前 50 MAU 免费。
- **人天**：5–8（本文估算）。
- **依赖**：D2。**等企业买家主动来问再做。**

### L2 零数据保留（ZDR）模式
- **竞品**：Firecrawl、Tavily、Exa、Parallel、Browserbase、Anchor、Browser Use 都有。
- **需求**：企业场景中等。
- **说明**：结果不落 GCS，只走流式或 webhook。它和"可追溯"的产品定位有冲突：Evidence Record 可以保留，正文不保留。
- **人天**：2–4（本文估算）。
- **依赖**：C1、B3。

### L3 key 的 IP 白名单
- **竞品**：Firecrawl 企业版、Kadoa 企业版、Clay 企业版。
- **人天**：1（本文估算）。
- **依赖**：D4。

### L4 SOC 2、DPA、条款
- **竞品**：Firecrawl（全档 SOC 2 Type II；DPA 从 Standard 档开始）、Exa、Parallel、Bright Data、Anchor。
- **需求**：一般说法是第一个中型或企业客户会要求。
- **说明**：这主要是审计费和流程成本，不是工程量。DPA 和条款要等 P4 的律师审查（`ROADMAP.md:360`）。

---

## 建议的依赖顺序（只是规划，开工需要 Howard 明确提出）

| 期 | 内容 | 合计人天（估算） | 回答你的哪一项 |
|---|---|---|---|
| **1** | F0 底座 + L0 + D1 数据模型 + A1、A2 + A3 并发和排队 + G1 MCP 异步工具 + C1、C2 + E1 任务 dashboard + F1 | 约 22–37（审计的 A 组 18–31，加 D1、L0、F1、G1 部分）| 并行任务、"画布"的基础 |
| **2** | B1 调度 + B2、B3 monitor 和投递 + D2、D3 邀请角色和切换 + D4、D5 key scope 和预算 + D6 审计 + A4 任务控制 + J1 n8n 节点 | 约 20–32 | 团队 |
| **3** | E2 结果表格 + E3 站点图 + E4 线性管道 + H1 search + H2 自带 key 抽取 + K1 adapter 目录 + I1 托管增强访问 | 约 40–75 | 画布（表格和站点图）、目录第一步 |
| **4** | K2、K3 官方和开放数据 + E5 节点画布（如果有付费需求）+ L1、L2 企业控制 + K4 授权数据商 | 50 到 300+ | 节点画布、Alexandria |

**关键依赖链**：F0 → A1/A2 → (A3, G1, E1, C1) → B1 → B2/B3 → E2/E4 → E5。D1 必须和 F0 同时做；L0 必须和 A1 同时上线；K4 依赖 D2 和账本。

## 成本由什么决定（只列项，不定价）

1. 浏览器秒数和承诺给用户的并发，这是最大的一项。
2. 住宅代理流量和验证码次数。
3. LLM token，主要来自表格格子、抽取、monitor 判定。
4. monitor 和定时任务的频率乘以页数。
5. 固定资源：Cloud SQL、常驻 worker 和 API 实例、以后的 Valkey。
6. 出站流量（新加坡约 $0.12/GiB）。
7. 结果保留时长：存储费很小，主要影响数据库体积。
8. 数据源授权费和分成（后期，而且是大头）。
9. 每个 adapter 的维护人力和每天真实站点测试。
10. SOC 2 审计和法律审查。

月固定成本（估算，新加坡牌价，不含按量部分）：第 1 期约 $16–60，常驻一个 worker 加一个 API 实例时约 $100–180；第 2 期约 $300–600；自管浏览器机群约 $800–2,000+。**每千页的实际成本未知**：ROADMAP PH 第 3 项要求的两周成本记录还没写（`research/hosted/` 里没有）。

## 未知和未核实（附查过哪里）

- **Octocrawl 托管服务的真实外部用量：未知。** 仓库里没有外部用户的用量记录，`research/trials/` 在 origin/main 上不存在；Cloud Logging 里的 `hosted_usage` 能回答这个问题，但我没有读生产日志。所有"对 Octocrawl 用户的需求"判断都缺少这项数据。
- 结果表格对开发者和 agent 用户有没有需求：没有验证过；现有证据来自 GTM 和研究类用户。
- 站点图：没有找到直接需求，也没找到搜索量数据。
- 竞品数字有冲突的，按出处取文档：Firecrawl 并发（文档和定价页不一致）、Apify 免费档并发（25 对 5）、Octoparse（3 个进程对 6 个节点）、Browserless 排队还是 429。
- Cloud Run、Firestore 的平台限额，Cloud NAT、AlloyDB 的价格，DBOS 在万页级扇出下的表现，Cloudflare 透传 SSE 的行为：都没有核实。
- `packages/runtime/src/pageCache.ts`、`packages/api/src/pdfFields.ts` 的具体能力这次没读，C6 和 H4 里对本地现状的描述**未核实**。
- 本次核对：`git fetch` 后 `origin/main` = `efdfb11c`；文中引用的源码路径都用 `git cat-file -e` 确认存在；行号沿用上游审计，没有逐行复核。仓库没有改动。