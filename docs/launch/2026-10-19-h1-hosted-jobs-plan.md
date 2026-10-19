# H1 方案：小规模 hosted 任务（2026-10-19）

ROADMAP PH 的 H1 阶段：hosted `batch_scrape`（最多 1,000 个 URL）和 `crawl`（最多 500 页），用 Cloud Tasks、GCS 和 Firestore 任务文档实现，不上 Postgres。

H1 的退出条件（ROADMAP 原文）：
- `npm test` 和 `npm run typecheck` 通过；
- parity 站点在 hosted 上通过；
- 一个 1,000 URL 的 batch 跑完后，从任意实例都能读回结果。

这份方案依据：
- 代码现状，2026-10-19 main `187778fb`；
- H0 的三项结果：压测、出口对比、额度拆分；
- [云端功能规划](2026-10-18-cloud-feature-plan.md) 第 53–74 行的“先做小方案”。

文中标“估计”的数字还没测过。

## 1. 一句话设计

一个任务（job）切成多段（slice）执行：
- 每段由 Cloud Tasks 投递到一个独立的 worker 服务；
- worker 从 GCS 取回任务的 `checkpoint.sqlite`，用现有引擎接着跑，跑满一段的页数或时间后暂停；
- 把新页面和 checkpoint 写回 GCS，更新 Firestore 任务文档，再排下一段。

读结果只读 Firestore 和 GCS，所以任意实例都能读。

这样复用引擎已有的大部分能力：robots、frontier、去重、includePaths、访问阶梯。引擎本来就会在 shutdown 时把任务标成 `paused`（`packages/runtime/src/orchestrator.ts:500`），并在启动时自动续跑 `pending`、`running` 和 `paused` 的任务（`packages/api/src/engine.ts:1698-1716`），batch 和 crawl 都会。按页数切段也不用改引擎：worker 订阅 `engine.jobEvents` 的 `page` 事件，数到 N 后调用 `engine.close({ cancelActive: true })`（engine.ts:2375-2383），它会等正在跑的任务写完 `paused`。

但有三处引擎要补，见第 10 节 PR ②：
- **crawl 续跑会重读已读页。** `restoreFrontier` 把每个读到内容的页重新放回队列（orchestrator.ts:610-612），hosted 又不用页面缓存，所以会真的再请求一遍；已有测试也是这么期望的（`orchestrator.test.ts:311`）。要改成续跑时把已读页标为已访问，只把它们的链接放回队列。
- **Crawl-delay 跨段不成立。** 每站上次请求的时间和学到的 Crawl-delay 只在内存里（`frontier.ts:197-210`、`:257-264`），新一段的第一个请求可能紧跟上一段的最后一个请求。要把这两样存进任务、带进新引擎。
- **batch 一段只跑一部分站点**（第 8 节）需要一个按站过滤的入口；现在续跑的 batch 会把所有没读完的 URL 都放进队列（orchestrator.ts:597-599）。

## 2. 现状（为什么不能直接打开）

- hosted 网关只放行 scrape 和 map，其余一律 403 `hosted_unavailable`（`packages/mcp/src/hostedApi.ts:560-568`）。
- 任务状态在 `taskRoot/<id>/checkpoint.sqlite`。hosted 的 `taskRoot` 是 `/tmp`，实例一回收就没了，别的实例也读不到。
- 取消和 in-flight 控制器只在进程内存里（engine.ts:860-862）。好在 orchestrator 每 100 ms 会读一次任务行，看到 `cancelled` 就停（orchestrator.ts:294-309），所以写库也能取消。
- 计费是一次请求一次 reserve 加一次 settle（`accountStart`）。没有按任务、按页的扣费。
- 每日计数器按“启动次数”加 1，不按页数加。
- `Task` 上没有租户字段。
- 仓库里没有任何 Cloud Tasks 或 GCS 代码。
- 项目里 Cloud Tasks API 还没启用，只有 Cloud Build 用的一个 US bucket（2026-10-19 用 gcloud 查过）。

## 3. 组件

