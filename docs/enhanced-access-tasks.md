# 增强访问（抗反爬）任务清单

依据：2026-11-10 对整条增强访问阶梯的评估（先本地，后托管；Howard 说更担心托管），以及 [ROADMAP.md](../ROADMAP.md)（当前阶段 "ten outside users"，`ROADMAP.md:37` 的冻结项）、[AGENTS.md](../AGENTS.md)、[ADR 0005](adr/0005-enhanced-access-policy.md)、[docs/access.md](access.md)。行号在 `main` 的 `1949dc97` 上核过，日期 2026-11-10。标"待核"的，动手前在当时的 `main` 上再查一次。

起因：16 个挑战页面的固定任务集（`research/access/subsets.v1.json` 的 `challenge16`）上，托管和本地差了一大截，而且差距的成因没有分开测过。

| 通道 | 谁能用 | 读到并通过校验 |
| --- | --- | --- |
| 托管普通阶梯：`http`，再到无头 `browser_local`，Google Cloud 出口，不等挑战 | 所有登录账号（13 个外部账号都走这条） | 0（10-31 那次 `hosted_chrome` 当天次数用完，13 页只走了这条） |
| 托管 `hosted_chrome`：真 Chrome 155，Webshare 机房代理 | 白名单 1 个账号，只能走 REST 的 `access: "enhanced"` | 5、6（[10-31 验收](../research/access/runs/2026-10-31-hosted-chrome-gate-4df8feed.md)的两次重跑） |
| 本地默认，不带授权 | 新装用户 | 0 |
| 本地 `installed_chrome`：本机真 Chrome | 手写授权文件之后 | 11、14、13（10-31、11-02、11-09） |
| Firecrawl（对照） | | 14、14、13（10-26、11-02、11-09） |

本地的数字全部来自一台 Mac 和一个 Clash 出口。11-02 和 11-09 的周报记录在分支 `claude/pa-weekly-2026-11-02`、`claude/pa-weekly-2026-11-09` 上，还没进 `main`。

目标一句话：**先弄清托管差在出口还是环境，同时让每一次被拦都报得准；之后才决定托管的钱花在哪。**

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 卡点

| 卡点 | 本地 `installed_chrome` | 托管 `hosted_chrome` | 成因 | 任务 |
| --- | --- | --- | --- | --- |
| Cloudflare 挑战页：capterra（T047）、cars.com（T071） | 4.2 s、4.8 s 通过 | 试过的每个出口都等到约 9 s 仍被拦 | 未知：出口和环境没分开 | M1、M2 |
| Cloudflare 拦截页：crunchbase（T048）；外部账号遇到的 lead411 | 3.1 s 通过（本地拿到的是挑战页） | "Sorry, you have been blocked"，报成 `cloudflare_challenge` | 出口被拒 | R1、R2 |
| DataDome 设备检查：tripadvisor、g2 | 2.6 s、6.0 s 通过 | 7.28–7.68 s 通过（4 次），约 9.04 s 仍被拦（2 次） | 托管慢，最后一次查看在约 9 s | H4（冻结） |
| DataDome：idealista（T045，验证码）、economist（T068，设备检查） | 没读到 | 没读到 | 未知：验证码子类型没记 | R4、L5 |
| studylib（T001） | 时过时不过 | 没读到 | 未知 | R4 |

## 待 Howard 决定

没决定的，按"默认"一栏做，或者先做不受影响的部分。

