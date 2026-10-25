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
  - **换 Webshare 住宅出口（2026-10-14）：** 两次分别过 10 道和 8 道，Clash 机房出口是 11 道和 7 道（[记录](../../research/access/runs/2026-10-14-installed-chrome-exits-3dd497ef.md)）。
    - 两个出口输在不同的检测上：DataDome 放行住宅出口、拦机房出口，T038 和 T046 在 Webshare 上两次都过了；Cloudflare 正相反，T047、T048、B001 在 Webshare 上两次都被拦。
    - 两个出口合起来，16 道里有 14 道至少过过一次。
    - 按检测类型选出口还没做，这几次也没有测它。
- **仍是后续工作。**
  - 每周重测。
  - 浏览器通道自带的一些步骤在测量里没有，验收时一起看。其中一项是用 `Network.setBlockedURLs` 屏蔽广告域名。

## 修订 2026-10-23：本机运行时默认推荐 installed_chrome（ROADMAP PA item 5）

**背景。** K1 在 2026-10-21 和 2026-10-22 两个窗口里，用同样的 92 道题和同样的条件，比较了 Octocrawl 的 standard、enhanced（Steel 数据中心）、installed_chrome 三臂和 Firecrawl、ZenRows，主指标是首次调用（[两窗口记录](../../research/access/runs/2026-10-22-k1-two-windows-b233d232.md)）。两个窗口都成立的大收益只有 installed_chrome 这一条。2026-10-22，Howard 按 K4 的默认定了：installed_chrome 进本机的默认推荐（`docs/pa-enhancement-tasks.md`"待你决定"第 14 条）。上面"使用条件"里的"定期重测"写了低于验收基线时停止默认推荐，但没有说推荐本身是什么。本修订补上。

**"默认推荐"是什么。** Octocrawl 在本机运行时，把 installed_chrome 说成首选的增强路线。它只是推荐，不是默认开启：

- 能力仍属第 3 类，默认关。要用它，服务的 grant 要列 `installed_chrome`（档位 enhanced，带 attestation），请求要选 `access: "enhanced"`，模式是 standard。
- Octocrawl 不替使用者写 grant，也不因为推荐而改任何默认能力。
- 托管服务照样拒绝它。一次最多开 2 个窗口。
- 阶梯顺序不变：它仍排在 `browser_local` 之后、provider 之前。

**在哪里推荐。** 只在下面三处。停止推荐时撤的也就是这些：

1. `docs/access.md`：增强访问一节里的"The recommended route on your own machine"，以及指向它的两句（页首列表里的 Enhanced access 一条，`installed_chrome` 条目里的 Status）。
2. `docs/local-setup.md` 的"Pages that stop at a check"。
3. 本地服务回答里的 agentHints（`packages/api/src/hints.ts` 的 `INSTALLED_CHROME_RECOMMENDED_HINT`），连同 `docs/scrape-options.md` agentHints 表里它那一行。它紧跟在挑战页那条提示后面，指向这条路线，并说怎样授权：使用者自己写 grant（档位 enhanced，列 `installed_chrome`，带自己的 attestation），用它启动服务，请求再选 `access: "enhanced"`。scrape、batch 和 crawl 的页面都带它。条件同时满足才出现：
   - 服务在使用者自己的机器上，和提供 handoff 的服务是同一类。托管服务永远不是，所以托管回答不带这条提示。
   - 服务的 grant 没有列 `installed_chrome`，浏览器也没有限定在一组 host 上（那时这一级根本不建）。
   - 页面停在挑战页或机器人检查：`blocked`，blockReason 是 `cloudflare_challenge`、`captcha` 或 `bot_detected_generic`，也就是这一级会等的那三种。
   - 自带的浏览器（`browser_local`）已经试过，同样停在检查上；这一级排在它后面。这一页的运行没有试过 installed_chrome，比如服务换掉 grant 之前存下的结果。
   - 这一级会接这个请求：模式是 standard，服务的通道策略把这个 URL 交给阶梯，请求不带 actions、截图、`mobile`、自定义请求头或 `skipTlsVerification`。拒收的选项和这一级用的是同一个函数（`installedChromeRefusal`）。

**引用的数字。** 都出自 K1 的两窗口记录：首次调用，92 道题，走 Clash 出口。