| 组件 | 做什么 | 新还是改 |
| --- | --- | --- |
| `octocrawl-api`（现有服务） | 接受启动、查询、取消和导出请求；写 Firestore 任务文档；排第一段 | 改：网关放行任务路由 |
| `octocrawl-jobs`（新 Cloud Run 服务，同一个镜像，入口不同） | 只接 Cloud Tasks 的 `POST /internal/jobs/:id/slice`；不公开（不加 `--allow-unauthenticated`，用 OIDC 校验） | 新 |
| Cloud Tasks 队列 `octocrawl-jobs`（asia-southeast1） | 投递每一段；同时最多 3 段并发，失败按退避重试 | 新 |
| GCS bucket `octocrawl-jobs-<project>`（asia-southeast1） | checkpoint、分段页面、导出文件；到期由 worker 删除，生命周期 30 天兜底 | 新 |
| Firestore `hostedJobs/{jobId}` | 任务的权威状态：归属、状态、计数、额度、租约、过期时间 | 新 |
| Firestore `hostedJobIdempotency/{workspaceId}-{keyHash}` | `Idempotency-Key` 到 jobId 的映射，24 小时 TTL | 新 |

为什么要单独一个 worker 服务：交互式的 scrape 和 map 现在只有 concurrency 2、最多 3 个实例。任务和它们抢实例的话，一个 batch 就能把交互调用挤到排队超时。拆开以后各自扩缩，任务也可以用更长的超时（15 分钟），交互服务保持 120 秒。

Firestore、GCS 和 Cloud Tasks 都照现有写法，用 REST 加 metadata server 的 token（hostedApi.ts:877-892），不引入 `@google-cloud/*` 依赖。

## 4. 数据

**`hostedJobs/{jobId}`**

| 字段 | 说明 |
| --- | --- |
| `workspaceId` | 现在等于 `ws_<uid>`（个人工作区）。H4 做团队时不用迁移 |
| `uid`、`keyId` | 谁发起的（keyId 是 key 的 HMAC 前缀） |
| `kind` | `batch` 或 `crawl` |
| `request` | 解析后的请求，不含 headers 的值 |
| `status` | `queued`、`running`、`completed`、`failed`、`cancelled`、`expired` |
| `counts` | `pages`、`errors`、`slices` |
| `credits` | `reserved`、`used`、`maxCredits` |
| `lease` | `holder`、`generation`、`expireAt` |
| 时间 | `createdAt`、`startedAt`、`finishedAt`、`expireAt`（结束后 7 天：过了就不再返回结果）、`deleteAt`（结束后 37 天，Firestore TTL 删除文档） |
| `hosts` | 每站最后请求时间和已知 Crawl-delay，跨段续上节奏 |

**GCS 布局**：`w/{workspaceId}/jobs/{jobId}/` 下面三类文件：
- `checkpoint.sqlite`：每段结束后上传，带 `ifGenerationMatch` 防止旧段覆盖新段；
- `pages/{slice:05d}.jsonl.gz`：这一段新增的步骤，每行一个页面结果；
- `export.jsonl.gz`：任务结束时合并生成。

`workspace_id` 出现在 Firestore 文档、GCS 路径和日志行里，满足 ROADMAP 的“每条记录都带 `workspace_id`”。SQLite 里的 `Task` 不加租户字段：它只在 worker 的临时目录里活一段时间，归属以 Firestore 为准。

## 5. 一段（slice）怎么跑

1. Cloud Tasks 投递 `POST /internal/jobs/:id/slice`，带这一段的 `generation`。
2. **拿租约**：Firestore 事务里先比较投递带来的 `generation` 和文档里的是否一致，再检查 `lease.expireAt` 已过或 `holder` 为空，然后写入自己。
   - `generation` 不一致（旧段的重复投递，Cloud Tasks 至少投递一次）：返回 200 丢弃，避免出现两条并行的段链。
   - 一致但租约还被占着（多半是实例死掉后 Cloud Tasks 很快重投，旧租约还没过期）：返回 503，让 Cloud Tasks 按退避再投；不能返回 200，否则这次投递算完成，之后再没有人排下一段，任务就永久卡住。租约时长等于这一段的上限 T 加 1 分钟，退避重试会在租约过期后成功。
   - 状态已是终态：返回 200。
3. **检查全局开关和额度**：
   - `hostedConfig/jobs.enabled` 为 false：任务保持 `queued`，延迟 5 分钟重排。
   - 账户额度不够跑下一段：任务 `failed`，原因 `credits_exhausted`，已有结果保留。
