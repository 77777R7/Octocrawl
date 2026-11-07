# 登录态体验任务清单

依据：2026-11-07 Howard 的两个问题（"agent 能不能自动判断需要登录、并提醒用户是否用登录态；用户一开始怎么知道可以直接用已登录的浏览器"）和同日的现状核查，以及 [ROADMAP.md](../ROADMAP.md)（当前阶段"ten outside users"，2026-11-04 的 hosted 登录决定）、[AGENTS.md](../AGENTS.md)、[docs/access.md](access.md)、[docs/mcp-client-ux-tasks.md](mcp-client-ux-tasks.md)。行号核实基于 `main` 的 `4d399e44`，日期 2026-11-07。标"待核"的，动手前在当时的 `main` 上再查一次。

起因：引擎已经能把需要登录的页面标成 `blocked` / `login_wall`，但结果里的提示只说 `mode authed` 加一条导入命令，不提 `my-browser`；"先问用户"这句散在 instructions 和参数描述三处，agent 要自己拼起来；`octocrawl serve` 启动、Connect MCP 页、hosted instructions 都没有一句"你已经登录的 Chrome 可以直接用，不用逐站登录"。用户在撞到登录墙之前不知道这条路存在，撞到之后 agent 也没有现成的话可问。

目标体验一句话：**用户从头到尾只回答一次"可以，用我的 Chrome"，其余由 Octocrawl 和 agent 完成，每一步看得见、收得回。**

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 七个时刻

| 时刻 | 极致体验 | 现状 | 任务 |
| --- | --- | --- | --- |
| 1 第一次接触 | 装好 MCP 后第一句话里就有：遇到要登录的页面，agent 会先问，同意后在你已登录的 Chrome 里读，不用再登一遍 | 只有 docs、博客和落地页一张卡片；serve 启动、Connect MCP、instructions 都没有 | L2、L3、L4、L5 |
| 2 撞到登录墙 | agent 对用户说人话，只问一个是非题："这页要登录 example.com，要不要我用你已登录的 Chrome 读？" | 本地 hint 只说 mode authed 加 `login import`，不提 my-browser；agent 要自己拼三处文字 | L1、L2 |
| 3 同意之后 | 一次授权，按站点记住，之后同一站点不再问；每次结果注明"以你的身份读取" | Chrome 的 Allow 每次连接都弹；Octocrawl 自己的 Allow reading these sites 每次请求都要点；不记站点 | A1、A2 |
| 4 出错时 | "你在 example.com 的登录过期了，去 Chrome 重新登一下，我接着读" | hint 直接给命令 `octocrawl login import <domain>` | L1 |
| 5 hosted 撞墙 | 说清云端不碰账号，给一条路，之后自动转到本机 serve，转之前问 | hint 已指向 serve（ROADMAP (a) 已做）；自动转发、dashboard 引导冻结 | H1–H3（冻结） |
| 6 批量 | "50 页里 12 页要登录 example.com，用你的登录态补读这 12 页？"一个"好"，只重跑 12 页 | batch 状态有 `waitingForPerson`，有 `hand_off_batch`；batch 报告没有 `agentHints` 字段；crawl 和 map 拒绝 authed | L7、A4 |
| 7 全程透明 | 每次动用登录态都留痕，agent 一句话转述 | Evidence Record 已有 `access.route`、`access.completion`、`access.sessionApplied`（0.8.6） | L2 的一句、L6 验证 |

## 待 Howard 决定

每条标出影响的任务。没决定的，按"默认"一栏先做，或者先做不受影响的部分。

