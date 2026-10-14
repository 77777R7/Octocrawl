# ADR 0005：增强访问的能力分级

- 状态：已接受
- 日期：2026-10-05
- 部分取代：[0004](0004-anti-bot-as-coverage-ladder.md)「自研 / 适配器 / 永不做」一节的"永不做"清单，以及「论文把什么判死了」表中"自研 CAPTCHA / CDP patch / 浏览器 fork"一行的结论；0004 的其余内容不变
- 前置：ROADMAP.md「PA · Enhanced access」、`research/stealth_layer_preliminary.md`

## 背景

2026-10-05，Howard 决定把暂停的 stealth、指纹、CAPTCHA、代理池工作作为产品级"增强访问"重启，写进 ROADMAP 的 PA 阶段。在这之前，ADR 0004 和代码里的 `REFUSED_CAPABILITIES` 把 `captcha_solving`、`cdp_patching`、`fingerprint_spoofing` 列为永不做，策略层没有开关；Browserbase 和 Steel 的适配器把对应字段写死为关。PA 开工前必须先消除"路线图允许、代码永久关闭"的矛盾。

`research/stealth_layer_preliminary.md`（2026-08）对 stealth 层的 no-go 结论被这次决定取代。它记录的事实仍然成立：stealth 补丁可能增加可检测性。这正是 PA 只用真实任务、不用检测测试页衡量效果的原因。

## 决定

每个增强访问能力属于下面三类之一。代码在 `packages/http-core/src/vendor.ts`，对应三个常量：`REFUSED_FOREVER`、`DEFERRED`、`AUTHORIZABLE`。

### 1. 永不做（`REFUSED_FOREVER`）

原则底线。任何 grant、任何配置都开不了，没有重启条件。

| 能力名 | 内容 |
| --- | --- |
| `identity_rotation` | 换身份熬过封禁，包括遇到 429 就换 IP 继续 |
| `patch_user_chrome` | 修改、补丁或注入用户自己的 Chrome |
| `in_session_route_switch` | 在已建立的交互会话里透明切换执行器或出口 |
| `secrets_in_records` | 把代理凭据、cookie、求解 token、`cdpEndpoint` 写进记录或日志 |

运行时：grant 里出现这些名字，判定为 `refused`；厂商声明 `identity_rotation`，provider gate 返回 `refused_capability`。

### 2. 暂缓（`DEFERRED`）

工程成本问题，不是原则问题。重启条件照搬 ROADMAP 暂缓表。行号会随 ROADMAP 前面章节的增删而移动，这里与代码里的 `source` 一起更新（最近一次：2026-10-06 PH 节加入后）；以行标题为准。

| 能力名 | 出处 | 暂缓表的行 | 重启条件 |
| --- | --- | --- | --- |
| `own_browser_engine` | ROADMAP.md:263 | An own browser fork or engine, and broad custom-fingerprint research | A maintained project stops working for a class of tasks that PA's set shows matters |
| `own_fingerprint_patches` | ROADMAP.md:263 | 同上 | 同上 |
| `own_captcha_model` | ROADMAP.md:264 | An in-house CAPTCHA model | Only if solver cost or coverage blocks paying users |
| `own_residential_network` | ROADMAP.md:265 | An own residential IP network | Not restarted; PA uses providers |
| `camoufox` | ROADMAP.md:266 | A second stealth engine (Camoufox) | Patchright leaves a clear class of PA tasks unsolved |
| `hosted_browser_cluster` | ROADMAP.md:267 | A hosted browser cluster beyond Cloud Run's instance cap | PH's phase 2 shows browser-lane demand that the instance cap cannot serve, and a key holder will pay for it |

托管的 API 和远程 MCP 本身于 2026-10-06 作为 ROADMAP 的 PH 阶段重启（有界的 Cloud Run 服务）；第 267 行只管超出该实例上限的托管浏览器集群。

运行时：拒绝原因写 `deferred`，带出处和重启条件，不写 `refused`。表格测试逐字核对每一项的行标题和重启条件与 ROADMAP 暂缓表一致；行号不做测试，因为其他人编辑 ROADMAP 前面的章节时不应因此让测试失败。

Patchright 与 `own_fingerprint_patches` 的区别：Patchright 是维护中的第三方项目（Apache-2.0），ROADMAP 第 242 行写明 PA 用维护中的项目代替自研，所以它属于第 3 类 `enhanced_browser`。Octocrawl 自己写的指纹或 CDP 补丁属于第 2 类。