4. **预留**：这一段最多 N 页 × 单价（浏览器 5，`fastMode` 为 1），同时给当天的任务计数器加 N（见第 7 节）。
5. **跑**：从 GCS 下载 `checkpoint.sqlite`（第一段没有，新建），用 `createApiEngine({ hosted: true, resumeOnStart: true, ... })` 打开。
   - worker 的引擎配置和网关不同：网关是 `defaultMaxPages: 1`（hostedApi.ts:486），worker 要配到 500，否则 crawl 会被拒。
   - 新页面数到 N 或用时到 T 就调用 `close({ cancelActive: true })`，任务变成 `paused`。引擎里有 2 个并发，实际页数会略多于 N，结算按实际页数。
   - 跑的期间每 5 秒读一次 Firestore 任务文档：看到 `cancelled` 就在库里标记取消，引擎在下一页之前停下；看到全局开关关闭就 shutdown。
6. **写回**：
   - 把这一段新增的 steps 写到 `pages/{slice}.jsonl.gz`；
   - 上传 checkpoint（generation 匹配才写）；
   - 用每一步的结果算实际花费（现成的 `scrapeCharge`），settle 本段预留，多退少补，幂等键是 `{jobId}-{slice}`。注意存储的步骤把状态码放在 `evidence.httpStatus`，`scrapeCharge` 读的是 `evidenceRecord.httpStatus`（hostedCredits.ts:95），要先映射，否则 404 会记 0 而不是 1；
   - 把每站最后请求时间和已知 Crawl-delay 写进任务文档，下一段带进新引擎；
   - 更新任务文档的 `counts`、`credits` 和状态，释放租约。
7. **接下来**：
   - 引擎说完成、失败或取消：写终态，生成 `export.jsonl.gz`；
   - 否则排下一段。下一段排到队尾，所以多个任务的段会自然轮流，这就是 H1 的公平调度。

建议的一段：N = 100 页，T = 8 分钟（估计；按 H0 压测，HTTP 100 页约 17 秒，浏览器约 65 秒，慢站和 Crawl-delay 会更久）。worker 的请求超时 15 分钟，Cloud Tasks 的投递截止 15 分钟。

**实例死掉怎么办**：Cloud Tasks 按退避重投这一段，租约没过期时得到 503 继续退避，过期后新实例接手，从上一段的 checkpoint 重跑。这一段写了一半的页面文件会被重写，计费的幂等键不变，所以不会重复扣。代价是最多重跑一段。

## 6. 对外接口

全部只给已登录账户的 key 和 OAuth 连接。无 key 调用和没有账户的手发 key 一律拒绝，提示需要账户。

| 路由 | 说明 |
| --- | --- |
| `POST /v1/batches` | 1–1,000 个 URL；202，返回 jobId 和估计花费 |
| `POST /v1/crawl` | `maxPages` 默认 100，最多 500 |
| `GET /v1/batches/:id`、`GET /v1/crawl/:id` | 状态、计数、额度 |
| `GET /v1/batches/:id/items`、`GET /v1/crawl/:id/pages`、`.../errors` | 从 GCS 分段文件分页，游标是 `slice:line`。和本地 API 的响应形状一致 |
| `POST /v1/batches/:id/cancel`、`POST /v1/crawl/:id/cancel` | 写 `cancelled`；正在跑的段在下一页前停 |
| `GET /v1/jobs/:id/export` | 任务结束后返回 GCS 签名链接，15 分钟有效 |

规则：
- 每个读写都先核对 `workspaceId` 和调用方是否一致。不一致返回 404，不暴露任务是否存在。
- 过期的任务返回 410 `job_expired`。
- 同一个 `Idempotency-Key` 加同一个请求，24 小时内返回同一个 jobId；同一个 key 配不同请求返回 409，和本地语义一样（engine.ts:851-859）。
- 每个账户同时跑的任务最多 2 个，排队最多 10 个；超过返回 429 加 `Retry-After`。
- 请求可以带 `maxCredits`。花到上限时任务停下，状态 `completed`，`budgetExceeded: credits`。

MCP 工具、任务进度页和 webhook 在 H2 做（ROADMAP 原来就这么分）。H1 只做 REST 和 worker。不过 H1 的路由会和本地 API 保持同样的形状，这样 H2 的 MCP 工具能直接复用现有的 SDK 调用。