| # | 问题 | 影响 | 默认（未否决前按此） |
| --- | --- | --- | --- |
| D1 | 跑出口/环境对照（M1）：在 Howard 的 Mac 上开 Chrome 窗口，走现有的 Webshare 机房代理，不花新钱。 | M1 | **2026-11-10 Howard："写好我们就正式开始按照你出的方案"，按同意处理** |
| D2 | 托管 Chrome 只读探测（M2）：用测试账号当天 20 次 `hosted_chrome` 里的 1–2 次，读一个显示浏览器属性的公开页面。 | M2 | 同 D1，按同意处理 |
| D3 | 本地授权由一条用户自己运行的命令来写（L1）。`docs/access.md` 现在写 "Octocrawl never writes the grant for you"，这条要改那句话。 | L1 | **2026-11-10 Howard："按照这上面说的来做"（指把 D3 定下来、L1 提到和 R1 同一批的建议），按同意处理** |
| D4 | 报告修正 R1–R4 现在做。R1 给公开的 `blockReason` 新增一个值，只增不改。 | R1–R4 | 同 D1，按同意处理 |
| D5 | R1 新值叫什么。候选：`access_denied`（站点拒绝了这个出口，等待没有用）。 | R1 | 已定（2026-11-10）：`access_denied` |
| D6 | R1 里"拦截页不再等待"会改变 `installed_chrome` 和 `hosted_chrome` 两档的行为（每次省约 9 s，不改读到与否）。`hosted_chrome` 的进一步工作是冻结项，ADR 决定八要求它的启动改动过两次 challenge16。 | R1.4 | 本地先做；托管那档保持原样，等 Howard 开口。**2026-11-10 已定：本地不等，直接报；托管那档没有改，留给 H7** |
| D7 | R1–R3 的托管部分要部署才生效。 | R1–R3 | 只合并，不部署；Howard 要求时再部署 |
| D8 | M1 出结果后，冻结的 Phase 3 是否解冻、先解哪一项。 | Phase 3 | 不解冻，把结果和建议交给 Howard |

## 定下的方向

1. **先测量，后花钱。** M1 之前，ISP 出口、GPU、更长的等待都是猜。
2. **报告准确先于访问能力。** R1–R4 不让任何页面多读到一页，它们让"为什么没读到"说得对。这是 Evidence Record 的本分，也是之后判断外部账号被拦属于哪一类的数据来源。
3. **冻结项不动。** `ROADMAP.md:37`：`hosted_chrome` 的进一步工作、住宅或 ISP 出口、托管解验证码，等 `research/trials/` 里的试用记录或 Howard 开口。
4. **ADR 0005 的四条"永不"照旧**：不轮换身份、不给用户的 Chrome 打补丁、不在一次会话里换路、记录里不写秘密。

## 不做的事

- **不做指纹伪装和响应钩子。** 2026-11-10 估过：本地约 0，托管最多 1–2 页，钩子会破坏 Evidence Record；ADR 也列为不做。
- **不在托管上解验证码。** ADR 决定六；本地 CapSolver 对 DataDome 清掉 0 页。
- **不加长 Cloudflare 挑战的等待。** Cloud Run 上等到 19 s 也没用。
- **不把 Web Bot Auth 当成这些卡点的解法。** 没有实测效果。
- **不重试已经试过没用的：** Patchright、Camoufox（7/16）、无头模式（1/16）、`W2L_BROWSER_IDENTITY=actual`、Steel 的代理和解题、本地走 Webshare 住宅轮换（2/16）。
- **不因为 lead411 的 1 次读取重开 2026-11-05 "不默认开放托管出口"的决定。**
- **不改旧记录。** 两处站不住的说法（见 R5）写新的带日期更正。

## 现状（在 `1949dc97` 上查到的）

等待和判定：

- `packages/bench/src/subjects/browserLocal.ts:209`：等待上限 `cloudflare_challenge` 10 s、`bot_detected_generic` 10 s、`captcha` 0；只在 `installed_chrome` 和 `hosted_chrome` 上等。`:226-227` 的循环条件让最后一次查看落在约 9 s。
- `packages/http-core/src/gate.ts:45-51`：`GateBlockReason` 六个值（`cloudflare_challenge`、`captcha`、`rate_limit`、`login_wall`、`geo_restricted`、`bot_detected_generic`），没有"出口被拒"。信号 `cf_attention_required`（拦截页）和 `header_cf_mitigated`（挑战页）都报成 `cloudflare_challenge`。没有 Cloudflare 1020/1015 和 AWS WAF 的识别。`:926`、`:936` 提到 `browser_proxy`，没有任何通道实现它。
- Cloudflare 页面上的 "Verification successful. Waiting for … to respond" 在每种状态的存档里都有，不是通过信号。
- DataDome 验证码的子类型（`t`）只在带解题授权时才读。

提示和结果：