| # | 问题 | 影响 | 默认（未否决前按此） |
| --- | --- | --- | --- |
| D1 | Phase 1（L1–L7）在这个窗口做，一项一个 PR（L3 和 L4 可以合成一个），从当时的 `origin/main` 拉分支。是否同意？ | Phase 1 | 同意 |
| D2 | 单页的登录墙 hint 先推荐哪条路：`my-browser`（不复制 cookie，用户肉眼可见，每页顶一个 tab）还是 saved login（导入一次，之后每页不用点，适合批量）？ | L1、L2 | 单页：先 my-browser，再 saved login；批量：先 saved login（`import_login` 加 mode authed），再 `hand_off_batch` |
| D3 | hint 是 CLI、REST、MCP 共用的纯函数（`hints.ts:272-275` 的注释）。改写后先用白话说要做什么，再在括号里给两种形式：MCP 工具名在前（`import_login`），命令在后（`octocrawl login import`）。CLI 的 verdict 行会原样打印同一句。是否接受？ | L1 | 接受 |
| D4 | Phase 2 的 A1：Octocrawl 自己的"Allow reading these sites"按站点（精确 host）记住，用户点过一次后同一站点不再弹 Octocrawl 的页面。Chrome 自己的"Allow remote debugging?"对话框是 Chrome 的，去不掉。记住的站点在 serve 启动时列出，可以用命令撤销。这个安全权衡是否接受？ | A1 | 接受，但记录里要说明这次授权是"记住的"还是"点的" |
| D5 | Phase 2（A1–A4）改引擎。ROADMAP 当前阶段写"引擎不接新工作，只修外部用户遇到的问题，先复现"。Phase 2 现在开工，还是等 `research/trials/` 里有记录说明首次授权的三步挡住了人？ | Phase 2 | 等试用记录，或 Howard 开口；Phase 1 不受影响 |
| D6 | Phase 3（hosted 转发到本机 serve、serve 的"已连接"提示、Connect MCP 的 hosted 文案、dashboard 引导）是 ROADMAP 2026-11-04 决定里的 (b)(c)(d)，冻结中。本清单只列出，不开工。是否同意？ | Phase 3 | 同意，按 ROADMAP 的解冻条件 |
| D7 | instructions 里加一个从句："用户对某个站点说过可以，这次对话里该站点的其他页面不再问；新站点再问。"这是给 agent 的行为规则，不是产品功能。要不要加？ | L2 | 加 |
| D8 | Phase 1 的本地改动（`@w2l/api`、`@octocrawl/mcp`、CLI）要发 npm 才到用户手里。随下一个 0.8.x 发，还是攒到 0.9？hosted 的 hint 不变，不用部署；站点文案随下一次 preview 部署。 | L1–L5 | 随下一个 0.8.x；站点随下一次 preview 部署，只在 Howard 要求时 |
| D9 | L6 的真实验证用哪个站：公开练习站 quotes.toscrape.com（I1 记录用过，有登录），还是 Howard 自己常用的某个站？ | L6 | quotes.toscrape.com 加本地 fixture；真实个人站点只在 Howard 提供时用，记录里只写站名和计数，不写任何值 |
| D10 | L7 要给 batch 状态加 `agentHints` 字段（今天没有，只有每一项各自的 hint）。这是 REST 和 SDK 的只增字段。接受，还是只在 MCP 的 `get_batch`、`wait_batch` 文本里加？ | L7 | 加字段，随 Phase 1 的 0.8.x 发 |

## 定下的方向

1. **只改"说话"的部分先行。** Phase 1 不加新能力，不改检测规则（`gate.ts`），不碰 ROADMAP 冻结项。hint、instructions、启动提示、help、文档文案是全部范围。
2. **hint 只说这台服务器真有的路。** 现有原则（`hints.ts:129`、`engine.ts:782`）：hosted 的 hint 只说本机服务器有的路，本地的 hint 不说没配置的路。登录墙 hint 要知道这台服务器有没有用户的 Chrome 和 saved logins，所以 `HintOffers` 要加字段，不能写死。
3. **先问用户，说出站点名。** 这句已经在 instructions（`instructions.ts:55`）和 `scrape` 的 `mode`、`handoff`、`lane` 描述里（`tools.ts:280-282`）。Phase 1 把它搬进结果本身，让 agent 拿到 `login_wall` 时不翻文档就有话可问。Octocrawl 不替任何人登录、不创建账号，这句保留。
4. **Octocrawl 决定走哪条路，用户不选工具。** agent 只告诉用户"会用你的 Chrome"或"会用你保存的登录"，不让用户在 `authed`、`my-browser`、`handoff` 之间选。推荐顺序见 D2。
5. **记录照旧。** `access.route`、`access.completion`、`access.sessionApplied` 不改；Phase 2 的 A1 只在记录里多说一个"授权是记住的还是点的"。

## 不做的事

- **不在没问过的情况下用登录态。** 不改 `import_login` 之外任何工具的 `requiresUserInteraction`（`docs/mcp-client-ux-tasks.md:574` 的理由：每次弹确认，无头模式直接拒绝）。不用 form elicitation 收集同意（同文件 :573）。
- **不把 cookie 复制到 hosted。** ROADMAP 2026-11-04 决定把一次性导入和持续同步都放进 Paused。
- **不写"绕过登录"。** `limits.md:81`、`terms.md:29`、`acceptable-use.md:10` 的措辞不变；新文案一律写"你自己的登录"。
- **不加 `serve` 的 my-browser 开关。** 它在 loopback 的本地服务器上本来就开着（`cli.ts:35-48`：`userChrome` 和 `sessionsFile` 都来自 `servesLogins`；`localHost.ts:53` 和 `run.ts:86-88` 也两样都传）。
- **不改 `gate.ts` 的登录墙检测**，除非外部用户遇到的误判被复现（AGENTS.md 的 parity 规则）。
- **不新开 docs 页。** CHANGELOG 0.4.0 提到的 `/docs/guides/own-chrome/` 已经改成博客 `scrape-website-with-login`，`blogPosts.mjs:34` 的 `from` 字段做了跳转，不是 404。

