# PA 增强访问下一轮：任务清单

**依据：**
- [ROADMAP.md](../ROADMAP.md) 的 Current phase（2026-10-09 起 PA 第一优先、2026-10-10 起先验证再付费）、PA 表、PH 的 H1 行；
- 方案：Howard 的《Octocrawl 引擎审计与 PA 增强访问技术方案》（2026-10-19，基于 main `3fb7905a`，下文简称"方案"，§ 是它的章节号；建议随本清单提交为 `docs/launch/2026-10-19-pa-enhancement-plan.md`，勘误见下）及其摘要《PA 技术审计：核心分析与开发建议》；
- [AGENTS.md](../AGENTS.md)、[ADR 0005](adr/0005-enhanced-access-policy.md)、[ADR 0006](adr/0006-task-verification.md)、[ADR 0007](adr/0007-region-readiness.md)。

核实基于 `main` 的 `2ffd7f25`（#604 表格等待、#607 H1 PR ③ 已合入），日期 2026-10-19。方案 §五 的六个 PA 缺口（A、B、D、E、F、G）逐条对照过源码：A、B、D、E、F 成立，G 部分成立；§五.7 的评测缺口成立（见表末两行）；C（#604）不在 §五，已合入。对照结果和勘误见下面两节。

**外部试用门（ROADMAP.md:23-29）：** 期限 2026-10-17 已过；`main` 上没有 `research/trials/`，仓库里查不到任何试用记录，仓库之外有没有试用过不知道。ROADMAP 写"过期无试用则工作停止、原因写进 ROADMAP"；方案 §十一.1 的立场是试用安排沿原计划推进、不阻塞工程修复。已定（2026-10-20，决定 9）：门不再设日期，改成"有人试用时记录到 `research/trials/`，试用的发现优先于新功能"，并写明 10-17 期限已过、仓库里没有试用记录；PA 工作照推进。P0.2 的 PR 一并改。

**编号：** 本清单的编号只在本清单内有效。`docs/h1-hosted-jobs-tasks.md` 的 S/E/R/W/D/V 编号和 ROADMAP PH 的 H0–H5 另有所指，引用它们时一律写"H1 清单的 W3"或"PH H5"。

**目标：** ROADMAP 2026-10-09 定的 bar 不变：在 item 1 的冻结集上，增强路线达到同窗口最好竞品的 verified completion、假成功不多于它；达不到就把差距和补法写进记录。方案把这个目标拆成两件事同时做：页面能否取得（访问闭环），用户要的数据能否正确、完整地交付（交付闭环）。

**完成标准（整轮）：**
- A–G 每项的验收通过（见各阶段），`npm test` 和 `npm run typecheck` 通过；
- 开发集（R1b 基线）上独立字段正确率不低于基线；保留集 v2 在 Phase 2 结束时对 `2ffd7f25` 和候选做同日配对的第一次运行，候选不低于同日 main 对照，并报 N 与零假成功的单侧 95% 上限；
- 健康 25 题不低于同窗口 main（K1 带一个固定在 `2ffd7f25` 的对照臂，逐题报变化）；
- K1 的两个独立窗口记录了与竞品的同条件对照：首次调用通过率、planned/attempted/not_run、假成功按"已交付结果"和"全部请求"两种分母各报 N 与上限、每题的 schema status / completeness / freshness、无人值守 / 已授权会话 / 人工接手三列分开（按 Evidence Record 的 `access.completion`）、成功结果与全部尝试的 p50/p95（按失败类型分层；冷启动/并发/地区的分层只在 G4 的 Cloud Run 记录里有）、每千次有效交付成本（分子含供应商、代理、solver、失败与重试和可得的计算费用；存储与投递本轮不测量，报 unknown exposure）、每条路线的边际收益表（新增正确任务、退步、费用、尾延迟）；
- 没有一条默认路线在只有一个窗口的证据下改变。

用法：做完一项勾一项，发现新的就补上。看进度读这个文件，不翻滚动记录。

## 现状核对（方案 vs `main` 2ffd7f25）

| 方案的判断 | `main` 上实际 | 结论 |
| --- | --- | --- |
| A 本地 MCP managed HTTP 不接 PA 配置 | `ManagedRuntimeOptions` 没有 accessGrant/browserEngine/browserIdentity/compatHosts/egressProxies/egressEchoUrl 六项（`packages/mcp/src/managedRuntime.ts:9-31`，调用 `:35`）；`localHost.ts:22-38` 不读 `W2L_ACCESS_GRANT`；引擎 accessGrant 为 null，`access: enhanced` 被 `engine.ts:811-814` 以 400 `unsupported_parameter` 拒绝。产品 CLI 一次性命令传了五项（accessGrant、browserEngine、compatHosts、egressProxies、egressEchoUrl）但漏 browserIdentity（`packages/cli/src/run.ts:75-79`），而且先把 identity 通知打到 stderr 再丢掉；它只读环境变量，不读 `--access-grant`。本地 host 还忽略 `W2L_WORKER_COUNT` 和 `W2L_PER_HOST_*`，也没有 Patchright/impit 预加载 | 成立。受影响的只有仓库自跑的 8791 本地 host（`npm run local:mcp`、LaunchAgent、`.mcp.json`）；发布的 npm 路径（stdio → `octocrawl serve`）传全六项，不受影响 |
| B 远程 CDP 把首次 goto 的响应与之后的 DOM 配对 | `vendors/cdp.ts:263` 只保存一个 response，等待后 `:284-306` 从它读 status/headers/请求头，从活页读 body 和 finalUrl；没有 framenavigated/response 监听；`CdpPage` seam（`:33-43`）没有 `on()`。`contracts/src/result.ts:124-128` 承诺 httpStatus 是"读取时页面显示的文档"的，provider 通道违反自己的合同 | 成立。动作/截图/waitFor 不进 provider rung 是引擎过滤的（`engine.ts:926-962`、`ladder.ts:617-627`），不是漏洞；真正缺的是文档身份和 layout/shadow 捕获 |
| C #604 表格等待待审 | #604 已于 2026-10-19 15:10Z 合入（`2ffd7f25`），ADR 0007 新增 2026-10-19 节；`readTables` 只接在 `BrowserLocalSubject`（browser_local 与 installed_chrome），provider 通道没有；PR 没有实站重跑 | 过期。C 变为"残余：实站重跑 + 其他通道的 unjudged 回归" |
| D 通用商品主体与跨主体补字段 | `extract-tf/src/product.ts:121-145` DFS 取第一个 Product，`:148-155` 取第一个 offer，`:157-180` 第一个含 Product 的脚本即返回，`:315-321` 按 JSON-LD→microdata→meta `fillMissing`，无主体约束；`extract.ts:152` 不传 url/canonical。在 `main` 复现了五个场景：推荐商品在前、跨来源补价格、ProductGroup 取 hasVariant[0] 不看 `?variant=`、多 offer 取第一个、同 SKU 两来源不一致静默取 JSON-LD。通用 jsonld/microdata/meta fact 都没有 `path` | 成立，且比方案多三个场景。`research/parity/sites.md` 没有对应实站用例（A33/J04/J05/E04 都是单 Product 页） |
| E 付费预留不跨硬崩溃 | `SpendLedger` 纯内存（`http-core/src/spend.ts:12-61`）；预留在 `routing/ladder.ts:1037` 调 vendor 前，第一次落盘是页面结束后的 `orchestrator.ts:476` putAttempt；`:448` putStep 与 `:476` 之间没有事务；恢复只读 attempts（`:240-244`）。#606 没碰账本 | 成立。只在 `octocrawl serve`/`w2l-api` 带 enhanced grant + vendor_remote_browser + `W2L_VENDORS` + 价目表 + batch/crawl 时可达（A 合入后本地 host 也可达）；托管 MCP 无 grant 不可达；hosted credits 是另一本账（Firestore 先扣，崩溃时多扣用户、无对账） |
| F 模型字段只记 source=model | `api/src/structured.ts:1034-1057`：`validate(merged)` 通过即 `complete`，evidence 只有 `{path, source:'model'}`；没有任何代码读 `source === 'model'`；`verify()` 不看 evidence。现有测试 `structured.test.ts:893-927` 让模型答一个正文里没有的 `warranty: 'two years'` 并断言 complete | 成立。失败测试已经有了，只需反转断言 |
| G 字节计量与路线历史 | `provider.ts:434-435` 把 DOM 长度写进 bytesWire 和 bytesDecompressed，违反 CHANGELOG 0.4.0-rc.1 的规则（"browser paths use null"）和 `result.ts:47` 的字段定义；browserLocal 四处失败路径写 0；ByteMeter 只在 `vendor_residential_proxy` 下存在、Browserbase 从不计量，计数在 `ladderCli.ts:645-668` 被丢弃；引擎每个 mode 一个 `MemoryRoutingHistory`（`engine.ts:982-988`），`FileRoutingHistory` 已存在但只有 `w2l scrape --history-file` 用；`VendorOutcome` 只有 contentful/verified/wallMs/costUsd/failureClass | 部分成立。真实 transport 的 costUsd 恒为 null，所以"累计成本惩罚多调用的厂商"在生产上是死代码；只有 ≥2 个厂商时排序才生效 |
| installed Chrome"尚未建成" | ROADMAP PA item 5 状态行（`ROADMAP.md:264`）还写"not built yet"；实际 `ladderCli.ts:306-324` 已有 rung，ADR 0005 记"实现 2026-10-14 / 验收 2026-10-14"（最终提交两次 11 和 7 of 16；Playwright 接管探针两次各 12 of 16），CHANGELOG 0.5.0 已发布，验收记录 `research/access/runs/2026-10-14-installed-chrome-acceptance-7b56397b.md` 及文件名含 installed-chrome 的 10 份记录 | ROADMAP 状态行过期，要改 |
| H1 云任务 | PR ①②③ 已合入；PR ④ worker 未开工（H1 清单的 W1–W12、E6）；PR ⑤⑥ 等 Howard 决定 GCP 资源。H1 明确不含增强访问（方案 §七.3；H1 方案第 202 行把 hosted 增强访问放在 PH H5） | 与方案一致；PR ④ 的引擎配置要把 accessGrant 钉为 null（见 P0.6） |
| 评测：planned/attempted/not_run | `run-set.mjs` 没有这三个字段；只在连续 3 次 `egress_proxy_refused` 时提前停止（`:500-514`），记录里一句"not run 的不在分母里"与 AGENTS.md 冲突；`run-set.mjs` 没有测试；16 题子集没有机器可读定义（三处手抄）；记录头没有 grant，egress 成本恒 unknown | 成立，归入 Phase 0 |
| 保留字段集 | `main` 上没有 `research/accuracy/`；#556（金标准 D01–D10 + H01–H08）和 #562（首次验收 6/8、62/75）都是草稿且互不包含；H01–H08 已被打开，不能再当未见集 | 成立，归入 Phase 1 的 R |

