# Octocrawl 云端商业补齐方案（2026-10-18）

**怎么来的：** 一共 23 个 agent。
- 15 家竞品（Firecrawl、Tavily、Exa、Crawl4AI、ZenRows、ScrapingBee、ScraperAPI、Apify、Bright Data、Spider、Browserless、Browserbase、Steel、Hyperbrowser、Jina）的定价、功能、MCP 和开源边界，每家都由两个独立的 agent 先后去官方页面查一遍、再核对一遍，抓取日期都是 2026-10-18。
- 另外做了四项调研：我们自己的成本（gcloud 只读读数加公开标价）、云端补齐每一项的工程量、开源商业模式、市场需求。
- 方案部分：3 个角度各写一版，评审打分后合成一版，最后由一个 critic 专门挑毛病。

**这份文件的结构：**
1. 「最终建议」：我根据 critic 的意见修订后的结论，**读这一节就够了**；
2. 「方案正文」：评审合成的完整版，写错的竞品事实已经更正，标了【审查更正】或【状态更新】；
3. 「附录」：critic 的完整意见。

所有数字都注明了来源，或者标成「估算」「未知」。竞品价格会变，以抓取日期为准。

---

# 最终建议（审查后修订）

## 一句话

**本地版保持免费、完整，这一点不变。托管版要想收到钱，就得有本地做不到的能力。不过在写收款代码之前，先用两周证明三件事：**
1. 能合法地收到钱；
2. 有人愿意付钱；
3. 在聊天客户端里，托管版比客户端自带的联网功能更好用。

## 相对正文，审查后改了这 6 处

1. **「能不能收钱」放到最前面（第 0 关，W1–2）。**
   - 要拿到这三样：卖家主体和注册地、Paddle 或 Lemon Squeezy 关于「代用户抓取网页」这类业务能不能开户的**书面答复**、律师审阅 Terms/Privacy/AUP 的报价。
   - 任何一项不成立，W2–4 的收款工程就不做。正文原来把它和其他事项并列放在 W1，这是低估了。
2. **先验证付费意愿，再写 checkout。**
   - 价格页先放一个假购买按钮（fake door），统计点击。
   - 直接访谈现在的真实用户。
   - 统计有多少用户用满了每月 1,000 的免费额度，现在是 0：一周里 4 个 uid 一共只扣了 106 credits。
   - 按现在的用量，正文里的转化路径（额度用尽，返回 `quota_exhausted`，再去买包）根本不会被触发。
3. **同一天做三方对照，对外只用托管层的实测数字。**
   - 同一组 92 个任务，分别跑：托管版、Firecrawl 托管版、本地版（家庭宽带 IP）。
   - 在 claude.ai 和 ChatGPT 里，拿 Octocrawl connector 和客户端**自带的联网功能**比 10 个任务。正文完全没提这个替代品，而它恰恰是聊天用户最直接的选择。
   - 现在的「55–56 对 67」「假成功 5 对 14」都来自本地增强路线，**托管层从来没测过**。
4. **云端独占的能力要提前。**
   - 正文把增强访问排在 W11，而且「不对外」。这样 12 周里卖的是托管版最弱的那个版本：遵守 robots、数据中心 IP、没有增强访问，只多了「远程能连上」这一条。
   - 改成：在**托管 Monitor**（电脑关机也在跑）和**托管增强访问**（按成本加成转售 Unlocker，核实率要先有实验数据）里**选一个**，作为付费的核心卖点，在 W6–8 做。两个都做的话，人日超出容量。
5. **付费的价值要放在「能力」上，而不是「量」上。**
   - 免费层一年送 12,000 credits，比一个 Starter 包（10,000）还多，轻度用户永远不用买。
   - 付费档应该解锁的是：crawl、Monitor、增强访问、更高并发。
   - 卖一次性包还是月订阅，等 fake door 测完再定。可以两种都放上去测。
6. **其他更正：**
   - 常驻 worker 的成本，低端的 $27 用错了口径：后台任务要 CPU 常驻，约 $68/月；要是用 VM 加持久盘，价格未知。
   - search 不能假设 Serper 能转售。先做「用户自带 key」，或者找一家书面允许转售、每千次不超过 $1 的供应商。
   - 风险表要加一条：托管 API 和官网在同一个 GCP 项目里，一次滥用投诉就可能连官网和登录一起下线。建议把它们拆到不同项目。
   - 人日实际是 27–45，超过「托管约 30 天」的容量，所以第 4 条只能二选一。

## 需要你拍板的 5 件事

1. **卖家主体和收款地：** 个人还是公司、在哪个国家。这决定 MoR 能不能开户，是第一道关。
2. **浏览器页从 5 credits 降到 2 吗？** 5 倍是所有竞品里最陡的：Firecrawl 1 倍，Tavily 和 Crawl4AI 2 倍。
3. **付费的核心卖点：** 托管 Monitor 还是托管增强访问？
4. **一次性包还是月订阅：** 建议用 fake door 两种都测。
5. **律师审阅的预算。**

## 压缩后的 12 周

| 周 | 做什么 | 门槛 |
|---|---|---|
| W1–2 | 第 0 关：收款和法律的书面答复；fake door；用户访谈；三方 92 任务对照；聊天客户端里和内置联网的对照；两周实际账单 | 拿到可行的收款路径，**并且**有付费信号（fake door 有点击，或者有用户明说要付） |
| W3–5 | 收款闭环、新计费规则、`/fc/v1` 兼容、无状态小批量、漏斗埋点（正文第 1、2、4、5 项） | 沙箱跑通；Howard 自己真实买一次并成功退款 |
| W6–8 | 一项云端独占能力（Monitor 或增强访问） | 有成本记录；有一个真实用户在用 |
| W9 | 评审门：用真实账单重算毛利 | 毛利不低于 60%；有一个非 Howard 的付费账户 |
| W10–12 | 第二项能力，或者 search（自带 key），或者做分发 | 按 W9 的结果决定 |

**判断要不要继续的标准：** 如果第 0 关两周都没有付费信号，就先停下收款工程，把时间放回 PA（访问能力）和分发上。

---

# 方案正文（评审合成版，已按审查更正事实）

# 结论

**核心决策**
- 本地 AGPL 版保持完整、免费、不计量，许可证不改。
- 托管版卖四样本地给不了的东西：
  1. 聊天客户端（claude.ai、ChatGPT、Codex）能直接连上的远程 MCP；
  2. 电脑关机时也在跑的 crawl、batch 和 Monitor；
  3. 不用自己运维；
  4. 每笔扣费都对得上一条 Evidence Record，失败不收钱。
- 最后这一条是对外的差异点。依据是 92 个任务的基准：Octocrawl 核实 55–56 个、假成功 5 个，Firecrawl 核实 67 个、假成功 14 个（ROADMAP PA item 9）。按这组数算，Octocrawl "说成功时真成功"的比例是 55/60 = 91.7%，Firecrawl 是 67/81 = 82.7%（估算）。
- 这组数来自本地增强路线，托管层从来没跑过这 92 个任务（工程调研）。所以第 1 周先在托管层测一轮，测完之前不对外讲成功率。

**要做什么（按顺序）**
1. 第 1 周先测量，同时处理外部关卡：
   - 实际账单；
   - 托管层 92 任务基线；
   - 托管浏览器页耗时分布；
   - ROADMAP 外部试用门（2026-10-17 截止）的结果，main 上没有记录，状态未知；
   - MoR、OpenAI 开发者身份验证、Claude 目录提交、律师审阅。
2. 第 2–4 周做收款闭环、新计费规则、`/fc/v1` 兼容端点、无状态小批量、漏斗埋点，第 4 周收真钱。
3. 第 5–6 周做 search。
4. 第 7 周过评审门。有付费需求才在第 8–10 周做常驻 worker、托管 crawl 和 Monitor。
5. 第 11 周做增强访问实验，不对外。
6. 12 周内不做托管 actions/interact、Octocrawl 出钱的模型、团队账户、闭源 Pro 包。