## 现状（在 `4d399e44` 上查到的）

检测：

- `packages/http-core/src/gate.ts:392`（HTTP 401）、`:515`（密码框加登录意图文案）、`:627`（WebAuthn 登录页）给出 `login_wall`。`contracts/src/status.ts:68` 列它为 blockReason，`http-core/src/failureClass.ts:96` 归为 `login_required`。
- `packages/bench/src/routing/ladder.ts:978`：用了 saved login 又被拒，记 `ladder_session_rejected`；`:2058-2068` 定义拒绝（block、跳到登录路径、页面就地要求登录）。规则见 `docs/access.md:16`。
- `hints.ts:108`：`GATES` 只含 `cloudflare_challenge`、`captcha`、`bot_detected_generic`，所以登录墙只拿到一条 hint，不会和 gate hint 叠加。

提示：

- `packages/api/src/hints.ts:292-298`：本地首次撞墙 "the page asks for a login; Octocrawl does not create accounts; use mode authed with your own session (octocrawl login import <host> saves it from your Chrome)"；登录过期 "<host> refused your saved login for <domain> (expired or signed out); sign in to it again in Chrome and run octocrawl login import <domain>"；hosted 用 `HOSTED_LOGIN_WALL_HINT`（`:51`）。两条本地 hint 都不提 `my-browser`。
- `hints.ts:133-143`：`HintOffers` 只有 `installedChrome`、`hosted`、`noFiles`。`engine.ts:781-793` 的 `hintOffers` 和 `taskHintOffers` 决定给什么；batch 和 crawl 的每页也走它（`:3359`）。
- `engine.ts:1654-1664`：配了 `userChrome` 的服务器在结果上加 `handoff: { reason: 'login_required', rationale }`，rationale 说 "send the request again with handoff: true"。compact 结果保留 `handoff`（`contracts/src/api.ts:342`、`structured.ts:1929`），MCP 的 `scrape` 结果里是否看得到，待核（L1.4）。
- 对应测试：`packages/api/test/hints.test.ts:65`、`:68`（本地两句的原文）、`:81`（hosted）、`:134`；`packages/cli/test/cli.test.ts:171-172`（verdict 行，用的是编造的 hint，不含真实文字）。

MCP：

- `packages/mcp/src/instructions.ts:55`：本地非只读一句 "lane my-browser, handoff and mode authed read pages in the person's own Chrome or with their saved login: ask the person first and name the site."；`:54` 只读版；`:75-76` hosted 版只说 "Monitors and saved logins run on a server on the person's computer: npx octocrawl serve"。没有一句说"结果是 login_wall 时做什么"。
- 长度：`docs/mcp-client-ux-tasks.md` 的 W3 结果记本地 1,591 字符（2026-10-17），今天的长度待量；上限 2,000：`hostedJobMcp.test.ts:100` 测 hosted，本地由 `toolsets.test.ts:141` 的 `expectUsableInstructions`（`packages/mcp/test/instructionChecks.ts:10-21`）检查：长度在 400 到 2,000 之间、点名的工具都在列表里、不含 `https?://` 和 `utm_`。
- `packages/mcp/src/tools.ts:280`（`mode`）、`:281`（`handoff`）、`:282`（`lane`）、`:283`（`access`）、`:478-479`（batch 的 `mode`、`lane`）、`:514`（`hand_off_batch`）、`:519`（`import_login`，`_meta` 带 `requiresUserInteraction`，`:591`）。
- hosted 拒绝：`hostedParity.ts:266-276`（`mode=authed` planned，`access=my-browser` different_on_purpose）。

CLI 和启动：

- `packages/api/src/cli.ts:36-37`：只在不在 loopback 时打一行 "saved logins (mode authed) are not read"；`:103` 打 Claude Code 的接入命令。在 loopback 上启动时，关于登录态一个字没有。
- `packages/cli/src/flags.ts:232` 顶层 usage 有 `login import <site>` 一行；`:241-242` `scrape`、`batch` 的 help 有 `--handoff` 和 `--lane my-browser` 的说明。
- `packages/cli/src/run.ts:137-150` `verdictLine`：不是页面的结果在 stderr 打 status、reason 和第一条 hint；`:209`、`:270` my-browser 的操作提示。
- `packages/cli/src/login.ts:11-23`：`octocrawl login` 的 usage。

站点和文档：