## 7. 额度和计费

**每日计数**：H0 刚拆出来的份额（全站 1,500，无 key 合计 500，每账户 500）按“启动次数”计，是给交互调用的。1,000 URL 的 batch 一次就会把单账户份额用完，所以任务要有自己的池，按页数计：

| 计数器 | 建议默认 | 说明 |
| --- | --- | --- |
| `<day>-jobs` | `W2L_JOBS_DAILY` = 10,000 页 | 所有任务合计，和交互的 1,500 分开，任务挤不掉交互调用 |
| `<day>-jobs-account-<uid>` | `W2L_JOBS_ACCOUNT_DAILY` = 2,000 页 | 一个账户一天的任务页数 |

`CreditsStore.reserve` 现在每个计数器只加 1。要改成可以加 N：同一次提交，同样的前置条件，测试照 #599 的写法。

**credits**：
- 每页的价格和单次 scrape 一样：HTTP 1，浏览器 5，404 记 1，robots 不让读的记 0。
- 每段预留、每段结算。为什么不在启动时一次预留全额：一个 1,000 URL、允许浏览器的 batch 要预留 5,000 credits，免费账户每月只有 1,000，大部分任务一开始就会被拒；按段走的话能先跑出结果，额度用完时再干净地停下。
- 启动时会算一个估计（URL 数 × 最高单价）放进响应，让调用方心里有数。只有余额连一段都不够时才拒绝启动。

**一个要你定的问题**：免费额度每月 1,000 credits，最多读约 1,000 个 HTTP 页面。所以一个 1,000 URL 的 batch 加上 parity 测试，免费账户一个月只能做一次。H1 的验收用测试账户就行（我们手动加 `purchased`）。但 H2 邀请外部用户时，是给他们手动加额度，还是任务页打折，需要你决定，见第 11 节。

## 8. 礼貌（per-host）

- 一个任务同一时间只有一段在跑（租约保证）。段内的节奏由引擎控制：Crawl-delay、每站最多 2 个并发、最少间隔 250 ms（`packages/runtime/src/frontier.ts:185-269`、`packages/contracts/src/policy.ts:95-96`）。段与段之间靠任务文档里的 `hosts` 续上（第 5 节）。
- 不同任务打同一个站时，两段可能在两个实例上同时跑。H1 的做法：每段开始前，对它要访问的站在 Firestore `hostedHostLeases/{host}` 上拿租约，租约时长等于这一段的时长。
  - crawl 只有一个站，直接拿。
  - batch 先挑出未读 URL 里所属站点没被占用的那些组成这一段；一个都挑不出来，就延迟 30 秒重排。
- 这比 H3 计划里的跨 worker 全局限速粗，但能保证同一时间只有一个实例在读一个站。这条单独写测试。

## 9. 保留、导出、删除

- 结果在任务结束后保留 7 天。任务结束时，worker 顺带排一个定时到 `expireAt` 的 Cloud Task（Cloud Tasks 最多可以提前 30 天定时），到点删掉 GCS 上这个任务的全部文件，并把状态写成 `expired`。
- 不能只靠 GCS 生命周期：它按对象创建时间算，第 0 段的文件在任务开始时就建了，任务拖得久的话早期分段会提前被删。生命周期只设 30 天，作为兜底。
- 任务文档本身多留 30 天（`deleteAt`），只作为过期记录：这期间接口返回 410 `job_expired`，不返回空结果冒充成功；之后 TTL 删除，接口返回 404。
- 导出是 `export.jsonl.gz` 的签名链接，15 分钟有效。
- 删除账户时（public-preview 的删除流程）要连带删掉 `w/ws_<uid>/` 下的文件和对应任务文档。在第 10 节的 PR ③ 里接上。

## 10. 拆成的 PR（每个都带测试，按顺序）