**怎么定价（建议，要 Howard 拍板）**
- 一次性 credit 包，12 个月有效：$10 买 10,000、$40 买 50,000、$150 买 200,000。
- 浏览器页从 5 credits 降到 2（`packages/mcp/src/hostedCredits.ts:26`），托管浏览器每页 30 s 渲染预算封顶。
- HTTP 页、404、map 维持 1。被拦、挑战页、robots 拒绝、没读到维持 0（`hostedCredits.ts:8-13`）。
- 新增"假成功退款"，每账户每月设上限。
- search 每次 3 credits，只用每千次不超过 $1 且允许转售的供应商；找不到就先做用户自带 key。

**预期（估算）**
- 毛利：按实测用量结构，三档都在 68–83%。全浏览器、每页 25 s 时降到 26–38%。30 s 封顶的最坏情况仍为正（12–28%）。
- 固定成本：今天约 $11–15/月。加常驻 worker 后约 $29–74/月，需要 5–11 个 Starter 包，或 1 个 Scale 包。
- 第 12 周目标（不是预测）：至少 5 个非 Howard 的付费账户，其中至少 2 个复购；至少 1 个目录正式上架。

---

# 一、市场与竞品

所有竞品数据都是 2026-10-18 抓取官方页面核实的。每千页价格是各家套餐价除以额度（竞品核实资料里已算好）。

## 1.1 定价和每千页价格

| 厂商 | 免费额度 | 入门付费 | 普通页 /千 | JS/浏览器页 /千 | 失败计费 | 来源 |
|---|---|---|---|---|---|---|
| Firecrawl | 每月 1,000，不用绑卡 | Hobby $19/月（年付 $16），5,000 | Hobby $3.80；Standard $0.99；Growth $0.798；Scale $0.749 | 同普通页，enhanced proxy +0 | 返回了文档的 403/404 收 1；没返回文档才是 0 | https://www.firecrawl.dev/pricing.md ，https://docs.firecrawl.dev/billing.md |
| Crawl4AI Cloud | 访客 20，验证邮箱后每月 1,000 | Starter $10/月，10,000 | $0.50；Builder $0.396 | $1.00；难站 $2.00 | 403/502/503/500 和取消的不收；价格写明 soft launch | https://crawl4ai.com/ ，https://api.crawl4ai.com/v1/prices |
| Tavily | 每月 1,000 | Project $30/月，4,000 | extract basic $1.50；Growth $1.00；按量 $1.60 | advanced $3.00；Growth $2.00 | 抽取失败不收 | https://www.tavily.com/pricing ，https://docs.tavily.com/documentation/api-credits.md |
| Exa | 每月 $10 | 预付，自动充值 $5 起 | `/contents` $1.00 | $1.00 | API key 计费下没写明 | https://exa.ai/pricing |
| ZenRows | 每月 5,000 | B1 $19/月，45,000 | $0.42；L1 $0.28 | $2.11；JS+premium $10.56 | 失败 0，404/410 收 | https://www.zenrows.com/pricing.md |
| ScrapingBee | 一次性 1,000 | Hobby $19/月，75,000 | $0.25 | $1.27（JS 默认开） | 200/404/410 收，403 不收 | https://www.scrapingbee.com/pricing/ |
| ScraperAPI | 每月 1,000 | Hobby $49/月，100,000 | $0.49 | $4.90 | 200/404 收，客户端取消的也收 | https://www.scraperapi.com/pricing/ |
| Apify Web Fetch | 每月 $5 用量 | Starter $19/月 | $1.50；Business $1.00 | 同价 | 只收成功 | https://apify.com/apify/web-fetch |
| Bright Data Web Unlocker | 每月 5,000 credits | 按量 | $1.50；$1,999 档 $1.00 | 同价（是否加价未确认） | 只收成功 | https://brightdata.com/pricing/web-unlocker |
| Hyperbrowser | 5,000（是否每月未知） | Startup $30/月 | $1.00（每页都走浏览器） | $1.00；JSON $6；代理 $10 | 未知 | https://www.hyperbrowser.ai/pricing |
| Spider | 注册送余额（金额未知） | 充值 $5 起 | 标价 $0.02–0.10 | $0.035–0.155 | 官方说法互相矛盾 | https://spider.cloud/pricing/ |
| Browserless | 每月 1k units | Prototyping $35/月（年付 $25）；Starter $200/月是中间档【审查更正】 | 至少 1 unit | 一页一会话约 $1.11 | 启动前被拒的不收 | https://www.browserless.io/pricing |
| Browserbase | 1,000 次 Fetch | Developer $20/月 | Fetch raw $1.00；markdown $4.00 | 会话 $2.00–3.33 | — | https://www.browserbase.com/pricing |
| Steel | 一次性 $30 | Launch $0 + 用量 | `/scrape` $5.00 | $5.00 | — | https://steel.dev/pricing |
| Jina Reader | 新 key 送 10M token | 1B token $50 | 按输出 token 计，4 页样本 $0.02–0.63 | 同 | 失败不扣 | https://jina.ai/reader/ |

## 1.2 功能、MCP、开源和云端分界

| 厂商 | crawl / map / search / Monitor | MCP 认证 | Claude 目录 | 开源和云端分界 |
|---|---|---|---|---|
| Firecrawl | 全有，Monitor 1 credit/页/次，最短 5 分钟 | 免 key、OAuth、key | 已上架，目录版只开 8 个工具 | AGPL；Fire-engine、截图、actions、Agent 只在云端 |
| Tavily | 全有，没有 Monitor | OAuth、key、免 key（免 key 只能 Search/Extract） | 已上架（2026-03） | 只开源客户端（MIT） |
| Exa | 搜索优先，没有 crawl/map，Monitor 只发现新结果 | 免 key、OAuth | 已上架；ChatGPT 也上架（v4.0.1） | 只开源客户端 |
| Crawl4AI | `/scan`、`/site`、Monitor 有文档但没开放 | 只有 key | 没上架 | 库是 Apache-2.0 加署名要求；搜索和代理阶梯只在云端 |
| ZenRows | crawl 有；search/Monitor 标"pending launch" | OAuth（token 就是 API key） | 没上架 | 只开源客户端 |
| Apify | 都靠 Actor 实现 | OAuth、key、x402 | 很可能已上架（claude.com/marketplace/connectors/apify 两次返回 200）【审查更正】 | Crawlee 开源；Web Fetch 闭源 |
| Bright Data | 有 Crawl API，没有 Monitor | OAuth 2.1、key，没有免 key | 没上架；Claude Code 插件市场里有（21 个 skills） | 只开源客户端 |
| Spider | 有 crawl/links/search，没有 Monitor | OAuth、key | 没上架；MCP Registry 有 | 核心 MIT；浏览器和代理网络在云端 |
| Browserless | crawl/map/search 只在云端 | OAuth、key | 没上架；MCP Registry 有 | SSPL 或商业许可 |
| ScrapingBee / ScraperAPI | 托管 crawl：ScrapingBee 没有，ScraperAPI 有 | 只有 key | 没上架 | 闭源 |

## 1.3 需求侧证据（需求调研，2026-10-18 调 npm/PyPI/Registry API）

- **搜索比抓取用量大。** 搜索类 SDK 月下载合计约 20.6M，抓取类约 11.8M。
- **Octocrawl 的分发量还很小。** firecrawl-mcp 每月 585k 下载，@octocrawl/mcp 是 1,180。
- **托管是主流。** 官方 MCP Registry 去重后 14,589 个 server，82.9% 只有远程端点。这个数据不完整，抓到 401 页上限就停了。
- **agent 框架给了接入口。** Hermes 默认后端是 Firecrawl，可以通过 `FIRECRAWL_API_URL` 换掉（https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search）。OpenClaw 的 web_fetch 失败时回退到 Firecrawl（https://docs.openclaw.ai/tools/web）。
- **开发者抱怨（都是轶事）：**
  - credit 乘数不透明：开 JSON 加 Enhanced Mode 后每页 5–9 credits（r/ProxyEngineering，2026-05-18）。
  - credits 月底清零（r/n8n，2026-01-05）。
  - Cloudflare 拦截。