- `packages/api/src/hints.ts:55-57`：托管被拦的提示只提本地的 handoff 和已保存登录，不提本地 `installed_chrome`。`:78-82`、`:536`：升级建议。`:395`：`hosted_chrome` 读成功后说 "the local browser lane served the page"。
- `packages/api/src/engine.ts:816-818`：本机有 Chrome 而授权没写 `installed_chrome` 时的提示（已有，是对的）。
- 托管 `hosted_chrome` 读成功时顶层 `lane` 是 `browser_local`（2026-11-10 抽查看到的，产生它的代码位置待核）。
- `packages/api/src/structured.ts:1824-1828`：`metadata.timezone` 取声明指纹的时区，真 Chrome 的读取（实际跑在 UTC）也报 `America/Los_Angeles`。

托管：

- `access` 只在 REST 的 `POST /v1/scrape`（`packages/api/src/app.ts:225`）上收；托管 MCP 的工具参数里没有。
- `packages/mcp/src/hostedApi.ts:682-684`：`hosted_scrape_phases` 不记拦截信号。`packages/mcp/src/hostedChromeMeter.ts:172`：`hosted_chrome_read` 不记站点和原因。
- `packages/http-core/src/spend.ts:65-75`：固定月费计价，每次读取记 0 美元，月度 20 美元上限不起作用。
- `Dockerfile.hosted-chrome:30-31`：`LANG=C.UTF-8 TZ=Etc/UTC`；出口是美国的 Webshare 机房代理。Chrome 固定在 155.0.8059.79，没有升级规则。
- `octocrawl-chrome`：并发 1、最多 1 个实例；忙时返回 503 但当天次数已扣；每账号每天 20 次；一次读取 22–30 s。
- 托管 Chrome 报什么 WebGL、CPU 核数、内存、`navigator.webdriver`，没有任何记录。普通阶梯的 `browser_local` 是无头的；按 Chromium 源码，无头下 `navigator.webdriver` 为 true（没有在实例上实测）。

线上（10-28 到 11-09 的日志，只取计数）：

- 913 次托管读取，141 次被拦（`captcha` 57、`cloudflare_challenge` 53、`bot_detected_generic` 27），大多是作者的测试和无 key 访客读 google.com。
- 11-05 以来其他登录账号 28 次读取，26 次成功，1 次被拦（lead411.com）。`hosted_chrome` 70 次调用，全是作者的。
- 2026-11-10 的 5 次抽查（托管版本 `34f6a22e`，不是正式运行）：普通阶梯读 capterra、etsy、lead411（2 次）全部被拦；lead411 走 `access: "enhanced"` 被 `hosted_chrome` 读到，HTTP 200，10,344 字符，30.6 s，n = 1。

本地：

- 不带授权只跑 `http` 和 `browser_local`。带授权要手写授权 JSON、带 `--access-grant` 重启、每个请求加 `access: "enhanced"`。
- `http_compat` 用 impit 0.14.5（Chrome 142 的指纹）；npm 上 0.14.8 有 Chrome 151。`http` 档的 UA 写 Chrome/128，本机真 Chrome 是 156。
- `installed_chrome` 每次读取用全新的配置目录，最多 2 个窗口。
- 48 个真实反爬页面（10-26 / 10-27 两个窗口），不带授权对 `installed_chrome`：Cloudflare 挑战页（11）2/1 对 11/11；Cloudflare 拦截页（3）0/0 对 2/0；DataDome（12）3/3 对 9/8；Akamai（6）1/0 对 4/4；AWS WAF（4）0/0 对 1/1；PerimeterX（5）3/3 对 4/4；其他（7）1/1 对 3/3；合计 10/8 对 34/31。

## 总原则

- **流程**：每个任务一个分支、一个 PR，从当时的 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree。commit 用 `-s` 签名，conventional 格式。PR 开好后打开 Auto-fix。
- **先复现**：R 和 L 的每一项先写一个在 `main` 上失败的测试（本地 fixture）。fixture 来自存档的拦截页时先清掉 IP、Ray ID、cookie、挑战令牌和 DataDome 的 `cid` / `hsh`。
- **证据诚实**：每次真实站点运行在 `research/access/runs/` 下写一份带日期的记录：命令、commit、走代理还是直连、出口类型。失败、被拦、连接错误都留在分母里。没测的写 unknown。任务集冻结后不换 URL。
- **秘密**：代理登录、cookie、解题令牌、key、账号 uid 不进记录、日志和 PR。记录里代理只写 `host:port`。
- **构建**：真实站点运行前 `npx tsc --build` 并重启 API（`npm run api`，端口 8787；8791 和 8812–8814 不碰）。
- **检查**：每个 PR 跑 `npm run typecheck` 和 `npm test`（跑测试前 unset 代理），把结果写进 PR。
- **部署**：只在 Howard 要求时。