- 相对 standard：两个窗口都成立的增 15、退 0，不稳 11。首次调用的账本费用两个窗口都是 $0，因为这条路线不付钱给第三方。Clash 的带宽和本机算力没有测量，记为 unknown exposure。
- 首次调用通过 60 道和 68 道（共 92 道）。Firecrawl 是 69 和 70，差距 9 和 2。这两个数是整条阶梯的：由 installed_chrome 这一级交付的是 16 道和 20 道，其余由 http 和自带浏览器交付（[窗口 1](../../research/access/runs/2026-10-21-k1-w1-322de68e-installed_chrome.md)、[窗口 2](../../research/access/runs/2026-10-22-k1-w2-b233d232-installed_chrome.md) 的臂记录里，首次调用四块的 "Verified answers by the route that delivered them" 之和）。
- 假成功 2 道和 1 道，两个窗口合计 3/184（95% 上限 4.2%）。Firecrawl 是 24/184（17.9%）。
- 对照：本机另一条增强路线 enhanced（Steel）增 3、退 1，不稳 14，大收益没有在两个窗口里都成立。

**推荐时要一并说明的限制。**

- 只在一台 Mac、一个机房出口（Clash，103.142.140.0/24）上测过。在使用者自己的网络上效果如何，unknown。住宅出口在 K3 的 Cloudflare 组里反而更差：Webshare 5/32，Clash 24/32（[记录](../../research/access/runs/2026-10-21-k3-egress-by-detection-5beacbf3.md)）。
- 它会在使用者的屏幕上打开 Chrome 窗口。K1 的 92 道首次调用里，走到这一级的窗口 1 有 38 道，窗口 2 有 35 道（同上两份臂记录，首次调用四块 "Rungs started" 里 installed_chrome 的数之和）。同时最多 2 个窗口。p95（全部尝试）是 26162 ms 和 25275 ms，standard 是 13887 ms 和 15918 ms，长 9–12 s。
- 要本机装有 Google Chrome。Chrome 会自动升级，效果可能在某次升级后变差。
- 托管服务和远程 MCP 的使用者用不上它。
- 没测过：installed_chrome 和付费供应商写在同一份 grant 里。K1 的两臂各用各的 grant。

**停止条件。** 就是"使用条件"里的"定期重测"。

- 每周重跑已于 2026-10-20 建成（`research/access/weekly.mjs`），每次在 16 道题上跑 installed_chrome；Chrome 大版本变化时，这 16 道再跑一次。
- 验收基线是 2026-10-14 验收里较低的那一次：16 道过 7 道（`research/access/weeklyPlan.mjs` 的 `IC16_BASELINE.floor`）。2026-10-20 和 2026-10-21 两次每周重跑都是 10/16。
- 结果低于 7 时，那周的记录写 "stop the default recommendation, retest pending"。Octocrawl 随后用一个 PR 撤下上面三处的推荐，直到重新测量、结果不低于基线，再用一个 PR 恢复。CHANGELOG 里已有的条目是记录，不改；撤下和恢复各写一条新的。
- 能力本身、grant 的规则和阶梯都不因此改变，已经授权的使用者照常能用。


## 修订 2026-10-25：第三方验证码求解器（ROADMAP PA item 6）

**背景。** K1 之后，本机 Chrome 与 Steel 合用一份 grant 时，92 道首次调用通过 71 道，Firecrawl 是 67 道（窗口 1，2026-10-25）。剩下的访问失败主要是验证码和机器人检查页：DataDome（T034、T038、T045、T046）、PerimeterX（T018、T065）、Kasada（T042）。厂商内置的求解在 2026-10-11 的 arm B 里一道也没有解出（见上文 item 4 的记录），Steel 能识别 DataDome，但不会自动解它。

**决定（Howard，2026-10-25）。**

- 验证码和 DataDome 求解是 PA 当前的第一优先。item 6 的条件启动就此满足，`third_party_captcha_solver` 开始实现。
- 求解器厂商用 CapSolver（基于 AI，2026-10-25 比较时是最便宜的一家）。
- DataDome 的求解走 Octocrawl 的 Webshare 出口，代理凭据发给 CapSolver。DataDome 的 cookie 只在发出它的出口和 User-Agent 上有效，所以浏览器和求解器必须用同一个粘性出口、同一个 User-Agent。这一点 Howard 已接受。
- 这一轮开发和测量的预算是 $20。
- 先做本地。托管以后单独做，放在一个默认关闭的开关后面；本修订不建任何托管部分。

