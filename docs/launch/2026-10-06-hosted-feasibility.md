# 托管 Octocrawl 可行性记录（2026-10-06）

本文是 ROADMAP PH 节的依据：当天的调研、已定的决定和第一阶段的实施顺序。竞争者的数字都是当天抓取的页面内容，来源在各节标明；页面会变，引用前核一遍。

## Context

Howard 看了上线后的 Connect MCP 页，发现满屏都是「local」「Verified locally」「在你自己的电脑上」「先开着 `npx octocrawl serve`」。他的判断：用户不会为了用一个 MCP 工具先在本机跑一个服务；Firecrawl 的做法是云端优先，用户拿一个 API key，客户端配一个 URL 就能用。他要：

1. 搞清楚为什么现在必须本地开 server 才能用 MCP，教他怎么做云端部署。
2. 深度检查站点和 README 里还有哪些「本地部署」类的问题。
3. 按 https://docs.firecrawl.dev/introduction 的方式重做接入体验。

Howard 随后明确了产品形态：**本地部署和官方云托管两条路都保留**，用户可以自己跑，也可以直接用我们托管的服务。本次要先回答云托管的可行性：技术上现有代码能不能直接托管、缺什么、成本和滥用风险、法律和合规（AGPL、robots、被抓站点）、需要多少工作量，然后才是改站点文案。

本文件在调研完成后补全：现状、Firecrawl 的模式、可行性结论、推荐方案、改动文件、验证方式。

## 调研结果

### A. Firecrawl 的接入模式（docs.firecrawl.dev，2026-10-06 抓取）

- 首屏第一件事是 MCP，不是 REST：一个**免 key 的 Streamable HTTP URL** `https://mcp.firecrawl.dev/v2/mcp`，每个客户端一行命令（`claude mcp add --transport http firecrawl <url>`、`codex mcp add firecrawl --url <url>`、Cursor/OpenCode 的 JSON）。免 key 只开 scrape、search、parse 三个工具，按 IP 每日限额。
- API key 是「升级」不是门槛：同一个 URL 加 `Authorization: Bearer <key>` 头，解锁 26 个工具和更高配额；另有 OAuth 入口 `/v2/mcp-oauth`。key 不放 URL 里。
- `npx -y firecrawl-mcp` 只是一个薄客户端，默认打 `https://api.firecrawl.dev`，不在本地跑引擎；`FIRECRAWL_API_URL` 可指向自托管实例。
- 免费计划 1,000 credits/月，无需信用卡；付费 $16 起。
- 自托管被定位为「功能较少的版本」：Docker Compose，没有反爬引擎、截图、Agent。
- 响应里没有证据字段（无抓取时间、hash、重定向链），这是 Octocrawl 的差异点。

结论：**两条路并存正是 Firecrawl 的结构**。云是主入口，`npx` 包同时服务云和自托管，差别只是 base URL。Octocrawl 现在的 `@octocrawl/mcp` 已经是同样的薄客户端（`--base-url`/`W2L_API_URL`），缺的只是一个公网的 API 加鉴权。

### B. 仓库里已有的云托管能力（origin/main）

**为什么现在必须本地开 server**：`@octocrawl/mcp` 的 stdio 入口（packages/mcp/src/stdio.ts:8-29）只是把 MCP 调用转成对一个 REST API 的 HTTP 请求，默认 `http://127.0.0.1:8787`，带 `--token`。引擎在 API 进程里。没有公网 API，就只能本地起一个。

**已经有的东西**
- API 的 hosted 模式：`--hosted` / `W2L_API_MODE=hosted`（packages/api/src/listen.ts:117），必须配静态 bearer token 列表（`--token` 可重复，或 `W2L_API_TOKENS` 逗号分隔，listen.ts:239-259），常量时间比对（api/src/auth.ts）。hosted 下自动拒绝：私网地址、robots override、skipTlsVerification、actions、authed 登录态、handoff、本地代理、非公网 HTTPS webhook（engine.ts 多处，contracts/src/ssrf.ts:49-55）。有每分钟滑动窗口限流 `W2L_RATE_LIMIT_PER_MINUTE`（app.ts:150-174），按 token 计，进程内存里。
- 主 Dockerfile 已装 Chromium，默认 CMD 是 hosted MCP（packages/mcp/dist/hostCli.js）。
- 实验性 Streamable HTTP MCP：packages/mcp/src/host.ts。但它是 **WorkOS OAuth 单用户**（`payload.sub === W2L_OWNER_SUBJECT`，host.ts:96），工具只放 25 个，且 scrape 只接受 Amazon.sg `/dp/` URL（hostedToolPolicy.ts:35-82），Monitor 只许两个域名。从未部署。
- 公开站的 Cloud Run 套路可以复用：Cloudflare Worker 转发 + 共享密钥头、tag revision 切流量、Firestore 原子配额（3/访客/天，100/站/天，quota.ts）、Secret Manager。
- 等待名单（waitlist.ts）存 email 和 needs（含 `hosted`、`api_key`），但没有任何东西把它变成 key。