- `README.md:137`（Access 文档一行）、`:141`（博客链接）；快速开始（`:89-96`）不提登录和 Chrome。
- `docs/access.md:5-10`（四种方式）、`:12`（Your own login）、`:162`（handoff）、`:185`（Your own Chrome）。"You allow it twice per connection" 在 `:191`。
- `apps/public-web/content/connect-mcp.md:146`："…saved logins, handoff to your own Chrome…"，列在工具清单里，没有解释。`introduction.md:30` 同样。
- `apps/public-web/src/product/scrapePage.ts:300-302`：落地页访问梯子的 "Your own Chrome" 卡片，是站上唯一一处面向用户的解释。
- 博客 `apps/public-web/content/blog/scrape-website-with-login.md`，`blogPosts.mjs:34`（`updatedDate: null`；改它要按 `blogPosts.test.ts` 更新日期）。
- `apps/public-web/scripts/dashboardPages.mjs`（`dashboard.test.ts:4` 引用）：dashboard 页面只在 `:152`（`codex mcp login octocrawl`）和 `:166`（"saved logins" 列在本地工具里）顺带提到 login，没有登录态的引导。

授权流程（Phase 2 的起点）：

- `packages/api/src/chromeLogin.ts:102-112`：通过 Chrome 用户数据目录里的 `DevToolsActivePort` 找到端点；用户要先在 `chrome://inspect/#remote-debugging` 打开开关，每次连接 Chrome 都弹 "Allow remote debugging?"。
- `packages/api/src/chromeHandoff.ts:1-35`（设计说明）、`:283`（"Allow reading these sites" 按钮）、`:327`（没点的原因）。按 `docs/access.md:191`，每次连接都要点两次，不记站点；Chrome 退出后不续（同一天的大任务权衡记录）。
- ROADMAP P3（`ROADMAP.md:496-510`）保留了"不用远程调试的扩展"设计，排在 PA 之后。

ROADMAP：

- 当前阶段 `ROADMAP.md:24-45`："engine takes no new work of its own: it fixes what outside users meet, each reproduced first"；saved logins 的 hosted 工作冻结。
- `ROADMAP.md:485-493`（锚点 `hosted-logins-2026-11-04`）：UX 条 (a) 已做（`hints.ts:51`），(b)(c)(d) 未做，状态冻结，解冻条件是 `research/trials/` 有记录点名这样的页面，或 Howard 开口。
- `research/trials/` 今天只有 `2026-10-16-entry-smoke.md`、README、TEMPLATE。

## 总原则

- **流程**：每个任务一个分支、一个 PR，从当时的 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree。commit 用 `-s` 签名，conventional 格式。PR 开好后打开 Auto-fix。
- **先复现**：改 hint、instructions、启动提示之前，先写一个在 `main` 上失败的测试（现有断言要改的，先改断言让它红）。
- **兼容**：hint 和 instructions 的文字是行为，`hints.test.ts`、`cli.test.ts` 和 MCP 的 instructions 测试会一起改；在 CHANGELOG 的 Unreleased 下写一条。REST 契约、结果形状、工具名不动。
- **文案规则**：写 Octocrawl，不写 W2L；不写 URL 进 instructions（`instructions.ts:5`）；hint 只说这台服务器有的路；永远不打印 cookie 值；"先问用户、说出站点名"每处都在。
- **证据诚实**：客户端里的效果，在真实客户端跑过才写"改善了"；没跑的写 unknown。每次真实客户端运行在 `research/access/runs/` 下写一份带日期的记录：命令、commit、客户端版本、是否走代理、用户点了几次、agent 问了没问。
- **检查**：每个 PR 跑 `npm run typecheck` 和 `npm test`（跑测试前 unset 代理），改 `apps/public-web` 的再跑 `npm run build:public`，把结果写进 PR。

## Phase 1 · 说话层（不加能力，不等解冻）

### L1 登录墙 hint 改写　S

起因：时刻 2 和 4。今天 agent 拿到 `login_wall` 只看到 mode authed 和一条命令，要自己去 instructions 和参数描述里拼出"该问用户"和"有 my-browser"。