本轮不做、理由写明：ROADMAP item 3 的两个未测点（`ROADMAP.md:218`：出口切换后 per-host pacing 与预算不重置；登录会话的 region）方案没有覆盖，第二项还需要登录账号和会话；第一项挂到 K3 的配对出口实验里顺带断言，第二项不做。方案 §七.4 的虚拟列表/动态表格（滚动容器、稳定行键、分次快照、覆盖区间、停止条件、observedCount 与 publisherTotal）排在本轮之后，因为先要 B 统一捕获身份；本轮的列表/表格输出不得宣称全量，报告窗口时写 observedCount、publisherTotal 留 null 不写 0；滚动、翻页、交互属于交互窗口。

## 方案勘误（写进后续记录时按这里改）

- 方案引用的 `packages/bench/src/ladder.ts` 不存在；LadderRunner 在 `packages/bench/src/routing/ladder.ts`（#591 回退：常量和谓词 `:203-215`，触发 `:909-914`，单 rung 跳过 `:639-646`，30 秒子预算 `:678-694`）；`buildChannels` 在 `packages/bench/src/ladderCli.ts:141`，不在 `engine.ts`。
- #604 已合入，#607（H1 PR ③）已合入；"最新合并为 #605"过期。
- #591 回退只在 REST/SDK/crawl/batch 不传 `timeout` 时可达；本地 MCP 默认注入 120 s、托管 MCP 注入 100 s，都走不到它（`docs/vendor-escalation.md:7-9` 已写明）。
- A 的范围：是仓库自跑的本地 HTTP host，不是"本地 MCP"整体；且它上面永远花不了钱（无 grant 时 `ladderCli.ts:398-400` 不建 provider rung），只是用不了 grant。
- B 的"远程通道没复用 actions/layout/截图"：actions/截图/waitFor 由引擎过滤不进 provider rung，不是漏洞；缺的是文档身份和 layout/shadow 捕获。
- G 的"历史主要在内存"：`FileRoutingHistory` 已存在（`vendorRouter.ts:184`），任务是让引擎用它并加维度，不是从零做；成功率已按 `verified ?? contentful` 算（PA item 10 已实现）。
- `docs/access.md:53` 说 provider rung 只在 research/authed 模式建，代码在 standard+enhanced 也建（`ladderCli.ts:398`）；`docs/access.md:117` 说托管 handoff 答 409，网关实际答 403 `hosted_unavailable`。

## 待你决定

还没回复的项先按默认做，你改了我再跟着改。

1. **一次性运行预算。已定（2026-10-20）：$10 以内，grant 不列 `vendor_residential_proxy`。** 可追溯的费用：数据中心 Steel grant 一轮 92 题 $0.0210（36 次付费调用，`research/access/runs/2026-10-12-pa4-92-datacenter-b117b45.md`），带 `vendor_residential_proxy` 的一轮 $1.3894（`research/access/runs/2026-10-11-pa4-92-residential-scroll-cd9d9e7.md:16`）。默认：Phase 0 基线 + Phase 2 的一次 Steel 对账 + K1 两窗口的 Octocrawl 臂共 $10 以内，grant 不列 `vendor_residential_proxy`，自备网关带宽未计量（unknown）。超出先问。影响 P0.1、E7、K1–K3。
2. **未合入 PR 的处置。** 草稿：#584（106 文件，NO-GO）、#528、#582；非草稿的开放 PR：#512、#514、#515；研究草稿 #556、#562 见 R1/R3。默认：#512/#514 的内容 #591 已带入 `main`（verify/9 含 uniqueBy），关闭；#584/#528/#582 的 D 类片段按 D6 拆成小 PR 后关闭原 PR；#515（Skyscanner 验证码分类）单独审。影响 P0.3、D6。
3. **保留字段集由谁标注。已定（2026-10-20）：本窗口选题并标注，Howard 或一位外部人抽查 20%，标注记录写明谁标谁查。** 方案 §十一.1 要求独立标注、不参与修复的人复核。原默认：#556 的 D01–D10 做开发集、H01–H08 降为回归集；新保留集 v2 由本窗口选 URL 并标注，你或一位外部人抽查 20% 的字段。影响 R2、Phase 2 验收。
4. **PA 与 H1 的时间分配。** ROADMAP 写"尚未设定"。默认：Phase 0–2 的 PA 任务先行，H1 PR ④ 在另一个窗口并行。`packages/mcp/src/hostedCredits.ts` 只由 PR ④ 窗口改，本清单 EH1 的字段改动排在 PR ④ 之后；给 PR ④ 的接口约定由 P0.6 送达，`docs/h1-hosted-jobs-tasks.md` 由 H1 窗口自己改。
5. **Cloud Run 固定运行时实验（G4）。** 要起 Cloud Run Job、花钱。默认：从 Phase 1 起可并行做，起任何 `gcloud` 之前问你。
6. **Browserbase 资格复查（K2）。** 官方文档已把 Verified 写成 Scale 可用。默认：只查账户页面和一次 403/200 探测，不买任何套餐；要买先问。
7. **每周重跑的范围、费用和调度。已定（2026-10-20）：三类臂都跑：Octocrawl 免费臂（25 健康 + 16 挑战用只列 installed_chrome 的 grant + 10 题轮换 frozen，健康与轮换组 standard）、Steel enhanced 臂（同 51 题，约 $0.02/周，持续花费，不在决定 1 的 $10 里）、竞品臂（Firecrawl Cloud、ZenRows 各跑同 51 题，每周约 51 次调用/家，额度见决定 10）。差距数字每周刷新，K1 仍是正式的两窗口对照。** 调度用桌面 app 的计划任务跑在你的 Mac（launchd 被 TCC 挡，同 `octocrawl-cleanup-gone` 的做法），建计划任务前仍要你点头。影响 P0.4、P0.2 的 item 9 措辞。
8. **8791 本地 host 何时重启。** A 合入后它要重启才读到 grant；CLAUDE.local.md 说不要动它，A4 也不会运行 `local-service.mjs install`（它会 bootout 再 bootstrap）。默认：A 的验收在 8797 起第二个 host 做、用完关掉，8791 由你自己择时重启。
9. **外部试用门。已定（2026-10-20）：不设日期。** P0.2 把 ROADMAP 的门改成"有人试用时记录到 `research/trials/`，试用的发现优先于新功能"，并写明 10-17 期限已过、仓库里没有试用记录；PA 工作照推进。相关的开放任务在 `docs/mcp-client-ux-tasks.md` 的 E3。
10. **竞品臂的 key 与额度（K1）。** 两窗口 × (92 + ≥40) 题，每家约 2×132 次调用；w2 一轮 92 题用了 81 Firecrawl credits（`ROADMAP.md:271`），估 230–260 credits；ZenRows 计价单位待查。默认：K1 开始前先确认两个 key 有效、额度够，不够先问你，不自行升级套餐；这笔额度不计入决定 1 的 $10。每周重跑的竞品臂（决定 7）另耗每家约 51 次调用/周（Firecrawl 约 45 credits/周），建计划任务前一并确认额度。
11. **托管计价。** 现状核对发现 `hostedCredits.ts` 的 scrapeCharge 把 provider 通道按 5 credits 平价，与 ROADMAP"成本加 margin"不一致，但 10-18 的商业计划正提议浏览器页 5→2 credits，ROADMAP 写两份提案未决前什么都不改。默认：本轮只产出成本数字，不改任何计价；浏览器页 5 还是 2 随商业计划一起决定。
12. **`waitForRegion` 对无表格读取器通道的行为（C2）。** 现在只有 `readTables` 存在时才可能报 `tablesUnjudged`，provider 通道带 `tableRowsMin` 合同时可以凭标题 ready。默认：改成没有表格读取器就报 `tablesUnjudged`、永不 ready；这会改变所有不传 readTables 的通道的等待行为，PR 里写明。

## 总原则