### 3. 需 grant（`AUTHORIZABLE`）

默认关。grant 列出时可用，并且每次使用都进记录。

| 能力名 | 最低档位 | 第三方费用 | 内容 |
| --- | --- | --- | --- |
| `compatible_transport` | standard | 否 | 浏览器兼容的 HTTP 传输（impit） |
| `egress_sessions` | standard | 否 | 用户自己的代理组成的会话：出口、cookie、profile 绑定，有界切换 |
| `enhanced_browser` | enhanced | 否 | Patchright，只用于 Octocrawl 自有的浏览器实例和 profile |
| `installed_chrome` | enhanced | 否 | 本机已安装的 Google Chrome，按测量过的方式启动（调试端口不对网页开放），每个任务一个新的临时 profile；只在本地运行、有窗口（见修订 2026-10-13）。测量时用原生 CDP 驱动；实现用 Playwright 通过 CDP 接管同样启动的 Chrome（见实现 2026-10-14） |
| `vendor_remote_browser` | enhanced | 是 | 远程浏览器厂商（Browserbase、Steel） |
| `vendor_unlock_html` | enhanced | 是 | 只返回 HTML 的解锁类厂商 |
| `vendor_captcha_solving` | enhanced | 是 | 厂商内置的验证码求解 |
| `vendor_stealth` | enhanced | 是 | 厂商侧的指纹与自动化隐藏（Browserbase Verified、Steel 指纹注入），记录为厂商自报、Octocrawl 无法观察 |
| `third_party_captcha_solver` | enhanced | 是 | 独立求解器适配器。条件启动：冻结任务集显示 CAPTCHA 仍是主要残余原因时才做 |

grant 的规则（`packages/http-core/src/accessGrant.ts` 的 `normalizeAccessGrant`）：

- 档位 `standard` 和 `my_browser` 只能列最低档位为 standard 的能力；`enhanced` 可以列全部。
- 有第三方费用的能力必须带正数的 `perRunUsd`。
- 最低档位为 enhanced 的能力必须带 attestation：谁、何时、接受了什么。
- 永不做、暂缓和未知的名字都是 grant 的错误，逐条报告，不静默丢弃。

厂商能力到 grant 的映射（`VENDOR_CAPABILITY_ACCESS`）：`captcha_solving` 对应 `vendor_captcha_solving`；`fingerprint_spoofing` 和 `cdp_patching` 对应 `vendor_stealth`；`identity_rotation` 属于永不做。映射归策略层所有，适配器声明的 `enableKey` 不起作用。provider gate 对 grant 没有覆盖的映射能力返回 `ungranted_capability`。

原有四个运营键（`session_persistence`、`live_view_handoff`、`residential_proxy`、`retry_orchestration`）不变，仍然默认关。

## 本 ADR 合入时的边界

- grant 的运行时来源还没有接线。API 引擎不向厂商适配器传任何 grant，ladder CLI 只传两个运营键。所以默认行为不变：不求解验证码，不开厂商 stealth。README、`REFUSAL_HINTS.stealth` 和网关提示的文案因此仍然准确，等服务端能读到 grant 时同一轮更新。
- `vendor_remote_browser` 今天由运营者配置决定（`W2L_VENDORS`、密钥、research 或 authed 模式），接线后改由 grant 决定。
- Browserbase 和 Steel：没有 grant 时，请求体与 `a48c9c4` 上逐字相同（Browserbase 为 `solveCaptchas: false`、`advancedStealth: false`），由 `packages/bench/test/vendors.test.ts` 固定。有 `vendor_stealth` 时 Browserbase 发送 `verified: true`，因为官方文档在 2026-10-05 已把 `advancedStealth` 标为弃用。两家都没有用真实 API key 跑过：2026-08-22 的通道对比里它们是 SKIPPED（无 key，见 `docs/vendor-escalation.md`）。

## 后果

- ADR 0004 的阶梯、身份自洽、"换 IP ≠ 换身份"、挑战页不算成功，全部保留。
- 对外可以说：默认不求解、不伪装；有明确授权和预算时可以，并且记录在案。不可以说的仍按 0004。
- 每次使用需 grant 的能力都要写进记录（Evidence Record 的 `access` 块，在后续工作组加入）。

## 修订 2026-10-11：厂商住宅代理进入 grant（ROADMAP PA item 4）