- [ ] **L1.1** `hints.ts:133-143` 的 `HintOffers` 加两个字段，两条路是分开的：`personChrome?: boolean`（这个请求能在用户的 Chrome 里读：`userChrome !== null`，且不要 `actions` 或 `screenshot`，即 `unreadByPerson(...) === null`，`engine.ts:3246-3250`）和 `savedLogins?: boolean`（这台服务器读 saved logins）。请求带 `actions` 或截图时，第一个为假、第二个为真，所以一个字段不够。`engine.ts:781-787` 的 `hintOffers` 填它们；`taskHintOffers`（`:789-793`）跟着生效。`engine.ts:2086` 和 `:2108` 的 read 分支今天不传 offers，要补上，否则这两处会说这台服务器没有这两条路。hosted 永远不填。
- [ ] **L1.2** 本地首次撞墙（没有 `ladder_session_rejected`）的 hint 按 offers 组句（按 D2、D3）。站点名用请求的主机，不用 `hostOf`：它优先取最终 URL，跳到 SSO 时会让人导入 SSO 站点的登录。`my-browser` 拒绝 mode authed 和 research（`engine.ts:1496`），所以写明 mode standard；crawl 两条路都不收，所以写明 on a scrape or batch。
  - 两条路都有："the page asks for a login; Octocrawl does not sign in or create accounts for anyone; ask the person first, naming <host>, whether to read it in the Chrome they are signed in to (lane my-browser in mode standard on a scrape or batch, octocrawl scrape --lane my-browser; they turn on remote debugging at chrome://inspect/#remote-debugging, click Allow there, then Allow reading these sites) or with a login they save once (import_login <host>, or octocrawl login import <host>, then mode authed on a scrape or batch: no click per page after that)"
  - 只有一条路（请求带 `actions` 或截图时只有 saved login）：只说这一条。
  - 两条都没有（本地服务器监听在 loopback 之外，或没配 saved logins）："the page asks for a login; this server reads no saved login and no Chrome of the person's; on their own computer Octocrawl reads it as them, after asking them (npx octocrawl serve, then lane my-browser, or octocrawl login import <host> and mode authed)"。今天这种服务器的 hint 让 agent 用它没有的 mode authed，和 hosted 改前的死胡同一样。
  - 已经在用户的 Chrome 里读过（lane `my_browser`），页面仍要登录："<host> asks for a login in the person's own Chrome too: ask them to sign in to it there, then read it again"。这时再推荐 my-browser 没有意义。
  - hosted：`HOSTED_LOGIN_WALL_HINT` 不变。
- [ ] **L1.3** 登录过期的 hint 改成先说发生了什么、再说下一步，不以命令开头："<host> no longer accepts the saved login for <domain> (expired or signed out); ask the person to sign in to it again in Chrome, then save it again (import_login <domain>, or octocrawl login import <domain>): a running server uses the new one at once"。`personChrome` 为真时加一句 "or, with their yes, read this page in their Chrome now (lane my-browser in mode standard)"。
- [ ] **L1.4** 确认 `engine.ts:1654-1664` 的 `handoff.rationale` 和新 hint 不矛盾（rationale 说 handoff，hint 说 my-browser 和 saved login，三条路都是本机的）。compact 结果保留 `handoff`（`structured.ts:1929`）；用真实运行确认 MCP 的 `scrape` 结果里看得到它。
- [ ] **L1.5** `docs/scrape-options.md:231` 的 hint 表跟着改；CHANGELOG 的 Unreleased 写一条。
- 验收：
  - 先改 `hints.test.ts:65` 和 `:68` 的断言让它在 `main` 上失败；新增两条路都有、只有 saved login、两条都没有、已在 Chrome 里读过、hosted 五组断言；`ladder_session_rejected` 的 `personChrome` 真、假各一组；跳到 SSO 时 hint 里是请求的主机。
  - 引擎层一组测试：带 saved logins 和 `userChrome` 的引擎，`actions` 请求只提 saved login；`app.test.ts:473` 跟着改。
  - 不提供 my-browser 的请求，hint 里没有 `my-browser`；hosted 的 hint 一字不变（`:81`）。
  - `cli.test.ts:171-172` 的 verdict 测试用的是编造的 hint，不受影响。用本地 fixture 的登录墙（`packages/fixtures/src/fixtures.ts:1206-1217`，`/block/login-wall`，密码框加登录标题，`expectedBlockReason: 'login_wall'`）跑一次 `octocrawl scrape`，stderr 打出新 hint。
  - 每条 hint 都说要先问用户，都有站点名，都没有值。
  - `npm run typecheck`、`npm test` 通过。
- 指标：登录墙 hint 提到 my-browser 的服务器配置 0 → 全部提供它的配置；"先问用户"从 instructions 一处 → 结果本身也说。
- 决定：D2、D3。

### L2 instructions 加登录墙的处理规则　S

起因：时刻 1、2、7。tool search 下模型一开始只看到工具名和 instructions（`docs/mcp-client-ux-tasks.md` W3 的理由），这是最便宜的"第一次就问对"。

