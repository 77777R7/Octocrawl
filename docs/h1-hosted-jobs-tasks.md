# H1 小规模 hosted 任务：任务清单

**依据：**
- [ROADMAP.md](../ROADMAP.md) PH 的 H1 行；
- 方案 [docs/launch/2026-10-19-h1-hosted-jobs-plan.md](launch/2026-10-19-h1-hosted-jobs-plan.md)（下文简称“方案”，§ 是它的小节）；
- [AGENTS.md](../AGENTS.md)。

核实基于 `main` 的 `187778fb`，日期 2026-10-19。

**目标：** hosted `batch_scrape` 最多 1,000 个 URL，`crawl` 最多 500 页。用 Cloud Tasks、GCS 和 Firestore 任务文档实现，不上 Postgres。

**完成标准（ROADMAP 的 H1 退出条件）：**
- `npm test` 和 `npm run typecheck` 通过；
- parity 的 crawl 和 batch 用例在 hosted 上通过；
- 一个 1,000 URL 的 batch 跑完后，从任意实例都能读回结果。

用法：做完一项勾一项，发现新的就补上。看进度读这个文件，不翻滚动记录。

## 待你决定（方案 §11）

还没回复的项先按我的默认做，你改了我再跟着改。

1. **免费账户跑任务：** 免费 1,000 credits 一个月只够一次 1,000 URL 的 batch。
   - 默认：H2 邀请用户时手动加 `purchased`。
   - 只影响 H2，不挡 H1。
2. **任务每日池：** 默认 `W2L_JOBS_DAILY` = 10,000 页，`W2L_JOBS_ACCOUNT_DAILY` = 2,000 页。
   - 两个值都是环境变量，事后可以改。
   - 影响 PR ④ 的默认值，不挡开工。
3. **单独的 worker 服务 `octocrawl-jobs`：** 默认单独建。
   - 影响 PR ④ 的入口和 PR ⑤ 的部署。
4. **动 GCP 资源：** 启用 Cloud Tasks API、建队列、建 bucket、部署新服务。
   - 默认：做到 PR ⑤ 时再问你，不先动。
   - **挡住 PR ⑤ 和 ⑥。**

## 总原则

- **分支：** 每个 PR 一个分支，从当前 `origin/main` 拉，分支落后 `main` 不超过一个 PR。
- **提交：** commit 加 `-s`，用 conventional 格式。开 PR 后马上开 Auto-fix。
- **调用方式：** Firestore、GCS 和 Cloud Tasks 都用 REST 加 metadata token，照 `hostedApi.ts:877-892` 的写法，不加 `@google-cloud/*` 依赖。
- **测试：** 先写会失败的测试，再改代码。假的 HTTP 服务照 `hostedCredits.test.ts` 的 `fakeFirestore` 写法。
- **审查：** 每个 PR 提交前交给 subagent 用干净的上下文审，只列会阻止合并的问题。
- **部署和 GCP 资源：** 要先问你。
- **证据：** 没在真实环境跑过的不写“支持”。真实站点的运行要记录命令、commit，以及是否走了代理。

## PR ① 存储客户端（`packages/mcp`，新文件）

- [x] **S1** `hostedJobs/{jobId}` 的读写，字段按方案 §4。
  - 用事务加 update-time 前置条件，做到：创建任务、改状态、拿租约（比较 `generation`）、放租约、加计数。
  - 内存实现和 Firestore REST 实现各一份，接口相同。
- [x] **S2** `hostedJobIdempotency/{workspaceId}-{keyHash}`，24 小时 TTL。
  - 同一个 key 加同一个请求返回原来的 jobId；同一个 key 配不同请求返回冲突。
- [x] **S3** GCS 客户端：
  - 上传、下载、删除前缀；
  - 上传带 `ifGenerationMatch`；
  - 签名下载链接，15 分钟有效。签名用服务账号的 `signBlob`（IAM Credentials REST），不在镜像里放私钥。