## Phase 0 · 测量（不改产品）

### M1 出口/环境对照　M

问题：`hosted_chrome` 和本地同时差了出口（Webshare 机房代理对 Clash 出口）和环境（Cloud Run 上 Linux + Xvfb 的 Chrome 155 对 Mac 上的 Chrome 156）。能分开两者的一组从没跑过：Mac 上的 `installed_chrome` 走同一批 Webshare 机房代理。

- [x] **M1.1** 核对走法：`W2L_EGRESS_PROXIES` 加授权里的 `egress_sessions` 是否让 `installed_chrome` 这一档也走代理（`docs/access.md:156` 写 "every fetch"，这一档待核）；不走的话用 `research/access/probe-forward.mjs` 的本地转发加 Chrome 的代理参数。确认本机的代理清单和托管用的是同一批（清单在 `.w2l/access/`，不提交、不打印）。
- [x] **M1.2** 跑之前把判定规则写进记录的开头，跑完不改：
  - 两组：A = Mac `installed_chrome` 走现在的 Clash 出口（当天基线）；B = 同一台 Mac、同一个 Chrome，走 Webshare 机房代理，每次读取一个代理（和托管一样）。
  - 任务：`challenge16` 全部 16 页，每组 3 轮，A 和 B 交替跑。
  - 一页"通过"= 3 轮里至少 2 轮读到并通过校验。
  - 看三页：capterra（T047）、cars.com（T071）、crunchbase（T048）。
  - B 上 capterra 和 cars.com 都通过：差距在环境，ISP 出口不是下一步，转 M2 的结果和 H2/H3。
  - B 上两页都不通过、拿到的仍是挑战页、A 当天通过：差距在出口，H1（ISP 出口对照）是解冻后的第一项。
  - B 上拿到的变成拦截页：出口被拒，同样指向 H1。
  - 其余情况，或 B 组超过四分之一的尝试死在连接错误上：写"没有结论"，不下判断。
- [x] **M1.3** 运行并记录：`research/access/runs/<日期>-exit-vs-environment-<commit>.md`，写明命令、commit、A/B 各自的出口类型、每页每轮的状态、`blockReason`、gate 信号和等待结束时刻、连接错误数。
- [x] **M1.4** 把结论和对 D8 的建议交给 Howard。

结果（2026-11-10，[记录](../research/access/runs/2026-11-10-exit-vs-environment-1949dc97.md)）：
- 走法：`installed_chrome` 拒绝带登录的代理，`W2L_EGRESS_PROXIES` 用不上；改用 `W2L_CHROME_PATH` 包装脚本（`research/access/exit-split/`），只换真实 Chrome 的出口，每次启动一个代理。本机清单和托管的 secret 是同一批 100 个。
- 判定：**没有结论**（规则 4）。A 组当天也读不到 capterra、cars.com、crunchbase，两组都卡在约 9 s 仍未通过的 Cloudflare 挑战上。
- 规则外：A 组只读到 7–9 页，昨天的周跑（Chrome 156）是 13 页；今天 Chrome 自动升到了 157。原因没分开，见 M3。

### M3 本地基线在 Chrome 157 上掉了　M

2026-11-09 Chrome 156 读到 13/16，2026-11-10 Chrome 157 读到 7–9/16（同一授权、同一个 Clash 出口）。期间 Chrome 版本、日期、引擎 commit 都变了，原因还没分开。

