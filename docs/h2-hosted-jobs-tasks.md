# H2 hosted 任务：客户端与邀请使用 任务清单

依据：[ROADMAP.md](../ROADMAP.md) PH 的 H2 行；H1 已完成（2026-10-20，[H1 清单](h1-hosted-jobs-tasks.md)）；[AGENTS.md](../AGENTS.md)。核实基于 `main` 的 `738e7e3b` 之后，日期 2026-10-20。

**目标**：

- 让客户端能用 MCP 工具启动、查询、翻页和取消任务。
- 提供任务进度页。
- 任务结束时发一个签名 webhook。
- 部署后开放给受邀的 key 持有者。

**完成标准**（ROADMAP 的 H2 退出条件）：

- 至少三个客户端（Claude Code、Codex 和另一个）端到端跑通启动、查询、取数据，并记录各自的版本。
- 有外部用户在跑任务。

用法：做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 已经具备（H1 做完的）

- **没有 key 就不能 crawl。** 任务只给账户的 key 和 OAuth 连接用（`hostedJobRoutes.ts`）。
- **每个任务有页数上限。** crawl 最多 500 页，batch 最多 1,000 个 URL，还有 `maxCredits`。
- **全局开关。** `hostedConfig/jobs.enabled`，现在是关的。

## 待你决定

1. **邀请谁、怎么邀请。**
   - 我的默认：由你给出名单，我给他们的账户加试用额度（`purchased`）。
   - 这一项会挡住 A2。
2. **webhook 的签名密钥。**
   - 我的默认：每个任务启动时生成一个 `whsec_` 开头的密钥，只在启动的响应里返回一次。签名方式和本地一样，用 `x-w2l-signature`（HMAC-SHA256，对 `时间戳.正文` 签名）。
   - 你可以改成每个账户一个固定的密钥。
3. **任务进度页由谁做。**
   - 页面在 `apps/public-web`，属于 UI 窗口。
   - 这个窗口只提供数据接口（P1）。
   - 默认：我做完 P1 后写一份接口说明，由你交给 UI 窗口。

## M：MCP 任务工具（`packages/mcp/src/hostedApi.ts`）

- [x] **M1** 账户调用方（key 或 OAuth）在 `/mcp` 和 `/mcp-oauth` 上列出任务工具：
  - crawl 类：`crawl`、`get_crawl`、`get_crawl_pages`、`get_crawl_errors`、`cancel_crawl`、`wait_crawl`；
  - batch 类：`batch_scrape`、`get_batch`、`get_batch_items`、`get_batch_errors`、`cancel_batch`、`wait_batch`。
  - 不带 key 的调用方和没有账户的 key 不列出这些工具；如果硬调，要说明需要账户。
- [x] **M2** 收紧任务工具的输入 schema，只保留 hosted 接受的参数（`HOSTED_BATCH_KEYS`、`HOSTED_CRAWL_KEYS`）。
  - 没有浏览器通道的连接，不列出 `waitFor` 和截图。
- [x] **M3** `wait_*` 的等待时长受 hosted MCP 的 100 秒上限约束。超时时返回任务当前的状态，并提示稍后再查。
- [x] **M4** 更新 instructions 和 server card，说明 hosted 现在可以跑任务，以及上限和收费。
- [x] **M5** 测试：用内存版的任务存储和假队列跑通。覆盖 MCP 启动 → 查询 → 翻页 → 取消；以及不带 key 的调用方看不到这些工具。

- M 做成的样子（`packages/mcp/src/hostedApi.ts` 的 `hostedTools`、`hostedJobTool`，测试在 `packages/mcp/test/hostedJobMcp.test.ts`）：
  - 服务器配置了任务、调用方又有账户时，才列出 12 个任务工具。
  - 启动类工具只保留 hosted 接受的参数，`maxPages` 的上限是 500。
  - `wait_*` 最多等 90 秒。
  - 状态的枚举加了 `queued` 和 `expired`。
  - 不带 key 的调用方硬调任务工具，会被告知需要账户。
  - server card 只描述不带 key 的调用方，所以没改。
  - 审查后改的：
    - MCP 处理器在进程内的调用不再计入调用方地址的限额（`wait_*` 每 500 毫秒查一次，原来 60 秒左右就会被 429）；
    - 列表工具的 `limit` 和 `maxResults` 收紧到 100；
    - `maxCredits` 从工具 schema 去掉，见 M6。