- 第 3 类新增 `vendor_residential_proxy`（最低档位 enhanced，有第三方费用）：厂商自己的住宅代理池（Steel 的 `useProxy`，按 GB 计费）。`VENDOR_CAPABILITY_ACCESS` 把厂商能力 `residential_proxy` 映射到它；运营键里的 `residential_proxy` 随之去掉，只剩 `session_persistence`、`live_view_handoff`、`retry_orchestration` 三个。写旧键不再开启任何东西，决定里记为 `unknown`。
- 价目表（`VendorTariff`）加 `perGbUsd` 与 `maxBytesPerCall`、`perSolveUsd` 与 `maxSolvesPerCall`，有单价必须有上限，取代此前对按 GB 计价的一律拒绝；grant 列了 `vendor_residential_proxy` 或 `vendor_captcha_solving` 时，它命名的每个价目表都必须写明对应单价（套餐已含则写 0），否则 grant 被拒绝。字节上限由本方在页面上按 CDP 计数执行，结算按厂商释放后报告的数字（Steel 的 `proxyBytesUsed`，代理侧双向计量）；超出上限按实收并在记录里标 `overCeiling`。求解次数厂商侧封不住，同样按报告数结算、超出标记。
- Steel 的请求体从此始终显式写 `useProxy`：有 grant 时 `{ geolocation: { country } }`，否则 `false`。「本 ADR 合入时的边界」里"没有 grant 时请求体与 `a48c9c4` 逐字相同"一句自此不再成立，差别只有这一个字段；Browserbase 不变。
- 每次付费调用的记录（`access.paidCalls[]`）加 `proxyBytes`、`solves`、`proxyCountry`。

## 修订 2026-10-13：本机 Chrome 经原生 CDP 进入 grant（ROADMAP PA item 5）

**背景。** 2026-10-12，PA 的 16 道挑战页题（8 道 Cloudflare、7 道 DataDome，另有 2 道没有厂商头）在本 ADR 允许的全部手段内都没有通过：undici、impit、Playwright、Patchright、Steel 的浏览器、住宅出口、Steel 的求解。Browserbase `verified` 只有企业版有。2026-10-13 的三份库级探测都只用于测量，不是产品运行：

- [Camoufox 与 nodriver](../../research/access/runs/2026-10-13-library-probe-stealth-16-8c91ac43.md)
- [Node 原生 CDP](../../research/access/runs/2026-10-13-library-probe-cdp-16-b8d4efaa.md)
- [重跑](../../research/access/runs/2026-10-13-library-probe-cdp-repeat-44e9498e.md)

它们发现，用 Node 启动本机已安装的 Chrome，按 nodriver 0.50.6 的参数（`--remote-debugging-host=127.0.0.1` 加固定端口，以及它的默认参数），通过原生 CDP（`Page.navigate`、`Runtime.evaluate`，不发 `Runtime.enable`、不用 Network 域，不经 Playwright）驱动，在产品自己的机房出口上：

- 有窗口时，两次分别有 13 道和 11 道通过数据检查，两次都过的有 11 道；
- 无头时只过 1 道；
- 同样有窗口的原版 Playwright 只过 1 道；
- 用 `--remote-debugging-port=0` 启动时，Cloudflare 在 9 次变体里都没放行，即使全程没有 CDP 连接；原因没有查清。

**分类。** 这条路线不改指纹，也不打 CDP 补丁：浏览器是原版 Chrome，参数是公开的启动参数，区别只在驱动方式。所以它不属于第 2 类的 `own_fingerprint_patches` 或 `own_browser_engine`，也不是 `camoufox`。它和 Patchright 一样进入第 3 类，能力名 `installed_chrome`，最低档位 enhanced，没有第三方费用，必须带 attestation。

**使用条件。** 实现时必须满足：

- **只在本地运行。** 托管服务拒绝它，和 `enhanced_browser` 一样。托管场景需要虚拟显示（Xvfb），未经测量之前不开放。
  - **2026-10-14 在 Cloud Run 上用 Xvfb 测了一次：** 16 道只过 2 道（[记录](../../research/access/runs/2026-10-14-installed-chrome-cloudrun-xvfb-ee53419e.md)）。
    - Chrome 每道题都正常启动并读到了页面：Xvfb 下有头运行，非 root 用户下沙箱照开。所以显示不是障碍。
    - 失败几乎全是站点对 Cloud Run 出口地址（Google Cloud）的 403 拦截，连本地两个出口都能过的 T053 也被拒。
    - 同一个 Job 改走 Webshare 住宅出口后过了 7 道，本地走同一出口是 10 道和 8 道。所以 Xvfb 不是主要障碍，出口才是。
    - 托管能不能开放，取决于住宅出口的流量费用、它的使用条款，以及每页约 40 秒的耗时。这需要另行决定，在那之前仍只在本地运行。