- [x] **M3.1** 用 Chrome for Testing 156.0.8078.80 和本机的 157，在同一时段同一出口各跑 2 轮 `challenge16`。结果：没有结论（规则 3）。156 读到 8、9 页，157 读到 7、6 页。crunchbase 和 stackoverflow 跟着版本走（156 两轮都读到，157 两轮都被拒）；capterra 和 cars.com 两个版本都读不到。记录：[2026-11-10-chrome-156-vs-157-1949dc97.md](../research/access/runs/2026-11-10-chrome-156-vs-157-1949dc97.md)。
- [x] **M3.2** crunchbase 和 stackoverflow：分清是 157 还是「Chrome for Testing 对正式版 Chrome」造成的。结果：**是正式版和 Chrome for Testing 的差别，不是 157 这个版本**（规则 2）。同版本号的 Chrome for Testing 157 四次都读到，本机 Chrome 157 四次都被拒。差别是双向的：B&H（B001）本机 Chrome 两轮都读到，Chrome for Testing 四轮都被拦。没有哪个版本让基线回到 13 页（每轮 6–8 页）。记录：[2026-11-10-chrome-testing-157-1949dc97.md](../research/access/runs/2026-11-10-chrome-testing-157-1949dc97.md)。
- [ ] **M3.4** 查本机 Chrome 157 和同版本 Chrome for Testing 在站点眼里差在哪（请求头、client hints、`navigator` 属性、组件），只读探测，不改产品。查到之后再决定改不改检测参数（ADR 0005 决定八）。
- [ ] **M3.3** capterra 和 cars.com：156、157、Chrome for Testing 都读不到（M3.1 和 M3.2 共 10 轮），不是 Chrome 版本的事。隔几天重跑本地基线，看是站点当天的变化还是长期变化。

### M4 对照实验的设计要扛得住当天波动　S

2026-11-10 一个下午里，同一台 Mac、同一个出口的本地基线在 6–9 页之间晃（M1 的 A 组 9、8、7；M3.1 8、7、9、6；M3.2 6–8），前一天是 13 页。每组 2–3 轮、一个下午跑完的设计分不出这种波动，M1 和 M3.1 都因此没有结论。

- [ ] **M4.1** 之后的对照实验（重跑 M1、L2.1、L4.1、H1）按这个设计：分散在至少 3 个不同的日子；每个重点页每组至少 6 次读取；各组在同一时段交替跑；判定规则照旧在第一次运行前写进记录。「至少 6 次」是按 11-10 的波动估的，没有做过统计上的计算；`research/access/` 里已有的重复读取数据够的话，先用它算一个依据。
- [ ] **M4.2** 重跑 M1 按 M4.1 做，不再等「基线回到 11 页以上的那一天」：基线组和代理组每天都跑，当天基线读不到的页照样记，最后按 6 次以上的读取合起来判。

范围说明：这次只回答三页的出口/环境问题。一台 Mac、一批代理，不代表别的机器。

### M2 托管 Chrome 报什么　S

- [ ] **M2.1** 选一个显示浏览器属性的公开页面（候选待核；托管对每个 URL 守 robots.txt，被 robots 拒绝的不用）。需要读到：`navigator.webdriver`、WebGL 的 vendor 和 renderer、`hardwareConcurrency`、`deviceMemory`、时区、语言、屏幕尺寸。
- [ ] **M2.2** 用 REST `POST /v1/scrape` 带 `access: "enhanced"` 读 1–2 次；同一页用本地 `installed_chrome` 读 1 次作对照。
- [ ] **M2.3** 记录：`research/access/runs/<日期>-hosted-chrome-surface-<commit>.md`。只写属性值，不写出口 IP。WebGL 是软件渲染的话记下来，它是 H3 的前提。

## Phase 1 · 报告修正，加 L1（R 各项不改访问能力，本地和托管共用）

### R1 "出口被拒"和"挑战没通过"分开报告　M