**没有的东西**
- 没有用户、账号、API key 签发、按 key 计量、账单。唯一的「per-key」是运维手工配的静态 token 列表。
- 没有多租户：一个进程一个 `W2L_TASK_ROOT`，SQLite 控制库，归档文档明说「SQLite 盘不能多实例共享」「不要当多租户任意 URL 爬虫用」（docs/archive/hosted-mcp-pilot.md:65-70）。
- 没有每次调用的成本数据（public-preview.md:261，`serviceCostUsd: null`）。
- README:552 还开着「Hosted Egress Gate」（浏览器子资源策略、DNS 到连接绑定）。

**为什么暂停**：ROADMAP.md:246「Operations, compliance and isolation cost」，重启条件是 P5 或「用户要求电脑关机时也能跑并愿意付费」。P5 的 hosted-scale 项（ROADMAP.md:188）列了需要的东西：worker 池 + 租约任务、每租户 task root 和预算、usage 端点、计量计费。

### C. 站点和 README 里的「本地」措辞（完整清单在调研记录里，这里只列要改的类别）

- **和已发布包矛盾的说法**（必须改）：page.ts:145 和 extract-page.md:40「Get code 需要仓库 checkout」；reference.md:3「REST、SDK、自托管都需要 checkout」；reference.md:7「@w2l/sdk 是私有包」；README.md:39-47「预览没有永久 URL」。
- **只对仓库开发者有意义的内容面向了访客**：introduction.md:5/11/30/44 的 sourceCommit 和「本机实测」；monitor-webhook.md 整页围绕 `npm run first-use:local` 和 127.0.0.1:8788；reference.md:34/104/106/110 的「同一 checkout 同一 commit」；limits.md:60-65 的 commit hash；README.md:147-186 的 LaunchAgent、w2l-local、legacy `npm run api`。
- **状态标签**：build-docs.mjs:78-102 的「Verified locally」「not run here yet」；build-docs.mjs:180 每页页脚「MCP setup is local; hosted MCP is paused」；connect-mcp.md:31-33「Hosted connection: Paused」。
- **首页**：可见文案里「local / 自己电脑 / 自己跑」约 10 处，「hosted」只有 1 处可见（FAQ 的 X/Reddit 注）。Get code 弹窗标题就是「Run it on your computer」。CTA 顺序：Get code → Try an example → Extract page；没有任何「接到你的 agent」的主入口。
- 三处自相矛盾：Get code 要不要 checkout；SDK 发没发布；哪个客户端是「verified」（introduction 说 Codex，picker 说 Codex 没跑过）。

## 可行性结论

**可行，而且第一阶段的工程量不大，因为积木都在**：
- `@octocrawl/mcp` 已经按 Firecrawl 的结构写成薄客户端，`--base-url` 加 `--token` 指向云端即可，npm 包不用改。
- API 的 `--hosted` 模式已经把私网、robots override、登录态、handoff、代理、非 HTTPS webhook 全部拒绝，SSRF 清单也在。
- 主 Dockerfile 已经能出一个带 Chromium 的镜像；公开站的 Cloud Run + Cloudflare Worker + Firestore 配额 + tag 切流量这套已经跑了一周。
- `host.ts` 已经是无状态的 Streamable HTTP MCP（每个 POST 一个 transport，`sessionIdGenerator: undefined`），改掉 WorkOS 单用户鉴权和 Amazon-only 策略就是通用端点。