- [x] **M6** MCP 的 `crawl` 和 `batch_scrape` 支持 `maxCredits`：contracts 的解析和 SDK 都要认这个参数。REST 已经接受它。
  - contracts 的 `parseBatchStartRequest` 和 `parseCrawlStartRequest` 接受 `maxCredits`（正整数）；追加 URL（`appendToId`）时不接受。
  - SDK 的 `CrawlStartRequest`、`BatchStartRequest` 类型加了这个参数，SDK 原样放进请求体发出。MCP 的 `crawl` 和 `batch_scrape` 会把它传给 REST。
  - 只有 hosted 的任务工具在 schema 里列出它。本地工具列表已经顶在 50,000 字节的上限上，而且本地服务器不花额度：本地收到这个参数时照常接受，但不会因此停下任务。
- [x] **M7** `get_batch_errors` 的描述写的是本地的 `{ errors, robotsBlocked }`，hosted 返回的是 `{ items, nextCursor, hasMore }`；没有浏览器通道的连接，schema 里还列着截图格式（REST 会拒绝并说明原因）。这两处要改。
  - hosted 的 `get_batch_errors` 描述改成 `{ items, nextCursor, hasMore }`，说明每条和 `get_batch_items` 一样，robots 拒绝的 URL 以 blocked 出现。
  - `crawl` 和 `batch_scrape` 的 `formats` 直接用 hosted scrape 的那份：没有浏览器通道就没有截图。
- [x] **M8** hosted MCP 的任务条目里带着 `usage` 和完整的 `trace`。hosted 的 scrape 会去掉这些，而 `get_crawl_pages` 的描述写的是“不带 debug 时不含 trace”。这一项在 A1 中发现。
  - `withoutTelemetry`（`results.ts`）对 `get_batch_items`、`get_crawl_pages`、`get_*_errors` 的每条去掉 `usage` 和 `trace`，`debug: true` 时原样返回；Evidence Record 不动。hosted 的两个 errors 工具为此加了 `debug` 参数。
- [x] **M9** hosted 的 `batch_scrape` schema 还列着 `mode: authed`，`maxFileBytes` 的上限是 500 MB，描述里提到 `appendToId`。这一项在 A1 中发现。
  - `crawl` 和 `batch_scrape` 的 `mode` 只剩 standard 和 research，`maxFileBytes` 上限 5 MiB；描述去掉 `appendToId`、`actions` 和“保留多久没说明”（hosted 的说明里写了 7 天）。
  - 测试在 `packages/mcp/test/hostedJobMcp.test.ts`。

## P：任务进度数据

- [x] **P1** `GET /v1/jobs` 列出账户的任务：最近的在前，分页；返回和状态接口一样的字段。dashboard 和 MCP 都可以用。
  - 做成的样子：`?limit=1–50&before=<上一页的 nextBefore>`，返回 `{ items, nextBefore, hasMore }`；不带账户 key 时返回 403。
  - 列表来自 workspace 的 slots 文档里的 `recent`：账户最近启动的 200 个任务的 id，在启动任务的同一次提交里写入。这样不需要 Firestore 复合索引，顺序也准。
  - 记录被 TTL 删掉的任务不再列出。这个改动之前启动的任务不在列表里，只有 H1 验收时跑的那几个。
  - 接口说明在 `docs/hosted-api.md` 的 Batch and crawl jobs 一节，可以直接交给 UI 窗口做 P2。
- [x] **P2** 进度页（UI 窗口），见“待你决定”第 3 条。
  - 做成的样子：dashboard 的 `/dashboard/jobs/`（Workspace 组，Activity 之后）。列出账户的任务，最近的在前，每页 20 个，可以“Load more”；每行有类型、id、状态（失败时带 failureReason）、实心 `<progress>`（batch 按 requested 算；运行中的 crawl 总数未知，进度条不带 value）、额度（有 maxCredits 时写“of N”）、开始和结束时间。
  - 有任务在 queued 或 running 时，每 5 秒重读这些任务（`GET /v1/{batches|crawl}/:id`），页面隐藏时不读，全部结束后停止。只重绘变了的行，所以 Export 按钮不会在轮询时丢焦点。
  - 结束的任务有 Export 按钮：取 `GET /v1/jobs/:id/export` 的签名链接（15 分钟有效）并打开，下载 gzip 的 JSON Lines；页面下方写了用 MCP（`get_batch_items`、`get_crawl_pages`）和 REST 读取的方法。过期的任务显示已删除。
  - 没有任务时说明任务目前只对受邀账户开放，以及怎样从 MCP 客户端启动（链接到 `/docs/connect-mcp/#crawl-and-batch-jobs`）。读取不受邀请名单限制。
  - 站点服务端（`packages/public-preview/src/account.ts`）加了三个只读代理：`GET /api/account/jobs`、`/api/account/jobs/{batches|crawl}/:id`、`/api/account/jobs/:id/export`，和 Playground 一样用签名的账户头访问 hosted API。hosted API 的网关本来就对这个头放行任务读取，所以 API 不需要改动和部署。