- **流程：** 每个任务一个分支、一个 PR，从当前 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree；分支落后 `main` 不超过一个 PR。commit 加 `-s`，conventional 格式。开 PR 后马上开 Auto-fix。
- **先失败测试再改代码：** 每项先写会失败的本地 fixture 测试；`research/parity/sites.md` 有对应实站的，再补实站用例。没人复现过的缺口不是任务。
- **实站记录：** 每次实站运行写 `research/access/runs/<YYYY-MM-DD>-<label>-<commit>.md`（或 `research/parity/runs/`），写明命令、commit、走代理还是直连、grant、费用（不知道就写 unknown）。
- **证据诚实：** 未测的值留 null/unknown；失败、被拦、未跑的都留在分母；带日期的记录只追加不改。任何优化不得以冻结题号、已公开的 blind 答案或站点特例字符串作为完成依据；验收看通用规则加负例 fixture。
- **手段边界：** 只用 ADR 0005 的 grant 类能力；永不做身份轮换、改用户 Chrome、会话内换执行器或出口、把凭据写进记录；暂缓类（自有引擎/指纹、Camoufox、自研 CAPTCHA 模型、自有住宅网络、Cloud Run 之外的浏览器集群）不碰。
- **付费顺序：** E（付费持久恢复）合入之前，不扩大付费并发、不加新的付费路线；已有路线（Steel 数据中心 grant）的单次验收运行不在此限。
- **两窗口才算数：** 任何路线或默认值的改变，要在第二个日期再次验证同题、健康组无退步、假成功不增加。
- **审查：** 每个 PR 提交前交给 subagent 用干净上下文审，只列会阻止合并的问题（文件、行号、为什么错、怎样证明）。
- **不扩 scope：** 把 `bench` 的生产核心迁到独立 engine 包（方案 §九.4）放在本轮之后；顺手发现的问题写成后续项，不在当前 PR 里改。

## 阶段与依赖

| 阶段 | 内容 | 依赖 | 退出条件 |
| --- | --- | --- | --- |
| Phase 0 · 基线与整理 | P0.5 runner 分母 → P0.1 基线记录；P0.2 ROADMAP 修正；P0.3 PR 分流；P0.4 每周重跑脚本；P0.6 给 H1 窗口的接口约定 | 无 | 两份基线记录在仓库里（含 planned/attempted/not_run 与 Grant 行）；P0.5 的测试绿；P0.3 每个 PR 的处置已写入；ROADMAP 的 item 5/9 和 PH H1 行正确；每周脚本跑过一次；P0.6 送达 |
| Phase 1 · 三条并行线 + 评测基建 | A 入口一致、B 文档捕获、D 主体字段；R 开发集（R1、R1b 基线）与保留集 v2 | 失败测试不等任何基线；A/B/D 的验收对比用 P0.1，D 的合入和 D6 依赖 R1 + R1b | A/B/D 各自验收通过并合入（B 含 B3、B4、B6；D6 滚动，不在此内）；R1b 基线记录在案；保留集 v2 冻结且未对任何候选跑过 |
| Phase 2 · 交付闭环 | C 表格残余、E 付费持久、F 有限候选与模型证据 | C1 和 C2 的失败测试不依赖 B；C2 的 provider 接线依赖 B2；E 只依赖 Phase 0，有空窗口可提前到 Phase 1；F2 依赖 D2/D3；F3a 依赖 B3 的 captureId 和 D6 的 RFC/WCAG fixture；E3 与 F3a/F4 都碰 `routing/ladder.ts`，F 的接线在 E3 合入后 rebase | E1 绿、E7 本地全过、一次真实 Steel 对账记录在案；F1/F2 通过，F3a/F3b 的 fixture 通过，开发集相对 R1b 上升、不降低合同，T073 与 H01–H08 记录在案；C2 接上或报 `tablesUnjudged`、C3 断言通过、C1 记录在案；保留集 v2 的同日配对运行记录在案 |
| Phase 3 · 观测与路线 | G1 字节诚实、G2a/G2b 路线观测与持久化、G3 排序、G4 Cloud Run 固定运行时、G5 公开捕获字段 | G1 无依赖（provider.ts 那一行随 B2 做）；G2a 只为 chargedUsd 依赖 E；G2b 依赖 G2a；G3 依赖 F 稳定、G2b 和两个窗口；G4 只依赖决定 5，可从 Phase 1 起并行 | G1 的测试绿；每周重跑的 Steel 臂记录含 G2a 的分层结果（访问送达 / 区域加载 / 任务通过）和单位成本；G2b 的持久化在该运行里写入但不改决策；G5 的公开字段登记 |
| Phase 4 · 对照与受控开放 | K1 两窗口竞品对照、K2 Browserbase 复查、K3 出口配对、K4 默认值决定、K5 ROADMAP 收口 | K1 依赖 Phase 2 合入和 G1/G2a 的字段；K2、K3 的测量是单独的小运行，可在 Phase 1–2 的空窗口做，决定留在 Phase 4 | ROADMAP 的 bar 状态更新：差距数字、补法、决定 |

A、B、D 互不依赖，可各开一个窗口；R 只写研究文件，可同时做。文件归属：A5 改 `ladderCli.ts` 的 `buildChannels`，B2/B3 改 `vendors/cdp.ts` 与 `subjects/provider.ts`，B4 改 `routing/ladder.ts` 的 providers 过滤，互不重叠，各自合入时 rebase 即可。

## Phase 0 · 基线与整理（≤1 天，不改引擎）

- [ ] **P0.5 runner 的分母（先做，P0.1 的记录要用它）。** 把 `research/access/run-set.mjs` 里的提前停止计数、planned / attempted / not_run 计算、记录头（含 `Grant:` 一行：grant 文件 SHA-256 与能力名）抽成纯模块 `research/access/runSetReport.mjs`；提前停止时把没跑的任务按 id 写进记录（`not_run`），删掉"不在分母里"那句；每题记录 `channelsTried`（ROADMAP item 11 未了点：T076 跳过 Steel 时 runner 没留 ladder trace）。
  - 测试落点：`packages/runtime/test/runSetReport.test.ts`，照 `verify.test.ts:6` 导入 judge.mjs 的写法导入 `../../../research/access/runSetReport.mjs`，喂一串带 proxyRefused 的合成 rows；`npm test` 自然包含它。
  - 同时按方案 §五.7 给旧 bench 指标改名，免得被当成正式准入数：`packages/bench/src/runner.ts:236` 的 `verifiedCompletionRate`（只计有真值标注的结果，或改名 contentfulWithTruthRate）、`phase3ScoreCli.ts:47/61` 的 `verifiedCompletion`、`liveCompareCli.ts:404` 过滤无 result 的 arm 改为计入 `no_result`；加一个小测试；文档写明唯一的正式准入协议是 run-set.mjs + 合同。不动已归档的 92 题报告。
  - 验收：`npx vitest run packages/runtime/test/runSetReport.test.ts` 绿；用 `--only` 两题 + 模拟连续 proxyRefused 跑出的记录里能看到 not_run 列表和 Grant 行。
- [x] **P0.1 基线运行（完成 2026-10-20，在 `main` `1c4d9178` 上，记录见"进度"）。** 在 `main` `2ffd7f25` 上两次运行，各有自己的 `--record` 文件（已存在 run-set 会拒绝）。这是 Phase 2/4 一切合同验证对比的"前"；它只给合同验证基线，不给字段正确率（字段正确率的前值见 R1b）。
  - 92 题 enhanced：API 按 `docs/access.md` 的 `W2L_VENDORS=steel` 与 `STEEL_API_KEY` 启动，`W2L_ACCESS_GRANT` 指向主 checkout 的 `.w2l/access/steel-grant.json`（不列 `vendor_residential_proxy`），端口照 10-12 记录用 8796，走代理。`node research/access/run-set.mjs --set all --access '"enhanced"' --save-responses --record research/access/runs/2026-10-<dd>-pa-next-baseline-all-2ffd7f25.md`。
  - 25 健康题包含在 92 题里（`tasks.v1.json` 的 healthy part），从同一份记录切出，不单独跑。
  - 16 题挑战子集（installed_chrome）：API 启动行照 `research/access/sticky-vs-rotating.sh:17-19` 的形式（`W2L_ACCESS_GRANT=.w2l/access/installed-chrome-grant.json`，`--port 8797`），但出口照验收记录 7b56397b 用 Clash（`HTTPS_PROXY=127.0.0.1:7890`），不是脚本里转发到 Webshare 住宅网关的 8796；`W2L_API_URL=http://127.0.0.1:8797`，`--set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access '"enhanced"' --record …-pa-next-baseline-ic16-2ffd7f25.md`（默认 `--set frozen` 会筛掉 blind 的 B001/B008）。
  - 顺带记下 T060（ROADMAP item 4 未了点：每臂假成功）在这一轮是否仍是假成功，原因写 unknown 不猜。
  - 验收：两份记录，各有命令、commit、代理/直连、Grant 行、费用、planned/attempted/not_run；92 题的 verified/假成功/p50/p95 和健康 25 题的逐题结果写进本清单"进度"节。
- [ ] **P0.2 ROADMAP 与文档修正（一个 docs PR，只改 ROADMAP 和 docs/access.md）。**
  - PA item 5 状态行：installed_chrome 已建成（`ladderCli.ts:306-324`），引用 ADR 0005 的实现/验收 2026-10-14、CHANGELOG 0.5.0、验收记录 7b56397b；每周重跑和出口按检测类型选择仍开放。不写未核实的记录数。
  - PA item 9：每周重跑按决定 7 的口径（三类臂：Octocrawl 免费、Steel enhanced、Firecrawl/ZenRows；差距数字每周刷新，K1 是正式两窗口对照）。
  - PH H1 行：PR ③ 已合入，下一项是 H1 清单的 W1。`docs/h1-hosted-jobs-tasks.md` 不动，由 H1 窗口改。
  - PA 节加一行链接到本清单。试用门按决定 9：去掉日期，改成"有人试用时记录到 `research/trials/`，试用的发现优先于新功能"，写明 10-17 期限已过、仓库里没有试用记录。
  - `docs/access.md:53`（standard+enhanced 也建 provider rung）、`:117`（403 不是 409）。