**三个真正的缺口，决定分阶段**：
1. **没有 key 的签发和计量**。只有运维手配的静态 token。最小做法：Firestore 存 key 的 HMAC，一个 owner 脚本从等待名单签发；免 key 层按 IP 每日配额（和预览的 quota.ts 同一套）。注册页和自助签发放第二阶段。
2. **没有多租户持久化**。batch、crawl、Monitor 的任务状态在进程内 SQLite，Cloud Run 多实例不能共享（hosted-mcp-pilot.md:65）。所以第一阶段只托管**无状态**的 scrape 和 map（Firecrawl 免 key 层也只开 scrape/search/parse），batch/crawl/Monitor 继续本地，第二阶段按 ROADMAP P5 做 worker 池 + 每租户 task root。
3. **没有每次调用的成本数据**。Chromium 一次请求的 CPU 秒数未测。第一阶段非 Amazon 页面走 HTTP 通道（和预览一样），浏览器通道只给持 key 用户且并发 1，先用 Cloud Run `max-instances` 和预算告警兜底，跑两周拿到真实账单再定价。

**风险**
- 滥用：hosted 就是替别人抓站。hosted 模式遵守 robots，有每 host 并发 1，AUP 页已有；要加每 key 和每 IP 的日配额、每分钟限流（API 已有，按 token）。
- 合规：证据记录里有目标 URL，日志保留 30 天；隐私页要加「hosted API 记什么」。AGPL 对我们自己托管没有义务问题（我们是版权方）。
- README:552 的「Hosted Egress Gate」（浏览器子资源策略、DNS 绑定）还开着。HTTP 通道绕过大半；开浏览器通道前要收掉。
- 预览已占了一个 Cloud Run 服务，hosted API 应是**第二个服务**（独立伸缩、独立预算），而不是塞进 w2l-public-preview。

**工作量估计**（单人）：第一阶段约 1 到 2 周；第二阶段（有状态任务托管）是 P5 规模，按周计，不在本计划内。

### D. 其他竞争者的「开源 + 云」做法（2026-10-06 抓取，来源见调研记录）

| 产品 | 开源引擎 | 云托管 | 免 key 层 | 免费额度 | MCP | 云比自托管多什么 | 文档首屏 |
|---|---|---|---|---|---|---|---|
| Firecrawl | 自托管版（功能少） | 是 | **是**，按 IP 日限 | 1,000 credits/月 | 远程 URL + Bearer；npx 薄客户端 | 反爬引擎、截图、Agent、搜索 | 云优先，MCP 第一 |
| Crawl4AI | Apache-2.0 | 是（刚上线） | 仅自托管 | 注册送 credit，无卡 | 远程 `api.crawl4ai.com/mcp` + Bearer；自托管 `/mcp/sse` | 搜索、无需自带 LLM key 的抽取、过反爬、万级 batch | 本地优先，云第二 |
| Steel | Apache-2.0 | 是 | 仅自托管 | $30 一次性 | 只有 npx 本地 server，无远程 URL | 代理、profile、验证码、录像 | 云优先 |
| Browser Use | MIT | 是 | 库和本地 MCP（自带 LLM key） | $15 或 $1（两处矛盾） | 远程 `api.browser-use.com/v3/mcp`；本地 uvx | 隐身、住宅代理、验证码 | 云是 Path 1 |
| Skyvern | AGPL-3.0，反爬部分不开源 | 是 | 仅自托管 | 5,000 credits/月 | 远程 `api.skyvern.com/mcp/`；本地 python | 反爬、代理、验证码、并行 | 云优先 |
| Scrapling | BSD-3 | 否 | 全免 | n/a | 仅本地 | n/a | 本地 |
| Apify / Crawlee | Crawlee Apache-2.0 | 平台 | MCP 只开搜索和文档工具 | $5/月 | 远程 `mcp.apify.com`（OAuth 或 token）；npx | Actor 商店、调度、存储 | Crawlee 本地优先，Apify 平台优先 |
| Browserbase | 仅 Stagehand 库 MIT | 仅云 | 否 | 1 浏览器小时 | 远程 `mcp.browserbase.com/mcp` | 全部 | 云 |
| Jina Reader | Apache-2.0（去掉存储层） | 是 | **是**，20 次/分钟 | 1,000 万 token | 远程 `mcp.jina.ai/v1`，key 可选 | 缓存、更高限额、ReaderLM | 云（URL 前缀）优先 |
| ScrapingBee / Zyte | 否 | 仅云 | 否 | 1,000 credits / $5 | 未确认 | n/a | n/a |