## W：任务结束的 webhook

- [x] **W1** hosted 任务接受 `webhook: { url, events? }`。
  - 只允许公网 https 地址，和本地 hosted 模式的规则一样。
  - 不接受 headers 和 secretEnv。
- [x] **W2** 启动时生成签名密钥，只返回一次（见“待你决定”第 2 条），存在任务文档里，不回显。
- [x] **W3** worker 在任务结束（completed、failed、cancelled）时发一次签名的 POST。
  - 失败就交给 Cloud Tasks 重试，最多若干次。
  - 记下送达结果。
- [x] **W4** 文档：签名的验证方法和示例。

- W 做成的样子（2026-10-20 决定：每个任务一个 `whsec_` 密钥）：
  - 路由 `readHostedWebhook` 校验 webhook，`webhook` 不进入引擎跑的请求。
  - 启动的响应里返回 `webhook.secret`。用同一个 idempotency key 重放的启动，会再返回同一个密钥，因为第一次的响应可能丢了；只有同一个账户能触发重放。
  - 状态和列表只显示 `url`、`events`、`delivery`，不显示密钥。
  - 任务结束时，worker 的 `finish` 排一个 Cloud Tasks 投递 `{jobId}-webhook`，由 `runJobWebhook` 发送。
    - 2xx 算送达；408、425、429、5xx 或没有回应，交给 Cloud Tasks 重试，最多 8 次（约 20 分钟）；其他回应和被出口策略拒绝的地址直接记为失败。
    - 每次结果记在任务的 `webhook.delivery` 上。
  - 签名和本地一致：`x-w2l-signature` = `sha256=` 加上对 `{x-w2l-timestamp}.{body}` 的 HMAC-SHA256。
  - 验证示例（Node 和 Python）在 `docs/hosted-api.md` 的 Job webhooks 一节。
  - MCP 工具不提供 webhook：schema 里不列，硬传会被拒绝，因为密钥会落进 agent 的对话记录。要不要提供，以后再定。
  - 原来的两个已知缺口，2026-10-21 补上（行为说明见 `docs/hosted-api.md` 的 Job webhooks）：
    - **`not_queued`。** 启动时就没排上队的任务，启动请求收到的是 503，所以不发 webhook，并在 `webhook.delivery` 里写明原因。先排队、被提升后才没排上队的任务，会立即用 `{jobId}-finish` 投递走结束流程并发出 webhook；这个投递也被拒绝时，记为“未发送”。
    - **取消。** 没有 slice 持有租约时，取消会立即用 `{jobId}-finish` 投递结束任务，不再被带延迟等着的 slice 拖住。有 slice 正在运行时，由那个 slice 提交时结束任务。
    - “未发送”只在还没有任何投递记录时写入，不会盖掉进行中或已送达的记录。
    - 已上线（#664）：API `octocrawl-api-finish-059ea76`（tag `h36finish`，回滚用 `h35credits`）。
    - 在 tag 地址上验证：启动一个带 webhook 的 5 个 URL 的 batch 后立即取消，任务以 `cancelled` 结束、用了 0 个 credit，webhook 在取消后 7 秒第一次投递就送达（接收端收到 `cancelled` 事件），导出链接返回 200。临时 key 已吊销。
  - 要上线，需要重新部署 API 和 worker（R1）。不用新建资源：沿用同一个队列和服务账号。

## R：发布与开放

- [x] **R1** 按带 tag 的 revision 流程部署 API 和 worker，确认线上 revision。
  - 2026-10-20 部署 main `dd218625`：API 用 `octocrawl-api-hook-dd21862`（tag `h32hook`，回滚用 `h31fetched`），worker 用 `octocrawl-jobs-w9-dd21862`（tag `w9hook`，回滚用 w8）。
  - 在线上用一个测试 key 跑了一次 webhook：投递成功、签名有效、密钥没有泄露，记录见 [research/hosted/2026-10-20-h2-r1-webhook-dd218625.md](../research/hosted/2026-10-20-h2-r1-webhook-dd218625.md)。
  - 测试 key 已吊销，全局开关已关。