- [x] **R1.1**（2026-11-10，PR #930，待合并）fixture：Cloudflare 拦截页（`cf_attention_required`）、1020、1015、AWS WAF 的 403 各一份，清理后放进测试目录。先写失败的测试：今天它们报 `cloudflare_challenge` 或不被识别。
- [x] **R1.2**（2026-11-10，PR #936，待合并，叠在 #930 上）`GateBlockReason` 加一个值（名字按 D5），`gate.ts` 把拦截页、1020、AWS WAF 的拒绝归到它；1015 归 `rate_limit`。跟着改：`contracts/src/status.ts` 的 blockReason 列表、`http-core/src/failureClass.ts`、SDK 的类型（JS 和 Python）、`docs/` 里列 blockReason 的地方、CHANGELOG 的 Unreleased。
- [x] **R1.3** 新值的提示：说清站点拒绝的是这个出口，等待和重试没有用；本地的下一步是换网络，或在用户自己的 Chrome 里读；托管的下一步是在自己的机器上跑。提示只说这台服务器真有的路。
- [x] **R1.4** 拦截页不进挑战等待（`browserLocal.ts:209` 附近）。本地先做；`hosted_chrome` 那一档按 D6。（PR #940，叠在 #939 上）
- [x] **R1.5** 真实站点核对：crunchbase 和 lead411 各读一次，记录新旧 `blockReason`。（2026-11-10：crunchbase 三次都报 `access_denied`，旧值 `cloudflare_challenge`；lead411 三次都直接读到，没遇到拦截页，新值没观察到，要等托管端部署后在 Google 出口上补读。[记录](../research/access/runs/2026-11-10-r15-access-denied-real-sites-f3f01baf.md)）

### L1 一条命令写本地授权　S（D3 已定，和 R1 同一批）

本地不带授权是 0 页，带授权是 11–14 页，中间隔着手写一个 JSON 文件再重启。2026-11-10 从 Phase 2 提到这里。

- [x] **L1.1**（2026-11-10，PR #928，待合并）由用户自己运行的命令：显示声明原文，用户确认后写授权文件，并说出怎么带它启动。Octocrawl 和 agent 都不替用户运行它。改 `docs/access.md` 里那句 "never writes the grant for you"。

### R2 托管日志补字段　S

- [ ] **R2.1** `hosted_scrape_phases` 加：`blockReason`、gate 信号名、哪一档给出的结果。
- [ ] **R2.2** `hosted_chrome_read` 加：站点（host）、结果状态、`blockReason`、gate 信号名、等待用了多久、等待结束时是通过还是仍被拦。不加 URL 的路径和查询，不加出口 IP。
- [ ] **R2.3** 测试断言日志字段；和 #586 去掉托管遥测的范围对一下，新字段不能把它去掉的东西加回来（待核）。

### R3 提示、`lane`、时区　S

- [ ] **R3.1** 托管被拦的提示（`hints.ts:55-57`）加上本地 `installed_chrome` 这条路。
- [ ] **R3.2** 去掉升级建议里的 `browser_proxy`（`gate.ts:926`、`:936`），或换成真有的通道。
- [ ] **R3.3** `hosted_chrome` 读成功时：顶层 `lane` 和 `hints.ts:395` 的话都说真 Chrome 那一档。`lane` 的取值是公开契约，改之前查清楚谁在读它（待核）；只增不改做不到的话，交给 Howard 定。
- [ ] **R3.4** `metadata.timezone`（`structured.ts:1824-1828`）：真 Chrome 的读取报它实际运行的时区，不知道就报 null。

### R4 仍被拦页面的诊断信息　S

- [ ] **R4.1** DataDome：不带解题授权也记验证码子类型（`t`）。只记子类型，不记 `cid`、`hsh`、cookie。
- [ ] **R4.2** Cloudflare：记挑战类型（托管挑战、JS 挑战、拦截）和等待结束时的状态。
- [ ] **R4.3** 这些进 trace（`debug` 下可见），不进 compact 结果。
- [ ] **R4.4** 用它重读 idealista（T045）、economist（T068）、studylib（T001）各一次，把看到的子类型写进记录。

### R5 两处更正记录　S

- [ ] **R5.1** 新的带日期记录，更正两处旧说法，旧记录不改：
  - "机房出口解析不了 `challenges.cloudflare.com`"不能解释托管的失败：那个子域名只有 IPv6 记录，Cloudflare 的文档说它解析失败是预期内且不致命的。这是读文档和一次 DoH 查询得出的，没有在托管实例上实测，照此写。
  - "端口 0 启动为什么失败"：Chromium 源码里 `--headless`、`--remote-debugging-pipe` 和端口 0 会让 `navigator.webdriver` 为 true，固定端口不会。