- [ ] **L2.1** `instructions.ts:55` 的那句改成（本地、非只读、列出了 `scrape`）："A page behind the person's login comes back blocked with blockReason login_wall. Octocrawl never signs in for them: ask them, naming the site, whether to read it in the Chrome they are signed in to (lane my-browser) or with a login they save once (import_login, then mode authed on scrape and batch_scrape; crawl takes none). lane my-browser, handoff and mode authed act as the person: ask first, say in your answer when a page was read as them, and their yes for a site holds for its other pages in this conversation."（最后一个从句按 D7。）`import_login`、`batch_scrape` 只在列出时点名，否则用条件句，和文件里其他句子一样。
- [ ] **L2.2** 只读版（`:54`）不变。hosted 版（`:75-76`）那句 "Monitors and saved logins run on a server on the person's computer" 加半句 "which reads a page behind their login as them, after asking them"；不提 my-browser（hosted 拒绝它）。
- [ ] **L2.3** 量长度：本地四个面各量一次，写进 PR。本地超过 2,000 时缩别的句子，不缩这一句。
- 验收：
  - 先写失败测试：本地非只读 instructions 不含 "login_wall"。
  - 改后：本地非只读含这句；只读不含 `my-browser`；hosted 不含 `my-browser`，含 "after asking them"；每个面 < 2,000 字符，不含 `https?://`。
  - `toolsets.test.ts:141` 的 `expectUsableInstructions`（`instructionChecks.ts:10-21`：长度 400–2,000、工具名都在列表里、无 URL 和 `utm_`）通过。
- 指标：instructions 里"结果是 login_wall 时做什么"0 句 → 1 句。
- 决定：D7。

### L3 `octocrawl serve` 启动时说一句登录态　S

起因：时刻 1。0.8.4 让 serve 打印 Claude Code 的接入命令（`cli.ts:103`），这是用户装好后第一眼看到的东西，而登录态在这里一个字没有。

- [ ] **L3.1** `cli.ts` 在 `servesLogins` 为真时紧跟接入命令那行打一行："octocrawl: pages behind your login: an agent can read them in the Chrome you are signed in to (lane my-browser) or with a login you save once (octocrawl login import <site>, then mode authed); it asks you first, and your logins stay on this computer"。`--hosted` 和不在 loopback 时不打（后者保留今天的 "not read" 警告）。
- [ ] **L3.2** 有 saved logins 时附数量："N saved logins (octocrawl login list)"；读 `sessionsFile` 失败不阻止启动，只不附。
- 验收：
  - `packages/api/test` 里没有 `runApiServer` 的测试，也没有测试捕获它的日志（`packages/mcp/test/entryRoutes.test.ts:66` 传 `log: () => {}` 丢掉了）；新加一个用 `options.log` 捕获的测试。先写失败测试：loopback 启动的日志不含 "pages behind your login"。
  - 改后：loopback 含且只含一行；`--host 0.0.0.0` 不含，含今天的 "not read"；`--hosted` 不含。
- 指标：首次启动看到登录态能力的入口 0 → 1。

### L4 CLI help 和 verdict　S（可与 L3 同一个 PR）

- [ ] **L4.1** `flags.ts:232` 顶层 usage 在 `login import` 那行下加一行："a page behind your login: --lane my-browser reads it in the Chrome you are signed in to; --mode authed reads it with a login you saved"。
- [ ] **L4.2** `flags.ts:241` `scrape` 的 synopsis 里 `--lane my-browser` 那段开头加 "for a page behind your login, or one your Chrome shows and Octocrawl cannot fetch"，让它和 `--handoff`（给 check）分工清楚。
- [ ] **L4.3** `run.ts:137-150` 不改逻辑；L1 的新 hint 会从这里打出。确认 `login_wall` 时 stderr 的那行不超过两行终端宽度（hint 长了就只打到第一个分号后的句子，待定：量了再说）。
- 验收：`cli.test.ts` 的 help 快照更新；`octocrawl --help`、`octocrawl scrape --help` 人工看一遍写进 PR。

### L5 文档和站点文案　S

起因：时刻 1。把"你已登录的 Chrome 可以直接用"写到用户会先到的地方，用白话，不新开页面。

- [ ] **L5.1** `apps/public-web/content/connect-mcp.md:146` "Run it on your computer" 那段加一句："Pages behind your own sign-in are read on this computer too: the agent asks you first, then reads the page in the Chrome you are already signed in to, or with a login you save once with `octocrawl login import`. Your logins never leave this computer."
- [ ] **L5.2** `introduction.md:30` 把 "saved login sessions" 展开成 "pages behind your own sign-in, read in your own Chrome or with a login you save once, after the agent asks you"。
- [ ] **L5.3** `docs/access.md` 在四种方式之后加一小节 "From the person's side"，四句话：agent 遇到登录墙会问什么；你点什么（Chrome 的 Allow、Octocrawl 页面的 Allow reading these sites）；读完记录里哪三个字段说明以你身份读过；撤销怎么做（关 remote debugging、`octocrawl login remove`）。技术小节不动。
- [ ] **L5.4** `README.md:89-96` 快速开始的 `npx octocrawl serve` 之后加一行同样的话，指向 `docs/access.md`。
- [ ] **L5.5** 博客 `scrape-website-with-login.md` 核对一遍是否和新 hint、新 instructions 的说法一致（它写的是 `--lane my-browser`、`--handoff`、`login import` 三方比较）；改了就按 `blogPosts.test.ts` 更新 `blogPosts.mjs:34` 的 `updatedDate`。
- 验收：
  - `npm run build:public` 通过；`npx vitest run apps/public-web packages/public-preview` 通过。
  - 新文字 grep 不到 `W2L`、`bypass`；每句都有"asks you first"或等义。
  - `limits.md:81`、`acceptable-use.md:10` 不改。