**共性**（Crawl4AI、Steel、Browser Use、Skyvern、Apify 五个「开源 + 云」产品）：
- 鉴权：云端一律一个 API key 放 header（多数 `Authorization: Bearer`）；自托管要么无 key，要么自己设 token。
- 免费层：注册送 credit、不要卡、然后按量付费；只有 Jina 和 Firecrawl 做到完全免 key 可用，Apify 只对搜索工具免 key。
- MCP：主流是公司 API 域名下的一个远程 HTTP 端点，同一把 key，一行 `claude mcp add --transport http ... --header`；同时保留一个本地 stdio 或自托管端点。Steel 是唯一只有 npx 没远程 URL 的。
- 自托管留不出来的：反爬、代理、验证码、规模和存储；Skyvern 直接写进许可证。
- 文档首屏：Steel、Browser Use、Skyvern、Firecrawl 云优先；Crawl4AI 和 Crawlee 本地优先。

**对 Octocrawl 的含义**：
- 「本地免费无限 + 云托管按量」是行业标准形态，不是妥协。差异化不在形态，在**证据记录**（没有一家的响应带抓取时间、hash、重定向链、robots 决定）。
- 免 key 层只有 Jina 和 Firecrawl 做了，而这两家恰好是「一个 URL 就能试」体验最好的；Howard 选免 key 可用，和它们一致。
- Octocrawl 云端「比自托管多什么」目前只能是：不用开机、不用装 Chromium、配额内免维护。反爬、代理、验证码按 ADR 0005 是访问授权（access grant）体系，云端第一阶段不提供，这点要在页面上写明，避免用户拿 Firecrawl 的预期来比。

### E. Octoparse（2026-10-06 抓取，来源见调研记录）

- **形态**：无代码桌面 App（Windows/Mac）+ 付费云执行，同一份 task 两种运行方式。本地免费、用自己的机器和 IP；云端按套餐给并发节点、定时、IP 池、导出。定位句「no-code solution for web scraping」，文档明说「不是托管抓取 API」。
- **定价**：Free 永久免费但仅本地（10 个 task、月导出 5 万行、无云无 API）；Standard $69/月起（云 3 并发、500+ 模板、IP 轮换、验证码、Data Export API）；Professional $249/月起（20 并发、Advanced API）。住宅代理 $3/GB、验证码每千次 $1 到 1.5 另计。
- **开发者面**（2026 年新补）：OpenAPI（`x-api-key`，`op_sk_` 前缀，Standard 起）、CLI（npm，可本地跑、管云运行）、MCP `https://mcp.octoparse.com`（OAuth 2.1 或 key，免费用户每月 2,000 条记录）、AgentTools API（响应带 `suggestedNextCall`、`retryGuidance`）。MCP 工具刻意很窄：找模板、执行、导出，**不能自定义抓取、不能不用模板抓**。
- **模板**：500+ 按站点预制，官方团队维护，按套餐分级，用代理或验证码的模板按记录数另收。

**可借鉴**：本地免费无限、云端计量；定时和无人值守是云的存在理由；同一把 key 通用于 API、CLI、MCP；MCP 给免费用户一个固定月额度当入口；AgentTools 的「下一步该调什么」提示。**反面**：它的 MCP 不能抓任意 URL，这正是开发者优先产品的空档。

## Howard 已定的决定（2026-10-06）

- 第一阶段只托管 scrape + map；免 key 可用，按 IP 日配额；加 key 提额度。batch / crawl / Monitor 留本地，第二阶段再托管。
- key 从等待名单手工签发（脚本），不做注册页。
- 免 key 只走 HTTP 通道；持 key 可用 Chromium，并发 1。
- 月预算约 $50：max-instances 2 到 3；免 key 每 IP 每天约 20 次，持 key 每天约 500 次；预算告警设在 $40。两周后按真实账单调。

## 推荐方案（第一阶段：hosted scrape + map，本地路径保留）