**出口在请求之前选定。** 第 1 类的 `in_session_route_switch` 不变，被拦之后不换出口。所以 DataDome 的求解只能用会话已经在用的出口，这个出口必须在请求之前选定，不能在被拦之后再选。做法如下：

- grant 写明求解器和它的出口：`"solver": { "vendor": "capsolver", "egress": "proxy" | "none" }`。
- `egress: "proxy"` 的意思是：这个服务（`octocrawl serve`，或一次性的 `octocrawl` 命令）的每个 rung，在每个请求的第一个请求之前，就经本机 `127.0.0.1` 上的一个转发器走操作者的粘性出口（`W2L_SOLVER_PROXY`）。
  - 转发器负责补上代理登录，因为 `installed_chrome` 的命令行不能带代理凭据。
  - 记录里出口的 `source` 是 `pool`，`proxy` 是转发器的 `127.0.0.1:端口`，从不写上游的登录。
  - 和 `W2L_EGRESS_PROXIES` 同时设置时，启动即报错：两种方式都在选这次运行的出口，只能留一种。
- 只有页面确实经这个转发器读取时，DataDome 和 Cloudflare 挑战才会求解。页面的出口由 rung 的出口策略判断（`proxyFor`），它必须等于转发器。否则记 `egress_mismatch`，不求解、不扣费，也不发任何东西给求解器。
- `egress: "none"`：运行的出口不变，只求解不绑定出口的类型（Turnstile、reCAPTCHA v2）。
- 按检测类型选出口仍然不做（item 3，2026-10-22 的决定）。这里的出口是整个运行的选择，由操作者写进 grant，不按页面或站点切换。
- K3 测过：Cloudflare 组走 Webshare 出口比走 Clash 差（5/32 对 24/32）。所以对以 Cloudflare 为主的任务集，选 `proxy` 有代价，这一点在 grant 里由操作者决定。

**grant 的规则（`normalizeAccessGrant`）。**

- 列了 `third_party_captcha_solver` 的 grant 必须有 `solver`。
- `tariffs[solver.vendor]` 必须写正数的 `perSolveUsd` 和 `maxSolvesPerCall`。
- 和其他有第三方费用的能力一样，必须有 `perRunUsd` 和 attestation。
- 没列这个能力却写了 `solver`，判为错误。
- 托管服务读到这个能力时，启动即拒绝。

**求解在哪里发生。**

- 只在本地的公共浏览器 rung 上：`browser_local` 和 `installed_chrome`，模式 standard，请求选了 `access: "enhanced"`。
- 带登录的 rung（`browser_local_authed`）和托管预览都不接。
- 在 `installed_chrome` 上，先按上文"等挑战页自己放行"等待。那一步仍然只读不动，不解题；求解是它之后单独的一步，只在 grant 允许时发生。
- 只求解 rung 本来会以"被检查拦住"返回 blocked 的页面，判定和 rung 自己的捕获用同一套规则：
  - 错误状态上的检查；
  - 决定性的检查；
  - 自身没有内容的页面上的小组件。
  一个为表单加载 reCAPTCHA 的正常文章页不求解。
- 支持的类型（CapSolver 文档，2026-10-25 读取）：
  - DataDome：`DatadomeSliderTask`。只接受 `t=fe` 的 captcha URL；`t=bv` 表示出口已被封，不买求解。
  - Cloudflare 挑战：`AntiCloudflareTask`。
  - Turnstile：`AntiTurnstileTaskProxyLess`。
  - reCAPTCHA v2：`ReCaptchaV2TaskProxyLess`。
  - PerimeterX、Kasada、hCaptcha、GeeTest 记为 `unsupported`，不求解。
  - 放在以 GET 提交的表单里的 Turnstile 或 reCAPTCHA 不求解（`form_sent_by_get`）：token 会进页面地址，而记录会保存这个地址。既没有回调、也不在表单里的小组件也不求解（`no_submit_target`）。

**发给求解器的，只有这些：**

- 页面 URL；
- 挑战自己的 URL（DataDome 的 captcha URL）或站点密钥（Turnstile、reCAPTCHA），以及小组件的 `data-action`、`data-cdata`；
- 浏览器的 User-Agent（`installed_chrome` 是 Chrome 自己报的那个，不另设）；
- 只对绑定出口的类型（DataDome、Cloudflare 挑战），加上运行的出口及其登录。

**从不发给求解器的：**