---

# 二、我们的成本与毛利

成本数据来自内部成本调研：2026-10-18 用 gcloud、Monitoring 和 Logging 做的只读读数，还没写进仓库；单价来自公开标价。下面都是标价、扣免费额度之前的数。

## 2.1 每种操作的成本（估算）

| 操作 | 每千次成本 | 依据 |
|---|---|---|
| HTTP 页 | 中位约 $0.059，区间 $0.017–0.13 | 实测 REST 均值 1.04 s × $0.0000406/s，加请求、Firestore、出网 73 KB |
| HTTP 页，按今天的低流量摊冷启动 | 约 $0.29 | 实测 2,817 计费秒和 139 次冷启动，分母约 456 次调用 |
| 浏览器页 | 10 s 中位约 $0.42；6 s $0.26；25 s $1.03；30 s 封顶约 $1.24；100 s 超时约 $4.1 | 托管浏览器页实测 9.0 s（`research/hosted/2026-10-17-mcp-vs-firecrawl-9c971756.md:53`）；本地中位 6.1 s（`research/access/runs/2026-10-12-pa4-92-main-48fd6e17.md`） |
| 浏览器页 + Webshare 住宅 | $10.5–11.7（$1.50/GB 套餐时 $4.8–5.3） | 每页 2.89–3.22 MB（`research/access/runs/2026-10-11-pa4-3arm-a-residential-e3b9d37.md:55`，`...-pa4-92-residential-scroll-cd9d9e7.md:152`） |
| Steel 住宅档（实测） | 每千次调用 $38.6，每千个核实结果 $116 | `research/access/runs/2026-10-11-pa4-92-residential-scroll-cd9d9e7.md:16,152` |
| search | 供应商价加自身开销 $0.03–0.06。Serper $0.30–1.00，Exa instant $4，Brave $5，Tavily basic $7.5–8 | 各家价格页（成本调研） |
| 100 页 crawl | HTTP $0.004–0.007；浏览器 $0.03–0.04 | 含同站 250 ms 间隔（`packages/contracts/src/policy.ts:96`） |
| Monitor 每次检查 | 约等于一个 HTTP 页 | 估算 |

## 2.2 每月固定成本

- **今天约 $11–15/月（估算）。** 大头是 Artifact Registry：实测 108,405 MB，约 $10/月。加清理策略后能降到约 $1/月（估算）。
- **Cloud Run 用量在免费额度内。** 实际账单没读到，未知。
- **第二阶段常驻 worker 每月多 $27–68（估算）。** 1 个空闲 min instance 约 $27；instance-based 常开约 $68。

## 2.3 免费层成本（估算）

- 一个读满 1,000 credits 的用户，每月约 $0.07–0.12（含 14% 不计费调用，这个比例来自账户日志 unread 12/86）。
- 浏览器页改成 2 credits 后，用满就是 500 个浏览器页，约 $0.21。
- Cloud Run 免费额度大约够 120 个读满 HTTP 的用户。
- 先卡住的不是成本，是 `W2L_SITE_DAILY=1500`：每月 4.5 万页，相当于约 45 个读满的用户。
- 实测用量：2026-10-11 到 18 日，4 个 uid（其中 1 个是测试账户）一共扣了 106 credits。

## 2.4 毛利（估算）

**算式：** 毛利 = (收入 − MoR 手续费 − 变量成本) / 收入。

**口径说明：**
- MoR 手续费按每笔 5% + $0.50 算（https://www.paddle.com/pricing ，https://www.lemonsqueezy.com/pricing ）。
- "实测用量结构"取账户日志：HTTP 57、浏览器 8、map 6、not_found 3。按新规则折成 82 credits，每千 credits 成本 $0.088–0.197。

| 档 | 实测用量结构 | 全 HTTP | 全 HTTP（今天的低流量） | 全浏览器 10 s | 全浏览器 25 s | 全浏览器 30 s 封顶 |
|---|---|---|---|---|---|---|
| Starter $10 | 70–81% | 78–84% | 61% | 69% | 38% | 28% |
| Builder $40 | 69–83% | 79–86% | 58% | 68% | 29% | 16% |
| Scale $150 | 68–83% | 79–87% | 56% | 67% | 26% | 12% |

**search 定 3 credits 一次时的毛利（扣 MoR 之前）：**
- Serper $0.30：85–89%。
- Serper $1.00：53–65%。
- Exa instant $4：−35% 到 −80%。
- Brave $5：−69% 到 −125%。

**增强访问试算：**
- Webshare 住宅浏览器页按 25 credits/页：38–58%。
- 转售 Bright Data Unlocker 按 4 credits/页：48–61%。核实通过率未知。
- Steel 住宅档按实测成本不可行。

**结论：**
- HTTP 页毛利很稳，浏览器页的毛利几乎全看每页耗时，所以 30 s 封顶是必需的。
- search 只能接低价供应商。
- 增强访问只能按成本加成卖。

---

# 三、核心商业决策：本地免费 vs 云端收费

## 3.1 原则

- **代码免费，运营和基础设施收费。**
- **已有功能不搬进付费墙。** ROADMAP Free core 一节写过：AGPL 代码里的限制谁都能删，加了还伤信任。
- **参照的案例（开源商业模式调研）：**
  - MongoDB Atlas 占 FY2026 收入的 72–75%（https://www.nasdaq.com/articles/mongodb-revenue-jumps-24-fiscal-q2 ）。
  - 爬虫类产品云端独占的都是基础设施：Firecrawl 的 Fire-engine，Browserless 的 stealth 和住宅代理。

## 3.2 分界

| 能力 | 本地（AGPL） | 托管免费 | 托管付费 |
|---|---|---|---|
| scrape、map、scrape_product | 不限 | 带 key 每月 1,000 credits；免 key 每 IP 每天约 20 页 | 按 credits |
| 小批量（同步，最多 10–20 个 URL） | batch 不限 | 计入 credits | 按页（W4） |
| search | 自带 SearXNG 或自己的 key（P5） | 计入 credits | 每次 3（W5–6） |
| crawl、异步 batch、Monitor、签名投递 | 不限，但要机器开着 | 不提供 | 按页或按次检查（W8–10，有评审门） |
| 增强访问 | 自带代理和 CAPTCHA 供应商 | 不提供 | 第二阶段按成本加成，12 周内只做实验 |
| my-browser、saved logins、actions | 免费 | 不提供 | 不提供（隔离和滥用风险） |
| Evidence Record、robots 决定、`cannot_verify` | 全部 | 全部 | 全部，不收费 |

## 3.3 有本地免费版，为什么还有人付钱（按证据强弱排）

1. **聊天客户端的用户跑不了本地版。** claude.ai 网页版、手机版和 ChatGPT 只能连远程 MCP（https://support.claude.com/en/articles/11175166-about-custom-connectors-remote-mcp ，https://developers.openai.com/api/docs/guides/developer-mode ）。对这批人，托管版就是全部产品。
2. **"本地 MCP"大多其实是调云端的薄客户端。** firecrawl-mcp、tavily-mcp、exa-mcp-server 都要 API key 去调云端，用户已经习惯为云端付钱（需求调研）。自建 Firecrawl 空闲时就占约 2.5 GB 内存（轶事），而且自托管版没有 Fire-engine（https://docs.firecrawl.dev/contributing/self-host ）。
3. **电脑关着也要跑。** 这一项要等常驻 worker 做好。
4. **扣费可追溯、失败不收钱（假设，需求证据弱）。** Spider 和 Crawl4AI 都开始把"出处"当卖点，但没有一家同时提供 robots 决定和内容哈希（竞品核实）。
   - 示意（估算，前提是托管层的数字接近本地）：按"每千个核实页"算，Firecrawl Hobby 约 $3.80 × 81/67 ≈ $4.59。这是下限，因为它对返回文档的 403/404 也收费，那部分页数未知。Octocrawl $10 包的 HTTP 页约 $1.09，浏览器页约 $2.18。