### 1. 云端服务 `octocrawl-api`（新 Cloud Run 服务，同项目同区域）
- 镜像：主 Dockerfile 的变体，CMD 改为 API 的 hosted 入口；或在 `packages/api` 加一个 `hostedCli.ts` 组合「hosted API + `/mcp` Streamable HTTP 端点」于同一进程、同一端口（Cloud Run 一个服务一个端口）。
- 鉴权中间件替换静态 token：`Authorization: Bearer <key>` → Firestore `apiKeys/{hmac}` 查 `enabled`、`plan`、`dailyLimit`；无 header → 免 key 层，按 `CF-Connecting-IP`（经 Worker 共享密钥验证后才信）计日配额。复用 quota.ts 的原子两文档提交模式，集合改名 `hostedQuotas`。
- 工具/路由白名单：第一阶段只开 `POST /v1/scrape`、`POST /v1/map` 和 MCP 的 `scrape`、`map`、`scrape_product`（Amazon.sg 走浏览器通道的既有门控可直接搬 amazonGate.ts）。其余路由 403 并给 `agentHints`「run locally for batch/crawl/monitor」。
- 通道：免 key 只 HTTP 通道，上限 40 s；持 key 可开 `browser_local`，并发 1，`max-instances` 先设 3。
- Cloudflare：Worker 新增路由 `api.octocrawl.dev` 和 `mcp.octocrawl.dev`（或同一 host 不同路径），转发到新服务并加共享密钥头；现有 worker.js 的转发逻辑可直接复用。
- key 签发：`scripts/hosted/issue-key.mjs <email>`，生成随机 key、写 HMAC 到 Firestore、打印一次。来源是等待名单（waitlist.ts 的 needs 含 `api_key`）。

### 2. 客户端接入（照 Firecrawl 的四种形态）
- 远程 URL：`https://mcp.octocrawl.dev/mcp`，`claude mcp add --transport http octocrawl <url>`、`codex mcp add octocrawl --url <url>`、Cursor/OpenCode JSON；加 key 用 `headers: { Authorization: Bearer ... }`，key 不进 URL。
- npx 薄客户端：`npx -y @octocrawl/mcp --base-url https://api.octocrawl.dev --token <key>`，或 `W2L_API_URL` / `W2L_API_TOKEN` 环境变量。包不用改。
- 本地：`npx octocrawl serve` + `npx -y @octocrawl/mcp`，原样保留，位置移到「Run it yourself」。
- 自托管：`octocrawl serve --hosted --token` 已有，写一节。

### 3. 站点与 README 改写（以 Firecrawl introduction 的顺序为蓝本）
- Connect MCP 页：首屏一个远程 URL 和每客户端一行；「Add a key for more」；然后「Run it on your computer」；最后「Self-host」。删「Paused」「Verified locally」「not run here」，状态改为客户端名 + 验证日期。
- introduction.md：开头改为「一个 URL 接入；本地和自托管也可以」；去掉 sourceCommit 和本机实测段。
- 首页：Get code 弹窗改名「Use it in your code or agent」，标签顺序 MCP (remote) → cURL (api.octocrawl.dev) → Local；hero 帮助行加「Connect your agent」；FAQ 的「no paid plan」改为免 key 层说明。
- 修三处矛盾：Get code 不需要 checkout；SDK 已发布；验证状态以 picker 为准。
- README：顶部加远程 MCP 一行；「For local MCP use」改为「Hosted / Local / Self-host」三小节；LaunchAgent 内容移到 docs/onboarding.md。
- 隐私、条款、AUP 增加 hosted API 一节；limits.md 增加 hosted 配额表。
- llms.txt 和每页页脚同步。

### 4. 不做的
- 注册页、OAuth、自助签发 key、计费：第二阶段。
- batch / crawl / Monitor 托管：第二阶段（P5）。
- 改首页视觉。

## 改动文件（第一阶段）