- [ ] **R5.2** 记一笔：10-31 验收记录里的 "$0.0000" 是固定月费计价的结果（`spend.ts:65-75`）。

## Phase 2 · 本地

### L2 同一批次里同一站点复用一个 Chrome 配置目录　M（先量再做）

假设：DataDome 会记住通过检查的访客，批量读同一站点时后面的页可以不再过挑战。没测过。它不是身份轮换：同一个出口、同一个浏览器，只是不丢掉本批次自己拿到的状态；批次结束即删。

- [ ] **L2.1** 先量：同一站点 10 页，全新配置对复用配置，各 2 轮，比较挑战出现的次数和总用时。没有差别就关掉这一项。
- [ ] **L2.2** 有差别再做，和 `egress_sessions` 的 cookie 会话规则对齐（`docs/access.md:155`）。

### L3 impit 和 UA 的版本　S

- [ ] **L3.1** impit 升到有 Chrome 151 指纹的版本；`http` 档的 UA 版本跟上。在 `benefit-hosts.v1.json` 的五个站上各读一次，前后对比，有退步就不升。

### L4 换一台机器或一个出口的本地基线　S

- [ ] **L4.1** `challenge16` 在另一个出口上跑一轮 `installed_chrome`（M1 的 B 组已经是一个；再要一个住宅宽带的话需要 Howard 提供环境）。

### L5 idealista 和 economist　S

- [ ] **L5.1** R4 之后，把这两页写进 `apps/public-web/content/limits.md` 的已知限制，写明看到的子类型和可走的路（用户自己的 Chrome）。
- [ ] **L5.2** `vendor_unlock_html`（ADR 0005 留好的解锁厂商位置）只列出，不开工：没测过，要花钱，等 Howard 开口。

### L6 Chrome 升级后掉页要能被发现　S

2026-11-10 的事：用户的 Chrome 自动升级，结果可能一夜变差，今天只有周跑能发现，而且周跑不比较版本。托管的升级规则是 H5（冻结），本地没有对应项。

- [ ] **L6.1** 周跑（定时任务 `octocrawl-pa-weekly-rerun`）的记录里写上本周和上周的 Chrome 完整版本号；版本变了而且 `challenge16` 比上周少 2 页以上，就在记录开头单独标出，并列出少掉的页。
- [ ] **L6.2** 第一次按 L6.1 跑的那周，核对上周记录里的版本号确实读得到（11-09 的记录写了 156.0.8078.81）。

## Phase 3 · 托管（冻结，只列出）

解冻条件：`research/trials/` 里的试用记录点名，或 Howard 开口。M1、M2 的结果决定先后。

- [ ] **H1** 静态 ISP 出口对照：同一个 `hosted_chrome`，机房对 ISP，各过两次 `challenge16`。要先修订 ADR 0005 的 D2，先读清 Webshare 条款 §1.4。M1 指向出口时排第一。
- [ ] **H2** 时区和语言跟出口一致（今天是 UTC / `C.UTF-8` 对美国出口）。属于环境声明，要 ADR 修订。
- [ ] **H3** GPU：只在 M2 显示软件渲染、而且 M1 指向环境时考虑。
- [ ] **H4** DataDome 设备检查的等待：最后一次查看补到 10 s（符合 ADR 现有上限），或把这一类放到 15 s（要修订决定五）。依据是 6 次样本。
- [ ] **H5** Chrome 升级规则：落后稳定版几个版本就升，升级过两次 `challenge16`（决定八）。
- [ ] **H6** 放开白名单之前：容量（并发 1 × 1 个实例）、忙时 503 不扣次数、`access` 进托管 MCP 的工具参数（工具列表已贴着 50 kB 上限）。
- [ ] **H7** `R1.4` 在 `hosted_chrome` 上生效（D6）。

## 进度