- 页面内容；
- 挑战之外的 cookie；
- 登录状态；
- Octocrawl 的记录。

**答案怎样用。**

- cookie 写进同一个浏览器上下文，然后重新加载页面。
- token 写进小组件的回填字段，再调用小组件的回调或提交它所在的表单。
- 之后页面按任何页面的规则重新判定：
  - 仍被拦，结果就是 blocked，这次求解照样计费，trace 记 `still_gated`。
  - 不再被拦，页面照常读取，ladder 再用任务契约验证。放行了检查但没有通过契约的页面，不算完成任务。

**上限和计费。**

- 每次求解在创建任务之前，先按价目表的 `perSolveUsd` 从运行（或该页）的 spend ledger 预留。
- 放不下时，或没有 ledger 时，不求解，记 `limit_reached`。
- 每次抓取最多 `maxSolvesPerCall` 次求解。这个次数按页面计，由 ladder 在该页的所有 rung 和重试之间共享，不是每个 rung 各算一次。
- 任务创建了才结算。只有 CapSolver 明确拒绝（`errorId` 非 0）才算没有创建；请求已发出但回答丢失或无法解析时，按可能已创建计费。CapSolver 的回答里不报单价，所以按价目表收费，记录写 `costBasis: "tariff"`。
- 每次结算后立刻记入运行的 paid calls（页面结果未知时 `outcome` 为 null），所以 rung 在求解之后抛错，这次求解也不会从记录里消失。
- 页面的第三方成本 `externalCostUsd` 记为 null（未知），不写 0；账本的收费在 `externalCostChargedUsd`。
- 任务里，每次求解有自己的 `paid_calls` 行：先写 `reserved`，结算后写 `settled`。
- 页面记录的 `access.paidCalls[]` 里，每次求解一条：`provider: "capsolver"`，`capabilities: ["third_party_captcha_solver"]`，`solves: 1`。

**到上限时。** 页面照常以 blocked 结束，ladder 继续或结束。这就是"结束"。没有 grant 时，handoff 仍是默认，由人在自己的 Chrome 里通过。

**记录里有什么，没有什么。**

- trace 的 `captcha_solve` 记：类型、厂商、第几次、毫秒数、预留和收费、计费依据、结果、原因、厂商的错误码（只接受纯代码），以及是否用了运行的出口。
- 从不记：token、cookie 值、CapSolver 的 key、出口的密码。CapSolver 的 `errorDescription` 是自由文本，可能回显请求，不出适配器。

**本机转发器。** 它只听 `127.0.0.1`，只转发代理形式的请求（`CONNECT host:port`，或带完整 `http://` 地址的请求）。网页脚本发到这个端口的普通路径请求返回 400，不会带着出口的登录发给上游。本机其他进程仍然可以用它，这和本机的 `HTTPS_PROXY` 转发器一样，属于操作者自己的机器。

**解出的 cookie。** 它写进浏览器上下文，和站点自己设置的 cookie 一样。grant 同时列了 `egress_sessions` 时，任务的 cookie 会话也会照常保存它：放在任务目录里，只有本人可读，任务结束时删除，从不进记录。

**密钥与配置。**

- key 从 `CAPSOLVER_API_KEY` 读取（Howard 的 `.w2l/access/capsolver.env`），出口从 `W2L_SOLVER_PROXY` 读取（`http://user:password@host:port`，必须是粘性出口；CapSolver 要求 Cloudflare 挑战的出口至少保持 3 分钟）。
- 启动提示只写出口的 `host:port`。错误信息不复述任何一个值。
- CapSolver 的 API 调用走操作者的环境代理（`HTTPS_PROXY`），不走求解出口。
- 本地 MCP host 暂不运行求解器，启动时提示这一点。

**本修订合入时的边界。**

- 本 PR 不发任何付费调用。测试用环回地址上的 CapSolver 替身和挑战页夹具。
- 真实站点上的效果、CapSolver 的实际账单与价目表的差距、求解后通过的比例，都是 unknown，要等一次小规模的实测（最多 3 次求解，在 $20 预算内）和之后的冻结任务集测量。
- 一次任务中途才出现的挑战（后续导航、弹窗、晚加载的表单）还没有监视；现在只在 rung 读页面的那一次检查。
- 站点自己的回调拿到 token 后，若自行以 GET 方式把它放进地址，Octocrawl 无法阻止，地址会进记录。目前只排除了可见的 GET 表单。
- 托管仍然拒绝。