- [x] **P0.3 未合入 PR 的分流（按决定 2；2026-10-20，核对基于 `main` `0ebe8cdf`）。** 处置如下，每个 PR 上留了同样的说明：

  | PR | 状态 | 核对 | 处置 |
  | --- | --- | --- | --- |
  | #512 verify fields on the delivered scrape response | 开放，非草稿 | 它的 `packages/mcp/test/deliveryScope.integration.test.ts`、`packages/ai-sdk/test/deliveryScope.integration.test.ts` 已在 `main`（#591 带入）；`research/trials/` 的 README 和模板 `main` 上没有 | 关闭；`research/trials/` 三个文件由本 PR 带入（README 的期限一段按决定 9 改为不设日期） |
  | #514 verify distinct list records by explicit identity fields | 开放，非草稿 | `uniqueBy`（`packages/runtime/src/verify.ts:106-113`）和 `packages/mcp/test/distinctRecordsDelivery.integration.test.ts` 已在 `main` | 关闭 |
  | #515 classify Skyscanner human verification pages | 开放，非草稿 | `gate.ts` 的 Skyscanner 判定和它的两个测试文件 `main` 上没有 | 保留，单独审：rebase 到 `main`、补 `sites.md` 用例后合 |
  | #582 classify explicit source outages as not served | 草稿 | `extract-tf/src/sourceUnavailable.ts` `main` 上没有；改 `readiness.ts` 与 ADR 0007 | 保留，转为独立小 PR（不属 D 类），rebase 后按 ADR 0007 审 |
  | #584 align final delivery and bound HTTP timeout fallback | 草稿，NO-GO | #591 已带入最终交付复验与 #591 回退；剩余片段见下 | 保留作 D6 的来源，D6 各片段合入后关闭 |
  | #528 verify final scrape delivery and preserve task records and standards | 草稿 | 与 #584 重叠（RFC/WCAG、百分比、聚合报价、Skyscanner 门、示例合同） | 保留作 D6 的来源，与 #584 一起在 D6 后关闭 |
  | #556 / #562 字段金标准与保留集首轮 | 草稿 | `main` 上没有 `research/accuracy/` | 保留，R1/R3 cherry-pick 后关闭 |

  原说明：每个 PR 写一条处置理由：已被 #591 带入 / 拆入 D6 / 单独审 / 关闭。#584 剩余可拆的片段：RFC/WCAG 兄弟章节（归 D6）、OTTO 变体链接与起价、ESPN 拆分积分榜、带符号百分比、FT 头条卡片、聚合报价、来源不可用分类（#582）、验证码分类、示例合同。Nasdaq 影子表的源码已在 `main`（#516），只剩测试。
  - 注意版本号：`main` 是 extract-tf/30、verify/9；#528 写 /32、#584 写 /36、#512/#514 写 verify/5、/6，移植时重新取号。
- [x] **P0.4 每周重跑脚本（按决定 7；脚本、子集定义、单元测试和首次本地运行 2026-10-20，计划任务未建）。** `research/access/weekly.mjs`：同一组 51 题（25 健康 + 16 挑战 + 10 题轮换 frozen）跑三类臂：Octocrawl 免费臂、Steel enhanced 臂（数据中心 grant，不列 `vendor_residential_proxy`）、竞品臂（`--target firecrawl` / `zenrows`，用 `research/access/run-set.mjs` 已有的竞品 runner），每题带合同（竞品不收合同），每臂一份记录 `research/access/runs/<date>-weekly-<arm>-<commit>.md`，再汇总一份写差距数字。
  - 轮换规则：16 题之外的 frozen 题有 36 道（`tasks.v1.json` 里 part=frozen 的 50 道减去子集里的 14 道；不用 run-set 的 `--set frozen`，它还会带上 3 道 unstable），按文件顺序切 4 组（10/10/10/6），组号 = ISO 周数 mod 4，偏移由日期推出、不存文件；记录头写组号。16 题臂要带 `--set all`。
  - 脚本自己起 API（照 `sticky-vs-rotating.sh:17-18`：固定一个空闲端口，避开 8787、8791、8812–8814；等 listening 再跑；结束时关掉，失败也关）；Octocrawl 免费臂和 Steel 臂各起一次 API，grant 不同。16 题的免费臂用只列 installed_chrome 的 grant；每份记录写 Chrome 版本，大版本变化时再跑一次 16 题；与验收基线（ADR 0005 / 7b56397b：11 和 7 of 16，探针两次各 12）比较，低于基线就写记录并标"停止默认推荐，待重测"。
  - 16 题子集加机器可读定义：`research/access/subsets.v1.json`（不改 `tasks.v1.json`，免得任务文件 SHA 变化），`cloudrun-xvfb/run.sh:20`、`sticky-vs-rotating.sh:19`、`docs/pa-challenge-botcheck-tasks.md` 改为引用它。
  - 验收：脚本本地跑过一次、三类臂各有记录和一份汇总；计划任务只在你点头并确认竞品额度后建（名字、时间写进本清单）。
  - [x] 计划任务（2026-10-20 建）：桌面 app 计划任务 `octocrawl-pa-weekly-rerun`，每周一 10:30（app 另加几分钟抖动），在专用 worktree `.claude/worktrees/pa-weekly`（detached 跟随 `origin/main`，`.w2l/access/` 里放 steel grant、竞品 key 和 10-14 验收那份 installed_chrome grant）里先 `npm ci` 和 `npx tsc --build`，再 `HTTPS_PROXY=http://127.0.0.1:7890 node research/access/weekly.mjs`，提交记录并开 PR（不自动合并）。代理必须带 `http://`：undici 的 EnvHttpProxyAgent 不认裸 `host:port`，竞品额度检查会报 Invalid URL。原说明：只在你点头并确认竞品额度后建。第 4 组只有 6 题，所以四周里有一周是 47 题而不是 51。建议的命令 `node research/access/weekly.mjs`（在 `main` 的最新 checkout 里，shell 带 `HTTPS_PROXY`），建议时间每周一 10:30 本地时间（在 `octocrawl-cleanup-gone` 之后）；每周预期费用：Steel 约 $0.02–0.03，Firecrawl 约 47–51 credits，ZenRows 约 50–250 credits（auto 模式按成功的配置计费，1–25/页）。
- [x] **P0.6 给 H1 窗口的接口约定（2026-10-20 改为核查：H1 PR ④–⑥ 已合入，#608、#616、#617）。** `packages/mcp/src/hostedJobWorker.ts:200` 建引擎时 `hosted: true`、不传 accessGrant，生产入口 `hostedJobsCli.ts` 也不设 `engineOptions`，所以 PH H5 之前托管切片不会有付费调用，约定的第一条已成立。注意 `engineOptions` 是测试 seam，展开在 `createApiEngine` 参数里，能带进 grant；PH H5 开放前要给它加"托管 worker 不接受 grant"的断言。USD 预留的 key 约定和租约/重复投递验收没有发生的对象，移交 EH1 与 PH H5。原约定内容：PR ④ 的 worker 引擎不传 accessGrant（PH H5 之前保持 null）；托管切片的 USD 付费调用若将来存在，预留存 Firestore、挨着 `hostedJobs`，key `{jobId}-{slice}-{ordinal}`，credits 的幂等键 `{jobId}-{slice}` 不变、USD key 是它的子键；PR ④ 的 W5 验收要覆盖"旧租约提交不得改写预留"和"重复投递按 `{jobId}-{slice}-{ordinal}` 幂等、不重复预留"。

## Phase 1 · 三条并行线 + 评测基建

### A 入口配置一致（`packages/api`、`packages/cli`、`packages/mcp`）

方案 §五.1。目标：同一份 grant、同一个任务，在 API CLI、产品 CLI、本地 HTTP host 上生成相同的 eligible routes；托管表面的拒绝不变。

- [x] **A1 先写失败测试。** `packages/mcp/test/localHost.test.ts`：`W2L_ACCESS_GRANT` 指向 `{tier:'enhanced', capabilities:['vendor_remote_browser'], tariffs:{steel:…}}`、`W2L_VENDORS=steel` 配假 key，对本地 URL 发 `access: enhanced`：不再答 400，`ladder_channels` 含 `provider(steel)`（connectVendor 推迟到首次 fetch，不出网）；installed_chrome 路线留给实站验收。`packages/cli/test/cli.test.ts`：新增 `W2L_BROWSER_IDENTITY=actual` → 引擎收到 `browserIdentity` 的断言（现有 `:38` 只测 `--access standard` 解析，`:177-182` 只测坏 grant 的 usage 错误）。
- [x] **A2 共用的引擎配置加载器。** 从 `parseListen`（`packages/api/src/listen.ts`，`readAccessGrant` 起）拆出只含引擎选项的那一片：accessGrant、browserEngine、browserIdentity、compatHosts、egressProxies、egressEchoUrl、workerCount、`tunedPolicy`（`W2L_PER_HOST_*`），加 Patchright/impit 预加载（`api/src/cli.ts:29-34`）。`ListenConfig` 和 `parseListen` 的返回形状不变：`parseListen` 内部调加载器再展开，所以 `packages/api/test/listen.test.ts`、`api/src/cli.ts:51-57`、`cli/src/run.ts:73-79` 不用改。加载器带 `hosted` 开关，托管时沿用现有拒绝（my_browser 档、compat、egress、installed_chrome）；它自己的测试放 `packages/api/test/engineConfig.test.ts`。
  - `ManagedRuntimeOptions` 加这六项并传给 `createApiEngine`（`managedRuntime.ts:35` 是唯一要改类型的地方）；`createManagedRuntime` 只有 `localHost.ts:43`（本地，要改）和 `host.ts:56`（托管，保持不传）两个调用方；`hostedApi.ts:486` 直接调 `createApiEngine`，也保持不传，并在测试里断言托管路径仍拒绝 enhanced/my_browser。
  - 注意：grant 进了页面缓存 key（`engine.ts:682`）和 Evidence Record 的 access 块，本地 host 加 grant 后缓存行为会变，测试里要覆盖。