5. **反面证据：爱好者只要免费。** 免费本地工具的帖子能拿到 527 和 621 赞（轶事）。本地版接住这批人，换口碑和分发，不指望他们付钱。

## 3.4 许可证

- **保持 AGPL。** Elastic（2024）、Redis（2025）都加回了 AGPL，Cal.com 闭源后社区反应偏负面（开源商业模式调研）。
- **现在可以随时双许可。** origin/main 上唯一的人类作者是 77777R7（1,934 个 commit），另有 6 个 commit 来自 Claude（`gh api .../contributors`）。
- **合入第一个外部 PR 之前，二选一：** 加 CLA，或者把计费、滥用控制、供应商路由放进独立的私有服务（ROADMAP 第 427 行已有这条规则）。

---

# 四、云端补齐清单

**人日口径：** 一个人加 AI agent，含测试、真实站点验证和写记录，不含等人的时间（工程调研）。

**时间安排：** PA 仍是第一优先（Howard，2026-10-09），托管工作按大约一半时间排。12 周约 60 个工作日，托管能用约 30 天；下表 #0–#7 合计约 17–30 人日（估算），在容量之内。

| # | 项目 | 人日 | 单位成本 | 需求依据 | 前置 |
|---|---|---|---|---|---|
| 0 | 测量：托管 92 任务基线一轮；浏览器耗时 p50/p95；两周成本记录；漏斗埋点 | 基线每轮 1–2；埋点 0.5–1（估算） | 几乎为 0 | 托管通过率从没测过 | 无 |
| 1 | 收款：MoR checkout，webhook 验签后按订单号幂等增加 `purchased`，退款和拒付（余额为负时拒绝调用），价格页 | 2–4 | 每笔 5% + $0.50 | 没有收款就没有收入；`purchased` 字段和扣费顺序已经实现（`hostedCredits.ts:141-155`） | MoR KYC，律师审阅，卖家注册地 |
| 2 | 计费规则：浏览器页 5→2，30 s 渲染预算，API 余额端点，把站点日上限拆成免费池和付费池 | 余额端点 0.5–1；其余约 1（估算） | — | 矩阵里 `platform.usage.credit-balance` 是 missing；日上限每月 4.5 万页 | 和 1 一起 |
| 3 | 假成功退款：`report_false_success` 接口和 MCP 工具，自动退那次调用的 credits，每月有上限 | 未估（资料里没有） | 只是退回的 credits | 差异化卖点；上报样本可以直接喂给 PA item 10 | 和 1 一起 |
| 4 | 托管端开放 `/fc/v1/scrape` 和 `/fc/v1/map` | 约 1 | 同 scrape | firecrawl-js 每月 5.18M、firecrawl-py 5.34M 下载；Hermes 的 `FIRECRAWL_API_URL` | 矩阵记录过 `/fc` 会丢部分 formats，要先测 |
| 5 | 无状态小批量（10–20 个 URL，100 s 内）和 MCP batch 工具 | 1–2 | 同页面价格 | Tavily extract 支持 1–20 个 URL，Exa 1–100 个，Bright Data scrape_batch 最多 10 个 | 无 |
| 6 | search：REST、MCP、`/fc/v1/search`；响应带 `provider`；后端失败返回 `cannot_verify` | 3–5 | 供应商费加 $0.03–0.06/千次 | 需求最大的一类；Firecrawl 免 key 层就开了 search | 先查供应商的转售和缓存条款（未知） |
| 7 | 常驻 worker（方案 A：单 worker 继续用 SQLite），租户隔离，托管 crawl，异步 batch，分块预扣 | crawl 4–6，batch 1–2 | 固定成本 +$27–68/月 | Hermes 的后端里只有 Firecrawl 和 Tavily 支持整站爬 | W7 评审门；全服务统一的按 host 限速 |
| 8 | 托管 Monitor（先做 webhook），变更时附前后 Evidence 哈希 | 3–5；邮件通知再加 1–2 | 每次检查约等于一个 HTTP 页 | Firecrawl、Crawl4AI、Exa 都有；直接的用量证据未知 | worker 做好；Howard 解除 Paused |
| 9 | 增强访问实验（不对外）：ADR 0005 修订草案，托管 vendor 通道，在 22 个没拿下的任务上试 Unlocker | 3–5，基线每轮 1–2 | Unlocker 按量 $1.50/千次 | 没拿下的 22 个里 Cloudflare 7 个、bot 检测 6 个（ROADMAP PA item 9） | 确认是否碰到 `identity_rotation` 这条 REFUSED_FOREVER 规则 |
| — | BYOK 模型抽取 | 单页 2–3 | 对我方约 0 | Firecrawl JSON 每页 +4 | 12 周内只在 W10 有余力时做 |
| — | 不做：托管 actions/interact（持久会话 8–15 天）、组织账户（4–6 天）、Octocrawl 出钱的模型、自有搜索索引、闭源 Pro 包 | — | — | 滥用风险最高，或者目前没人要 | — |

---

# 五、定价方案

## 5.1 每种操作扣多少 credits（建议）

| 操作 | 现行（代码） | 建议 | 理由 |
|---|---|---|---|
| HTTP 页 | 1 | 1 | — |
| 浏览器页 | 5 | **2**，每页 30 s 封顶 | 5 倍是样本里最陡的倍数（Firecrawl 1 倍，Crawl4AI 和 Tavily 2 倍，ZenRows 5 倍，ScraperAPI 10 倍）；通道是自动选的，用户控制不了 |
| 404/410 | 1 | 1 | 和 Firecrawl、ZenRows、ScrapingBee、ScraperAPI 一样 |
| 被拦、挑战页、robots 拒绝、没读到 | 0 | 0 | 卖点 |
| 假成功 | — | 上报后退还 | 每账户每月设上限 |
| map | 每次 1 | 每次 1 | — |
| 小批量和 crawl 的每一页 | — | 同 scrape，不另收任务费 | Firecrawl crawl 也是每页 1 |
| search（最多 10 条结果） | — | 每次 3，抓结果页另按页计 | 毛利见 2.4 |
| Monitor 检查 | — | HTTP 1，浏览器 2，出错为 0；付费最短间隔 5 分钟 | Firecrawl 出错也收 1 |
| 确定性 JSON 抽取 | +0 | +0 | Firecrawl JSON +4 |
| 增强访问 | 托管端拒绝 | 第二阶段按成本加成，调用前显示上限 | ROADMAP PH 的 Credits 一节 |

## 5.2 档位（建议）

| 档 | 价格 | credits | 每千 credits | 有效期 | 用完之后 |
|---|---|---|---|---|---|
| Free | $0 | 每月 1,000，外加免 key 额度 | — | 当月 | 返回 429 `quota_exhausted`，附购买链接 |
| Starter 包 | $10 一次性 | 10,000 | $1.00 | 12 个月 | 再买一个包，不允许透支 |
| Builder 包 | $40 一次性 | 50,000 | $0.80 | 12 个月 | 同上 |
| Scale 包 | $150 一次性 | 200,000 | $0.75 | 12 个月 | 同上 |
| Enterprise | 联系我们 | — | — | — | 价格页只放一行接询价 |

- **为什么先只卖一次性包：** 不用处理续费、降级、按比例退款，工程量最小。Exa、Spider、Jina 都有预付方式（竞品核实）；不过 Spider 也有月订阅、Exa 也有 Websets 订阅【审查更正】。
- **为什么是 12 个月：** Hyperbrowser 的额外 credits 是 12 个月有效（竞品核实）。这样预收款的负债锁在一年内，又比"月底清零"好得多。
- **单 key 并发：** Free 1，付费 2。整个服务现在只有 6 个并发槽（`--max-instances=3` × `--concurrency=2`，`docs/hosted-api.md`）。
- **月付订阅：** 至少 5 个账户复购之后，在 W11 再评估。