- [x] **S4** Cloud Tasks 客户端：
  - 建任务，带 OIDC token、`scheduleTime` 和 `dispatchDeadline`；
  - 任务名由 `{jobId}-{generation}` 生成，用来去重。
- 验收：每个客户端都对假的 HTTP 服务测过成功、前置条件失败重试、404 和 409；`npm run typecheck` 和 `npm test` 通过。
- PR ① 做成的样子（`packages/mcp/src/hostedJobs.ts`、`hostedCloud.ts`）：
  - 任务、工作区的运行/排队名单和幂等 key 在一次提交里写；
  - 排队中的任务拿不到租约（`queued`），被提升时才排第一段；
  - 幂等 key 的 id 必须以它的 workspaceId 开头。
- 还没对真实 Google 服务验证过，PR ⑤ 部署后核对：
  - GCS 媒体下载是否带 `x-goog-generation`；
  - 签名链接能否被 GCS 接受；
  - Cloud Tasks 的请求体是否被接受。

## PR ② 分段执行（`packages/api`、`packages/runtime`）

这是方案里最不确定的一个 PR。做不下去就停下，回去改方案（方案 §12）。

- [x] **E1** 先写失败测试：crawl 分三段续跑，每个 URL 只请求一次。
  - 做法和原计划不同：没改默认行为，改为加一个选项 `CrawlSpec.skipFetchedOnResume`，hosted worker 打开它。打开后，续跑时任务已有步骤的 URL（不论结果）都标为已访问，只把读到内容的页的链接放回队列。
  - 为什么不改默认：本地 crawl 的页面列表只读最新一次 attempt（engine.ts:1086、2160），续跑时重读就是为了让新 attempt 自己列全所有页。改了默认，本地 `resume_crawl` 之后的列表会缺掉前面的页。`orchestrator.test.ts:311` 的期望保持不变。
  - 也没用 `useCached`：缓存页仍要等每站间隔和 Crawl-delay，每段都会白等；而且每段都把旧步骤复制进新 attempt，checkpoint 会按平方增长。
  - 测试：三段续跑每个 URL 只读一次；上一段失败的页不重读；页数预算跨段累计。
- [x] **E2** 引擎能导出、也能接受每站的最后请求时间和已知 Crawl-delay。
  - 测试：跨段的请求间隔不小于 Crawl-delay。
  - 做法：一次运行结束时（包括 shutdown 暂停），把每站节奏写进任务行的 `Task.pacing`（SQLite 新列 `pacing_json`）。续跑时折回 frontier。节奏跟着 `checkpoint.sqlite` 在段与段之间传，本地重启续跑也受益。
  - 没带过去的：`OriginScheduler` 里 429 的冷却时间（`packages/bench/src/subjects/originScheduler.ts`），新一段会忘掉。站点回 429 时，Retry-After 只在段内有效。记为后续项 **E6**。
- [x] **E6**（E2 时发现）把 `OriginScheduler` 的 429 冷却也存进 `Task.pacing`，让它跨段有效。
  - 做法：`runSlice` 跑完后把还没到期的冷却写进 `Task.pacing` 的 `cooldownUntilMs`（按 `URL.host`），下一段开跑前恢复到 `OriginScheduler`（http 和 https 都设）。测试：`jobSlices.test.ts` 里站点回 429、Retry-After 2 秒，下一段先等够再请求。
- [x] **E3** batch 续跑时可以只取一部分站点的 URL（按站过滤）。
  - 测试：只跑指定站点，其余 URL 留在下一段。
  - 做法：`CrawlSpec.batchHosts`。不在列表里的站点的 URL 不放进队列，这次运行结束时只要还有剩下的就记为 `paused`，不记 `completed`。
