# PA 挑战页与 bot 检测任务清单

依据：[ROADMAP.md](../ROADMAP.md) 的 PA 表（item 4、5、9 的状态行）、[AGENTS.md](../AGENTS.md)、[ADR 0005](adr/0005-enhanced-access-policy.md)。核实基于 `main` 的 `fdcd705f`，日期 2026-10-12。起因：窗口 2（[记录](../research/access/runs/2026-10-12-pa9-w2-baseline-782bb64.md)）里 Firecrawl 过而 Octocrawl 没过的 22 题中，13 题是我们判为 `cloudflare_challenge` 或 `bot_detected_generic` 的页面；10-11 的四臂实验（[D](../research/access/runs/2026-10-11-pa4-3arm-d-control-e3b9d37.md)、[A](../research/access/runs/2026-10-11-pa4-3arm-a-residential-e3b9d37.md)、[B](../research/access/runs/2026-10-11-pa4-3arm-b-residential-solve-6021174.md)、[C](../research/access/runs/2026-10-11-pa4-3arm-c-webshare-d65614d.md)）证明换住宅出口和厂商求解对这类页面无效。本清单只管这一类。

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 总原则

- **流程**：每组一个分支、一个 PR，从当前 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree；分支落后 `main` 不超过一组。
- **先归因再验证**：没有逐站归因（厂商、拦截层、证据）的任务不进验证组；验证只对已归因的类别做。
- **一次只变一个变量**：沿用四臂的做法，同日、同批、相邻两臂只差一个变量，每臂一份 dated record（`research/access/runs/<YYYY-MM-DD>-<label>-<commit>.md`），写明命令、commit、出口、走代理还是直连、费用，以及与供应商侧（Steel/Browserbase 的 session 列表）的对账。
- **手段边界**：只用 ADR 0005 的 grant 类能力（`compatible_transport`、`egress_sessions`、`enhanced_browser`、`vendor_remote_browser`、`vendor_stealth`、`vendor_residential_proxy`）；永不做身份轮换、不给用户 Chrome 打补丁、不自研指纹补丁与浏览器引擎（暂缓类），不碰 CAPTCHA 求解（item 6，四臂已证明这批页面没有可解的 CAPTCHA）。
- **证据诚实**：没测过的值留 null 或 unknown；被拦、失败、不完整都留在分母里；blind 的 B001、B008 只在验收时跑，不参与调参；带日期的记录不改结论，只追加。
- **两窗口才算数**：一种配置只有在第二个日期再次 verified 同一任务、健康控制组无退步、假成功不增加，才进入路线记忆和 ROADMAP。
- **费用**：每臂 grant 的 `perRunUsd` 按臂设；本清单总预算 $5 内；超出先问 Howard。
- **Steel 共用**：和「增强访问路线同步」「距离最终版本的差距」窗口共用一个 Steel key，用之前和用完各发一条消息，对账按时间窗口和 `proxySource` 排除对方的 session。

## 任务池

### 目标池：16 题，两次 10-11 enhanced 全 92 运行都未过，原因是挑战页或 bot 检测

| 任务 | 集合 | 类型 | 站点 | 竞品能过（F=Firecrawl，Z=ZenRows） | 我们的原因 | 已知线索 |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | frozen | document | studylib.net | F | cloudflare_challenge 403 | 四臂都拦 |
| T002 | frozen | dynamic | ember-energy.org | FZ | cloudflare_challenge 200 | C 臂自备网关 http 直接过：IP 信誉型 |
| T047 | frozen | listing | capterra.com | FZ | cloudflare_challenge 403 | 四臂都拦 |
| T048 | frozen | page | crunchbase.com | FZ | cloudflare_challenge 403 | 四臂都拦 |
| T068 | frozen | listing | economist.com | FZ | cloudflare_challenge / bot_detected 403 | A 臂本地浏览器过了一次，不稳定 |
| T071 | frozen | listing | cars.com | F | cloudflare_challenge 403 | 四臂都拦 |
| T076 | frozen | listing | stackoverflow.com | FZ | cloudflare_challenge 403 | 本地 rung 带 robots 覆盖，Steel rung 被阶梯跳过 |
| B001 | blind | listing | bhphotovideo.com | F | cloudflare_challenge 403 | 只用于验收 |
| T005 | frozen | listing | etsy.com | — | bot_detected_generic 200 | 竞品也没过，作上限参照 |
| T034 | frozen | listing | etsy.com | FZ | bot_detected_generic 403/200 | 四臂都拦 |
| T038 | frozen | listing | tripadvisor.com | FZ | bot_detected_generic 403/200 | Steel 报无 CAPTCHA 任务 |
| T045 | frozen | listing | idealista.com | — | bot_detected_generic 403 | Firecrawl 的 stealth 引擎也失败，作上限参照 |
| T046 | frozen | listing | g2.com | FZ | bot_detected_generic 403 | 四臂都拦 |
| T049 | frozen | listing | yelp.com | Z | bot_detected_generic 403 | 本地 rung 带 robots 覆盖，Steel rung 被阶梯跳过 |
| T053 | frozen | page | imf.org | FZ | bot_detected_generic 403 | 10-06 Patchright A/B 曾一次过，复查不过 |
| B008 | blind | listing | imdb.com | F | bot_detected_generic 405 | 只用于验收 |