## 5.3 和竞品逐项对比（竞品数据 2026-10-18 核实，来源同 1.1）

| 项目 | Octocrawl（建议） | Firecrawl | Tavily | Crawl4AI | ZenRows | Exa |
|---|---|---|---|---|---|---|
| 普通页 /千 | $1.00 / $0.80 / $0.75 | $3.80（Hobby）/ $0.99（Standard） | $1.50 / $1.00 | $0.50 / $0.396 | $0.42 / $0.28 | $1.00 |
| 浏览器页 /千 | $2.00 / $1.60 / $1.50 | 同普通页 | $3.00 / $2.00 | $1.00 / $0.792 | $2.11 / $1.38 | $1.00 |
| 被拦或 403 | 0 | 返回了文档就收 1 | 失败不收 | 不收 | 不收 | 未写明 |
| map | 每次 1 credit | 1 credit（按次还是按页，两处文档矛盾） | $0.50–0.80/千 URL | 未开放 | 用 crawl 实现 | 没有 |
| search /千次 | $3.00 / $2.40 / $2.25 | $7.60（Hobby）/ $1.98（Standard） | $7.50（Project） | $1.00 | 没有 | $4（instant） |
| Monitor 每次检查 | 1 credit，出错 0 | 1，出错也收 | 没有 | 1，确认的变化 +3 | 没有 | $15/千次 |
| JSON 抽取 | 确定性 +0 | +4 | 只在 Research 里 | 按 token | 只限预备好的域名 | summary $1/千页 |
| 最低付费 | $10 一次性 | $19/月 | $30/月 | $10/月 | $19/月 | 预付 |
| 有效期 | 12 个月 | 套餐 credits 不结转 | 每月 1 日重置 | 额外 credits 不过期 | top-up 结转一次 | 免费额度每月重置 |
| 出处记录 | Evidence Record（robots 决定、哈希） | 资料里没查到 | 没有 | engine、exit、content_hash | `X-Request-Cost` 头 | 状态和费用估算 |

**定位：**
- Starter 的 $1.00/千页落在 Exa、Hyperbrowser（$1.00）、Tavily Growth（$1.00）、Apify Web Fetch（$1.00–1.50）这一档，约为 Firecrawl Hobby 的 26%。
- 传统抓取 API 更便宜，不去拼底价：ScrapingBee $0.25、ZenRows $0.42、Spider $0.02–0.10。

**已知弱点：**
- 浏览器页相对 Firecrawl Standard 贵：$1.50–2.00 对 $0.99。JS 重度用户会选 Firecrawl。
- 补救只有一条路：把托管浏览器页的中位耗时降下来，再降到 1 credit。这需要第 1 周的耗时数据。

## 5.4 护栏和调价触发条件（建议）

- 托管浏览器每页 30 s 渲染预算。不设的话，100 s 超时的最坏情况是每千页约 $4.1（估算），任何档位都亏。
- 每个 key 每天不计费的浏览器尝试，不超过当天计费页数再加一个固定余量。防止有人拿免费的 Cloudflare 失败页反复刷。
- 两周实测里浏览器页 p90 超过 20 s，或者不计费的浏览器尝试超过 30% 时，有两个选项：
  - 浏览器页调到 3 credits；
  - 或者改成"2 credits 含 20 s，之后每多 10 s 加 1"（parity 草案的时长规则）。
- $40 预算告警和 `--max-instances=3` 先不动，有量了再调。

---

# 六、分发与转化

| 渠道 | 现状 | 动作 | 周 |
|---|---|---|---|
| Claude connector 目录（973 个） | **已提交**（2026-10-18，插件包和 MCP connector 各一份，等审核）【状态更新】 | 等审核结果 | — |
| Claude Code 官方插件市场（315 个） | 未上架；firecrawl、brightdata、tavily、exa、zyte 都在，Exa 插件 5,255 次安装 | 提交"远程 MCP + skill"形式的插件 | W2–3 |
| ChatGPT / Codex 插件目录 | #587 已合入；**OpenAI 身份验证被拒，已发邮件申诉**；实测 Codex 自建 marketplace 只能加载 skill、加载不了远程 MCP【状态更新】 | W1 开始做开发者身份验证；修好加载；准备审核用例和演示录像（ZenRows 的包就卡在这两项）。Codex 不接受 .mcpb | W1 起，W5–6 提交 |
| MCP Registry、Smithery | Registry 已有 0.5.0；Smithery useCount 是 0 | 每次功能上线发新版 | 持续 |
| Hermes、OpenClaw | 用户可以通过 `FIRECRAWL_API_URL` 换后端 | `/fc/v1` 兼容，写接入文档，用真实的 Hermes 跑通并留记录 | W3、W6 |
| SEO | /tools/link-extractor/ 已上线 | 做 Can-I-scrape 检查器（展示 robots 决定加 Evidence）；工具结果页加"用 MCP/API 跑"入口；价格页放一张有出处、有日期的对照表（比较页 PR #263 是否重开由 Howard 决定） | W4 起 |

**转化路径（每一步都按来源计数）：**
1. 免 key 用户碰到每天 20 页的上限，返回 429，消息写清"登录每月送 1,000 credits"。Crawl4AI 的 402/429 消息就是写给用户看的（竞品核实）。
2. OAuth 连接成功后第一次调用。
3. 额度用到 80% 时，在工具结果里提示一次。
4. 额度用尽返回 `quota_exhausted`，带"$10 买 10,000、12 个月有效"的链接，agent 可以直接转述给用户。
5. 进入 MoR checkout，付款。
6. 第二次购买。

不学 Firecrawl 在价格页里藏"给 agent 看的注册指令"的做法（需求调研）。

---

# 七、12 周路线图

时间：2026-10-19 到 2027-01-10。部署和目录提交都等 Howard 发话。部署后要执行 `update-traffic` 并确认线上 revision（AGENTS.md）。

| 周 | 里程碑 | 主要工作 | 退出条件（可测） |
|---|---|---|---|
| W1（10-19） | M0：测量和外部关卡 | 外部试用门的结果写进 ROADMAP；两周成本记录（PH 第 3 项）写进 `research/hosted/`；托管层 92 任务基线一轮；托管浏览器耗时 p50/p95，以及 1 vCPU 是否打满；Artifact Registry 加清理策略；Howard 定价；同时申请 Paddle 和 Lemon Squeezy；开始 OpenAI 身份验证；提交 Claude 目录；Terms/Privacy/AUP 送律师 | 成本记录含实际金额、命令和 commit；基线记录含核实数、假成功数、0-credit 比例、是否走代理、源 commit；三项外部提交都有日期 |
| W2–3（10-26） | M1：收款闭环（沙箱） | 清单第 1–4 项，加漏斗埋点 | 同一 webhook 重放 3 次只记一次；退款能扣回；余额为负时拒绝调用；firecrawl-js v4.42.0 改 base URL 后 scrape 和 map 都通过；付费账户不受全站上限影响；`npm test` 和 `npm run typecheck` 全绿 |
| W4（11-09） | M2：真钱上线 | MoR 批准后切到生产；第 5 项；价格页 | Howard 自己真实买一次并退款成功；确认线上 revision；目标是第一笔非 Howard 的付款，否则写下卡在哪个外部原因 |
| W5–6（11-16） | M3：search 和插件 | 第 6 项；Hermes 接入文档；提交 Claude Code 插件和 ChatGPT/Codex 插件 | 响应带 `provider`；实测每千次成本不超过售价的 50%；真实 Hermes 跑通 web_search 和 web_extract，有记录 |
| W7（11-30） | 评审门 1 | 用真实账单重算毛利；统计浏览器耗时分布和不计费尝试占比 | 目标：真实毛利不低于 60%。付费账户 ≥3，或至少 1 个付费用户明确要 crawl/Monitor，W8 才开始做 worker；否则 W8–10 只做分发和 search 质量 |
| W8–9（12-07） | M4：worker 和 crawl（有门槛） | 第 7 项 | `kill -9` 后任务能续跑；跨租户读取全部被拒；100 页真实 crawl 有成本记录；余额用完时以 `budget_exceeded` 停下 |
| W10（12-21） | M5：托管 Monitor（有门槛） | 第 8 项 | 连续 7 天没有漏检；扣费次数和检查次数一致；出错的检查扣 0 |
| W11（12-28） | M6：增强访问实验 | 第 9 项；决定要不要做月付 | 22 个任务的核实数、假成功数、每个核实结果的成本写成记录；ADR 0005 修订草案交给 Howard |
| W12（01-04） | 评审门 2 | 按实测调价；托管层第二轮 92 任务基线；决定增强访问、BYOK、月付、Pro 各自去留 | 目标：至少 5 个非 Howard 的付费账户，其中至少 2 个复购；假成功退款不超过总扣费的 2%；下一季计划写进 ROADMAP |

