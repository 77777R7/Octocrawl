# 批量与并发抓取：框架与可行性方案（2026-11-05）

依据：`main` `1127fb84`（0.8.1）的代码与文档；Howard 2026-11-04 用 Octocrawl 抓 IDS 2027（科隆国际牙科展）展商名录的会话记录（桌面端 scratch 会话 `62efcb36-51c4-48af-bed6-3cd4cd51f774`，下文记作"会话"，L 是其行号）；本文第 9 节的一次 `map` 探测。文中标"估计"的数字没有测过。

## 0. 结论

1. **"一次把一批 URL 抓回来、并发执行"这件事，Octocrawl 已经有了。** `batch_scrape` 读已知的 1–1,000 个 URL，`crawl` 沿链接读一个站点的一段（hosted 最多 500 页），`map` 不读页面只列 URL。本地和 hosted 都提供，任务可续跑、可翻页、可发 webhook（[docs/batch-crawl-map.md](../batch-crawl-map.md)）。IDS 名录的 14 页就是用 hosted `batch_scrape` 一次跑完的，约 45 秒（会话 L504）。
2. **"一页一页"的感觉不是缺工具，而是这次任务卡在四个瓶颈上：**
   - 272 个详情页要登录态才显示电话和邮箱。能读出来的只有 `--lane my-browser`（在你自己的 Chrome 里读），而这条通道按设计串行：代码强制 `maxConcurrency: 1`（[engine.ts:1248](../../packages/api/src/engine.ts)、`:1438`、`:3036`），实测 4.4 秒一页，272 页 20 分钟。
   - 站点限频：第一轮 272 页里 98 页被静默跳到首页，却记为 `success`、`readiness: ready`、无 warning。没有机制发现它、放慢、重试，只能由 agent 猜一个"每 8 页停 100 秒"，又花了约 20 分钟。
   - 发现 URL 的 `map` 从名录页出发，按"起点路径子树"规则拒掉 2,555 个 URL，只返回 2 条，没有说明原因。换成 `crawlEntireDomain: true` 直接列出 2,135 个展商详情页（第 9 节）。 这条提示 #820 已于 2026-11-04 合入 main。
   - `--mode authed`（把 Chrome 登录态导入 Octocrawl 自己的浏览器）本可以每站并发 2，但在这个 Gigya SSO 站点上读到的是未登录页，也记为 `success`。
3. **所以方案的重点不是"再做一个批量功能"，** 而是：让假成功变成有名字的信号；让调度器据此自动放慢和重试；让 agent 一开始就走 map / batch 而不是 scrape；结果不穿过 agent 的上下文。放开通道并发（本地 4 个 worker、每站 2 个在飞）是最后一步，而且对限频的站点没有用：IDS 的下限由站点允许的速率决定，不由我们的并发决定（第 5 节）。

## 1. IDS 任务实际发生了什么

| 步骤 | 走的路径 | 页数 | 用时 | 结果 |
| --- | --- | --- | --- | --- |
| 名录（Dental materials 分类，14 页） | hosted MCP `batch_scrape`，`maxConcurrency: 2`（L144、L176） | 14 | 约 45 s | 14/14，去重后 272 个展商 slug，这一步约 30 credits，含探查用的 7 次 `scrape`（L232） |
| 登录态导入 | Howard 自己运行 `npx octocrawl login import english.ids-cologne.de`（L307、L317） | — | — | 成功：5 个 cookie、9 条 localStorage，`localStorageRead: true` |
| `--mode authed` 试读 | `scrape --mode authed`，两次（L337、L347） | 2 | — | `success`、`route: authed_browser`、`completion: authorized_session`，但页面仍是未登录内容（无电话邮箱，有登录提示）。没有 `login_wall`，没有 warning |
| 详情页第 1 轮 | 本机 `npx octocrawl@0.8.1 batch --urls-file … --lane my-browser --formats markdown`（L399） | 272 | 1,202 s（`wallMs`，L458） | 272 条全记 `success`；其中 98 条 `evidence.finalUrl` 是站点首页、`httpStatus` 200、`redirectChain` 为空（L481–L482） |
| 详情页第 2 轮 | 同上 + `--wait-for 15000 --max-concurrency 1`（L486） | 98 | 424 s | 60 条好，38 条仍跳首页（L516） |
| 详情页第 3 轮 | 每组 8 个 URL，组间 `sleep 100`（L529、L534） | 38 | 约 13 min，含停顿 | 前 4 组 32/32 好；末组 6 条未记录（L573）；交付表 272 全齐（L608） |