14 题至少一家竞品能过，是增益的目标；T005、T045 留在分母当上限参照；B001、B008 只跑验收。

### 不在本清单：窗口 2 里四家都没过的 12 题

B003 tesla、B009 allrecipes、T005 etsy、T010 OECD（需要点击）、T012 walmart、T013 bestbuy、T014 homedepot、T037 expedia、T045 idealista、T073 stubhub（提取问题，另一窗口在查）、T078 instagram、T081 facebook（登录墙）。保留在分母里，不做。

## G1 归因组（不花钱，约 1 天）

目标：16 题每题一行归因——厂商、拦截层、证据——或明确写 unknown。

- [x] **T1.1 保存完整响应**（`--save-responses`，2026-10-12；T001、T047 的冒烟运行里读到了 `gate_detected` 的 `header_cf_mitigated`）：给 `research/access/run-set.mjs` 加一个开关（例如 `--save-responses`），把每次 `POST /v1/scrape` 的完整响应（含 `evidenceRecord` 与 `trace`）按任务写到 `.w2l/access/runs/<timestamp>/responses/<task>.json`。现有记录的 `gateEvents` 只存事件名，没有 `signals`，归因拿不到依据。不改 `attempts.jsonl` 和 Markdown 记录的形状。
  - 验收：一次 `--only T001 --save-responses` 后，对应 JSON 里能读到 `gate_detected` 事件的 `signals` 数组；`npm test` 通过；文件在 `.w2l/` 下，不进仓库。
- [x] **T1.2 跑 16 题收集信号**（2026-10-12，[standard](../research/access/runs/2026-10-12-pa-gate-signals-standard-56f9a0d1.md)、[enhanced](../research/access/runs/2026-10-12-pa-gate-signals-enhanced-56f9a0d1.md)：Cloudflare 8、DataDome 7、无厂商头 2）：standard 一轮、enhanced（10-11 grant，Steel 无代理）一轮，都带 `--save-responses`。
  - 命令：`node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 [--access '"enhanced"'] --save-responses --record research/access/runs/<date>-pa-gate-signals-<label>-<commit>.md`
  - 验收：两份记录；每题的 `signals` 列出来（`cf-mitigated`、`cf_interstitial_text`、`header_x_datadome`、`px-captcha`、`akamai_reference`、`header_x_kasada`、`header_x_iinfo_imperva` 等，见 `packages/http-core/src/gate.ts`）。
- [x] **T1.3 库级差分**（2026-10-12，[记录](../research/access/runs/2026-10-12-library-probe-16-b117b451.md)：13 题五臂全拦，Patchright 与 Playwright 无一题不同；T002 全过；T053 两个浏览器臂过而产品的浏览器一档不过）：把 `research/access/probe.mjs` 的臂扩到四个——undici、impit chrome、本地 Playwright（stock）、Patchright——同一出口（自备网关）各打一次，记下每题在哪一层开始被拦：HTTP 层（undici/impit 都 403）还是渲染后（HTTP 200 但浏览器里出挑战）。标签 `library_probe`，只写进 `suspected`，不作路线依据。
  - 验收：一份 `research/access/runs/<date>-library-probe-<commit>.md`，表格为任务 × 四臂 × 结果；impit 不进仓库依赖，照 probe.mjs 头部的做法在 scratch 目录装。
- [x] **T1.4 归因表**（同一份记录的 Attribution 节：甲 1、乙 0、丙 1、丁 13，另 B008 归入丁）：汇总 T1.2、T1.3，写成一份 dated record：任务 × 厂商（Cloudflare managed challenge / Turnstile / IP 信誉；DataDome / PerimeterX / Akamai / Kasada / Imperva / 未知）× 拦截层 × 证据。每题末尾写明属于下面哪一类：
  - 甲：IP 信誉型（换出口即过，如 T002）→ 已有 C 臂配置覆盖，不进验证组；
  - 乙：HTTP 层指纹型（impit 过、undici 不过）→ G2 的 T2.3；
  - 丙：渲染后的 JS 挑战或 headless 检测型 → G2 的 T2.1、T2.2；
  - 丁：未知。
  - 验收：16 行齐全；unknown 的写明查了什么。

## G2 验证组（有对照，约 2 天，预算 $5 内）

目标：对已归因的类别各做一次有对照的验证，每臂一份记录。对照臂固定为 C 臂配置（`standard` grant：`compatible_transport` + `egress_sessions`，`W2L_EGRESS_PROXIES` 指向自备网关，API 不走 Clash 代理），同日重跑一次作为基线。