- 新增 `packages/api/src/hostedCli.ts`（或扩展 listen.ts）、`packages/api/src/hostedAuth.ts`（Firestore key 查询 + 免 key 配额）、`scripts/hosted/issue-key.mjs`、`Dockerfile.hosted-api`、`cloudbuild.hosted-api.yaml`、`docs/hosted-api.md`（部署步骤，照 docs/public-preview.md 的格式）。
- 改 `packages/mcp/src/host.ts`（去 WorkOS，接 bearer key；去 Amazon-only 策略，白名单改为 scrape/map/scrape_product）、`packages/mcp/src/hostedToolPolicy.ts`。
- 改 `cloudflare/public-preview-proxy/worker.js` 和 `wrangler.toml`（新增 host 路由）。
- 复用：`packages/public-preview/src/quota.ts`（原子配额）、`amazonGate.ts`、`server.ts` 的 `acceptProxyHeaders`、`packages/api/src/auth.ts` 的常量时间比对、`packages/contracts/src/ssrf.ts` 的 hosted 清单。
- 站点：`apps/public-web/content/{introduction,connect-mcp,extract-page,reference,limits,privacy,terms,acceptable-use,monitor-webhook}.md`、`apps/public-web/scripts/build-docs.mjs`、`apps/public-web/src/{page.ts,main.ts,getCode.ts}`、`README.md`、`packages/*/README.md`、`CHANGELOG.md`。

## 验证

1. 本地：`npm run api -- --hosted --token test` 起 hosted 模式，`curl` 打 `/v1/scrape` 确认私网地址、robotsOverride 被拒；用 `npx -y @octocrawl/mcp --base-url http://127.0.0.1:8787 --token test` 跑 initialize / tools/list / scrape。
2. 本地起 `/mcp` Streamable HTTP 端点，用 `claude mcp add --transport http` 连接并调用 scrape；无 key 时走免 key 配额，超限返回 429 带 Retry-After。
3. `npx vitest run packages/api packages/mcp packages/public-preview apps/public-web`，`npx tsc --build`。
4. 部署到新 Cloud Run 服务（no-traffic → 切 tag），Worker 加路由后：`curl https://api.octocrawl.dev/v1/scrape` 免 key 成功；`claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp` 显示 Connected 并能 scrape；超配额 429；私网 URL 400。
5. 看两周 Cloud Run 账单和 Cloud Logging 的 hosted 调用量，再定配额和定价。

## 实施顺序（第一阶段，按 PR 切）

1. **PR-1 文案先行，不等云端**（1 天）：修三处和已发布包矛盾的说法（Get code 不需要 checkout、SDK 已发布、验证状态统一），删 introduction/reference/limits 里的 sourceCommit 和「本机实测」段，页脚「hosted MCP is paused」改为「hosted coming; run it yourself today」。这一步让今天的访客不再被「local」劝退。
2. **PR-2 hosted API 进程**（2 到 3 天）：`packages/api` 加 hostedCli（hosted API + `/mcp` Streamable HTTP 同进程），`hostedAuth.ts`（Firestore key 查询 + 免 key 按 IP 日配额，复用 quota.ts），路由和工具白名单 scrape/map/scrape_product，免 key 只 HTTP。host.ts 去 WorkOS 与 Amazon-only 策略。本地用 `--hosted` 跑通 curl 与 `claude mcp add --transport http`。
3. **PR-3 部署件**（1 天）：Dockerfile.hosted-api、cloudbuild.hosted-api.yaml、docs/hosted-api.md、`scripts/hosted/issue-key.mjs`；Worker 与 wrangler.toml 加 `api.octocrawl.dev`、`mcp.octocrawl.dev`。
4. **部署**（半天）：新 Cloud Run 服务 octocrawl-api，max-instances 3、concurrency 1、2 GiB、预算告警 $40；no-traffic 部署后切 tag；线上验证免 key scrape、超配额 429、私网 400、MCP Connected。
5. **PR-4 站点改写**（2 天）：Connect MCP 页首屏改远程 URL（照 Firecrawl 顺序：远程 → 加 key → 本地 → 自托管）；首页 Get code 改名并把 MCP remote 放第一个 tab；README 顶部加远程一行；隐私、条款、AUP、limits 加 hosted API 一节；llms.txt 同步。
6. **发 key 与观察**（两周）：从等待名单给前几位签 key；看账单和 Cloud Logging 的 hosted 调用量；10/7 起的复盘加 `utm_source` 和 hosted 调用两张表。两周后定配额与是否定价。
7. **第二阶段（P5，另立计划）**：batch/crawl/Monitor 托管需要 worker 池、每租户 task root、计量；自助注册和付费。

总工期第一阶段约 1 到 2 周（单人）。