三轮合计约 44 分钟（15:06:21Z 起，15:50:04Z 完成通知）。跳首页呈周期：约 10 页正常、约 9 页跳首页、再正常（L521）。这和按访问频率限制的站点一致，但会话里没有 429、Retry-After 或 Crawl-delay 证据，原因未证实；agent 的"每 8 页停 100 秒"是猜的（L562、L573）。

另一个会话（名单比对，`309b0385…`）里 `map` 从名录页出发、`sitemap: "only"`：`returned: 2, refused: 2555`（L150），精简答复没说原因，agent 据此放弃了 `map`。

## 2. 现有能力盘点

| 能力 | 本地（`octocrawl serve`、CLI、本地 MCP） | hosted（账户的 key 或 OAuth 连接） | 代码 |
| --- | --- | --- | --- |
| batch | 1–1,000 个 URL；`maxConcurrency` 1–4，只降不升；worker 默认 4，`W2L_WORKER_COUNT` 1–64；续跑、`idempotencyKey`、`appendToId`、webhook | 同样 1–1,000；每片 2 个 worker（`JOB_WORKER_COUNT`）；每片 100 页、首片 10 页、8 min + 60 s 宽限；每账户同时 2 个运行、10 个排队；每天 2,000 页/账户、10,000 页全站；结果保留 7 天 | [engine.ts](../../packages/api/src/engine.ts) `startBatch`；[hostedJobRoutes.ts:63-64](../../packages/mcp/src/hostedJobRoutes.ts)；[hostedJobWorker.ts:54](../../packages/mcp/src/hostedJobWorker.ts) |
| crawl | 页数无上限（MCP 默认 100）；sitemap 入队；`includePaths` / `excludePaths`；不支持 `authed` 和 `my-browser`（会点到退出链接） | 默认 100、最多 500；`maxConcurrency` 降到 2 | [orchestrator.ts](../../packages/runtime/src/orchestrator.ts) |
| map | 读 1 个页面 + sitemap，`limit` 默认 5,000；默认限制在起点路径子树，`crawlEntireDomain` 放开 | 同，`limit` ≤ 5,000、60 s | [map.ts:273](../../packages/runtime/src/map.ts) |
| 每站节奏 | 并发上限 2（`perHostConcurrency`，env 最多 4）、起步间隔 250 ms、robots `Crawl-delay`、429 的 Retry-After 冷却；跨片、跨重启保存在 `Task.pacing` | 同，另加每片一个站点租约，两片不同时读一个站 | [policy.ts:95-96](../../packages/contracts/src/policy.ts)；[originScheduler.ts:56](../../packages/bench/src/subjects/originScheduler.ts)；[frontier.ts:200](../../packages/runtime/src/frontier.ts) |
| 通道 | HTTP → Playwright 浏览器（一个 Chromium，每请求一个 context，没有找到 context 数上限）→ vendor → `authed`（导入登录态，Playwright）→ `my-browser`（一条 CDP 连接，一次一个 tab，强制串行） | HTTP → Playwright；每把 key 同时 1 个浏览器页（`browser_busy`）；无登录态 | [chromeHandoff.ts:296-302](../../packages/api/src/chromeHandoff.ts) |
| 结果回传 | `get_batch_items` 每次 ≤ 50，MCP 文本答复 50,000 字符截断；CLI `--out` 写文件 | ≤ 100；`GET /v1/jobs/:id/export` 签名链接；dashboard Jobs 页 | [results.ts:12](../../packages/mcp/src/results.ts) |
| 超过 1,000 个 | SDK `batchScrapeChunked`，分块顺序执行 | 同 | [client.ts](../../packages/sdk/src/client.ts) `batchScrapeChunked` |

没有的：根据页面内容自动放慢的逻辑；失败或假成功条目的自动重试；从 `scrape` 结果指向 `batch_scrape` 的 agentHints（`scrape` 描述只写 "Not for: many URLs"，[tools.ts:273](../../packages/mcp/src/tools.ts)）；`map` 对子树拒绝的说明。

## 3. 目标与非目标

目标：