1. **存储客户端**：Firestore 任务文档和幂等表、GCS（上传、下载、generation 前置条件、签名链接）、Cloud Tasks（建任务、OIDC）的 REST 客户端，加内存假实现；测试用假的 HTTP 服务器，照 `hostedCredits.test.ts` 的 `fakeFirestore` 写法。
2. **分段执行**（引擎改动最多的一个）：
   - 在 `packages/api` 里加一个“跑一段”的入口，把 `close({ cancelActive: true })` 挂在新页数和时间预算上；
   - crawl 续跑不再重读已读页（runtime 的 `restoreFrontier`，改掉 `orchestrator.test.ts:311` 的期望，本地 `resume_crawl` 也受益）；
   - 引擎接受并导出每站最后请求时间和 Crawl-delay；
   - batch 续跑可以只取一部分站点的 URL。
   - 测试：用本地夹具站点跑一个 crawl 和一个多站 batch，各分成三段，每段换一个新引擎和复制过去的任务目录。验证每个 URL 只请求一次、`maxPages` 准确、跨段的请求间隔不小于 Crawl-delay、取消在下一页前生效。
3. **hosted 任务路由**：网关放行第 6 节的路由，加归属检查、并发和排队上限、幂等、估计花费、过期 410、导出链接，以及账户删除连带清理。
4. **worker**：`/internal/jobs/:id/slice`，包括租约和 generation 防护、每段预留和结算、按页计数（`reserve` 支持加 N）、取消轮询、全局开关、站点租约、到期删除。测试覆盖：实例在一段中途死掉后重投先得 503、租约过期后接手、不重复扣费；旧段的重复投递被丢弃；两个任务打同一个站不并行。
5. **部署和基础设施**：启用 Cloud Tasks API；建队列（最多 3 个并发投递，最多重试 5 次）；建 bucket 和生命周期规则；部署 `octocrawl-jobs` 服务；配服务账号和 `run.invoker`；开 Firestore TTL。另外把步骤写进 `docs/hosted-api.md`。这一步要动 GCP 资源，先等你点头。
6. **验收**：
   - parity 的 crawl 和 batch 用例（L02、L04、L11、A13–A15、A26–A35）对 hosted 跑一遍，记录在 `research/hosted/`；
   - 一个 1,000 URL 的 batch：跑完后先把两个服务都缩到 0，再从新实例和另一个 revision 的 tag URL 读回全部 1,000 项，记录命令、commit 和花费。

工作量估计：PR ① 1–2 天，② 2–4 天，③ 1–2 天，④ 2–3 天，⑤ 半天，⑥ 1 天，合计 8–13 天。没有算返工。

## 11. 要你决定的事

1. **免费账户和任务**：免费的 1,000 credits 一个月只够一次 1,000 URL 的 batch。H2 邀请用户时：
   - (a) 手动给他们加额度（我的建议，H4 收费前最简单）；
   - (b) 任务页打折，比如 HTTP 页 0.5。
2. **任务的每日池**：`W2L_JOBS_DAILY` = 10,000、每账户 2,000，这两个默认值是否可以？按 H0 的单价，1 万个 HTTP 页的计算成本约 $0.13（估计，按标价）。
3. **单独的 worker 服务** `octocrawl-jobs`：我建议单独，理由见第 3 节；不单独的话，少一个服务，但交互调用会被任务挤。
4. **PR ⑤ 动 GCP 资源**（启用 API、建队列、建 bucket、新服务）：可以在 PR ④ 合并后直接做，还是到时候再问你？

## 12. 风险和没做的事

- **checkpoint 体积**：每页的完整结果都在 `steps.result_json` 里。1,000 页的 checkpoint 估计 20–80 MB，每段都要上传一次。PR ② 会先量出来；太大的话，就让 checkpoint 只保留续跑需要的字段，正文只放在分段文件里。
- **跨实例礼貌**只靠站点租约，粒度是一整段；H3 才有真正的全局限速。
- **引擎改动**：第 1 节的三处是这份方案里最不确定的部分，PR ② 先做，做不下去就回来改方案。
- **被封的站**：出口对比只覆盖了不封的站（`research/hosted/2026-10-19-h0-egress-714af563.md`）。会封 Cloud Run 地址的站，在 hosted 任务里也会被封，结果会如实标 `blocked`。
- **滥用**：只有账户能开任务，有页数上限、每日池和全局开关。但 Google 的 IP 段被拿来对一个站批量请求的风险（云端规划第 455–465 行）没有完全消掉，靠站点租约和 Crawl-delay 兜底。
- **H1 不做**：MCP 任务工具、进度页、webhook（这些在 H2；H2 也明确不给无 key 调用开 crawl）；Postgres 和 worker 池（H3）；团队（H4）；hosted 增强访问（H5）。