W10–W11 跨圣诞和元旦，产能和目录审核都按低估计。

---

# 八、风险与对策

| 风险 | 证据 | 对策 |
|---|---|---|
| 法律和 ToS | 托管层对每个 URL 都遵守 robots（`engine.ts:762-777`）；请求日志不存页面内容；律师审阅还没做 | 托管层不开放登录、actions、my-browser；AUP 和 Terms 在 W4 前过律师；开了 crawl 就定结果保留期并更新隐私页；Cloudflare 默认拦 AI 爬虫的站点照样遵守，不规避 |
| MoR 不收爬虫类业务 | 未核实 | W1 同时申请两家，业务描述如实写；两家都拒的话，退路是直接接支付平台并自己处理税务。这一步在关键路径上 |
| 滥用 | 免费额度可以按 GitHub、Google、邮箱各领一份；用 $10 包测试盗刷的卡 | 免费池受全站日上限约束；不计费尝试设上限；退款有月上限；拒付的订单冻结账户的 key；公开 abuse 联系方式 |
| GCP 出口 IP 信誉 | `OriginScheduler` 只在单进程里生效（`docs/public-preview.md:36`） | crawl 上线前先做全服务统一的按 host 并发和 Crawl-delay；crawl 等 W7 评审门 |
| 成本失控 | 浏览器长尾（100 s 时每千页 $4.1）；住宅代理每千页 $10–40；3 个实例 24 小时满载理论上每月 $316（估算） | 30 s 封顶；住宅代理不进免费层；12 周内不出模型预算；crawl 分块预扣 |
| Firestore 热点 | `credits/{uid}` 单文档写入大约每秒 1 次（经验值，未核实） | 分块预扣，最后统一结算 |
| OpenAI 审核 | 要求验证过的开发者身份；Codex 里 MCP 还没加载出来 | W1 就开始，但不放在收入的关键路径上 |
| AGPL 被拿去托管 | Railway 上有第三方 Firecrawl 一键部署模板 | 护城河放在目录上架、OAuth、账户数据、IP 信誉；私有服务独立部署；第一个外部 PR 合入前加 CLA；商标状态未知，要查 |
| 价格战 | Crawl4AI $0.50/千页（soft launch）；Cloudflare `/crawl` 每浏览器小时 $0.09、Web Search 按原价转售（https://developers.cloudflare.com/changelog/post/2026-10-02-introducing-web-search-api/ ） | 不追底价，主打失败不收费和证据；按季度复查调价触发条件 |
| 宣传说过头 | 55–56 和 5 对 14 都来自本地增强路线 | 对外数字只用托管层的实测记录，带命令和 commit |
| 单人运维 | Monitor 需要有人值守 | Monitor 放在 W10 而且有门槛；连续失败就自动暂停并通知；不承诺 SLA |

---

# 九、未知项与先要测量的东西

**W1 必须测（不测，第二节和第五节都只是估算）：**
1. 实际账单金额。现在没有 Billing 导出，PH 第 3 项的记录也还没写。
2. 托管层 92 任务的核实数、假成功数和 0-credit 比例，从来没测过。
3. 托管浏览器耗时 p50/p95，1 vCPU 是否打满，以及并发 2 时每请求的实际单价。
4. ROADMAP 外部试用门（2026-10-17）的结果。

**上线后测：**
5. 真实漏斗各步的转化率。目前 `/mcp` 的 10,654 次请求里有 10,530 次不到 50 ms，多半是爬虫（成本调研的读数）。
6. 付费用户的通道比例，以及不计费调用的真实占比。现在的 14% 只来自 4 个 uid。
7. 免费用户的用量分布（数据在 Firestore `creditUsage` 里，不在仓库）。

**签约和定价前查清：**
8. MoR 是否接受这类业务，卖家注册地放在哪里。
9. search 供应商的转售和缓存条款，以及实际单价。
10. 经 Webshare 网关的每页流量，以及 Unlocker 能不能通过 Octocrawl 的核实。
11. 托管存证、假成功退款这两项的真实需求。

**竞品侧的矛盾或空白（会影响对外说法）：**
- Firecrawl map 按次还是按页计费；
- Firecrawl Scale 能不能结转；
- Firecrawl 免 key 的上限没公开；
- Firecrawl 在 ChatGPT 上的 listing 打开是 403，没法核实；
- Exa 在 API key 计费下失败的 URL 收不收费；
- Crawl4AI 价格还在 soft launch。

**其他：** 域名费用；各目录的安装量和审核周期；各家的 ARR。

---

# 附：评审打分表

| 草案 | 证据使用 | 商业合理性 | 单人可行性 | 风险处理 | 平均 | 取用的部分 |
|---|---|---|---|---|---|---|
| revenue-first | 9 | 8 | 9 | 8 | 8.5（**底稿**） | 一次性包三档、30 s 封顶、毛利表、W7 门槛、5.5–10 人日最快收款路径、Unlocker 实验 |
| differentiation-first | 8 | 8 | 8 | 9 | 8.25 | W1 先测托管层再对外讲数、外部试用门检查、托管和 PA 各占一半时间、假成功退款、"每千个核实页"对比、Can-I-scrape、agent 可读的 429 |
| parity-first | 8 | 6 | 5 | 7 | 6.5 | 浏览器时长规则（作为调价备选）、"本地 MCP 多是云端薄客户端"的论证、增强访问按 MB 计价的思路 |

扣分理由：
- **parity-first：** 一开始就上订阅，Growth 档要扩到 25 个实例；26.5–45 人日压在 12 周里；Growth 档长浏览器页没有时长规则时毛利为负。
- **differentiation-first：** 托管存证没有需求证据，Monitor 档位上限是自己提的数。
- **revenue-first：** 没先核对外部试用门的状态，假成功这个卖点用得不足。

---

# 附录：Critic 审查意见（原文）


依据：方案正文、各份调研资料，以及 origin/main `ed99d302`（`packages/mcp/src/hostedCredits.ts:26` 现行规则是 `browserPage: 5`，`docs/hosted-api.md:64,82` 现行配置是 6 个并发槽）。标「我的知识，未核实」的内容在资料里找不到。

---

## (1) 资料不支持或与资料冲突的数字

1. **"加常驻 worker 后约 $29–74/月"，低端用错了口径。**
   - 资料里的 $27 是 request-based 空闲实例的价格，这种实例在请求结束后 CPU 会被限速。工程调研写明，后台任务要的是"CPU 常驻"（`--no-cpu-throttling`），对应资料里 instance-based 常开的价格，约 $68/月。
   - 方案 A 写的"min-instances=1 且 CPU 常驻、带持久盘"本身有问题：Cloud Run 没有块存储持久盘，只有 GCS FUSE 或 NFS（Filestore）。在 GCS FUSE 上跑 SQLite 不安全；Filestore 最低容量很大，月费远高于 $68（我的知识，未核实）。现实的做法是一台小 VM 加持久盘，资料里没有这项价格。
   - 所以"需要 5–11 个 Starter 包"的下限不成立。