- **G1** 一份已知 URL 列表一次提交，自动并发到站点允许的上限，不浪费读，不需要人工调 sleep。
- **G2** 假成功（跳首页、未登录页、挑战页、空壳页）在结果里有名字，重试策略和 agent 都能识别。
- **G3** agent 第一步就走 map / batch / crawl，而不是重复 scrape。
- **G4** 结果不穿过 agent 上下文：按字段投影，或导出文件。

非目标：

- 换身份、换 IP 绕过站点限频（ADR 0005 的立场；会话 L573 里 agent 也明确不这么做）。
- hosted 浏览器集群（ROADMAP Paused）。
- Firecrawl 以外的新 API 形状。

## 4. 框架设计

五层，加一层 agent 体验。每项标 D 编号，第 6 节评估可行性。

### 4.1 发现层：从站点到 URL 列表

现状：`map`（sitemap + 起点页链接）、列表页 `formats: ["links"]` 或 `list` 格式、`crawl`。缺口：`map` 子树规则拒掉大多数候选时不说原因。

- **D1 `map` 的子树拒绝有提示。已完成：#820，2026-11-04 合入 main**（紧凑答复的 `counts` 按原因列出拒绝数，agentHints 建议 `crawlEntireDomain: true` 或从站点根出发）。原设想： 当 `refused.subtreeDenied` 大于 `returned` 时加 warning `subtree_scope`（"N URLs were left out because they are outside the start URL's path subtree; set crawlEntireDomain: true, or start from the site root, to list the whole host"）和同义的 agentHints；MCP 紧凑答复带 `refused` 的前三个原因。改 [map.ts:416-442](../../packages/runtime/src/map.ts) 的 warnings 和 [hints.ts:304](../../packages/api/src/hints.ts)。
- **D2 "列表页 → 详情 URL"写成标准做法**，进 MCP instructions 和 `docs/batch-crawl-map.md`：`batch_scrape` 名录分页 + `formats: ["links"]`（或 `list`）→ 按路径过滤 → 第二个 batch。不新增工具。

### 4.2 任务层：batch

现状：durable、hosted 分片、续跑、幂等、追加。缺口：失败和假成功的条目不会自动重试；超过 1,000 个要 SDK 分块且顺序跑。

- **D3 batch 的软阻塞重试。** 请求加 `retry: { softBlocks: N }`（默认 1）。条目结束为 off-target（D10）、429 / 503、`timeout`、`verify` 失败（D11）时放回 frontier，等该站冷却（D5）后再读，最多 N 次；每次尝试留在 trace，`attempts` 计数进 `get_batch`。hosted 要把"待重试"写进 checkpoint，跨片生效。
- **D4 batch 的 `maxConcurrency` 上限从 4 放到 worker 数**，和 crawl 一致。多站点列表才用得上；单站仍受每站上限 2 约束。

### 4.3 调度层：每站节奏

现状：固定上限 + 固定间隔 + Retry-After 冷却 + Crawl-delay。缺口：站点不回 429 而是静默换页时，节奏不变。

- **D5 自适应节奏（AIMD）。** 每站维护 `ceiling` 和 `delay`。收到软阻塞信号（D10、D11、429、挑战页）：`ceiling` 降到 1，`delay` 翻倍（上限如 120 s），并对该站冷却 `delay`；连续 K 页（如 10）正常：`delay` 减半直到基线。信号只来自条目结果，不猜站点规则。状态存进已有的 `Task.pacing`，跨片、跨重启。改 [originScheduler.ts](../../packages/bench/src/subjects/originScheduler.ts)（`cooldown` 已有）、[frontier.ts:197-264](../../packages/runtime/src/frontier.ts)、engine 的结果回写。
  - 对 IDS：第一轮会在第 11 页左右发现跳首页并放慢，之后以站点允许的速率读完，不再有 98 + 38 页白读和 100 s 盲等。总时长不会低于站点允许的速率（第 5 节）。

### 4.4 通道容量层