- [x] **A3 产品 CLI。** `packages/cli/src/run.ts:75-79` 加 browserIdentity；一次性命令是否读 `--access-grant` 由加载器统一决定（默认仍只读环境变量，usage 文字要和行为一致）。
- [x] **A4 本地 host 的启动链。** `scripts/section-c/local-service.mjs` 的 plist 转发 `W2L_ACCESS_GRANT`：把 plist 文本抽成纯函数，用单元测试验证（设了就转发、没设就没有），不运行 `install`/`restart`/`uninstall`（它们会 bootout 再 bootstrap 8791）；`.w2l/local-mcp.env` 可放 grant（`localHostCli.ts:9-18` 已读该文件）；`docs/local-setup.md`、`docs/mcp-first-use.md`、`docs/access.md:94` 写明。
- [x] **A5 潜在崩溃。** `ladderCli.ts:235` 在 `browserAllowedHosts` 与 installedChrome 同时存在时 `buildChannels` 直接 throw；本地 host 设了 Amazon 公共状态文件就会传 `browserAllowedHosts`（`localHost.ts:44-46`），A2 之后这条路会被走到。做法：`buildChannels` 在有 `browserAllowedHosts` 时不建 installed_chrome rung，并在启动通知里说明（throw 发生在建 channel 集时，不是单次请求，写不进 `ladder_channel_skipped`）。测试：`packages/mcp/test/localHost.test.ts` 设 `W2L_AMAZON_PUBLIC_STATE_FILE` 加 installed_chrome grant；`packages/bench/test/ladderCli.test.ts` 断言不再 throw。
- 完成（2026-10-20，一个 PR）：加载器 `packages/api/src/engineConfig.ts`；本地 host 经 `ManagedRuntimeOptions` 传六项和 workerCount、`W2L_PER_HOST_*`；托管时加载器还拒绝 installed_chrome；`--access-grant` 只有 API 服务器读，一次性命令和本地 host 只读环境变量（usage 不变）；三入口表驱动测试 `packages/mcp/test/entryRoutes.test.ts`；plist 纯函数 `scripts/section-c/local-service-plist.mjs`。
- 验收：A1 的测试通过；`packages/mcp/test/hostedSchema.integration.test.ts` 的 NEVER_HOSTED 不变；三个入口对同一 grant、同一 URL 的 `ladder_channels_filtered`/`channelsTried` 一致（写一个表驱动测试）；实站：在 8797 起第二个本地 host（不动 8791，用完关掉），对 T053 跑一次 `access: enhanced`，记录显示走到 installed_chrome 或 provider（已有路线的一次验收运行，不算新的付费路线）。

### B 文档捕获一致（`packages/bench/src/vendors`、`subjects/provider.ts`、`ladderCli.ts` 的 provider 段、`packages/contracts`）

方案 §五.2、§六.2。目标：每次捕获知道自己对应哪份文档；远程通道的 status/headers 与 DOM 同代际；供应商给不了证据时写 unobserved，不写 matched。

- [ ] **B1 先写失败测试。** `packages/bench/test/vendors.test.ts` 的 fake browser（`newCDPSession` 桩约 `:94`）扩成能发 `Page.frameNavigated` / `Network.responseReceived`，加"goto 之后换文档"两例（脚本跳转、挑战放行）：期望 status/finalUrl 来自最后显示的文档；再加一例没有 `newCDPSession`，期望 `responseMatch: 'unobserved'`。对照 `browserLocal.test.ts:802/839/859/905` 的本地行为。
- [ ] **B2 CDP 侧主文档追踪。** `vendors/cdp.ts`：goto 之前开一条 CDP session（与 `meterPage` 共用或另开一个 helper；`meterPage` 只在有 meter 时才开，不能依赖它），监听 `Page.frameNavigated` / `Network.responseReceived`（type Document），模式照 `packages/api/src/chromeHandoff.ts:513-543`，在和 `metering` 同一个 finally 里 detach；`context.newCDPSession` 不存在或开失败时 `responseMatch` 为 `'unobserved'`，永不写 `'matched'`。`CdpPage` seam 加可选 `on()`；`NavigationOutcome`（`:199-212`）和 `ProviderResponse`（`provider.ts:73-99`）带 documentGeneration（loads 计数）、显示文档的响应、`responseMatch: matched | mismatched | unobserved`（用方案的枚举）。`provider.ts:420-430` 的 evidence 改用显示文档的 status/contentType；顺带把 `:434-435` 的 bytesWire 改 null（G1 的 provider 部分）。
- [ ] **B3 内部的 CaptureRef / ViewRef（方案 §六.2，第一轮只做内部引用和诊断）。** 在 bench 内部给 FetchResult 加 `capture: { captureId, requestedUrl, finalUrl, capturedAt, sourceKind: 'http_body' | 'browser_dom', sourceHash, documentGeneration, responseMatch, capabilities, limits }`，browserLocal 从 `MainFrameDocuments` 填、provider 从 B2 填、http 只填 captureId 和 sourceKind；HTTP 捕获与之后的浏览器捕获 captureId 不同。ViewRef `{ viewId, captureId, parentViewId?, regionId?, selectionVersion, transformVersion }` 只写进 trace，由区域选择和 layout/shadow 转换处生成。公开的 Evidence Record 可选字段等 F3a 用过、稳定后再加（G5）。
- [ ] **B4 bench CLI 路径的 provider 拒绝（小）。** 引擎（`engine.ts:926-962`）已经为 screenshot/actions/headers/mobile/skipTlsVerification 丢掉 vendor rung，`ladder.ts` 也为 waitFor 跳过无 `waitsFor` 的 rung，产品路径没有缺口。只有直接用 LadderRunner 的 bench CLI 缺这一层：在 `routing/ladder.ts` 约 `:600` 的 providers 过滤里对 provider channel 也应用 `refusal`，事件是 `ladder_channel_not_served`；失败测试放 `packages/bench/test/ladderCli.test.ts` 或 `ladder.test.ts`，用假 provider channel。
- [ ] **B6 共享 browser 异常断连后的重建（方案 §七.1 的待验证点，不写成已发生事故）。** 失败测试放 `packages/bench/test/browserLocal.test.ts`：起一个 Subject、请求一次、杀掉共享 browser 进程、再请求同一 Subject，断言第二次拿到重建的 browser 并成功，或以明确的 failureClass 失败而不是挂住或复用死句柄。若失败，修法是在 `getBrowser` 里监听 `disconnected` 或检查 `isConnected()`，清掉 `this.browser` / `this.browserPromise`。installed_chrome 不在此列（它按任务生命周期启停）。
- 验收：B1 三例通过；B3 的 `capture`/ViewRef 出现在 trace 里，`contracts/test` 不变（本轮不动公开记录，公开字段见 G5）；B4 的假 provider channel 测试通过；B6 的重建测试通过；实站：Steel 上跑 T001、T047（挑战页）各一次，记录里 `responseMatch` 有值且 httpStatus 与最终文档一致。

### D 主体与字段（`packages/extract-tf`、`packages/contracts`、`packages/api/src/structured.ts`）

方案 §五.3、§六.3。目标：先定主体，再按主体合并字段；来源有定位；歧义保留。

- [ ] **D1 先写失败 fixture（五个，`packages/extract-tf/test/product.test.ts` 内联 HTML，不进 `packages/fixtures`）。** 推荐商品 JSON-LD 在前（期望目标商品）；目标 JSON-LD 缺价、另一商品 microdata 有价（期望价格 null + 冲突记录）；ProductGroup + `?variant=T-XL`（期望 XL）；offers 数组（期望按目标 offer，不是第一个）；同 SKU 两来源不一致（期望 conflicting，不静默取一个）。
  - 现有 `product.test.ts:96-103/105-122` 用 `toEqual` 断言 fact 没有 `path`，加 path 后要一起改；`:124-139` 的同商品 JSON-LD+OG 合并要保住。