- **有窗口。** 它会在使用者的机器上打开 Chrome 窗口，grant 的 attestation 要写明这一点。无头模式不作为这条路线提供，因为测量显示无效。
- **每个任务一个新的临时 profile，放在系统临时目录下，用完删除。** 永远不用使用者自己的 Chrome profile。读取使用者自己的 Chrome 是 `my-browser` 通道；修改它属于第 1 类 `patch_user_chrome`，仍然永不做。
- **调试端口只对驱动开放，不对网页开放。**
  - 不带 `--remote-allow-origins`。nodriver 默认带 `--remote-allow-origins=*`，在这种情况下，被访问的网页只要知道调试 WebSocket 的地址，就能打开它并控制浏览器，比如读取 `file://`。临时 profile 挡不住这一点。2026-10-14 实测：带 `*` 时，页面里的脚本拿到地址后能连上；不带时 Chrome 拒绝页面的连接；Node 自带的 WebSocket 不发 Origin 头，驱动自己的连接照常可用（[记录](../../research/access/runs/2026-10-14-library-probe-cdp-safe-launch.md)）。
  - 调试端口每次启动由驱动向操作系统要一个空闲端口，连同 `--remote-debugging-host=127.0.0.1` 显式传给 Chrome。端口不写死，并避开本机已经占用的端口（例如 8791）。不用 `--remote-debugging-port=0`，即不让 Chrome 自己选端口：2026-10-13 在这种方式下 Cloudflare 一直没放行，原因没有查清；由驱动挑好端口显式传入则能通过。
  - 收窄后的启动在 16 道题上跑了两次，分别通过 12 道和 13 道，测量时的启动方式是 13 道和 11 道，通过率没有下降。驱动只连 `127.0.0.1`。
- **启动参数分两类。**
  - 出口和代理参数（`--proxy-server`、`--proxy-bypass-list`），以及 Octocrawl 自己的运行参数（profile 目录、调试端口），属于正常使用，可以随任务和出口变化，不需要重新测量。
  - 会影响指纹或检测的参数，包括语言、时区、窗口、功能开关（例如 `--lang`、`--disable-features`），只能用测量过的那一组，不加入自研的指纹或补丁。改这一类参数之前，要先在 16 道题上至少跑两次，并且结果不低于当前基线。
- **定期重测。** 用的是本机会自动升级的 Chrome，版本不受 Octocrawl 控制，效果可能在某次升级后变差。所以每次使用都记录 Chrome 版本，并且每周在 16 道题上重跑一次，Chrome 大版本变化时也重跑，就像 install-check 那样。结果低于验收基线时写进记录，并停止默认推荐这条路线，直到重新测量过。
- **一次最多开 2 个窗口。** 每个任务会在使用者屏幕上打开一个窗口，所以 batch 和 crawl 在这条路线上的并发上限是 2。
- **没装 Chrome 时说清楚。** 找不到 Google Chrome 时，结果要明确说缺的是什么、去哪里装，就像 `browser_not_installed`（#479）那样，不能报一个看不懂的错误。
- **与其他浏览器 rung 走同一套规则：** URL 检查、robots.txt、限速、预算、Evidence Record。记录里写明路线、Chrome 版本、有窗口，以及启动方式（检测类参数那一组的标识）。
- **不做请求拦截。** 一份 DataDome 报告把拦截列为检测信号，所以先不做。

**本修订合入时的边界（2026-10-13，已由下面的实现取代）。** 只有能力名和规则进入代码（`AUTHORIZABLE` 加 `installed_chrome`）：grant 可以列它，但还没有任何 rung 使用它，列了也不会改变行为。路线的实现、它在 Evidence Record `access` 块里的路线名、每周重测，以及验收（产品在 16 道题上至少跑两次，并且健康组和真实站点批次不退步）属于后续工作。实现时用上面收窄后的启动方式，不用测量时带 `--remote-allow-origins=*` 的那一组。`camoufox` 仍然暂缓：它在同样 16 道题上只过 7 道，这条路线更好，也更便宜。

