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
- [ ] **M6** MCP 的 `crawl` 和 `batch_scrape` 支持 `maxCredits`：contracts 的解析和 SDK 都要认这个参数。REST 已经接受它。
- [x] **M7** `get_batch_errors` 的描述写的是本地的 `{ errors, robotsBlocked }`，hosted 返回的是 `{ items, nextCursor, hasMore }`；没有浏览器通道的连接，schema 里还列着截图格式（REST 会拒绝并说明原因）。这两处要改。
  - hosted 的 `get_batch_errors` 描述改成 `{ items, nextCursor, hasMore }`，说明每条和 `get_batch_items` 一样，robots 拒绝的 URL 以 blocked 出现。
  - `crawl` 和 `batch_scrape` 的 `formats` 直接用 hosted scrape 的那份：没有浏览器通道就没有截图。
- [x] **M8** hosted MCP 的任务条目里带着 `usage` 和完整的 `trace`。hosted 的 scrape 会去掉这些，而 `get_crawl_pages` 的描述写的是“不带 debug 时不含 trace”。这一项在 A1 中发现。
  - `withoutTelemetry`（`results.ts`）对 `get_batch_items`、`get_crawl_pages`、`get_*_errors` 的每条去掉 `usage` 和 `trace`，`debug: true` 时原样返回；Evidence Record 不动。
- [x] **M9** hosted 的 `batch_scrape` schema 还列着 `mode: authed`，`maxFileBytes` 的上限是 500 MB，描述里提到 `appendToId`。这一项在 A1 中发现。
  - `crawl` 和 `batch_scrape` 的 `mode` 只剩 standard 和 research，`maxFileBytes` 上限 5 MiB；描述去掉 `appendToId`、`actions` 和“保留多久没说明”（hosted 的说明里写了 7 天）。
  - 测试在 `packages/mcp/test/hostedJobMcp.test.ts`。

## P：任务进度数据

- [x] **P1** `GET /v1/jobs` 列出账户的任务：最近的在前，分页；返回和状态接口一样的字段。dashboard 和 MCP 都可以用。
  - 做成的样子：`?limit=1–50&before=<上一页的 nextBefore>`，返回 `{ items, nextBefore, hasMore }`；不带账户 key 时返回 403。
  - 列表来自 workspace 的 slots 文档里的 `recent`：账户最近启动的 200 个任务的 id，在启动任务的同一次提交里写入。这样不需要 Firestore 复合索引，顺序也准。
  - 记录被 TTL 删掉的任务不再列出。这个改动之前启动的任务不在列表里，只有 H1 验收时跑的那几个。
  - 接口说明在 `docs/hosted-api.md` 的 Batch and crawl jobs 一节，可以直接交给 UI 窗口做 P2。
- [ ] **P2** 进度页（UI 窗口），见“待你决定”第 3 条。

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
  - 已知缺口（后续项）：
    - 第一个 slice 没排上队（`not_queued`）的任务，worker 不会走到结束这一步，所以不发 webhook。
    - 任务取消时，如果下一个 slice 正带着延迟在队列里等（比如等到 UTC 次日），webhook 要等那个 slice 到期才发。
  - 要上线，需要重新部署 API 和 worker（R1）。不用新建资源：沿用同一个队列和服务账号。

## R：发布与开放

- [x] **R1** 按带 tag 的 revision 流程部署 API 和 worker，确认线上 revision。
  - 2026-10-20 部署 main `dd218625`：API 用 `octocrawl-api-hook-dd21862`（tag `h32hook`，回滚用 `h31fetched`），worker 用 `octocrawl-jobs-w9-dd21862`（tag `w9hook`，回滚用 w8）。
  - 在线上用一个测试 key 跑了一次 webhook：投递成功、签名有效、密钥没有泄露，记录见 [research/hosted/2026-10-20-h2-r1-webhook-dd218625.md](../research/hosted/2026-10-20-h2-r1-webhook-dd218625.md)。
  - 测试 key 已吊销，全局开关已关。
- [ ] **R2** 打开全局开关，按名单邀请（见“待你决定”第 1 条）。
- [ ] **R3** 更新 `apps/public-web/content/connect-mcp.md` 和 `docs/hosted-api.md`，写明 hosted 任务的用法和上限。

## A：验收

- [ ] **A1** Claude Code、Codex 和第三个客户端（OpenCode）各自端到端跑一次：启动、查询、取数据，并记下客户端版本。记录放 `research/hosted/`。
- [ ] **A2** 外部用户在跑任务：日志里出现非测试账户的任务。

## 从 H1 带过来的后续项

- **E7** 二进制压缩包被当成 `success`。
- **R7** Cloudflare 用 1010 拦掉 Python 默认的 User-Agent。开放前要核对 Python SDK。
- **W13** `reserve` 的回应丢失时，额度一直被占着。

## 下次从这里继续

- M1–M5（#627）、P1（#629）、W1–W4（#636）已合并，R1 已部署并在线上验证。全局开关现在是关的。
- 下一项：R3（更新 connect-mcp 和 hosted-api 文档里的任务用法）和 A1（三个客户端端到端跑一次）。R2（打开开关、发邀请）要等你给出邀请名单。