- [ ] **D2 主体解析。** 收集全部 Product 节点（含 `@graph`、ProductGroup/hasVariant）并带 JSON Pointer；按请求 URL 与 variant 参数、canonical、节点 `@id`/`url`、`mainEntity`/`mainEntityOfPage`、URL 里的 sku/mpn 排序；多个剩下就 `identity.status = 'conflicting'`，不取第一个。复用 `contracts/src/extractor.ts:90-105` 的 `ProductIdentity`，把 `requestedId`/`observedSelectedId` 改为 `string | null`（通用页 URL 常没有 sku）并改注释，`amazon.ts:150-179` 随之通过类型检查。`collectDeclaredProductFacts(doc, ctx?: { url?, canonical? })` 加可选第二参数，调用方 `extract.ts:152`（`:143-145` 已读到 baseUrl 和 canonical）和 `product.ts:426`。
- [ ] **D3 同主体合并与来源定位。** `fillMissing` 只在低优先来源绑定到同一主体时补（同 sku/`@id`，或 microdata scope 在选中区域内）；不一致记 `field_ambiguous`（复用 `declared.ts:51-70` 的逐节点 path 和 `structured.ts:176-209` 的冲突机制）；jsonld/microdata/meta fact 都带 `path`（pointer、选择器、`meta[property=…]`）。
- [ ] **D3b 字段合同（方案 §六.3 的 FactSet）。** 每个 fact 可选带 rawValue、normalizedValue、unit、转换规则、适用情境（商品：变体/地区/报价类型；文档：版本/发布/修订时间；表格：行键/列头/单位/脚注/有效日期）；区分 unobserved（选择器没匹配到）与源站明确宣布的 absence；新字段进 Evidence Record 要登记 `EVIDENCE_RECORD_ADDED_KEYS` 与 `packages/contracts/schemas/evidence-record.v1.json`，`w2l.evidence/1` 不变。D6 的"带符号百分比"并入这一条。第一轮做不完的部分写明延后项和理由，不静默省略。
- [ ] **D4 结构化输出。** 通用商品 `identity.status ≠ matched` 时发 `subject_unverified`（现在 `structured.ts:701/958` 对通用页不可达，因为 GENERIC_ADAPTER 没有实体）；`evidencePath` 从 fact.path 带出（`:426-447` 已支持）；unobserved 与显式 absence 分开输出。是否给通用商品页一个实体由实现时判断，最小改动是从 identity 发 issue。
- [ ] **D5 实站用例。** `research/parity/sites.md` 加两行：一个推荐 JSON-LD 在目标前面的商店页、一个 ProductGroup 页；先在 `main` 复现，再改代码；记录到 `research/parity/runs/`。
- [ ] **D6 从 #584/#528 拆出的 D 类片段（滚动项，每个一个小 PR，各带自己的负例 fixture；依赖 R1，不在 D 的验收和 Phase 1 退出条件内）：** RFC/WCAG 文档头信息与状态/日期保留（F3a 复用这个 fixture）；OTTO 变体与起价；ESPN 拆分积分榜；FT 头条卡片；聚合报价。每个 PR：fixture + `sites.md` 用例 + 开发集 D01–D10 相对 R1b 无退步（R1 合入前改为对应 `sites.md` 用例 + 本 PR 的负例）；每个片段必须经通用规则（主体、字段关系、情境）生效，不得按 host 或字符串匹配。
- 验收：D1 五例通过；`EXTRACTOR_VERSION` 升号；D5 两行实站用例通过；开发集字段正确率相对 R1b 不退步；rawValue/unit/转换规则能往返；保留集 v2 在 Phase 2 结束前不跑。

### R 评测基建（研究文件，不改引擎）

方案 §十一。目标：有一个未参与调参的保留集、一个独立评分器、一个"前"值。

- [x] **R1 开发集。** 从 `main` 拉新分支，cherry-pick #556：`research/accuracy/{README.md, audit_gold.py, test_gold.py, source_dom.py, field-gold-manifest.v1.json, field-gold-plan.v1.json, field-gold.schema.json, .gitignore}`；`.github/workflows/field-gold.yml` 只保留 `workflow_dispatch`；Python 在 `.w2l/pyenv` 里跑（AGENTS.md）。D01–D10 做开发集，H01–H08 降为回归集（#562 已打开它们）；原始页面继续放 `.w2l/field-gold/`。（2026-10-20 完成，#621）
- [x] **R1b 开发集基线。** R1 合入后、任何 D/F 代码改动合入前，用 R3 的评分器对 `main` `2ffd7f25`（或当时的 main）跑 D01–D10 和 H01–H08，命令、commit、逐字段正确性记录到 `research/accuracy/runs/`。这是 D、D6、F 验收的"前"值。（2026-10-20 完成：`research/accuracy/runs/2026-10-20-dev-baseline-cea1d4cb.md`，`main` `cea1d4cb`）
- [x] **R2 保留集 v2。** 按文章、商品、列表、表格、动态区域、文档元数据分层，至少 40 题、每题逐字段标注：主体、值、来源关系（pointer/选择器/行列）、单位、日期、完整性、新鲜度；清单与 SHA 冻结在 `research/accuracy/reserved.v2.json`；标注与抽查按决定 3。不含 92 题里的任何 URL，不含 H01–H08。N=40 时零假成功的单侧 95% 上限约 7.2%，验收里写明；v3 扩到 ≥300 题分层是本轮之后的后续项。（2026-10-20 冻结：42 题、295 字段、六层各 7 题，`research/accuracy/reserved.v2.json`；本会话标注，Howard 的 20% 抽查（62 个字段）待做；未对任何候选跑过）
- [x] **R3 独立评分。** 从 #562 取 `holdout_score.py`、`test_holdout_score.py`（`run_holdout.mjs`、`holdout-protocol.md` 可选；`field-acceptance.yml` 不要）；扩展为主体匹配、字段关系、单位/日期保留分别计分；报告 N 和零假成功的单侧 95% 上限 1−0.05^(1/N)；成功结果中的错误比例与每请求假成功概率分开报。（2026-10-20 完成，#621；`run_holdout.mjs` 未取，改用单版本的 `run_dev.mjs`）
- 验收：v2 冻结记录（题数、分层、SHA）；评分器有测试；R1b 记录在案；v2 对任何候选都还没跑过。

## Phase 2 · 交付闭环

### C 表格等待残余（#604 之后）

- [ ] **C1 实站重跑（不依赖 B）。** Nasdaq/AAPL 延迟表格在 `main` 上重跑（#604 没有实站重跑），本地浏览器、不带 grant，记录。
- [ ] **C2 其他通道。** 先在 `packages/bench/test/regionWait.test.ts`（现有 readTables 用例 `:276-310`）加两例：(a) 只有表格检查、没有 readTables：记录今天是 `unjudged: 'checks_not_on_page'`、无 `tablesUnjudged`；(b) `tableRowsMin` 混一个能过的文本检查：今天可以在表格没判定时 `ready: true`，这是失败测试。生产改动（按决定 12）：`regionWait.ts` 去掉 `tablesUnjudged` 和 ready 门槛上的 `readTables !== undefined` 条件，没有表格读取器就报 `tablesUnjudged: true`、永不 ready。B2 之后再给 provider 通道接同一个 `readTables`（需要 CDP 页上的 captureLayout）。readiness 沿用 ADR 0007 的 `region_unjudged` 处理：检查失败时 `not_extracted` + `region_unjudged`（`readiness.ts` 的 regionWaitOf），阶梯把它当 `not_served` 继续向上、不关付费 rung（`ladder.ts:426-436`）；最终交付的表格检查通过仍是 `ready`。
- [ ] **C3 一致性回归。** readiness 与最终表格规则共用一个函数的断言；selector 没匹配到元素 → unjudged 而不是空集合；tables 批次和 `delayedTableDelivery.integration.test.ts` 不退步。

### E 付费持久恢复（`packages/runtime`、`packages/http-core`、`packages/contracts`、`packages/mcp`）

方案 §五.5、§八。目标：预留先落盘再调供应商；每次调用有稳定 `paidCallId`；崩溃后不重开已占额度；未知费用不归零。E3 拥有 `routing/ladder.ts` 的 `paidFetch` 段（约 `:1030-1050`），F 的接线在它之后 rebase。

- [ ] **E1 先写失败测试。** 新子进程 fixture `packages/runtime/test/fixtures/paid-crawl-process.ts`：CrawlOrchestrator + SqliteTaskStore + 假付费 ScrapeAtom（reserve $1 后 settle），store 包装层在 settle 之后的 `putAttempt` 前按环境变量选的 kill 点对自己 SIGKILL。测试 `packages/runtime/test/paidRecovery.test.ts` 照 `delivery.test.ts:395` 的方式 spawn，预算 $1，恢复同一任务，断言不再有第二次付费调用。放默认 unit 组，只有时间界限不稳才进 TIMED。现有 `orchestrator.test.ts:853`（优雅关闭）和 `http-core/test/spend.test.ts` 不改、保持绿。
- [ ] **E2 `paid_calls` 表。** `sqliteStore.ts` SCHEMA（`:59-128`，用 `CREATE TABLE IF NOT EXISTS` 迁移）；`TaskStore`（`taskStore.ts:35-73`）加 `putPaidCall`/`listPaidCalls`，`memoryStore.ts` 同样实现。字段：paidCallId（reserve 之前确定性生成 `{taskId}-{attemptId}-{ordinal}`，恢复后复用，可作供应商幂等键）、taskId、attemptId、url、vendorId、ceilingUsd、state（reserved / submitted / usage_pending / settled / unknown / released）、chargedUsd、providerRequestId、providerSessionId、tariffVersion、grantHash、deadline、createdAt、settledAt。`EvidencePaidCall` 加可选 `paidCallId`，登记进 `EVIDENCE_RECORD_ADDED_KEYS.accessPaidCall`（`contracts/test/evidenceRecord.test.ts:53` 同步），`ladder.ts:1336` 的 paidCall() 填它；paid_calls 是持久状态机，EvidencePaidCall 是结算快照，不重复。
- [ ] **E3 调用前落盘。** `SpendLedger.reserve` 保持同步、contracts 签名不变；给账本（或 `ExecutionContext.spend`，`contracts/src/execution.ts:49`）加可选 `persist?: { onReserve(call): Promise<void>; onSettle(call): Promise<void> }`，编排器接到 store；`routing/ladder.ts` 在 `:1037` 的 reserve 之后、`:1047` 的 `channel.fetch` 之前 `await onReserve`（写完才发请求），拿到 session id 写 submitted，结算时 `onSettle` 写 settled 或 usage_pending。单页 scrape 没有 store 时保持内存行为。
- [ ] **E4 恢复。** `orchestrator.ts:240-244` 的 priorChargedUsd = attempts.chargedUsd + 未结算行按 ceiling；`interruptOpenAttempts`（`:597-613`）把孤儿 reserved/usage_pending 折进中断的 attempt；submitted/usage_pending 的行恢复时先查供应商 session 或用量（Steel session 列表）再定 settled 或 unknown，不盲目重放；供应商接受幂等键时传 paidCallId（Steel 是否支持要先核实，不先宣称）；unknown 永不自动释放；released 只在有证据时写。可变费用只有估算时保留 usage_pending 和 residualExposure。
- [ ] **E5 监控字段。** 任务状态里分别给 reserved、knownCharged、unknownExposure、refundable；超上限按实记录并标 overCeiling（账本已有）。browser_local 失败路径的 `externalCostUsd: 0` 是真零，保留。
- [ ] **EH1 与 hosted 两本账的关联（排在 H1 PR ④ 合入之后）。** `hostedCredits.ts` 的 RequestNote/RequestLine 加 scrapeId 与 paidCallIds，让 credits 与 USD 按 id 关联；托管侧的 USD 预留实现本身属 PH H5，不在本轮。
- [ ] **E7 故障注入集。** 预留后、远程 session 创建后、收到页面后、写 step 前各 kill 一次；取消后迟到结果；账单 API 不可用；上报费用高于预留；同一 paidCallId 提交两次只结算一次。第一轮本地 SQLite + 模拟供应商；然后对 Steel 做一次受控真实调用，核对 request/session 对账链（预算见决定 1）。租约与重复投递属 PR ④ 的 W5（见 P0.6）。
- 验收：E1 绿；E7 本地全过；真实 Steel 对账记录一份；没有任何路径把未知费用写成 0。