- [x] **E4** “跑一段”入口：订阅 `jobEvents` 的 `page` 事件，新页数到 N 或用时到 T 就 `close({ cancelActive: true })`，结束状态是 `paused`。
  - 测试：多站 batch 和 crawl 各分三段，每段换一个新引擎和复制过去的任务目录。
  - 要验证：`maxPages` 准确，取消在下一页前生效。
  - 做成的样子（`packages/api/test/jobSlices.test.ts`）：
    - 引擎新增 `runSlice(taskId, { maxNewPages, maxMs, batchHosts?, graceMs? })`，加两个选项：`deferLaunch`（启动请求只存任务、不跑）和 `taskIds`（任务 id 用 jobId）。
    - 到达上限时不是 `close`，而是“排空”（orchestrator 新增 `drainSignal`）：不再取新页，正在读的页读完并存下，任务以 `paused` 结束。宽限期（默认 60 秒）过了还没读完才硬中断。原因：直接中断时，正在读的页下一段要重读，测试里 7 页请求了 14 次。
    - 每段会重读一次 sitemap：frontier 的待读队列不存进 checkpoint，sitemap 里还没读的条目靠重读找回，每段多 1 个请求。
- [x] **E5** 量一下 checkpoint 的大小：1,000 页的 batch 和 500 页的 crawl。结果写进 PR 描述。
  - 超过 50 MB 的话，在这个 PR 里加一项：checkpoint 只留续跑需要的字段。
  - 2026-10-19 在本机经代理用 `runSlice` 跑，每段 250 个新页，只量 `checkpoint.sqlite` 主文件，不含 WAL：
    - books.toscrape 1,000 个 URL 的 batch：4 段，17.2 MB，约 17 KB 一页；
    - docs.python.org/3/library/ 的 crawl：范围内只有 327 页，2 段，21.5 MB，约 66 KB 一页。按这个推算 500 页约 33 MB（估计）。
  - 都低于 50 MB，checkpoint 暂不瘦身。页面更大的站会更大，PR ⑥ 的验收里再看一次。

## PR ③ hosted 任务路由（`packages/mcp/src/hostedApi.ts`）

- [x] **R1** 网关放行方案 §6 的路由，只给已登录账户的 key 和 OAuth 连接。
  - 无 key 调用和没有账户的手发 key 返回 403，并说明原因。
- [x] **R2** 归属检查：`workspaceId` 不一致返回 404；过期返回 410 `job_expired`。
- [x] **R3** 限制：
  - 每账户同时运行最多 2 个任务，排队最多 10 个，超过返回 429 加 `Retry-After`；
  - crawl 的 `maxPages` 默认 100，最多 500；
  - batch 1 到 1,000 个 URL；
  - 支持 `Idempotency-Key`；
  - 支持 `maxCredits`。
- [x] **R4** 启动时返回估计花费；余额连一段都不够时拒绝启动。
- [x] **R5** 列表接口从 GCS 分段文件分页（游标 `slice:line`），响应形状和本地 API 一致；导出接口返回签名链接。
- [x] **R6** 删除账户时连带删除 `w/ws_<uid>/` 下的文件和对应的任务文档（public-preview 的删除流程）。
- PR ③ 做成的样子（`packages/mcp/src/hostedJobRoutes.ts`）：
  - 只有 `createHostedApi` 同时配置了 `jobs` 和 `credits`，网关才放行任务路由；不配置就和以前一样返回 403。
  - 只接受白名单里的参数（`HOSTED_BATCH_KEYS`、`HOSTED_CRAWL_KEYS`），其余的报出参数名后拒绝。
  - key 没有浏览器通道时固定 `fastMode`，按每页 1 credit 估价。
  - `maxPages: null` 按默认值 100 处理。
  - 第一段入队失败的任务记为 `failed`，原因 `not_queued`，让出名额，并接着给下一个被提升的任务入队（`HostedJobStore.fail`）。
  - `CreditsStore.balance` 是新加的余额查询。
  - 删除账户时，删掉 `hostedJobs`、`hostedJobIdempotency`、工作区名单，以及 `W2L_JOBS_BUCKET` 里 `w/ws_<uid>/` 下的文件。

