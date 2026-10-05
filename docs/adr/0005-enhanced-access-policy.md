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

工程成本问题，不是原则问题。重启条件照搬 ROADMAP 暂缓表；行号是本 ADR 写成时（提交 `a48c9c4`）的行号。

| 能力名 | 出处 | 暂缓表的行 | 重启条件 |
| --- | --- | --- | --- |
| `own_browser_engine` | ROADMAP.md:240 | An own browser fork or engine, and broad custom-fingerprint research | A maintained project stops working for a class of tasks that PA's set shows matters |
| `own_fingerprint_patches` | ROADMAP.md:240 | 同上 | 同上 |
| `own_captcha_model` | ROADMAP.md:241 | An in-house CAPTCHA model | Only if solver cost or coverage blocks paying users |
| `own_residential_network` | ROADMAP.md:242 | An own residential IP network | Not restarted; PA uses providers |
| `camoufox` | ROADMAP.md:243 | A second stealth engine (Camoufox) | Patchright leaves a clear class of PA tasks unsolved |
| `hosted_browser_cluster` | ROADMAP.md:244 | Hosted API and hosted MCP at scale | P5's hosted-scale item, once P3 has exited; or earlier when users ask for runs while their computer is off and will pay more for it |

托管 K8s 浏览器集群归在第 244 行之下：那一行管托管服务的规模化，浏览器集群是其中一部分。

运行时：拒绝原因写 `deferred`，带出处和重启条件，不写 `refused`。表格测试逐字核对每一项的行标题和重启条件与 ROADMAP 暂缓表一致；行号不做测试，因为 ROADMAP 前面的章节经常被编辑，行号会漂移，以行标题为准。

Patchright 与 `own_fingerprint_patches` 的区别：Patchright 是维护中的第三方项目（Apache-2.0），ROADMAP 第 240 行写明 PA 用维护中的项目代替自研，所以它属于第 3 类 `enhanced_browser`。Octocrawl 自己写的指纹或 CDP 补丁属于第 2 类。

### 3. 需 grant（`AUTHORIZABLE`）

默认关。grant 列出时可用，并且每次使用都进记录。

| 能力名 | 最低档位 | 第三方费用 | 内容 |
| --- | --- | --- | --- |
| `compatible_transport` | standard | 否 | 浏览器兼容的 HTTP 传输（impit） |
| `egress_sessions` | standard | 否 | 用户自己的代理组成的会话：出口、cookie、profile 绑定，有界切换 |
| `enhanced_browser` | enhanced | 否 | Patchright，只用于 Octocrawl 自有的浏览器实例和 profile |
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