| 日期 | 事项 | 结果 |
| --- | --- | --- |
| 2026-11-10 | 评估完成，清单写好 | 产品代码未动 |
| 2026-11-10 | M1 跑完 | 没有结论：当天基线也读不到三页；本地基线 13 → 7–9，与 Chrome 157 同一天，开 M3 |
| 2026-11-10 | M3.1 跑完 | 没有结论：156 读到 8、9 页，157 读到 7、6 页；2 页跟着 Chrome 版本走，2 页两个版本都读不到 |
| 2026-11-10 | M3.2 跑完 | 是正式版 Chrome 和 Chrome for Testing 的差别，不是 157 这个版本；差别双向（B&H 相反）；基线仍是 6–8 页 |
| 2026-11-10 | 清单补三处 | 加 M4（实验设计）、L6（Chrome 升级掉页）；D3 定为同意，L1 提到 Phase 1 |
| 2026-11-10 | L1.1 做完 | PR #928（待合并）：`octocrawl access-grant` 只在终端里回答本人，不覆盖已有文件，没有东西自动加载它；能挂伪终端的程序仍可替人输入，ADR 0005 修订里写明 |
| 2026-11-10 | R1.1 做完 | PR #930（待合并）：5 份 fixture（1 份真实抓取清理后，1 份取自 10-30 的记录，1020、1015、负载均衡器 403 三份照厂商公开页面写成，没对过线上页面）；今天的报法 6 条测试，应有的报法 5 条 `it.fails`，暂用名 `access_denied`（D5 未定）；1015 今天已报 `rate_limit` |
| 2026-11-10 | R1.2 做完 | PR #936（待合并）：D5 定名 `access_denied`；Cloudflare 拦截页、403 上的 1020、CloudFront 的 “Request blocked.”、`awselb` 的 403 报它，1015 仍报 `rate_limit`；等待、下一档、hints 都照旧（R1.3、R1.4 再改）；除名字外有一处行为变化：带打码服务的授权下，拦截页不再当作 Cloudflare 验证送去打码；SDK 没有 blockReason 列表，不用改；ADR 0005 没动，留给 R1.4；1020、1015、负载均衡器三份 fixture 仍没对过线上页面 |
| 2026-11-10 | R1.3 做完 | PR #939（待合并，叠在 #936 上）：`access_denied` 的页面有自己的提示（站点拒绝的是这个出口，等待和重试没有用；本地说换网络或在自己的 Chrome 里读，托管说在自己的机器上跑），批量结束时单独一行；在用户自己的 Chrome 里也被拒的页面不再让人回 Chrome；推荐 `installed_chrome` 的那行不再跟在它后面（这一档读拦截页的结果没测过）；没验证：交接后在 Chrome 里被拒的页面，步骤上的 lane 是不是 `my_browser`；my-browser 批量遇到拦截页会等满 10 分钟，属于 R1.4 |
| 2026-11-10 | R1.4 做完 | PR #940（待合并，叠在 #939 上）：D6 定为不等、直接报；`installed_chrome` 对 `access_denied` 的页面只读一次就报，trace 的 `challenge_wait` 记 `not_waited`、`capMs: 0`；`hosted_chrome` 单列一份上限，仍等 10 秒（H7）；ADR 0005 加了 2026-11-10 修订；没改：这一级之后试哪一档、`my-browser` 等人的 10 分钟；没验证：真实站点（R1.5） |
| 2026-11-10 | 合并，R1.5 跑完 | #937、#930、#928、#924、#936、#939、#940 都已合入 main（没部署、没发版）。R1.5 在 `f3f01baf` 上本地跑三组（本机出口；真实 Chrome 走机房代理；`http` 和 `browser_local` 也走机房代理），每格 1 次：crunchbase 三组都是 403、`access_denied`，`challenge_wait` 记 `not_waited`，提示是 R1.3 的新文字，旧值是 `cloudflare_challenge` 加 9 秒等待；lead411 三组都由 `http` 直接读到（200，核对通过），没遇到拦截页，新的 `blockReason` 没观察到 |

## 下次从这里继续

L1.1 和 R1.1–R1.5 都已做完，PR 都已合入 main，没部署。R1.5 留一处没确认：lead411 的拦截页只在托管端的 Google 出口上出现过，要等托管端部署了含 #936 的版本后补读一次（部署要 Howard 开口）。测量这边：M3.4（只读探测，查本机 Chrome 和同版本 Chrome for Testing 差在哪）；M3.3 和 M4.2 要分散在 3 天以上，每天跑一次基线组和代理组。