- 部署：只在 Howard 要求时，按 AGENTS.md 的 Public preview deploys（`public:preview:local` 查 CSP，tag revision，`update-traffic`，确认线上 revision，Cloudflare purge，indexnow）。
- 决定：D8。

### L6 真实客户端验证并记录　M

起因：Phase 1 的验收是"agent 第一次撞墙后不看文档就问出那句话"，这只能在真实客户端里看到。

- [ ] **L6.1** 本地 `npx octocrawl serve`（loopback）加 `@octocrawl/mcp`，接 Claude Code。用本地 fixture 的登录墙和 quotes.toscrape.com 的登录页（按 D9）各跑一次：只给 agent URL，不提登录。记录：agent 是否在动用 Chrome 或登录前问了；问的那句话；用户点了几次（Chrome 的 Allow、Allow reading these sites、页面上的点击）；从撞墙到拿到页面几轮；结果里 `access.completion`、`access.route`、`access.sessionApplied` 的值。
- [ ] **L6.2** 登录过期一轮：`octocrawl login remove` 之后再 import 一个已登出的会话（或等它过期），看 agent 对用户说的是不是"去 Chrome 重新登一下"而不是一串命令。
- [ ] **L6.3** 第二个客户端（Cursor 或 Codex）各跑一次 L6.1；跑不了的写 unknown。
- [ ] **L6.4** 记录写到 `research/access/runs/<YYYY-MM-DD>-login-ux-<commit>.md`：命令、commit、客户端版本、是否走代理、每轮 agent 的原话（去掉任何值）、点击次数、结论。记录里不出现 cookie、sessionSha256 以外的会话信息。
- 验收：记录存在；agent 在动用登录态前问了（是/否各写明）；用户的点击次数和轮数是实测数字，不是估计。
- 指标：Phase 1 的完成标准（见下）。
- 决定：D9。

### L7 批量的按站点合并提示　M

起因：时刻 6。batch 的状态有 `waitingForPerson`（`contracts/src/api.ts:752`；`engine.ts:1280-1282`、`:1303`），有 `hand_off_batch`，但 batch 报告没有 `agentHints` 字段（`BatchStatusResponse`，`api.ts:727`；`CrawlReport`，`contracts/src/crawl.ts:252-301`）：只有每一项各自的 hint（`crawl.ts:330`，`engine.ts:3359`）。agent 要自己数有几页撞墙、在哪个站。

- [ ] **L7.1** 给 batch 状态加 `agentHints`（可选字段，REST 只增不改；MCP 的 `get_batch`、`wait_batch` 跟着带出来），在 `engine.ts:1283-1306` 组状态时填（按 D10）。有 N 个 `login_wall` 的项时一句："N pages of <host>[, <host2>] asked for a login (waitingForPerson): ask the person, then either hand_off_batch (they get through in their Chrome, one tab at a time) or batch_scrape those URLs again in mode authed after import_login <host> (or with lane my-browser)"。多于三个 host 只列前三个加 "and K more"。hosted 的版本按 `HintOffers.hosted` 只说本机的路（和 `HOSTED_LOGIN_WALL_HINT` 一致），不点名 `hand_off_batch`、`import_login`。
- [ ] **L7.2** crawl 拒绝 `mode authed` 的消息（`contracts/src/api.ts:2236`："mode authed is not available for crawl: a crawl follows every link, and a sign-out link would end your session in Chrome too; list the pages and send them as a batch in mode authed"）已经说了用 batch；确认它在 MCP 的 `isError` 结果里原样可见。
- 验收：先写失败测试（batch fixture 有两项 `login_wall` 时状态没有 `agentHints`）；改后 N、host 正确，没有 `login_wall` 的 batch 不带这句；hosted 的 batch 状态不提 `hand_off_batch`、`import_login`；`BatchStatusResponse` 的字段表和 SDK 类型同步；CHANGELOG 写一条（新增字段）。
- 决定：D2、D10。

### Phase 1 完成标准

- L1–L5、L7 合入，随一个 0.8.x 发布（D8），CHANGELOG 有条目。
- L6 的记录显示：agent 在动用用户 Chrome 或 saved login 之前问了，问句里有站点名；my-browser 路线用户点击不超过 2 次（Chrome 的 Allow、Allow reading these sites），不含页面本身有 check 时的那一下；从撞墙到拿到页面不超过 3 轮；过期一轮 agent 用白话说。达不到的写出数字和原因，不改标准。
- 第二个客户端有记录或写 unknown。