2. **"30 s 封顶的最坏情况仍为正（12–28%）"和方案自己的护栏冲突。**
   - 5.4 节允许"每个 key 每天不计费的浏览器尝试，不超过当天计费页数再加一个固定余量"，也就是不计费的浏览器调用最多可以和计费调用一样多。
   - 按 30 s 每千页 $1.24 算，每卖出 1 个计费浏览器页，成本最多翻倍。Starter 全浏览器时成本约 $12.4，收入 $10，毛利为负。
   - 资料里难题集"约 40% 读不到"，这些调用不扣 credit 但照样烧计算。毛利表没有把它算进最坏情况。

3. **"Browserless 入门付费 Starter $200/月"写错了。** 资料里 Browserless 的入门付费档是 Prototyping，月付 $35、年付 $25。$200 是中间档 Starter。

4. **"Apify 文档说有，registry 搜不到"（1.2 节），被另外两份资料推翻了。**
   - ZenRows 和 Browserless 两次核查里，`claude.com/marketplace/connectors/apify` 都返回 200。
   - 需求调研表里写着 Apify 2026-08 已上架。
   - 所以 Apify 很可能已经在 Claude 目录里。方案低估了"同类都已上架"的程度。

5. **"Exa、Spider、Jina 也都是纯预付"不准确。** Spider 有 Unlimited 月订阅（$40–$19,994/月）和 AI Studio 订阅；Exa 有 Websets 订阅。

6. **"#0–#7 合计约 17–30 人日，在容量之内"漏算了路线图里的其他项。**
   - 第 3 项（假成功退款）没有估算；第 8 项（Monitor 3–5 天，加邮件 1–2 天）和第 9 项（3–5 天，加两轮基线各 1–2 天）都排进了 W10–W11，却没计入总数。
   - 加上之后约 27–45 人日，超过"托管约 30 天"的容量，而且 W10–W11 是节假日。
   - 方案给 parity-first 扣分的理由正是"26.5–45 人日压在 12 周里"，自己却落在同一个区间。

7. **"每千个核实页"的对比口径不一致。**
   - Firecrawl 用的是 Hobby 月付（$3.80 × 81/67 ≈ $4.59）。换成 Standard（$0.99 × 81/67 ≈ $1.20），Octocrawl 浏览器页的 $2.18 反而更贵。
   - 两边都套用本地增强路线的 55/60，而方案自己也承认托管层从没测过。

8. **search 的成本假设偏乐观。**
   - Serper 要买 $50 包才是 $1.00/千次，$0.30 要先付 $3,750。初期实际成本是 $1.00，Scale 档毛利约 50%，不是表里的 85–89%。
   - Serper 卖的是抓 Google 得到的结果，"允许转售"这个前提很可能不成立（未核实）。方案的约束和首选供应商自相矛盾。

9. **"第 12 周目标：至少 5 个非 Howard 的付费账户"和实测基数脱节。**
   - 实测一周 4 个 uid（其中 1 个是测试账户）一共只扣了 106 credits，离 1,000 的免费上限很远。
   - 方案的转化第 4 步是"额度用尽返回 `quota_exhausted`"，按现在的用量根本不会触发。
   - @octocrawl/mcp 每月 1,180 次下载；`/mcp` 的 10,654 次请求里有 10,530 次不到 50 ms，多半是爬虫。
   - 5 个人各买一个 $10 包，收入 $50，比律师费、MoR 开户和每月固定成本都少。

10. **小问题：** Crawl4AI 的 Monitor 写成"确认的变化 +3"，资料原文是"3 credits per confirmed matched change"，是不是在 1 credit 之上再加 3 没有写明。"Claude 目录 973 个"和另一份核查里"805 个没能复现"的说法也没有调和。

---

## (2) 漏掉的重要竞品、功能和成本

**竞品：**
- **聊天客户端内置的联网能力是聊天场景里最直接的替代品，方案完全没提。**
  - claude.ai 和 ChatGPT 本身就能联网搜索和抓取网页。资料里 Claude API 的 web fetch 只收 token 费，web search $10/千次。
  - 方案把"聊天客户端用户跑不了本地版"列为付费理由第 1 名，却没回答这个问题：已经有免费的内置工具，他们为什么还要装一个 connector？
- **Cloudflare 只出现在风险表里，没进定价对照。**
  - `/crawl` 每浏览器小时 $0.09，Workers Paid 每月含 10 小时。
  - Web Search API 按供应商原价转售 Exa、Linkup、Ceramic。
  - Markdown for Agents 让网站自己在边缘把页面转成 Markdown。
- **Parallel 没进对照表。** 它是 $2B 估值、Extract $1/千次、每月免费 5,000 次请求，Claude 目录里不用登录就能用，ChatGPT 目录里也有。和 Octocrawl 的 Starter 价同档，而且免费额度是 5 倍。
- **search 供应商漏了几个符合"每千次不超过 $1"的选项：** Perplexity Fast Search $1/千次、Parallel、Ceramic $0.25/千次（来自 HN，轶事）。
- **Claude Code 官方插件市场里已有、方案没提的：** Zyte、Nimble、Browser Use、TinyFish。

**功能：**
- **PDF 和文档解析。** Firecrawl 的免 key MCP 就开了 parse，Exa 和 Tavily 也有。方案里完全没提托管端怎么处理 PDF。
- **按 key 设消费上限、自动充值。** Firecrawl、Exa、Crawl4AI 都有。
- **x402 或 agent 自付。** 资料里 Apify、ZenRows、Spider、Exa、Tavily、Browserbase、Hyperbrowser 都支持，方案没说做还是不做。
- **SOC 2。** Firecrawl 所有档位都有，Exa 在按量档就有。B2B 采购会问，单人公司拿不出来，至少要在 Enterprise 那一行说清楚。
- **状态页、可用性数据和对外的事故沟通。**

**成本：**
- 律师审阅 Terms、Privacy、AUP 的费用：资料和方案都没写金额，很可能是 12 周内最大的一笔支出。
- 卖家主体注册、记账和报税；MoR 的拒付费；Lemon Squeezy 跨境和 PayPal 是否另收费（我的知识，未核实）。
- 处理客服、退款、假成功申诉的人工时间。
- 第 9 项实验里 Unlocker、Steel 的实际支出。
- 研发本身的 Claude Code 花费：资料里一轮研究就是 $24.75。

---

## (3) "本地免费，为什么还要为托管付钱"的逻辑缺口

1. **12 周内卖的是最弱的版本。**
   - 托管层对每个 URL 都遵守 robots，没有增强访问、actions、my-browser，出口还是 GCP 数据中心 IP。
   - 方案自己引用的开源商业规律是"云端独占的是基础设施"（Fire-engine、住宅代理），但增强访问排在 W11，而且"不对外"。在这 12 周里，托管版没有任何云端独占的能力，只多了"远程能连上"这一条。
   - Firecrawl 付费买到的是它最强的版本；Octocrawl 付费买到的是它最弱的版本。

2. **对能写代码的开发者，本地很可能比托管更好。**
   - 能调 REST 的人就能 `npx octocrawl serve`。在家庭宽带 IP 上跑，被反爬拦的概率大概率低于 Cloud Run 的数据中心 IP（推断）。
   - 方案没有测过本地和托管在同一任务集上的差距。如果差距大，付费理由第 2 条（"不用自己运维"）就站不住。

3. **"可追溯、失败不收费"不是付费理由。**
   - 3.2 节写明 Evidence Record 在本地、托管免费、托管付费三处都"全部，不收费"。它能帮用户选 Octocrawl，但不能让用户为托管掏钱。
   - 资料里关于这一点的需求证据只有"弱"。