### F 有限候选与模型证据（`packages/api/src/structured.ts`、`packages/bench`）

方案 §五.4、§六.4、§六.5。目标：模型只提候选、确定性规则复核；已取得的页面先重提取再花钱。schema 合法与事实有来源支持是两个状态。

- [ ] **F1 先写失败测试。** 反转 `structured.test.ts:893-927`，逐字段给期望：`/availability`：模型答 `in_stock`，按 F2 的匹配规则定位到声明数据里的 `In Stock`（`#availability`），保留；`/material`：`aluminium` 在正文里，保留；`/warranty`：`two years` 定位不到，字段缺失（可空字段定位不到时不写 null，保持缺失），status `incomplete`，issue `model_unsupported`。`:409-426`（`aluminium` 在正文里）保持 complete。再加一个负例：9.99 只出现在推荐商品区域，期望 unsupported。
- [ ] **F2 模型候选复核。** `extractStructured` 在 `validate(merged)` 之后（`structured.ts:1045` 附近）：每个模型写入值必须能定位，匹配规则：小写、合并空白、`_`/`-`/标点当空格，先查声明数据的值再查 `result.markdown`；定位写进 `evidencePath`/`text`（`StructuredFieldEvidence` 已有这两个可选字段），声明数据命中时记该字段的 evidencePath。主体绑定：D2 解析出 identity 的商品页、或请求点名了表格/列表行/itemSelector 时，定位必须落在该主体的区域或同身份的声明节点内，只在别处（推荐、其他变体、其他行）出现算 unsupported。情境：价格/数量/日期字段把原值、规范化值和旁边的币种/单位/日期/地区一起写进 evidence。定位不到的字段保持缺失，status 仍 incomplete；模型不改 required/nullable（已如此）。Evidence Record 的 `fieldEvidence.locator` 因此对模型字段不再恒为 null。B3 给到 captureId/viewId 后挂到候选上。
- [ ] **F3a 同捕获的有限候选提取。** 验证失败且 readiness 为 `not_extracted` 时，在同一捕获上评估最多三个候选：默认正文、目标文档章节、主体一致的声明数据；每个候选用原合同重新验证（ADR 0006：验证读最终投影）；trace 记 `extraction_candidates`（候选、得分、选中原因、字节/工作量上限是否触发）；沿用现有字节和工作量上限；这是免费动作，在任何付费 rung 之前（ADR 0007）。设计定为：候选循环放在新文件 `packages/bench/src/subjects/candidateExtraction.ts`，在首次提取之后由 `browserLocal.ts:1344`、`provider.ts:527`、`resilientHttp.ts:679` 调用（仓库没有 `subjects/http.ts`；`browserLocal.ts:1063`/`:1084` 另两处提取是区域等待用的，不在候选范围），用 `options.verify` 和 runtime 的 `verify()` 评估候选；阶梯只消费 trace，最终裁决仍是阶梯的 `contractVerdict`（备选：subject 返回源快照、阶梯跑候选并调 `contractVerdict`，裁决只有一条路但页面已关）。候选引用 B3 的 captureId/viewId（B3 定义，本任务只消费）。失败测试：`packages/bench/test/candidateExtraction.test.ts`，fixture 用本任务自己的最小 HTML；验收断言 D6 的 RFC/WCAG fixture 经"文档章节"候选被选中（fixture 不复制进来）。
- [ ] **F3b 列表/表格候选与缓存。** 请求指定的列表（itemSelector）/表格作为候选；缓存只有保留了可重提取的源快照（rawHtml/html）才做候选提取，只有 Markdown 的缓存按 freshness/mode/budget 重新读取（页面缓存按请求形状 key，`engine.ts:677-682`，不是重提取入口）；实站：T073（not_extracted 案例）和 H01–H08 各跑一次，记录。
- [ ] **F4 动作决策的影子模式。** 新文件 `packages/bench/src/routing/decideNext.ts`，纯函数 `decideNext({ result, failureClass, readiness, verdict, remainingMs, channel })`，覆盖方案 §六.5 的全部 8 行：`next_rung`（访问被拦）、`wait_same_session`（送达但仍加载）、`reextract`（已捕获未提取）、`stop`（源端故障/预算）、`handoff`（登录墙：已授权会话或人工接手，无授权即停，assisted 单独统计）、`wait_retry_after`（429：尊重等待，不换身份）、`keep_591_fallback`（精确 headers timeout 且剩 ≥30 s）、`paginate_or_incomplete`（最终投影丢失必需内容：分页/游标/完整产物引用，否则按原合同返回未完成，不沿用裁剪前的 passed）。表驱动测试的硬约束：`not_extracted` 永不给付费 rung 发 `next_rung`；`region_unjudged` 先经 `contractReadiness` 当 `not_served`；`wait_same_session` 只对浏览器通道的 `not_loaded`，且已等时间 < 10 s 默认上限、`remainingMs` 留得出最终捕获。先只写 `ladder_action_decision` trace，记下影子决定与阶梯实际动作不同的案例；不驱动循环。接线在 E3 合入后 rebase。
- [ ] **F6（后续，不卡 F）MCP 大结构分页。** 方案 §九.3：`packages/mcp/src/results.ts` 的 `withinBudget`（`:87-110`）只缩正文，大 links/tables 没有分页；加分页或投影，裁后复验，fixture 断言裁掉必需字段不能保留 `passed`。
- 验收：F1/F2 通过；F3a 的 fixture 通过且 D6 的 RFC/WCAG fixture 经候选被选中；F3b 的 itemSelector 候选通过；开发集相对 R1b 正确交付上升、无退步；MCP 预算复验（#591）行为不变；T073 与 H01–H08 记录在案。

## Phase 3 · 观测与路线

### G 计量与路线历史（`packages/bench/src/routing`、`subjects/provider.ts`、`vendors`、`packages/contracts`）

方案 §五.6、§七.2、§九。先把观察数据做准，再改决策。