- [x] **T2.0 对照臂**（T053 产品侧差异已隔离，[记录](../research/access/runs/2026-10-12-t053-identity-204c8a76.md)：imf.org 的 Akamai 拒绝自称 Google Chrome 的 headless Chromium，诚实声明 HeadlessChrome 则 200；开关 `W2L_BROWSER_IDENTITY=actual` 已做（#431），产品实测 T053 3/3 verified、其余 14 题不变，[记录](../research/access/runs/2026-10-12-pa-gate-signals-actual-identity-204c8a76.md)；92 题 A/B 窗口 1 已跑：声明身份 44 verified、actual 32，actual 只多 T053、少 13 题（含 6 题健康组），[declared](../research/access/runs/2026-10-12-identity-ab-declared-2df8207d.md)、[actual](../research/access/runs/2026-10-12-identity-ab-actual-2df8207d.md)，**结论：不改默认，开关留作按 host 的路线选项**）：C 臂配置在 16 题上同日重跑。
  - 验收：记录一份；每题 egress 为 `p.webshare.io:80`。
- [ ] **T2.1 Patchright 定向重测**（丙类；T1.3 的探针里 Patchright 与 Playwright 在 16 题上无一不同，预期无增益，跑与否由 Howard 定）：C 臂配置 + `W2L_BROWSER_ENGINE=patchright` + grant 加 `enhanced_browser`（tier enhanced，需 attestation）。10-06 的 A/B（[记录](../research/access/runs/2026-10-06-patchright-ab-f052375.md)）只在数据中心出口下做过，结论是无净增益；这次换自备网关出口。
  - 验收：记录一份；与 T2.0 逐题对照，列出净增益与退步；T053 要在记录里单独说明（10-06 曾一次过）。
- [ ] **T2.2 Browserbase `verified` 首次实跑**（丙类，item 4 的"另一家供应商只补它能补的类别"）：适配器已有（`packages/bench/src/vendors/browserbase.ts`），但从未用真实 key 跑过。grant 用 `vendor_remote_browser` + `vendor_stealth`，tariff 按 docs/access.md 的示例（`perHourUsd` 0.12、`maxSessionMs` 120000、`minBilledMs` 60000、`billingIncrementMs` 60000），`proxies: false`。
  - 前置（Howard）：提供 Browserbase key，并确认 `verified`（Advanced Stealth 的现名）在当前套餐可用；不可用则此项改为"记录原因，跳过"。
  - 验收：记录一份；与 T2.0 对照；按 Browserbase 控制台的 session 用量对账，写明账本与控制台的差。
- [ ] **T2.3 兼容传输扩 host**（乙类；T1.3 显示 16 题里没有乙类，本项暂无候选）：T1.3 显示 impit 过而 undici 不过的站，加进 `research/access/benefit-hosts.v1.json` 候选，先用 `W2L_COMPAT_HOSTS` 指定跑一遍。
  - 验收：记录一份；只有在两窗口都 verified、且健康组与 real-site 批次无退步时才改默认列表（item 2 的规则）。
- [ ] **T2.4 费用与对账**：每臂记录里写清 grant 的 SHA-256、账本费用、供应商侧 session 汇总、余额差（Steel 看 Wallet 的 Activity，Browserbase 看其控制台）。
  - 验收：三个数并排；不一致就写不一致。

## G3 验收组

- [ ] **T3.1 第二窗口**：G2 里有净增益的配置，在另一天再跑一次 16 题（含 B001、B008）。
  - 验收：同一任务两窗口都 verified 才算；记录一份。
- [ ] **T3.2 无退步检查**：item 1 的 25 题健康组和 real-site 批次各跑一次（`node research/parity/run-sites.mjs --batch L ...` 按 AGENTS.md）。
  - 验收：无可归因退步；假成功按验证结果计，不增加。
- [ ] **T3.3 路线记忆与 ROADMAP**：通过验收的配置写进路线记忆（当前只有 host × vendor，有效期与地区维度是 item 2 的后续，不在本清单）；ROADMAP 的 PA item 4、5 状态行各加一条日期行，写明增益、费用与"该类别在当前边界内无解"的结论（如果是这个结果，同样合格）。
  - 验收：docs PR 一个；状态行链接到各记录。

## 需要 Howard 的事

- [ ] Browserbase 的 key 与套餐（T2.2 前置）。
- [ ] 每个 enhanced grant 的 attestation 声明（T2.1、T2.2 各一份）。
- [ ] 总预算 $5 是否同意；超出先问。

## 遗留与不在范围

- 四臂暴露的两点仍开着：T060 在每臂都是假成功（item 4 的假成功收尾，另一窗口）；自备网关的流量 Octocrawl 不计量，`egressCostUsd` 一直 unknown（要算 C 类配置的真实成本得看 Webshare 控制台）。
- CAPTCHA 求解（item 6）、登录墙、提取问题、需要交互的页面、路线记忆的有效期与地区维度，都不在本清单。