4. **免费层和付费包在互相分流。**
   - 免费层一年送 12,000 credits，比一个 Starter 包（10,000）还多。另外还有免 key 每 IP 每月最多 600 页，而且 GitHub、Google、邮箱可以各开一个账户。
   - 聊天场景的用量本来就低，实测也远低于上限。轻度用户永远不需要买。

5. **中间被两头挤。**
   - 重度用户会选 Firecrawl Standard（$0.99，浏览器页同价）或 Crawl4AI（$0.50 / $1.00）。
   - 轻度用户留在免费层。
   - 只卖一次性包、12 个月有效，又没有订阅，所以收入没有续费结构。方案拿 Exa、Jina 作先例，但它们靠的是巨大的流量，Octocrawl 没有。

6. **假成功退款只能靠用户自己上报。**
   - agent 不会主动报。人要先判断出"假成功"，再去申诉。
   - 这个机制还会被用来白嫖：方案只设了月上限，没有说由谁裁定、怎么裁定。
   - 5 对 14 这组数也来自本地路线。托管层很多页直接被拦、扣 0 credit，假成功的结构可能完全不同。

7. **search 卖 $3/千次，没有说明为什么有人买。** 它比 Crawl4AI（$1）、Firecrawl Standard（$1.98）、Perplexity 和 Parallel（$1）都贵，开发者也可以直接用 Cloudflare 的原价转售。

---

## (4) 低估的风险

- **收款主体和所在地。**
  - 方案写"卖家注册地还没定"，退路是"直接接支付平台并自己处理税务"，对单人开发者来说这是一个很重的合规负担。
  - 卖家所在地决定 Stripe、Paddle、Lemon Squeezy 能否开户和提现，以及适用哪些跨境经营和数据抓取的法规；这一项应该放在 W1 关键路径的最前面，而不是和其他外部事项并列。
- **单个 GCP 项目的连带影响。**
  - 托管 API 和公开站点 `w2l-public-preview` 都在 `octopus-w2l-20260924-7r7` 里。只要有一次滥用投诉导致 GCP 封项目，官网、登录和 API 会一起下线。
  - 方案只提了"IP 信誉"，没提项目隔离，也没提 GCP 自己的 AUP。
- **法律责任主体。** 托管之后，Howard 就成了替用户抓取的一方。`scrape_product` 已经在托管端对 Amazon 开放。风险表只写了"遵守 robots"，对 ToS 违约、个人数据（GDPR）和下架通知的处理流程都没有说明。
- **容量远小于定价暗示的规模。**
  - 全服务只有 6 个并发槽，每个浏览器页占一个槽直到跑完（`docs/hosted-api.md:82`）。按每页 10 s 算，每天最多约 5 万个浏览器页。
  - 一个 Scale 包的用户就能挤占免费用户；平均 4.6 s 的冷启动会让付费体验变差。"有量了再调"的时机没有定义。
- **$10 包招来盗刷测卡。** 拒付率一高，MoR 可以直接终止合作。"冻结 key"挽回不了拒付率。
- **目录上架顺序不对。** 方案 W1 就提交 Claude 目录，但律师审阅要到 W4 前才完成。目录审核很可能要求完备的隐私政策和条款（推断）。另外 Firecrawl 在 Claude 目录里只开放了 8 个工具，说明 Anthropic 可能会限制工具面。
- **30 s 封顶的副作用。** 重页面会更多地落到"没读到、扣 0"，成本照样发生，成功率下降。这又削弱了"成功率"这个卖点。
- **机会成本。** PA 是第一优先，托管只有一半时间。W7 评审门的样本只有 3 个付费账户，统计上什么都证明不了，却决定了要不要投入约 $70/月的 worker 和 4–8 人日。

---

## (5) 掏钱之前最该测的 5 件事

1. **托管层和 Firecrawl 托管版在同一天、同一组 92 个任务上的对照。**
   - 测核实数、假成功数、0-credit 比例和浏览器通道占比，记录是否走代理和源 commit。
   - 同时用本地家庭 IP 跑一轮，量化托管比本地差多少。
   - 不测这一项，第三节和第五节的卖点都没有依据。
2. **两周的真实账单，加上托管浏览器耗时 p50/p95/p99。**
   - 包括并发 2 时 1 vCPU 是否打满，以及不计费调用在成本里的占比。
   - 用真实数重算 30 s 封顶下的最坏毛利，把不计费尝试算进去。
3. **付费意愿：在写 checkout 之前先验证。**
   - 价格页放一个假购买按钮（fake door），统计点击。
   - 统计有多少真实账户（排除爬虫和测试账户）用到了 1,000 的上限，现在看是 0。
   - 直接访谈现有的 3 个真实用户。
4. **收款和法律能不能落地，并拿到书面答复。**
   - 卖家主体和所在地；Paddle 或 Lemon Squeezy 是否接受"代用户抓取网页"的业务，提现路径是否可行。
   - 律师审阅的报价。
   - 任何一项不成立，W2–W4 的工程就白做了。
5. **聊天客户端里的替代测试。**
   - 在 claude.ai 和 ChatGPT 里，用同一批任务对比内置联网工具和 Octocrawl connector：成功率、可追溯性、用户感知。
   - 如果 connector 没有明显优势，付费理由第 1 条就不成立，目录上架也换不来付费。

第 6 项（W5 前要测）：search 供应商的转售和缓存条款，以及按实际用量算出的单价。如果没有合规的 ≤$1 供应商，search 只能做用户自带 key，3 credits 的定价就要撤掉。
---

# 补充：收款方（MoR）调研（2026-10-18，方案写完之后补做）

依据各家官方页面，2026-10-18 读取。最后选哪家，要等确定卖家注册在哪里。

| 项目 | Paddle | Lemon Squeezy |
| --- | --- | --- |
| 网页抓取类业务 | 21 类禁止业务里没有抓取；最接近的是「未经授权访问他人数据」、代理（限制）、破解 CAPTCHA（禁止）。已经有抓取 API（Unwrangle）在用 Paddle 收款（https://paddle.com/support/aup ，https://www.unwrangle.com/tos/ ） | 禁止清单里没有抓取，但写了「支付合作方限制的产品」，拿不准的要先问客服（https://docs.lemonsqueezy.com/help/getting-started/prohibited-products ） |
| 卖家所在地 | 除受制裁国家外都支持；个人可以注册，要过证件加视频自拍的身份验证（https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle ） | 银行收款支持香港、新加坡、加拿大、美国，不支持中国内地；PayPal 收款覆盖 200 多个国家和地区（https://docs.lemonsqueezy.com/help/getting-started/supported-countries ） |
| 提现 | 电汇或 Payoneer，每月一次，最低 $100 | 银行或 PayPal，美元结算，每月两次，最低 $50 |
| 手续费 | 5% + $0.50 | 5% + $0.50；买家在美国以外加 1.5%，PayPal 付款再加 1.5% |
| 预付 credits | 官方文档明确支持，作为一次性商品卖（https://developer.paddle.com/get-started/how-paddle-works/ai-companies ） | 未核实 |
| 审核 | 要有已上线的网站、价格页、条款、退款政策、隐私政策；多数自动通过，人工审核约 5–7 个工作日 | 审核时长未知 |

**其他几家：**
- **Dodo Payments：** 明确不接「scraping」类业务（https://docs.dodopayments.com/miscellaneous/merchant-acceptance ），**不考虑**。
- **Polar：** 禁止「未经授权访问他人数据」。
- **Stripe Managed Payments：** 需要通过资格审查，价格未核实。
- **Gumroad：** 禁止「出售 AI 工具的使用权」。

**初步倾向：Paddle。** 理由有三条：
1. 支持的卖家国家最广；
2. 官方文档明确支持卖预付 credits；
3. 已经有同类的抓取 API 在用它。