- **HTTP / Playwright：** worker 4、每站 2，多站点批量已经并发；要更快改 `W2L_WORKER_COUNT`，D4 之后请求里的 `maxConcurrency` 也能跟上。**D6** 浏览器 context 池上限 + 内存护栏：现在没有找到上限，把 worker 调到 16 时一个 Chromium 开 16 个 context 没有保护。这就是 ROADMAP stage H 第 6 项"a browser pool, concurrency"的内容。
- **`authed`（导入登录态）：** 本就可每站并发 2，不占用你的 Chrome，是登录站点的首选。缺口：登录态没生效时页面照常 `success`（IDS 的两次试读）。现有 `login_wall` 规则只认页面开头的登录要求（[docs/access.md](../access.md) "Your own login"），行内的 "Log in for contact details" 算正文。**D7** 把"登录态是否生效"交给用户声明的 `verify` 契约（D11），不另写启发式；Evidence Record 另标 `sessionApplied`（cookie 数、localStorage 是否带上），让人能区分"没带上"和"带上了但站点不认"。IDS 属于后者：Gigya SSO，agent 推测登录依赖 cookie 之外的状态（L362、L369，未证实）。
- **`my-browser`：** 按设计串行，文档多处承诺"one at a time"（[docs/access.md:195](../access.md)、CLI `--help`）。**D8（可选，后置）** 允许 `maxConcurrency` 2–3 个 tab：技术上一条 CDP 连接可以开多个 target（[chromeHandoff.ts:296](../../packages/api/src/chromeHandoff.ts) 已用 `Target.createTarget`）；代价是同时只有一个 tab 可见，其余按 `page_read_hidden` 读（已有路径，对隐藏时折叠内容的站点保真度降低，`:83-91`），而且它用的是你本人的登录会话，多开只会更快触发限频。建议 D5 落地后再评估。
- **hosted：** 每片 2 worker、每站租约、worker 最多 3 个实例（Cloud Tasks `max-concurrent-dispatches=3`）。**D9** 每片 worker 2 → 4、实例数上调，需要成本数据（H0 压测：2 并发时 CPU ≤ 0.6、内存约 390 MiB，[research/hosted/2026-10-19-h0-load-test-714af563.md](../../research/hosted/2026-10-19-h0-load-test-714af563.md)）。属于 stage H 第 6 项，当前阶段冻结。hosted 没有登录态（ADR 0005），IDS 详情页这类任务在 hosted 上做不了，不是容量问题。

### 4.5 校验与回传层

- **D10 off-target 判定（正确性修复）。已完成：#821，2026-11-05 合入 main 并随 0.8.2 发布（另一会话，分支 `claude/sharp-newton-f1ae0f`）。** 它的规则按路径结构判定（最终 URL 折叠后是站点根、请求路径的祖先、或没有共同路径段的更短路径），warning 名为 `redirected_off_page`，所有通道都报，`my-browser` 的 `redirectChain` 改为记 `[requestedUrl, finalUrl]`，readiness 记 `not_served`，batch 和 crawl 报表加 `redirectedOffPage` 计数，并附文档与测试。未覆盖：hosted 任务报表不带该计数；条目状态仍是 `success`，errors 报表不列它们。本文原设想如下，可作为 #821 合入后的对照： 条目的最终 URL 经 canonical 折叠（`/a` 与 `/a/`、`index.html`、`www`、`http`/`https`、tracking 参数）后与请求 URL 路径不同，且满足其一：(a) 落在站点根；(b) 与同一 batch 里 ≥ 3 个其他条目落在同一最终 URL 或同一 `rawBodySha256`。则加 warning `off_target_redirect`（带 `requestedUrl`、`finalUrl`），不再是干净的 `success`，batch 的 errors 报表列出（`code: off_target_redirect`）。IDS 的 98 条全部满足 (a) 和 (b)。(b) 挡住合法跳转（`/product/123` → `/product/123-slug`、语言跳转）的误报。按会话里的分析记录，这个假成功已开成缺陷卡片，本文没有核对。
- **D11 `verify` 契约成为 batch 的重试信号。** `verify` 在 batch 上已经可用（"Same as scrape"），用户声明"好页长什么样"（例如电话样式的 `markdownMatches`），`verification.status: failed` 触发 D3 / D5。现有检查都是"必须含有"（`markdownIncludes`、`markdownMatches`、`markdownCountMin`、`minTables`、`tableRowsMin`、`listRecordsMin`、`recordFields`、`field`）；"不得含有"（IDS 的 "Log in for contact details"）要加 `markdownExcludes`。
- **D12 回传不过上下文。** `get_batch_items` 加 `fields` 投影（`url`、`status`、`finalUrl`、`json`、`warnings`、`verification`），默认不带 markdown；本地也提供 export 文件（CLI 已有 `--out`，MCP 没有）。272 行 Excel 这类任务的正确形态是每页一个 `json` 或 `list` 结果 + 导出，不是 Markdown 走 agent 上下文。