## PR ④ worker（`/internal/jobs/:id/slice`）

- [x] **W1** 校验 OIDC，只接受队列的服务账号。
- [x] **W2** 租约：
  - `generation` 不一致：200 丢弃；
  - 租约被占：503；
  - 任务已结束：200。
- [x] **W3** 每段预留和结算：
  - `reserve` 支持一次加 N，测试照 #599 的写法；
  - 结算前把 `evidence.httpStatus` 映射过去再交给 `scrapeCharge`；
  - 幂等键是 `{jobId}-{slice}`。
- [x] **W4** 每 5 秒读一次任务文档，响应取消和全局开关 `hostedConfig/jobs.enabled`。
- [x] **W5** 站点租约 `hostedHostLeases/{host}`；挑不出可跑的站点时延迟 30 秒重排。
- [x] **W6** 任务结束时生成 `export.jsonl.gz`，再排一个定时到 `expireAt` 的删除任务。
- [x] **W7**（PR ① 审查时发现）create 的提交生效了但响应超时：重试时任务文档已存在，要认出这是自己写的，不能占着名额报错。
- [x] **W9**（PR ② 审查时发现）同一个任务的两次 `runSlice` 可能同时通过“没在跑”的检查。hosted 靠 Firestore 租约挡住（W2），worker 只能在拿到租约后调用。
- [x] **W10**（PR ② 审查时发现）`batchHosts` 传的站名必须和 `URL.hostname` 一样：小写、punycode、不带端口。否则那些 URL 永远留着，任务一直 `paused`。由 worker 用同一个函数从 URL 算站名。
- [x] **W11**（PR ② 审查时发现）读 sitemap 的时间如果超过一段的时间上限，每段都还没读页就被排空，任务永远推进不了。worker 要发现“连续两段 0 新页”，然后记失败，或者给下一段更长的时间。
- [x] **W12**（PR ③ 审查时发现）一段正在跑时账户被删除，这一段可能在删除列出文件之后才上传分段文件，文件就留下了。worker 上传前要确认任务还在；结算时发现任务已经没了，就删掉自己刚写的文件。
- [x] **W8**（PR ① 审查时发现）一个从没结束的任务被 TTL 删除后，它在工作区名单里的位置要释放；被提升的任务文档不存在时跳过它。
- [ ] **W13**（PR ④ 第二轮审查提出，暂不处理）`reserve` 的提交已经生效、但回应丢了时，额度和当天的页数被占着，任务上又没有记下预留，就没有人退回。hosted scrape 现在也是这样。要彻底解决，得先在任务上记下预留的 id，再去预留。
- PR ④ 做成的样子（`packages/mcp/src/hostedJobWorker.ts`、`hostedJobsCloud.ts`、`hostedJobsCli.ts`）：
  - worker 是同一个镜像的另一个启动命令：`node packages/mcp/dist/hostedJobsCli.js`。
  - 五个环境变量全设才开启任务，只设一部分时启动报错：`W2L_JOBS_BUCKET`、`W2L_JOBS_QUEUE`、`W2L_JOBS_WORKER_URL`、`W2L_JOBS_TASKS_ACCOUNT`，加上项目 id。
  - 提交流程（两轮审查后定下来的）：
    - 结算按预留 id（任务、generation、持有者）只算一次（`creditSettles/{id}`）。
    - checkpoint 和分段文件按“段号加持有者”命名，任务文档只记已提交的那些，没提交的文件没人读。
    - 提交时把预留和用量留在任务上，结算失败时由下一次投递补上。
    - 提交结果未知时不退款。
    - 旧投递收到时，如果任务在跑、租约空着，就把当前那一段重新入队。
    - 租约至少 16 分钟，长过投递截止时间；上传前再确认一次租约。
    - 结束的任务会记下被提升的任务，之后的投递负责补排它的第一段。
  - 每段多预留 1 页的余量：排空时正在读的页也会存下，一段最多比 N 多存 1 页，这一页也要付了钱。
  - 一段死掉时，预留留在任务文档上，下一段先退回再预留自己的，不会重复扣费。
  - 取消也会排一次投递，worker 收到时给已结束的任务写导出、排到期删除。
  - W7：创建任务时提交抛错，就回读一次任务文档（id 是随机的）。文档已经在，说明写入其实成功了，按创建成功处理。
  - W8：工作区名额满时，先去掉名单里文档已经不存在的任务，再判断能不能放进新任务；提升时也跳过文档不存在的排队任务。