- [ ] **G1 字节诚实。** 规则：量过的才是数，没量的是 null，没发请求的才是 0。`provider.ts:434-435` 的 bytesWire 改 null（随 B2 做）；`grep -n "bytesWire: 0" packages/bench/src/subjects/*.ts` 逐处判断：browserLocal 的 `:628/1491/1706/1754` 和 provider 的 `:196`（providerFailure）在请求或 session 已开始后失败，改 null；provider `:703`（policy_denied，requestCount 0）保留 0。自备网关的流量不可测，保持 unknown 并在 K1 的成本里列为 unknown exposure。ByteMeter 的 bytesCounted/bytesCapped 从 `ClosedVendorSession` 经 `withMeasuredSessions`（`ladderCli.ts:645-668`）带到 `paid_calls` 和 Evidence Record（可选键，登记 ADDED_KEYS）；`docs/scrape-options.md:126` 改措辞。测试照 `contentEncoding.test.ts`、`compatTransport.test.ts:228-231`。
- [ ] **G2a RouteObservation 字段。** `VendorOutcome`（`vendorRouter.ts:59-70`）加 accessDelivered / regionLoaded / taskVerified / failureStage / readiness / reason、每次尝试的时间分解（G4 量的那些阶段名）、环境版本（浏览器大版本、出口配置版本），以及账本的 chargedUsd（取 `progress.paidCalls` 里已结算的值，`ladder.ts:1336-1340`，不是恒为 null 的 `result.usage.externalCostUsd`），在 `recordVendorOutcome`（`ladder.ts:1005-1018`）写入；Memory 与 File 两个 RoutingHistory 同步。失败测试放 `vendorRouter.test.ts` 和 `ladder.test.ts`，`ladderCli.test.ts`、`crawlCli.test.ts` 只改类型。
- [ ] **G2b 持久化与路线键。** 新文件 `packages/bench/src/routing/sqliteRoutingHistory.ts`（better-sqlite3 在 runtime 已用），文件在 `<taskRoot>/routing-history.sqlite`，实现 `RoutingHistory`；键从 host 扩成 (host, 路径族或任务族, 所需格式, 地区与出口类别, 浏览器/传输版本, 提取器/验证器版本, 策略版本)，带 TTL 和最小样本量，样本不足时回退到 (host, 出口类别) 再回退到固定阶梯，每次过期写失效原因（TTL、版本变化、出口变化）；浏览器大版本、站点模板或出口配置变更使相关记录过期；引擎在 `engine.ts:982-988` 用它替换 Memory；FileRoutingHistory 保留给 bench CLI；修掉 history 按 mode、channel 按 `mode|enhanced` 的 key 不一致。只存统计，不存 URL/cookie/凭据。
- [ ] **G3 排序。** 单位有效交付成本代替累计成本；新 host、新版本或样本不足时用现有固定阶梯；先影子排序（只记日志，保持声明顺序），两个窗口一致收益后才固化。
- [ ] **G4 Cloud Run 固定运行时（研究，按决定 5，可从 Phase 1 起并行）。** 镜像 digest、Chrome/Playwright 版本、字体、locale、显示参数固定，影响指纹或检测的参数只用 ADR 0005 测量过的那一组；启动自检分项（Xvfb、CDP、浏览器、DNS、代理控制页）；init 子进程回收与信号转发、admission control、保留非 root；分别计时冷启动、导航、challenge wait、region wait、捕获、提取、序列化、取消清理；资源配置用困难页负载曲线定；做一次本地 vs Cloud Run 同 16 题同出口的配对运行，隔离 Xvfb/出口/CDP 的归因（方案 §四.3）。只出记录，不开放托管 PA。出口成功率的测量与云功能计划 step 0 用同一 parity 站点集，记录可共用。
- [ ] **G5 公开的捕获字段（B3 经 F3a 用过、稳定后）。** Evidence 和 Evidence Record 加可选 `document: { captureId, generation, responseMatch }`，登记 `EVIDENCE_RECORD_ADDED_KEYS` 与 `packages/contracts/schemas/evidence-record.v1.json`，`w2l.evidence/1` 保持有效；测试在 `packages/contracts/test/evidenceRecord.test.ts`。
- 验收：每周重跑的 Steel 臂记录含 G2a 字段和单位成本；G1 的测试；G5 的 key 列表测试；路线决策不变。

## Phase 4 · 对照与受控开放

- [ ] **K1 两窗口对照。** Phase 2 合入后，同一 UTC 日交错跑：Octocrawl standard / enhanced / installed_chrome 三臂加一个固定在 `2ffd7f25` 的 main 对照臂，Firecrawl Cloud、ZenRows 两臂（key 与额度按决定 10 先确认）；92 题（含健康 25）+ 保留集 v2；固定 commit、任务集 SHA、地区、出口、缓存、模式、超时、预算；首次调用为主指标，重试改善单列。提取器与字段正确率的比较在冻结的不可变捕获（B3 的 captureId）上做、访问评估重读真实页面，两类实验分开记录；保留集 v2 各跑一次冻结捕获和实站。报告项见"完成标准"。另一天再跑一次，这次也替代 10-11 四臂 23 题欠的第二窗口。
- [ ] **K2 Browserbase 资格复查（按决定 6）。** 只查 entitlement；可用则在 16 题挑战子集上做最小配对实验，一次只变一个变量。资格查询是单独的小运行，可早做，决定留在这里。
- [ ] **K3 出口按检测类型。** 10-14 的 exits 记录（Webshare 过 T038/T046 两次）和 10-16 的 DataDome 记录（Webshare 1/16 vs Clash 5/16）互相矛盾；做一次配对实验再决定是否按检测类型选出口，否则不建。按检测类型选出口只能是请求前按 host 的已记录类型选，不是被拦后在同一 rung/会话内换出口重试（ADR 0005 永不做）。同一运行里顺带断言出口切换后 per-host pacing 与预算不重置（ROADMAP item 3 未测点）。配对实验是单独的小运行（不在每周脚本里），可早做。
- [ ] **K4 决定默认值。** 路线历史是否驱动排序；installed_chrome 是否进默认推荐；hosted PA（PH H5）是否开。计价按决定 11 不在本轮改。每条引用 K1 的边际收益表，要 ADR 0005 修订或 ROADMAP 决定。
- [ ] **K5 ROADMAP 收口。** 在 PA 的 bar 下写：冻结集与最好竞品的差距数字、补法、本轮关闭了哪些缺口；不写"达到竞品水平"除非两窗口、多任务类型、实际部署环境都支持。
- 验收：两份窗口记录；ROADMAP 更新；任何默认路线改变都有两窗口证据。

## 进度

- 2026-10-19：清单写成，核实基于 `2ffd7f25`。基线数字待 P0.1，开发集基线待 R1b。
- 2026-10-20：决定 1、3、7、9 已定；P0.2 的 PR #609 已开，P0.5 进行中。
- 2026-10-20：P0.1 基线跑完，在 `main` `1c4d9178`（#609、#610 之后）。92 题 enhanced（Steel 数据中心 grant，走 Clash）：verified 58/92，假成功 2（T010、T031），p50 6251 ms，p95 31203 ms，Steel 费用 $0.0251；健康 25 题 23 过（T027 http_error 400、T052 cloudflare_challenge）；T060 本轮 verified，不再是假成功，原因 unknown。记录 `research/access/runs/2026-10-20-pa-next-baseline-all-1c4d9178.md`。16 题 installed_chrome（Clash 出口，复用 10-14 验收的 grant）：12/16 过，未过 T045、T046、T068（DataDome）、T048（Cloudflare），假成功 0，费用 $0。记录 `research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md`。
- 2026-10-20：P0.3 分流完成（#512、#514 关闭，其余见 P0.3 表）；P0.6 改为核查，托管 worker 不传 grant；每周计划任务 `octocrawl-pa-weekly-rerun` 已建。Phase 0 全部完成。
- 2026-10-20：P0.4 每周脚本首次本地运行（代码 `main` `259bcef3` 加本 PR，记录名用 259bcef3；走 Clash，周 2026-W43，轮换第 3 组只有 6 题，共 47 题）。免费臂 36/47（健康 23/25，16 题 installed_chrome 10/16，高于验收下限 7、低于 11；轮换 3/6），假成功 0，$0；Steel 臂 28/47（16 题只过 2），假成功 1，$0.0049；Firecrawl 37/47，假成功 4，账户实扣 70 credits；ZenRows 34/47，假成功 3，实扣 338 credits（$0.338）。与最好竞品的差距：免费臂 1（16 题上 4），Steel 臂 9。记录 `research/access/runs/2026-10-20-weekly-{free,steel,firecrawl,zenrows,summary}-259bcef3.md`。计划任务未建，待 Howard 点头。
- 2026-10-20：R1、R3、R1b 完成（#621）。开发集基线（`main` `cea1d4cb`，保存字节经 HTTP 通道回放，只走本机回环，$0）：D01–D10 必填字段完全正确 34/86，任务接受 0/6，10 次请求中假成功 7（字段错 6、无目标仍答 success 1，每请求上限 91.3%）；H01–H08 回归集 62/75、6/8，与 #562 在 10-17 的结果相同。评分器有三处是看过本次输出后修的（D06 崩溃、unknown 维度误计、同一商品卡片拆成两条），修前 D 为 20/86，记录里两组数字都在。记录 `research/accuracy/runs/2026-10-20-dev-baseline-cea1d4cb.md`。

- 2026-10-20：A1–A5 完成（`844ddfec`，一个 PR）。A1 两个测试在 `main` `cea1d4cb` 上失败（本地 host 400 `unsupported_parameter`；CLI 引擎收到 `browserIdentity` undefined），改后通过；三入口对同一 grant、同一 URL 的 `channelsTried` 与 `ladder_channels_filtered` 一致（4 个场景）；NEVER_HOSTED 未改；`npm test` 3502 过、1 失败（`installedChrome.integration.test.ts` 的“等待自清挑战”，`main` 上同样失败）。实站：8797 第二个本地 host、installed_chrome grant、走 Clash，T053 `access: enhanced` 经 http 403 → browser_local 403 → installed_chrome 200，verified，$0。记录 `research/access/runs/2026-10-20-a-local-host-t053-844ddfec.md`。
- 2026-10-20：R2 保留集 v2 冻结（#624）：42 题（文章、商品、列表、表格、动态区域、文档元数据各 7 题），295 个字段，逐字段有主体、值、来源关系、单位、日期、新鲜度，`audit_gold.py` 从原始字节逐项复核通过；不含 92 题、H01–H08、D01–D10 和 parity 站点的任何 URL 或域名。N=42 零假成功上限 6.9%（N=40 时 7.2%）。本会话标注，Howard 抽查 20%（62 个字段，清单在 `reserved.v2.json`）待做；未对任何候选跑过，输出到字段的映射在第一次运行前写好并冻结。

## 下次从这里继续

- 决定 1、3、7、9 已定（2026-10-20），其余按默认。
- 下一项是 **P0.5**（runner 分母，P0.1 的记录格式靠它）和 **P0.2**（ROADMAP 修正），两者可同时开；P0.5 合入后跑 **P0.1**；A1、B1、D1 的失败测试和 R1 不等基线，可各开一个窗口。