### 4.6 agent 体验

- **D13** 同一调用方 10 分钟内对同一站点第 3 次 `scrape` 时，结果加 agentHints："a known list of URLs: batch_scrape; a section of a site: crawl; the site's URLs: map"。放 hints 不放描述：本地工具列表已顶在 50,000 字节上限（[docs/h2-hosted-jobs-tasks.md](../h2-hosted-jobs-tasks.md) M6）。
- **D14** batch 启动答复带估算（按已知每页秒数与并发估计用时，及当前每站节奏）；`wait_batch` 返回当前速率和预计剩余，agent 才知道该等多久、何时回来。
- **D15** 文档修正：`docs/batch-scrape.md:137` 的 `wait_batch` "up to 300 seconds" 实际是 120 s；ROADMAP:76 "`batch` is refused there by design" 是 2026-10-13 的说法，hosted jobs 2026-10-20 起已提供。

## 5. 吞吐模型与 IDS 推算

单站：`pages/s ≈ min(每站并发 ÷ 每页秒数, 站点允许速率)`。多站点：`≈ worker 数 ÷ 每页秒数`。

实测参考：`my-browser` 串行 4.4 s/页（272 页 1,202 s）；hosted batch 2 并发 HTTP 页约 3.2 s/页（14 页 45 s）；H0 压测 500 个 HTTP 页 165.5 s、200 个浏览器页 261.7 s（2 并发）；hosted 1,000 URL batch 307 s，10 片、每片 20–40 s（[research/hosted/2026-10-20-h1-acceptance-d292501e.md](../../research/hosted/2026-10-20-h1-acceptance-d292501e.md)）。

| 场景 | 现状 | 方案落地后 | 说明 |
| --- | --- | --- | --- |
| IDS 272 个详情页（登录态 + 限频） | 约 44 min，含两轮人工重试 | 约 37 min（估计），无人工、无白读 | 下限 = 站点允许速率。按观察到的周期约 10 页 / 80–90 s 推算；周期未证实。D8 多 tab 不会缩短它 |
| 不限频的登录站点 272 页，`my-browser` | 20 min（4.4 s/页串行） | 同 20 min；只有 D8 能缩短到约 8–10 min（估计） | |
| 不限频的登录站点，`authed` 生效 | 约 10 min（每站 2 并发，估计） | 同 | 需要 D7 / D11 判定登录态生效 |
| 272 个不同站点的公开页（如展商官网） | 4 worker，约 3.4 min（估计，HTTP 页 3 s） | `W2L_WORKER_COUNT=16` + D4：约 1 min（估计） | 受本机 CPU 和网络限制；浏览器页按 0.76 页/s 另算 |
| hosted 公开页 1,000 个 URL | 307 s（实测） | D9 之后视成本数据 | 每片 2 并发、每站租约 |

## 6. 可行性评估

工作量：S 一天内，M 一到三天，L 三天以上，都是估计。