- 验收测试：
  - 一段跑到中途死掉，重投先得到 503，租约过期后被新实例接手，不重复扣费；
  - 旧段的重复投递被丢弃；
  - 两个任务打同一个站时不会并行。

## PR ⑤ 基础设施和部署（先问你）

- [x] **D1** 启用 Cloud Tasks API，建队列 `octocrawl-jobs`：asia-southeast1，最多 3 个并发投递，最多重试 5 次。
  - 重试次数要想清楚（PR ④ 第二轮审查提出）：一段一直失败、重试用完以后，任务就没有投递了，会一直停在 `running`。要么不设上限、靠退避，要么加一个定时扫描，把很久没动的任务记为失败。
- [x] **D2** 建 bucket `octocrawl-jobs-<project>`：asia-southeast1，30 天生命周期兜底。
- [x] **D3** 服务账号权限：
  - 队列的服务账号对 `octocrawl-jobs` 有 `run.invoker`；
  - 服务对 bucket 有读写权限；
  - 有 `signBlob` 权限。
- [x] **D4** 部署 `octocrawl-jobs`：请求超时 15 分钟，不公开。`octocrawl-api` 用新 tag 部署，再切流量并确认线上 revision。
- [x] **D5** 打开 Firestore TTL：`hostedJobs.deleteAt`、`hostedJobIdempotency.expireAt`。
- [x] **D6** 把部署步骤写进 `docs/hosted-api.md`。
- PR ⑤ 做成的样子（2026-10-20）：
  - 资源和命令都写在 `docs/hosted-api.md` 的“Batch and crawl jobs”一节。
  - 队列不限重试次数，退避 10 秒到 10 分钟。
  - 端到端用一把临时 key 验证过，用完已吊销：6 个 URL 的 batch 和 5 页的 crawl 都在一段内完成，各自只结算一次，到期删除排在 7 天后。
  - 线上：API 是 `h28jobs`（回滚 `h27shares`），worker 是 `octocrawl-jobs-w1-5141c6d`。
  - 全局开关现在是**关**的，打开之前先完成 PR ⑥ 的验收。
- [ ] **D7**（重试次数定下来时提出）worker 记下同一段连续失败的次数，到 N 次就把任务记为失败（`delivery_failed`），免得一段一直失败时每 10 分钟重试一次、持续 37 天。

## PR ⑥ 验收

- [ ] **V1** 把 parity 的 crawl 和 batch 用例（L02、L04、L11、A13–A15、A26–A35）对 hosted 跑一遍，记录到 `research/hosted/`。
- [ ] **V2** 跑一个 1,000 URL 的 batch。跑完后先把两个服务缩到 0，再从新实例和另一个 revision 的 tag URL 读回全部 1,000 项。
  - 记录命令、commit 和花费。
- [ ] **V3** 在 ROADMAP 的 H1 行下标记完成，链接到记录。

## 下次从这里继续

- 方案和本清单已合并（#602）。PR ① 到 ④ 已合并（#605–#608），PR ⑤ 已部署（2026-10-20），全局开关关着。
- 下一项是 **PR ⑥ 的 V1**：parity 的 crawl 和 batch 用例对 hosted 跑一遍。要先打开开关，并发一把测试 key。