**实现 2026-10-14。** `installed_chrome` 有了自己的 rung，排在 `browser_local` 之后、provider 之前。

- **什么时候有这个 rung。** 三个条件同时满足才建：grant 列了 `installed_chrome`；请求选了 `access: "enhanced"`；模式是 standard。服务是托管的、grant 里又列了它时，引擎启动就报错。
- **驱动方式。** 先按上面收窄后的方式启动 Chrome，再由 Playwright 用 `connectOverCDP` 接管，在 Chrome 自己打开的窗口和默认上下文里读页面。这样 robots.txt、限速、预算和 Evidence Record 都沿用浏览器通道的，不再另写一个 CDP 驱动。
  - 同样启动、由 Playwright 接管时，16 道题两次各过 12 道；原生 CDP 是 12 和 13（[记录](../../research/access/runs/2026-10-14-library-probe-pwcdp.md)）。
  - 两次都不同的只有 T048，验收时再看。
- **不做的事。** 不设 User-Agent、语言、时区、窗口大小，也不注入客户端提示。记录声明的是 Chrome 自己报的 User-Agent（`identity: actual`）。
- **不接的请求。** 带 actions、截图、`mobile`、自定义请求头或 `skipTlsVerification` 的请求，这个 rung 不接，因为它们都要在测量之外驱动或改动窗口。
- **等挑战页自己放行（2026-10-14 补）。** 测量时探针遇到挑战页会每秒重读一次，最多等 20 秒；产品 rung 起初没有这一步，看到 Cloudflare 挑战页就立刻返回 blocked（T002 冒烟测试）。现在 rung 遇到 `cloudflare_challenge`、`bot_detected_generic` 或 `captcha` 时，也每秒重读一次页面，最多 20 秒，且不占用截止时间前的抓取余量。只读不动：不点击、不输入、不解题。页面换成不是挑战的文档就照常读取；到时仍是挑战就照常报 blocked。trace 里记 `challenge_wait`，写明结果和等了多久。
- **每次抓取的生命周期。** 每次抓取启动一个 Chrome，抓完关掉，同时删除临时 profile。整个进程最多同时开 2 个窗口。
- **代理。** 需要登录的代理会被拒绝，并说明原因：Chrome 的命令行不能带代理凭据，而代答代理认证的质询要拦截请求。
- **找不到 Chrome 时。** 结果带 `browser_not_installed` 警告，提示安装 Google Chrome 或设置 `W2L_CHROME_PATH`。
- **记录里写什么。** Evidence Record 的 `access.route` 是 `installed_chrome`，`executor` 是 `chrome`，`executorVersion` 是 Chrome 的版本，`profile` 是检测类参数那一组的标识（`nodriver-0.50.6-no-allow-origins`）。
- **验收（2026-10-14）。** 最终提交在 16 道题上跑了两次，分别过 11 道和 7 道；前一个提交两次是 11 道和 9 道；探针用 Playwright 接管时两次都是 12 道（[记录](../../research/access/runs/2026-10-14-installed-chrome-acceptance-7b56397b.md)）。
  - 7 道那次少过的 4 道，Chrome 都等满了 19 秒，页面仍是站点发出的真实 403 挑战。所以那次是站点没有放行，不是误判。它是同一出口在约 1.5 小时内的第六轮 16 题，是否因为出口信誉下降没有查证。
  - 能达到这个数，是因为验收中补了三处：
    1. 等挑战页自己放行。
    2. 门检测不再把 DataDome 的 `x-datadome: protected` 响应头和 Cloudflare 的 `precursor` 脚本当成被拦：放行后的正常页面上也带这两样。
    3. 等待只认明确的挑战证据，这一处是审查时补上的。
  - 刚合入时只过 2 道。
  - 回归对比：在同一台机器、同一个出口上，全部 92 道题 main 过 43 道、修复后过 42 道；真实站点 L 批次两边都是 12/12。差异逐题查过：多出的 1 道是 DataDome 修复的效果，少的 2 道是站点当时真的发了 Cloudflare 挑战。
  - 仍落后探针的是两道 DataDome 题（T038、T046）。
- **仍是后续工作。**
  - 每周重测。
  - 浏览器通道自带的一些步骤在测量里没有，验收时一起看。其中一项是用 `Network.setBlockedURLs` 屏蔽广告域名。