## Phase 2 · 首次授权成本（改引擎，按 D5 开工）

起因：时刻 3。今天 my-browser 一次连接要点两次（Chrome 的 Allow、Octocrawl 页面的 Allow reading these sites），每次请求都重来，Chrome 退出后不续。这是体验上的分水岭，但按 ROADMAP 当前阶段属于引擎新工作。

- [ ] **A1 按站点记住 Octocrawl 的授权**（按 D4）。用户在 Octocrawl 页面点过 "Allow reading these sites" 的精确 host 记到 `W2L_SESSIONS_FILE` 旁边的一个文件（待定名字，用户可读、仅本人可读，和 `sessions.json` 同样的权限）。同一 host 的下一次请求不再打开 Octocrawl 的页面；Chrome 的 Allow 不受影响。`octocrawl login list` 旁边加列出和撤销（`octocrawl sites list` / `octocrawl sites revoke <host>`，或并进 `login`，待定）。记录：Evidence Record 的 `access` 多一个字段说这次授权是 `remembered`（带授权日期）还是 `clicked`；serve 启动时列出记住的 host 数。安全边界不变：只有用户在 Octocrawl 页面上的一次点击能加入；精确 host，不含子域；撤销立即生效；一个 Allow 仍然不能让调用方读用户登录的其他站点（`docs/access.md:177` 的原则）。
  - 验收：先写失败测试（第二次请求仍打开授权页）；改后同 host 不打开、不同 host 打开、撤销后打开；记录字段正确；`docs/access.md:185-197` 更新。
- [ ] **A2 一条 CDP 连接贯穿 serve 生命周期**。今天每个请求连一次 Chrome，Chrome 每次弹 Allow。改成第一次用时连上，保持到 serve 停止或 Chrome 退出；断了下次用再连（Chrome 再弹一次是对的）。先查：保持连接对 `navigator.webdriver`（本来 remote debugging 开着就为 true）、对 `octocrawl login import` 的并发有没有影响；"Chrome is being controlled by automated test software" 横幅是否因此常驻（`docs/access.md:164` 说 remote debugging 开着就显示）。
  - 验收：同一 serve 内两次 my-browser 请求，Chrome 只弹一次 Allow（真实 Chrome 的 integration 测试，进 TIMED 组）。
- [ ] **A3 Chrome 退出后能续**。my-browser 的 batch 在 Chrome 退出后把余下页面标成 `cancelled`。改成：A1 记住的 host 在 Chrome 回来后自动续读，没记住的按今天的流程再问。每页顶一个 tab 的行为不改（隐藏 tab 会折叠内容，`docs/access.md:192`）。
- [ ] **A4 批量只重跑撞墙的页**。L7 让 agent 知道有 N 页要登录；A4 给一个动作：`hand_off_batch` 已经按项处理 check；加一个 "retry stopped items in mode authed / lane my-browser" 的入口（REST 和 MCP，形状待定），让 agent 不必自己收集 URL 再开一个 batch。
- 决定：D4、D5。

## Phase 3 · ROADMAP 冻结项（只列出）

对应 `ROADMAP.md:485-493` 的 UX 条 (b)(c)(d) 和"hosted 转发到本机 serve"的主体。解冻条件是 ROADMAP 写的那两条，本清单不改它。

- [ ] **H1** hosted 结果撞墙时，用户电脑上的 serve 已连接 → 问过之后自动转到本机读（ROADMAP 的 "asked first"）。
- [ ] **H2** serve 启动时说 hosted 的登录态读取从这台电脑过；dashboard 显示电脑是否连接和上次读取。
- [ ] **H3** Connect MCP 页和 hosted MCP 的 instructions、工具描述说"登录后的页面经你自己的电脑读"；dashboard 引导在第一个 key 之后多一步。
- 决定：D6。

## 指标

| 指标 | 现状（2026-11-07） | Phase 1 目标 | Phase 2 目标 |
| --- | --- | --- | --- |
| 登录墙 hint 提到 my-browser | 0 种服务器配置 | 所有提供它的配置 | — |
| "先问用户"出现的位置 | instructions、3 条参数描述 | 加结果 hint、serve 启动、Connect MCP、README | — |
| 首次启动看到登录态能力 | 0 处 | serve 1 行、CLI help 1 行 | — |
| 用户点击次数（my-browser 单页） | 2 次 / 每次请求 | 2 次 / 每次请求（不变，实测记录） | 同一 host 第二次起 0–1 次 |
| 撞墙到拿到页面的轮数 | 未测（unknown） | 实测，目标 ≤ 3 | — |
| Chrome 退出后 batch 余页 | `cancelled` | — | 记住的 host 自动续 |
| 真实客户端记录 | 0 份 | ≥ 1 份（Claude Code），第二客户端或 unknown | 每项 1 份 |