- [x] **R1b** 按账户放行（2026-10-21 决定：先加白名单，只放名单内的账户）：`hostedConfig/jobs.allowedUids`。没有这个字段时所有账户都能启动任务；有这个字段时只放行名单内的账户，空数组谁都不放。不在名单上的账户启动任务会收到 403 `jobs_invite_only`，MCP 也不列出任务工具；读取和取消在 REST 上照常可用。说明见 `docs/hosted-api.md`。要部署 API 才在线上生效，和 R2 一起做。
- [x] **R2** 打开全局开关，按名单邀请（见“待你决定”第 1 条）。顺序：先写 `allowedUids`，确认生效，再开开关。
  - 2026-10-21：暂时没有人选，名单只放 Howard 的账户，开关已打开并保持开着。
  - API 部署为 `octocrawl-api-invite-7f935dc`（tag `h34invite`，回滚用 `h33shapes`）。
  - 名单外的测试账户启动任务收到 403 `jobs_invite_only`，MCP 也不列出任务工具；Howard 的账户经 REST 和 MCP 各跑了一个任务，都完成了。
  - 记录见 [research/hosted/2026-10-21-h2-r2-invite-7f935dc5.md](../research/hosted/2026-10-21-h2-r2-invite-7f935dc5.md)。
  - 以后加人：把 uid 加进 `allowedUids` 即可，不用部署。
- [x] **R3** 更新 `apps/public-web/content/connect-mcp.md` 和 `docs/hosted-api.md`，写明 hosted 任务的用法和上限。
  - 另外改了 `apps/public-web/content/limits.md`：它原来写着 hosted 不跑 crawl 和 batch。
  - 这几页要等下一次 public preview 部署才会上线。那是 UI 窗口的部署，这里没做。

## A：验收

- [x] **A1** Claude Code、Codex 和第三个客户端（OpenCode）各自端到端跑一次：启动、查询、取数据，并记下客户端版本。记录放 `research/hosted/`。
  - 2026-10-20 在线上跑通，记录见 [research/hosted/2026-10-20-h2-a1-clients-d094e319.md](../research/hosted/2026-10-20-h2-a1-clients-d094e319.md)。
  - 版本：Claude Code 2.1.301（`/mcp-oauth`）、Codex 0.162.1（`/mcp` 加 key）、OpenCode 1.18.26（`/mcp` 加 key）。
- [ ] **A2** 外部用户在跑任务：日志里出现非测试账户的任务。

## 从 H1 带过来的后续项

- **E7** 二进制压缩包被当成 `success`。
- **R7** Cloudflare 用 1010 拦掉 Python 默认的 User-Agent。开放前要核对 Python SDK。
- **W13** `reserve` 的回应丢失时，额度一直被占着。

## 下次从这里继续

- M1–M5（#627）、P1（#629）、W1–W4（#636）、M7–M9（#642）已合并，R1 已部署并在线上验证。全局开关现在是关的。
- R3 和 A1 已完成（2026-10-20）。H2 剩下的：
  - R2 已完成：开关已开，名单只有 Howard 的账户。A2（外部用户在跑任务）要等有了邀请的人，并把他们加进 `allowedUids`。
  - 后续部署（2026-10-21）：
    - API `octocrawl-api-credits-3354110`（tag `h35credits`，main `3354110f`，含 M6；回滚用 `h34invite`）。在 tag 地址上，用 MCP 跑了一个 `maxCredits: 1` 的任务，用量正好 1 个 credit；`mcp.octocrawl.dev` 的 `crawl` 和 `batch_scrape` 都列出了 `maxCredits`。
    - 官网先部署了 `w2l-public-preview-jobs-5beacbf3`（tag `r109jobs`，任务文档），再部署了 `w2l-public-preview-credits-3354110f`（tag `r110credits`，回滚用 `r109jobs`）。connect-mcp 页和 limits 页的新内容都在线上核对过。
  - M7–M9（#642）已部署：2026-10-21 上线 main `917d35f7` 的 API，revision `octocrawl-api-shapes-917d35f`（tag `h33shapes`，回滚用 `h32hook`）。worker 没变，仍是 w9。
    - 先在不接流量的 tag 上，用一把临时的 HTTP 通道 key 对比 `tools/list`：h32hook 上 `batch_scrape` 的 `mode` 含 `authed`、`maxFileBytes` 上限 524288000、描述提到 `appendToId`；h33shapes 上 `mode` 只有 standard 和 research、上限 5242880、不再提 `appendToId`。`get_batch_errors` 改说 `{ items, nextCursor, hasMore }`，formats 的枚举里没有截图。
    - 切流量后 `mcp.octocrawl.dev` 给出同样的结果。临时 key 已吊销。
    - M8（任务条目去掉 `usage` 和 `trace`）要跑一个任务才看得到，这次开关没开，没有在线上验证，只有单元测试覆盖。
  - webhook 的两个已知缺口已补上，M6 已完成，都已在线上生效（`h36finish`）。
  - 开放前要核对 R7（Python SDK 的 User-Agent）。
  - P2 进度页已完成（dashboard 的 Jobs 页）。