| 编号 | 内容 | 工作量 | 风险 | 与 ROADMAP 当前阶段的关系 | 验收证据 |
| --- | --- | --- | --- | --- | --- |
| D10 | off-target 判定 | M | 低到中：合法跳转误报，用 (b) 的"≥ 3 条同落点"规避 | 正确性修复，符合"修用户遇到的问题"；需先按 AGENTS.md 用 fixture 复现 | fixture：N 次后跳首页的假站；IDS 的 98 条真实记录 |
| D1 | `map` 子树提示 | S | 低 | 降低试用成本 | fixture + 第 9 节的 IDS 对照 |
| D13 | scrape → batch 的 hints | S | 低 | 降低试用成本 | 单元测试 |
| D15 | 文档修正 | S | 无 | — | — |
| D4 | batch `maxConcurrency` 上限随 worker 数 | S | 低：文档写的 1–4 要改 | 小改 | 已有 `orchestrator.test.ts:510` 加一例 |
| D2 | 列表页 → 详情的标准做法 | S | 无 | 文档 / instructions | — |
| D11 | `verify` 成为重试信号，加 `markdownExcludes` | S–M | 低 | 引擎 + contracts | fixture |
| D12 | `fields` 投影、本地 export | S–M | 低 | MCP / API | 单元测试 |
| D14 | 启动估算与速率 | S | 低 | MCP | 单元测试 |
| D5 | 自适应节奏 | M–L | 中：误判放慢正常任务；要求连续 2 个信号才降速 | 引擎新功能，当前阶段"引擎不接新工作"，需 Howard 决定 | fixture 限频假站 + IDS 实测两窗 |
| D3 | 软阻塞自动重试 | M | 中：hosted 分片 checkpoint 要带"待重试" | 同上 | fixture + hosted 一次真实任务 |
| D6 | 浏览器 context 池 + 内存护栏 | M | 中 | stage H 第 6 项，冻结 | 内存测量 |
| D7 | `sessionApplied` 标注 | S–M | 低 | 引擎 | IDS 复现 |
| D9 | hosted 每片 worker 2 → 4 | 代码 S，部署和测量 M | 成本 | stage H 第 6 项，冻结，等外部用户提出 | 每页成本记录 |
| D8 | `my-browser` 多 tab | L | 高：保真度、你本人会话的限频风险、推翻文档承诺 | 身份绑定功能，ADR 0005 范围 | 先看 D5 后的数据 |

2026-11-05 核对：D1 已由 #820 完成；D10 已由 #821 完成（另一会话，0.8.2）；D13、D4、D15 在 PR #824（本会话）。

## 7. 建议顺序

**Phase 0：不改代码，今天就能用的做法。**

- 发现：`map` 加 `crawlEntireDomain: true`（或从站点根出发），用 `search` 过滤路径。
- 已知列表：`batch_scrape`。登录站点先 `octocrawl login import <site>` + `--mode authed`（每站并发 2），用 `verify` 声明好页的样子；只有 authed 不生效才用 `--lane my-browser`，接受串行。
- 结果：CLI `--out` 或 hosted export，不要用 `get_batch_items` 全量拉 Markdown。
- 把这次 IDS 的经过按 [research/trials/TEMPLATE.md](../../research/trials/TEMPLATE.md) 记一条：虽是作者自己跑的，它就是外部用户会撞上的问题，也是 D10 / D5 的复现依据。

**Phase 1：正确性与提示（S / M，符合当前阶段）。** D1（#820）和 D10（#821）已合入；D13、D4、D15 在 PR #824，D13 放在 MCP 层（`packages/mcp/src/repeatedScrapes.ts`）实现，避开了 #821 改的 `packages/api/src/hints.ts`。剩 D2。

**Phase 2：引擎自动放慢与重试（需 Howard 决定）。** D5、D3、D11、D12、D14、D7。

**Phase 3：容量与身份绑定（stage H 第 6 项，冻结）。** D6、D9、D8。

## 8. 待 Howard 决定

1. off-target 页的状态：新增 `redirected` 状态，还是保留 `success` 加 warning 与 `verification.status: failed`？前者更直白，但动 contracts、Firecrawl shim 和文档。 #821 选的是后一种形态：状态不变，warning 加 readiness `not_served`，报表计数。要不要让 `succeeded` 不再计入这些条目、errors 报表列出它们，是合入后的对照项。
2. D5 / D3 要不要在"十个外部用户"阶段动引擎。依据：作者在真实任务上遇到了，抓任何限频站点的用户都会遇到；反面：ROADMAP 2026-11-01 写的是"引擎不接新工作，只修用户遇到的"。
3. D8（`my-browser` 多 tab）要不要进计划。建议不进，先看 D5 之后的数据。
4. hosted 容量（D9）是否等外部用户提出。

## 9. 本次探测记录

2026-11-05，hosted MCP（Howard 账户的 OAuth 连接），1 credit，经代理：

```
map url=https://www.english.ids-cologne.de/ids-cologne-exhibitors/list-of-exhibitors/ crawlEntireDomain=true search="exhibitor" limit=5000
→ id 14d16874-5dd4-44ce-b5a8-5f91084c1993, status completed, returned 2288, refused 450
  其中 2,135 条是 /exhibitor/<slug>/ 详情页（全部展商，不止 Dental materials 分类）
```

对照会话里从同一起点、`sitemap: "only"`、不带 `crawlEntireDomain` 的 map：`returned: 2, refused: 2555`（会话 `309b0385…` L150）。差别只在子树规则。
