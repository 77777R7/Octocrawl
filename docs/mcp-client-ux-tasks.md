# MCP 客户端体验任务清单

依据：2026-10-17 的调研和方案（Howard 要求“让用户更快、体验更友好，特别是客户端这边”），以及 [ROADMAP.md](../ROADMAP.md)、[AGENTS.md](../AGENTS.md)。行号核实基于 `main` 的 `a7f88cc8`，日期 2026-10-17。标“行号待核”的引用来自方案审查，动手前要在当时的 `main` 上再查一次。

起因：同样接进 Cursor、Codex、Claude 后，Firecrawl 的工具一眼能看出分组和用途，Octocrawl 的看不出来。调研的结论是，业界做“分类”不靠改工具名，靠四样东西：`instructions`（连接时告诉模型有哪些工具组、怎么配合）、`title`（给人看的名字）、`annotations`（只读还是会改东西，客户端据此分组和决定是否弹确认）、工具集开关（只开需要的组）。这四样 Octocrawl 现在基本都没有。另外，工具定义体积很大，出错时 agent 拿不到下一步提示，长任务没有有界等待。登录（OAuth）已经能用，不在本清单范围内。

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 待 Howard 决定

每条标出影响的任务。没决定的，按“默认”一栏先做，或者先做不受影响的部分。

**2026-10-17 Howard：D1–D15 先按下表的默认值走。** 之后改了哪一条，就在该行注明日期和新的决定。

| # | 问题 | 影响 | 默认（未否决前按此） |
| --- | --- | --- | --- |
| D1 | 排期：本周做 W1–W4；W5+W6 合并成一次 hosted 部署；W7–W10 等外部试用的发现处理完再开始。是否同意？ | 全部 | 同意 |
| D2 | 哪个窗口做：W1 改的是 `apps/public-web`（UI 窗口负责的范围）。W1 在 UI 窗口做，还是按“小 follow-up 在当前窗口做”的规则在这里做？`packages/mcp` 的改动由这个窗口做吗？ | W1、全部 | W1 在这里做，开新分支 |
| D3 | 本地 `scrape` 如实标成非只读（它的 actions 和 mode authed 会以本人身份操作页面）。这样在 W10 之前，Codex auto 和 VS Code 里每次本地 scrape 都会弹确认，是否接受？ | W4 | 接受 |
| D4 | 执行错误从“抛 JSON-RPC 错误”改成“返回 `isError` 结果”。这对用程序调用的人是行为变更，是否接受？跟哪个版本发布？ | W5 | 接受，随 0.6.0 |
| D5 | Connect 页继续 keyless `/mcp` 在前（ROADMAP PH item 4 的现行写法），还是改成 `/mcp-oauth` 在前？后者要改 ROADMAP。 | W1 | keyless 在前 |
| D6 | hosted keyless 的 instructions 能不能写出“每日额度”和“登录后消耗 credits”？只作为事实性限制写，不写成推广。 | W3 | 能 |
| D7 | UTM：`serverInfo`、server card、`server.json` 的 `websiteUrl` 保留 UTM（只是列表元数据，不进模型）还是去掉？模型能读到的提示里的 UTM 要不要去掉（只在 MCP 渲染时去，REST 不变）？ | W3、W5 | 元数据保留；模型可见的文字去掉 |
| D8 | 本地 stdio 指向 `https://api.octocrawl.dev` 时，要不要自动换成 hosted 工具集（行为变更）？还是只在 instructions 里用条件句提醒？ | W3、W10 | 只写条件句 |
| D9 | hosted MCP scrape 的超时上限（建议 100 s，只限 MCP，REST 不变）。hosted 的 `mode authed`：只从 schema 里去掉，还是同时在引擎里加显式拒绝？W5+W6 什么时候部署（可能有试用用户正连着）？ | W6 | 100 s；只从 schema 去掉；在两次试用会话之间部署 |
| D10 | 为了让 crawl 和 batch_scrape 降到 Codex 的 5,000 字节以下，要不要采用方案 (a)：把它们宣告的 formats 和 verify 结构放宽成宽松类型，校验仍在服务器端做？体积预算从第一个 PR 起就让 CI 失败，还是先只警告？ | W7 | 不采用 (a)；首次削减合入前只警告 |
| D11 | 结果内容上限定多少（按 W2 实测，在 5 万到 8 万字符之间选）？`get_scrape` 不受上限，还是改分页？本机截图的 base64 立即去掉，还是先弃用一个版本？要不要加 `summary` 字段，只在 MCP 里还是也进 REST/SDK 的 compact 契约？hosted 副本带哪些 outputSchema？ | W8 | 按实测取值；`get_scrape` 不受上限；先弃用一个版本；summary 暂不加 |
| D12 | MCP 层 crawl 的 `maxPages` 缺省时用多少（100，与 hosted 模式一致；或 10）？MCP scrape 默认超时（建议 120 s，REST 仍是 300 s）？`wait_crawl` 和 `wait_batch` 的统一上限（120,000 或 300,000 ms）？ | W9 | 100；120 s；120,000 |
| D13 | 本地默认工具集：保持 `all`（兼容），还是改成精简的 `core,crawl,batch`、其余需要显式开启？如果改，从哪个版本开始？ | W10 | 保持 `all` |
| D14 | ~~`@modelcontextprotocol/sdk` 的下限从 `^1.25.2` 提高~~。2026-10-17 W3 查过 1.25.2 的 tarball：`ImplementationSchema` 已经有 title、description、websiteUrl 和 icons，`Server` 也已经接受 `instructions`，**不用提高下限**。 | W3 | 不需要 |
| D15 | 分发：octocrawl.dev 的浅色和深色 PNG 图标是否批准？Connect 页按 #543 的“只列编码 agent”规则要不要加 VS Code？要不要发 Claude plugin skill？W4、W5 之后要不要申请进 Anthropic Directory 或 ChatGPT 上架？ | W3、W1 | 先不做，等 W4、W5 合入后再问 |

## 定下的方向（来自调研）

1. **不改工具名，不加前缀。** 原因：
   - 规范把同名冲突交给客户端处理，Claude Code、Codex 和 Gemini CLI 都会自己加服务器名，比如 `mcp__octocrawl__scrape`。
   - Cursor 对“服务器名 + 工具名”有 60 字符的上限，前缀会占掉长度。
   - 改名会弄坏已发布的包（`@octocrawl/mcp`、`@octocrawl/ai-sdk`、MCP Registry 里的 `server.json`）。
   - 现有的动词开头的名字配合 `mcp__octocrawl__get_*` 这类通配规则正好能用。
   - 可读的名字交给 `title`（W4）。分组交给 instructions（W3）和工具集（W10）。
2. **只改呈现层。** 不加新功能。hosted crawl、batch、Monitor、search、extract、浏览器 actions 留在 ROADMAP 后面的阶段（PH 第 2 阶段、P5）。
3. **先测量，再优化（W2）。** 没测过的客户端效果，比如“加了 annotations 就少弹确认”，在 eval 记录证明之前不对外宣称。
4. **登录不动。** OAuth 已经满足 CIMD、PKCE 和 `resource` 参数（`packages/public-preview/src/oauth.ts`，行号待核：833-836）。取消请求在 MCP 层也已经接好（`packages/mcp/src/inFlight.ts` 的 `trackPost`，`server.ts:41-55`）。

## 行业标准答案（调研结论，已经过对抗核查）

强度：spec-required（规范 MUST）> spec-recommended（规范 SHOULD）> vendor-required（目录或平台审核要求）> widely-adopted（多家在用）> emerging（少数在用）。完整的来源和核查记录放在会话的 scratchpad 里（`research.json`、`plan.json`），没有入库。

| # | 做法 | 强度 | Octocrawl 现状 | 任务 |
| --- | --- | --- | --- | --- |
| S1 | 发 `instructions`：讲清做什么、哪类任务用哪个工具、长任务怎么走、结果怎么读；不重复工具描述；用条件句，让工具子集变化时文字仍然成立。目标 1–2k 字符，Claude Code 在 4,096 处截断 | widely-adopted | 没有 | W3 |
| S2/S3 | 每个工具都有通俗的 `title`（顶层和 `annotations.title` 同一个值），四个 hint 都显式写，而且如实 | vendor-required | 38 个中只有 3 个有 annotations，没有工具有顶层 title | W4 |
| S4 | 读和写分成不同工具，不用一个参数切换安全和不安全的操作 | vendor-required | 满足 | — |
| S5/S32 | 单个 inputSchema 尽量不超过约 5,000 字节（超过后 Codex 会删掉属性说明），整个列表要小；长篇用法放到 instructions 或文档里 | widely-adopted | 本地 77,608 字符；scrape、crawl、batch_scrape 各 1.8–2 万 | W2、W7 |
| S6 | 每个端点只列出它真正接受的选项 | emerging | hosted 列出了约 5.8k 字符会被拒绝的选项 | W6 |
| S7/S8 | 描述的第一句说清对象和返回；描述和提示只写事实，不引导去其他产品，不放 URL | widely-adopted / vendor-required | 有些描述只是重复工具名；`wait_batch` 的描述指向 REST 和 SDK | W7 |
| S9/S22 | 名字合法、短、稳定；`tools/list` 的顺序固定，通用的在前 | spec-recommended | 名字满足；小众的 `scrape_product` 排在最前 | W4 |
| S10/S11 | 执行失败以 `isError: true` 的结果返回：第一行写错误码和修复办法，下面逐行写提示；未知工具名和取消仍用协议错误 | spec-recommended | 所有失败都抛 -32603，`agentHints` 被丢掉 | W5 |
| S16/S17 | 结果需要被解析的工具，声明宽松的 `outputSchema`；`structuredContent` 和 text 放同样的完整 JSON（Cursor 的模型只读 text，Codex 只读 structuredContent） | spec-recommended / emerging | 只有 map 有 outputSchema | W8 |
| S12/S13 | 结果要放得进客户端的预算（Claude Code 超过 1 万 token 警告、2.5 万封顶，超过 5 万字符的文本存成文件）；如实截断；二进制按 image block 或引用发 | widely-adopted | 正文没有上限；`truncatedAt` 从来不填；截图以 base64 放在 JSON 里 | W8 |
| S18/S19/S26 | 长任务：start 返回句柄，加一个约 30 s 的有界等待，超时返回当前状态；同步等待控制在 200 s 以内（claude.ai 240 s 就停）；无界任务要有安全默认值；能送达时发进度 | widely-adopted / emerging | `wait_batch` 做得好；crawl 没有对应的等待；本地 crawl 默认不限页数 | W9 |
| S23/S24 | 工具集只随授权或启动配置变化；提供工具集开关和只读模式 | spec-required / widely-adopted | hosted 按授权区分，满足；本地永远列 38 个 | W10 |
| S34 | 在 CI 里用 JSON Schema draft 2020-12 校验每个 schema；属性名合法；根层级不用组合关键字 | widely-adopted | 没有 | W2 |
| S27/S30 | 补齐身份元数据（title、description、websiteUrl、图标）；每个客户端都有一步安装；写的验证步骤和用户实际看到的一致 | widely-adopted | `serverInfo` 只有 name 和 version；Connect 页说错了工具数 | W1、W3 |

## 现状（在 `a7f88cc8` 上查到的）

- `packages/mcp/src/server.ts`：
  - `:23` `MCP_VERSION = '0.5.0'`，是硬编码的。
  - `:37` `new Server({ name: 'octocrawl', version: MCP_VERSION }, { capabilities: { tools: {} } })`，没有 instructions，也没有 title。
  - `:49` 不在 allowedTools 里的工具会抛 `'tool not available in this deployment'`。
  - `:56` 所有错误都 `throw … withErrorCode(error)`，取消只看 `call?.signal`。
  - `:58-61` 声明了 outputSchema 的工具，会把同样的 JSON 同时放进 text 和 structuredContent。
- `packages/mcp/src/tools.ts`：
  - `:13` `TOOL_NAMES` 以 `scrape_product`、`batch_products` 开头。
  - 只有 `:228`（scrape_product）、`:241`（scrape，只有 openWorldHint）、`:276`（map）带了 annotations。
  - `:326-327` crawl 的 `maxPages`、`maxDepth` 类型是 `['number','null']`，没有说明。
  - `:455` batch 系列的描述是模板文字；`wait_batch` 那句指向 REST 和 SDK。
  - `:649` `wait_batch` 的 `timeoutMs` 上限是 300,000。
- `packages/mcp/src/hostedApi.ts`：
  - `:173-176` `hostedTools()` 直接复用本地 inputSchema，只改了描述，并强制 `readOnlyHint: true`。
  - `:183` `oauthTools()` 用 `_meta: { securitySchemes }` **整体替换**了 `_meta`。
- `packages/api/src/engine.ts:784-791`：`checkHostedOptions` 在 hosted 模式下拒绝 `skipTlsVerification`、`actions` 和正则类 verify 检查。其他的 hosted 拒绝逻辑（行号待核）：
  - `:571-592` savedLogins 为 null、egress、installed_chrome；
  - `:1204`、`:1213` handoff 和 lane my-browser；
  - `:911` fastMode 下的截图。
- `packages/mcp/src/hostedToolPolicy.ts` 是 `host.ts`（WorkOS 试点，没有部署过）的策略，**不是**线上 hosted 的策略。不要从它推导 hosted 的允许列表。
- `apps/public-web/scripts/build-docs.mjs`：
  - `:142` Claude Code keyless 的验证句写着 `/mcp lists scrape, map and scrape_product`；
  - `:150` Cursor keyless 的验证句写着 three tools。
  - 两处都和 keyless 实际只列 2 个工具不符。
- `apps/public-web/content/connect-mcp.md:35-57`：`/mcp-oauth` 小节只有 Claude Code 和 Cursor，没有 Codex。
- `docs/hosted-api.md:16` 还写着“any other `/.well-known` file is 404 … finds none”，没提 `/mcp-oauth` 的 Protected Resource Metadata。
- `packages/mcp/package.json:23` `@modelcontextprotocol/sdk` 是 `^1.25.2`。仓库里装的是 1.30.0，最高支持协议 2025-11-25。
- 0.5.0 已在 2026-10-17 发布（#549）。PH item 6 已验收（#544、#545）。

## 基线（实测，2026-10-17）

- **本地 tools/list**：38 个工具，77,608 字符（约 22k tokens）。
  - 紧凑 inputSchema 字节：batch_scrape 19,945，scrape 18,247，crawl 17,745。
  - 去掉所有描述后的结构字节（审查时用临时测试测的，W2 要复测）：scrape 5,985，crawl 5,508，batch_scrape 6,792。
- **hosted keyless tools/list**：2 个工具，24,395 字符。
- **覆盖率**：annotations 3/38，outputSchema 1/38，instructions 0 字符。
- **Firecrawl keyless**（firecrawl-fastmcp 3.30.2）：3 个工具，26,448 字符；每个工具都有 title、annotations 和 outputSchema；instructions 1,408 字符。
- **结果大小**：未测，算未知，不当作 0。

## 总原则

- **流程**：
  - 每个任务一个分支、一个 PR，从当时的 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree。
  - commit 用 `-s` 签名，conventional 格式。PR 开好后打开 Auto-fix。
- **先复现**：每项都先写一个在 `main` 上失败的测试，再改代码。
- **兼容**：
  - 工具名一律不改。
  - 结果形状和导出的 `callTool` 默认不变；要变的，在 CHANGELOG 的 Unreleased 下写一条，并写进 PR 描述。
  - REST 契约和 Firecrawl 兼容层（冻结在 firecrawl-js v4.42.0）都不动。
- **范围**：
  - 只改 `packages/mcp` 的呈现层，外加 W1 的文档。
  - `host.ts`（WorkOS 试点）不接任何新东西，测试里明确排除它。
  - Monitor 和 delivery 保持原生形态，不做成 ROADMAP Paused 表里那种 Firecrawl 形状的 Monitor MCP 接口。
- **两条发布轨道**：
  - **hosted 部署**：只在 Howard 要求时做。先部署不接流量的 revision 并在 tag 地址上冒烟测试；main CI 通过后 `update-traffic`；确认线上 revision；保留上一个 tag 作为回滚。
  - **npm 和 registry 发布**：打 tag，走 Release workflow（Howard 要批准两次），`server.json` 和 `MCP_VERSION` 一起升版本。
- **建议的版本节奏**（待 D1、D4 确认）：
  - W3+W4 是增量改动，发 0.5.1；
  - W5 是 `isError` 行为变更，发 0.6.0，W6 在 hosted 上随它一起部署；
  - W7–W10 之后发 0.6.x 或 0.7.0。
- **证据诚实**：
  - 客户端侧的效果，要在真实客户端里跑过才写“改善了”；没跑的写 unknown。
  - 每次真实客户端运行都在 `research/` 下写一份带日期的记录，写明命令、commit、客户端版本、是否走代理。
- **检查**：每个 PR 都要跑 `npm run typecheck` 和 `npm test`（跑测试前 unset 代理），并把结果写进 PR。

## W1 Connect 页事实修正（keyless 仍在最前）　S　→ PR #555

起因：今天不登录的新用户被告知会看到三个工具，实际只有两个，容易以为自己装错了。这是外部试用之前唯一直接帮到非作者用户的改动。服务：外部试用门槛、PH item 4。

- [x] **W1.1** `apps/public-web/scripts/build-docs.mjs:142`：Claude Code keyless 的验证句改成 `/mcp lists scrape and map`，并注明 `scrape_product` 只列给带浏览器通道的 key 和登录用户。
- [x] **W1.2** `build-docs.mjs:150`：Cursor keyless 的验证句把 "three tools" 改成 `scrape and map`。
- [x] **W1.3** `apps/public-web/content/connect-mcp.md` 的 `/mcp-oauth` 小节（:35-57）补上 Codex 的接法（`codex mcp add … --url https://mcp.octocrawl.dev/mcp-oauth`，具体命令先查 Codex 文档）。状态写成“Howard 报告可用，尚无带日期的记录”，有了 `research/hosted/` 的记录再改成 Checked <date>。
  - 做了：命令是 `codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp-oauth` 加上 `codex mcp login octocrawl`（codex-cli 0.162.1 的 `codex mcp --help` 里有 `login`、`logout` 两个子命令）。页面上标的是 “Reported working; not checked here yet”。2026-10-16 核查那句话改成只点名 Claude Code 和 Cursor。
- [x] **W1.4** `docs/hosted-api.md:16`：删掉“找不到 OAuth metadata”的说法，写明 `/.well-known/oauth-protected-resource/mcp-oauth` 存在；在表格里加上 `/mcp-oauth`。
- [x] **W1.5** 保持 keyless 在前、key 作为升级（D5）。页面结构不变，不新增文档。
- [x] **W1.6**（做的时候发现的）博客 `apps/public-web/content/blog/claude-code-web-scraping.md:17` 也写着“three tools”，改成：没有 key 时列出两个，带浏览器通道的 key 再加 `scrape_product`。按 `blogPosts.test.ts` 的要求，`updatedDate` 改成 2026-10-17。CHANGELOG 里 0.3.x 那条写着 “the three tools” 的条目是过去的发布记录，不改。
- 验收：
  - `apps/public-web` 构建和测试通过；
  - `grep` 确认 keyless 验证句里没有 `three tools` 和 `scrape_product`；
  - 每条 keyless 验证句和 `research/hosted/2026-10-13-mcp-clients.md` 里该客户端实际列出的工具一致；
  - `docs/hosted-api.md` 提到了 `/mcp-oauth` 和它的 PRM。
- 结果（PR #555）：`npm run build:public` 通过；`dist` 里剩下的 “three tools” 只有基准测试那句和过去的 CHANGELOG 条目。`npx vitest run apps/public-web packages/public-preview` 跑了 34 个文件、334 个测试，全部通过（跑前 unset 了代理）。站点还没部署。
- 部署（只在 Howard 要求时）：先用 `public:preview:local`（8798）检查 CSP；然后部署带 tag 的 revision、`update-traffic`、确认线上 revision；最后做 Cloudflare purge 和 indexnow。
- 指标：错误的验证句 2 → 0。
- 决定：D2、D5。

## W2 工具面预算与合法性测试（先测量）　M　→ PR #557

起因：后面每一项都要有固定的基线和防回归保护。结构字节决定 5,000 字节的目标能不能达到。结果大小没测过。只加测试和根目录的 devDependency，不改任何已发布行为。

- [x] **W2.1** 新增 `packages/mcp/test/toolSurface.test.ts`，覆盖这些面：本地 `TOOLS`（stdio 和 `localHost.ts` 8791 共用）、`hostedTools(false)`、`hostedTools(true)`、`oauthTools(false)`、`oauthTools(true)`。`host.ts` 的 `REMOTE_TOOLS` 明确排除，并在测试里注释原因。
- [x] **W2.2** 每个工具分列计量：inputSchema 紧凑字节；去掉所有 description 后的结构字节；description 字符数；title、annotations 和 `_meta` 的字节；outputSchema 字节。只有 inputSchema 字节和 description 字符做“只降不升”的 ratchet；其他列只测量，预算由 W4、W8 各自设定。
- [x] **W2.3** `_meta` 保留检查：每个本地工具的 `_meta` 键，在 `hostedTools` 和 `oauthTools` 上都还在。今天是空检查，W4 起生效。
- [x] **W2.4** schema 合法性：用 ajv 的 draft 2020-12 meta-schema 校验每个 input 和 output schema。顶层属性名要符合 `^[A-Za-z0-9_.-]{1,64}$`，根层级不用 `anyOf`、`oneOf`、`allOf`。ajv 加到根 `package.json` 的 devDependencies 并更新 lockfile，因为 `@w2l/mcp` 没有自己的 devDependencies。不通过的用 `test.todo` 点名，并登记成 follow-up。
- [x] **W2.5** 结果大小：
  - 扩展 `fixture-scrape.test.ts`，记录 scrape 和 map 序列化结果的字符数；
  - 新增 `fixture-jobs.test.ts`，用进程内引擎、HTTP 档做离线 crawl 和 batch，记录 `get_crawl_pages` 和 `get_batch_items` 的大小；
  - 需要浏览器档的截图 fixture 放进 `vitest.config.ts` 的 TIMED 组。
- [x] **W2.6** 记下已知差异：stdio 指向 `https://api.octocrawl.dev` 时列出 38 个工具，而那个地址只服务 scrape 和 map。留给 W3 和 W10 处理。
- 验收：
  - `npm test` 离线通过，`npm run typecheck` 通过。
  - 测试打印每个面的表格，数值在构建差异范围内和基线一致（本地约 77,608；hosted keyless 约 24,395；scrape、crawl、batch_scrape 的紧凑字节和结构字节；annotations 3/38；outputSchema 1/38）。
  - 新的 crawl 和 batch fixture 不放进 TIMED 组也能稳定跑。
- 指标：结构字节和结果大小从“未知”变成“已测”。
- 结果（PR #557，src 在 `a7f88cc8`）：
  - `toolSurface.budget.json` 固定了 5 个面上每个工具的 inputSchema 字节和描述字符；是精确匹配，涨了会失败，降了要连预算文件一起改。
  - 实测：
    - 本地 38 个工具 77,608 字符；hosted keyless 24,337（线上 24,395 来自旧构建）；hosted key 24,721。
    - inputSchema 字节 / 结构字节：scrape 18,247 / 5,985，crawl 17,745 / 5,508，batch_scrape 19,945 / 6,792，map 3,253 / 867。审查时测的结构字节得到确认。
  - 结果大小（compact，夹具站点，含计时字段，每次略有出入）：
    - scrape 4,909；map 519；
    - get_crawl（4 页）450；get_crawl_pages（4 页）19,282，约每页 4.8k，所以 200 页上限可能接近 100 万字符；
    - wait_batch（3 个 URL）386；get_batch_items（3 项）14,585；
    - 带视口截图的 scrape 119,895，其中 base64 114,836。
  - 所有 schema 都通过了 draft 2020-12 meta 校验，没有需要 `test.todo` 的。
  - 截图测试按 `*.integration.test.ts` 自动进 TIMED 组，`vitest.config.ts` 没改。
  - 检查：`npm run typecheck` 通过；`npm test` 跑了 251 个文件、3020 个测试，全部通过，另有 1 个 todo。
- 决定：无。

## W3 按面生成的 instructions 与身份信息　S　→ PR #558

起因：在 tool search 下（Claude Code 和 Cursor 默认开启，Codex 把 instructions 当作命名空间描述），模型一开始只看到工具名和 instructions。这是提高“第一次就选对工具”最便宜的办法，也能在不占 schema 字节的前提下让 Octocrawl 的长处被看见。

- [x] **W3.1** 新增 `packages/mcp/src/instructions.ts`，根据实际列出的工具名生成文字：工具在场就写对应的句子，不在场就用条件句。内容包括：
  - Octocrawl 是什么：把页面转成 Markdown，并附 Evidence Record；被拦截、空页、错页都会如实报告。
  - 路由：单个 URL 用 scrape；站点 URL 用 map；已知列表用 batch_scrape，再 wait_batch，再 get_batch_items；子树用 crawl，再 get_crawl 或 get_crawl_pages（W9 之后加 wait_crawl）；Amazon.sg 用 scrape_product。
  - 怎么读结果：`status`、`verification.status`、`readiness` 三者的区别；`agentHints` 是下一步；`isError` 表示调用没有执行。
  - 长任务：会返回句柄；用同一个 `idempotencyKey` 重试是安全的。
  - 需要本人参与的抓取方式：先征得本人同意，并说出站点名。
  - 两条速度事实：`fastMode` 只走 HTTP；`waitFor > 0` 直接从浏览器档开始。
  - 本面的限制：hosted keyless 只走 HTTP、有每日额度；登录后消耗 credits（D6）；crawl、batch 和 Monitor 在本地运行（只写事实，与 PH item 1 一致，不带 URL）。
  - 一句条件句：base URL 是 hosted Octocrawl 时，只有 scrape 和 map 能用（D8）。
- [x] **W3.2** 接线：新增 `McpServerOptions.instructions`，传进 `server.ts:37` 的 `new Server(...)`；`stdio.ts`、`localHost.ts`、`hostedApi.ts`（`/mcp` 和 `/mcp-oauth`）都接上。`host.ts` 不改。
- [x] **W3.3** 身份信息：`serverInfo` 加 title `Octocrawl`、description 和 websiteUrl（UTM 按 D7）。`serverInfo`、`hostedServerCard`（hostedApi.ts，行号待核：约 196）和 `server.json` 在同一个 PR 里对齐。
- [x] **W3.4** 版本：查 SDK changelog，确认 `Implementation` 类型从哪个版本开始有 title 和 description，按 D14 提高 `packages/mcp/package.json` 的下限。再加一个测试：`MCP_VERSION` 等于 `packages/mcp/package.json` 的 version。
- [x] **W3.5** 在 CHANGELOG 的 Unreleased 下写一条。
- 验收：
  - 先写失败测试：stdio 和 hosted keyless、OAuth 的 initialize 都没有 instructions。
  - 改完后，用 InMemoryTransport 在 stdio（全量）、localHost、hosted keyless、hosted OAuth 上各做一次 initialize，检查：
    - instructions 不超过 2,000 字符，超过 4,096 直接失败；
    - 无条件提到的工具名都在该面的 tools/list 里；
    - 不匹配 `/https?:\/\//`，不含 `utm_`；
    - `serverInfo.title === 'Octocrawl'`；
    - 版本号一致。
  - hosted 部署后（Howard 要求时）做一次线上 initialize，记录 revision 和是否走代理。
- 指标：4 个面的 instructions 0 → 1,000–2,000 字符；serverInfo 字段 2 → 4–5 个。
- 决定：D6、D7、D8、D14。
- 结果（PR #558）：
  - 新增 `packages/mcp/src/instructions.ts`。`createMcpServer` 默认按列出的工具生成本地版；`hostedApi.ts` 按调用方传入 hosted 版（keyless、key、`/mcp-oauth`）。stdio 和 8791 不用改代码。
  - 长度：本地 1,591 字符，hosted keyless 1,136，OAuth 1,173。都不含 URL 或 `utm_`。
  - D6 按默认：写了每日额度和 credits。D7 按默认：`serverInfo` 的 websiteUrl 保留 UTM。D8 按默认：只写一句条件句，并且只在 scrape 和 map 都列出时才写。
  - 身份信息：`SERVER_IDENTITY` 统一管 name、title、description。server card 共用这三项；`server.json` 加了 `title`，用官方 2025-12-11 schema 校验过一次。测试保证它们和 `MCP_VERSION`、package version 一致。
  - 审查发现两处事实错误，已修并补了测试：
    - Claude 出口地址的 keyless 是所有 Claude 连接器共享的额度，不是按地址算；
    - “报错就是没执行”这句不对：start 在客户端超时后，任务可能已经开始，所以改成提醒用同一个 `idempotencyKey` 重发。
  - `host.ts` 试点现在也会拿到默认的本地文案（其中提到了它限制掉的抓取方式）。它没有部署，没有人连着，不处理。
  - 检查：`npm run typecheck` 通过。`npm test` 3019 个全部通过（这次是在审查修复之前跑的）；修复之后跑了 `packages/mcp` 和 `apps/public-web`，31 个文件、280 个测试，全部通过。还没部署，也没发版。

## W4 title、如实的 annotations、工具顺序与 `_meta` 合并　S　→ PR #559

起因：没有 hint 的工具会被客户端当作破坏性写操作（规范默认值），所以 Codex auto 和 VS Code 里每次 `get_batch` 都要确认。title 是工具卡片上显示的名字，也是进 Directory 和 ChatGPT 的前提。

- [x] **W4.1** 在 `tools.ts` 里加一张表，每个工具一行：title、readOnlyHint、destructiveHint、idempotentHint、openWorldHint。顶层 `Tool.title` 和 `annotations.title` 都从这张表取值。
  - **只读**：map、scrape_product、get_scrape、crawl 和 batch 的读工具、wait_batch、list_logins、preview_monitor，以及 Monitor 和 delivery 的读工具。会访问外部网页的（map、scrape_product、preview_monitor）设 `openWorldHint: true`；只读 Octocrawl 自己存储的设 `openWorldHint: false`。
  - **start 和 create**：`readOnlyHint: false`、`destructiveHint: false`，不声明 idempotentHint，因为只有带 `idempotencyKey` 时重复 start 才安全。
  - **`destructiveHint: true`**：cancel_crawl、cancel_batch、cancel_monitor_run、remove_login、pause_monitor（它会取消正在执行的任务）。pause_delivery_destination 要先读引擎代码，确认它会停止进行中的工作再设。
  - **本地 scrape**：`readOnlyHint: false`、`destructiveHint: false`、`openWorldHint: true`（D3）。hosted 副本保持 `readOnlyHint: true`。
- [x] **W4.2** 顺序：`TOOLS` 改成通用的在前：scrape、map、get_scrape、crawl 系列、batch 系列，然后 scrape_product、batch_products、logins、Monitor、delivery。hosted 的顺序随之变成 scrape、map、scrape_product。
- [x] **W4.3** `_meta`：import_login 加 `anthropic/requiresUserInteraction: true`。hosted 的三个工具加 `openai/toolInvocation/invoking` 和 `invoked`，每条不超过 64 字符。
- [x] **W4.4** 修 `hostedApi.ts:183`：`_meta` 改成合并 `{ ...('_meta' in tool ? tool._meta : {}), securitySchemes }`，不再整体替换。
- [x] **W4.5** 在 CHANGELOG 的 Unreleased 下写一条：`@octocrawl/mcp` 导出的 `TOOLS`、`TOOL_NAMES` 的顺序和字段变了。
- 验收：
  - 先写表驱动测试，它在 main 上会失败（35/38 个工具没有 hint）。
  - 需要同步更新的现有测试（行号待核）：
    - `tools.test.ts:16-17`（顺序）；
    - `:720-722`（scrape 的 readOnlyHint 改成断言 `toBe(false)`）；
    - `:729`（map 的 annotations）；
    - `hostedApi.test.ts:572`（hosted 顺序）。
  - 改完后在所有面上检查：
    - `Tool.title === annotations.title`；
    - 每个 hint 都是显式的布尔值；
    - 没有 `readOnlyHint && destructiveHint`；
    - 只读集合和表一致；
    - hosted scrape 只读、本地 scrape 不是；
    - `TOOL_NAMES[0] === 'scrape'`；
    - W2.3 的检查通过；
    - `tools.test.ts:596-607`（禁止 `/oauth|subscribe|resource/i`）仍然通过；
    - invoking 和 invoked 不超过 64 字符。
  - 做一次交互式 Codex auto 会话，记录 get_batch 和 map 不弹确认、cancel_batch 弹确认。
- 指标：title 0/38 → 38/38；显式 hint 3/38 → 38/38；标成只读的读工具 2 → 约 19 个（以表为准）；确认弹窗次数在 eval 里测量。
- 决定：D3。
- 结果（PR #559）：
  - `tools.ts` 里加了一张 `PRESENTATION` 表，类型是 `Record<ToolName, …>`，漏了哪个工具编译都会报错。`TOOLS` 改成从 `TOOL_NAMES` 按新顺序生成，原有定义原样留在 `DEFINITIONS` 里。
  - 只读的有 19 个。
  - destructive：比计划多了 `import_login`。审查时发现，导入会替换同一域名下已经保存的登录（`FileSessionStore.save`），而且撤销不了。
  - `pause_delivery_destination` 不标 destructive：它只改 `enabled` 字段（`setDeliveryDestinationEnabled`），不会中断正在进行的投递。
  - D3 按默认：本地 scrape 标为非只读。
  - `/mcp-oauth` 的 `_meta` 改成合并，不再整体覆盖。
  - 合并 main（含 #554，SDK 升到 v2）时，只有 CHANGELOG 冲突。#554 新加的 2026-07-28 测试，顺序断言改成了新顺序。
  - 检查：`npm run typecheck` 通过；`npm test` 跑了 3022 个测试，全部通过。
  - 确认弹窗的实际效果（Codex auto 下 get_batch 不再弹、cancel_batch 仍然弹）还没在交互会话里验证，等 E2。

## W5 执行错误改成 `isError`（追平 Firecrawl，并带上 agentHints）　M　→ PR #560

起因：今天 agent 拿到的是 -32603 加一串转义 JSON，或者什么都没拿到，丢掉了能让它自己改正调用的 `agentHints`。本地第一次运行最可能遇到的失败（API 没启动）表现为一个原始的 fetch 错误。Firecrawl 已经返回 `isError` 和部分下一步，所以这一项首先是追平。

- [x] **W5.1** 在 `server.ts` 里把 `throw withErrorCode(error)` 换成 `toolError(error)`。以下情况**不走** isError：
  - 如果 `extra.signal.aborted || call?.signal.aborted`，仍然抛 `requestCancelled()`。stdio 上 `call` 是 undefined，只有 `extra.signal`，所以要补上这个判断。
  - 未知工具名（tools.ts 里抛出的 `unknown tool`，行号待核：约 661、771）和 allowedTools 之外的工具，仍然是协议错误。
  - hosted crawl 也保持协议错误，但要让消息说出可用的工具和本地路径：让 `normalizeCall` 的引导消息排在 `server.ts:49` 的通用消息前面，或者把引导文字放进抛出的错误里。
- [x] **W5.2** 其余执行错误都返回 `{ isError: true, content: [{ type: 'text', text }] }`，不带 structuredContent，`_meta['octocrawl/error']` 放 `{code, status}`。text 的格式：
  - 第一行是 `<code>: <一行修复办法或消息>`；
  - 知道 `retryAfterMs` 时加一行 `Retry after N s`；
  - 每条 agentHint 一行 `Next: ...`；
  - 总长不超过 4,000 字符。
- [x] **W5.3** 提示从 `RequestError.agentHints` 和 `W2LError` 里取。解析 `W2LError` 的 body，不再用 `<METHOD> <path> failed: <status> {json}` 这种拼起来的字符串。
- [x] **W5.4** 本地 API 连不上（`ECONNREFUSED` 或 `fetch failed`）时映射成 `api_unreachable: no Octocrawl API at <url>; start it with npx octocrawl serve, or set W2L_API_URL`。`stdio.ts` 启动时如果 API 连不上，往 stderr 打一次同样的话。
- [x] **W5.5** 未知或已被清理的 id（`TaskNotFoundError`）映射成 `not_found: …; start a new crawl/batch`。
- [x] **W5.6** 渲染只在 `server.ts` 里做。导出的 `callTool` 行为不变，仍然抛错；tools.ts 里对 429 的改写（行号待核：约 492-503）留在 `callTool` 里，由渲染器去解析。
- [x] **W5.7** “在本地运行”这类事实性提示保留（PH item 1）。`LOCAL_HINT` 和 `HTTP_ONLY_HINTS` 这两个共享常量不改，因为 REST 也在用。UTM 按 D7 只在 MCP 渲染时处理。
- [ ] **W5.8**（挪到 W9.2，那里本来就要写这句；本地 scrape 和 map 的记录没有保留期限） 保留期说明：本地只写从 engine.ts 读到的事实（scrape 和 map 的记录没有保留期限，行号待核：约 807、815）；crawl 和 batch 的保留期实现时从引擎里读，读不到就写“未核实”。hosted 不写，因为 hosted 不提供句柄类工具。
- [x] **W5.9** 在 CHANGELOG 的 Unreleased 下写清这个行为变更（D4）。
- 验收：
  - 先写失败测试，复现 2026-10-17 的线上探测：hosted 带 actions 的 scrape 返回 -32603 加转义 JSON；hosted crawl 返回 `tool not available in this deployment`。
  - 改完后，以下 5 类执行错误都返回 `isError: true`：
    - 本地解析器拒绝；
    - hosted 引擎拒绝（比如 skipTlsVerification）；
    - 带 Retry-After 的 429；
    - 关闭的端口上 ECONNREFUSED；
    - 未知的 batch id。
  - 这 5 类的共同要求：第一行匹配 `/^[a-z_]+: /`；不含 `{"error"`；每条 agentHint 都变成一行 `Next:`；没有 structuredContent；不超过 4,000 字符。
  - 其他检查：
    - hosted crawl 仍是 JSON-RPC 错误，但消息说出可用工具和本地路径；
    - 未知工具名仍是协议错误；
    - 新加 stdio 取消测试，结果是协议取消而不是 isError；
    - `httpCancellation.test.ts` 不改就能通过；
    - REST 的 agentHints 快照不变。
  - 需要同步更新的现有断言（行号待核）：
    - `host.test.ts:52-58`；
    - `tools.test.ts:382-383,584-590,758-760`；
    - `hostedApi.test.ts:153,185,189`；
    - `hostedApi.test.ts:184` 仍是协议错误，改成断言新的消息。
  - W8 合入后，在 Cursor 里对带 outputSchema 的工具的 isError 结果再做一次冒烟测试。
- 指标：以 isError 送到模型的执行错误 0/5 → 5/5；送到模型的 agentHints 0 → 全部；不靠人帮忙就从错误中恢复的比例在 eval 里测量。
- 决定：D4、D7。
- 结果（PR #560）：
  - `server.ts` 新增 `toolErrorResult`。hosted 的错误码（`quota_exhausted`、`browser_busy`、`hosted_unavailable`）从 `body.code` 读；429 改写后的错误从 `cause` 里拿出原始的 Retry-After。
  - 按 D7 的默认，UTM 只在 MCP 渲染时从链接里去掉：逐个解析 URL 再删 `utm_*` 参数，正文不受影响。审查发现第一版正则会删掉正文里的 `?` 和 `&`，已修。
  - 连接被拒、域名解析失败才算 `api_unreachable`，TLS 失败不算。
  - 取消改用合并后的 signal 判断，stdio 的取消也能识别。
  - hosted 上调用不提供的工具（如 crawl）仍是协议错误，但消息会列出这里提供哪些工具，并说明 crawl 这类要在本地跑。
  - stdio 启动时，如果 API 连不上，向 stderr 打一行提示（`warnIfUnreachable`），不阻塞启动。
  - 改了 14 处原来期待“抛错”的旧断言。
  - 检查：`npm run typecheck` 通过；`npm test` 3026 个测试全部通过（在审查修复之前跑的），修复之后 `packages/mcp` 109 个测试全部通过。
  - Cursor 下 isError 加 outputSchema 的冒烟测试要等 W8。

## W6 hosted schema 只列出 hosted 接受的选项　M　→ PR #563

起因：试用用户先连的是 hosted。今天 agent 看到约 5.8k 字符的选项，用了却被拒绝，白白浪费一次调用和上下文。Directory 要求列出的选项都能成功。另外 300 s 的默认超时超过了 claude.ai 的 240 s 和 Cloud Run 的 120 s。

- [x] **W6.1** 在 `hostedApi.ts` 的 `hostedTools()` 旁边，声明一个显式的允许列表 `HOSTED_SCRAPE_KEYS`，并把 schema 构建器改成按面传参（W10 会复用）。依据是上面“现状”里列出的 hosted 真实拒绝逻辑。**不要**从 `hostedToolPolicy.ts` 推导。
- [x] **W6.2** 去掉这些选项：actions、robotsOverride、lane、handoff、skipTlsVerification、`access: my-browser`、`access: enhanced`（hosted 没有 access grant，要用测试确认）。verify 的检查类型枚举去掉 `VERIFY_REGEX_CHECK_TYPES`。keyless 再去掉 screenshot 格式。
- [x] **W6.3** `mode authed`：hosted 上 savedLogins 是 null，也没有显式拒绝，可能会直接匿名运行。先写一个刻画测试，固定它今天的行为，再按 D9 处理。
- [x] **W6.4** OAuth 带浏览器的面上，额度不足时会被固定走 HTTP（hostedApi.ts，行号待核：约 625），这一点 schema 表达不了。在描述里说明浏览器格式需要浏览器 credits；被拒绝时由 W5 返回带下一步的 isError。
- [x] **W6.5** hosted map 只保留 hosted 支持的选项，并在 schema 里写明上限（limit ≤ 5,000，timeout ≤ 60,000）。
- [x] **W6.6** hosted scrape 的超时：只在 MCP 的 `normalizeCall` 里限幅，schema 的最大值设成 D9 定的值（建议 100,000 ms）。REST `/v1/scrape` 不变。限幅要在结果里回显。
- [x] **W6.7** 在 CHANGELOG 的 Unreleased 下写一条。和 W5 合成一次 hosted 部署（D9）。
- 验收：
  - 先写失败测试：hosted keyless 的 tools/list 里有 actions、robotsOverride 和正则类检查。再写一个刻画测试，记录 hosted `mode authed` 今天的行为。
  - 改完后：
    - keyless 和 OAuth 的列表里都没有会被拒绝的属性，也没有正则类检查；
    - keyless 没有 screenshot；
    - **每个列出的 scrape 和 map 属性，取合法值、通过 `createHostedApi`（hosted 模式引擎）调用，都会被接受。** 这是真正防止 schema 和实现漂移的检查；
    - hosted MCP scrape 设 `timeout: 300000` 时被限幅并回显；REST 设 300000 时行为不变；
    - W5 合入后，额度不足的 OAuth 截图调用返回 isError，并说出 credits。
  - 部署后线上复测，记录 revision。
- 指标：hosted scrape 的 inputSchema 约 18.2k → ≤ 5,000 紧凑字节（审查时测得保留部分的结构是 4,078，W2 复测前算未核实）；列出却会被拒绝的选项 约 5.8k 字符 → 0；hosted keyless 的 inputSchema 合计建议 ≤ 8,000 字符，总目标等 W8 定下 outputSchema 后再定。
- 决定：D9。
- 结果（PR #563）：
  - **允许列表是实测出来的**：对 createHostedApi，每个选项各传一个合法值调用一次，keyless 和带浏览器的 key 各测一轮。
    - 被拒绝的：handoff、lane、`access` 取 standard 以外的值、skipTlsVerification、actions、robotsOverride、正则类 verify 检查；map 的 ignoreRobotsTxt、limit 超过 5000、timeout 超过 60000。
    - 只在 keyless 下失败的：screenshot 被拒；waitFor 大于 0 时返回 policy_denied。
    - **被接受但没有效果**：`mode authed` 在 hosted 上以匿名身份读取，返回 success；`lockdown` 永远是 cache_miss；`storeInCache`、`maxAge`、`minAge` 都不起作用（gate 把 storeInCache 写死为 false）。这些也都从 schema 里去掉了。比计划多去掉了 lockdown 和三个缓存选项。
  - 按 D9 的默认：超时上限 100 s，只对 MCP 生效，REST 仍是 300 s；`mode authed` 只从 schema 去掉，引擎不改。W6.3 的刻画测试记录了它今天匿名读取的行为。
  - 浏览器面在描述里写明：账户 credits 少于 5 时，截图会被拒绝。W5 合入后，这时返回 isError。
  - 体积：keyless 的 tools/list 从 24,337 降到 16,135 字符；hosted scrape 的 inputSchema 从 18,247 降到 10,387 字节（带 key 的是 11,056）。**还没到 5,000 字节的目标**，剩下的主要是 formats 和 verify 的长说明，要等 W7 来压缩。
  - 防漂移测试：`hostedSchema.integration.test.ts`（TIMED 组）对每个列出的选项都实际调用一次；列出的选项如果没有样例值，测试直接失败。
  - 检查：`npm run typecheck` 通过；`npm test` 3022 个测试全部通过。
  - 线上复测要等 W5 和 W6 一起做 hosted 部署（D9 的部署时机）。

## W7 本地 schema 瘦身和描述前置　L（等试用发现处理完再开始）

起因：Codex 会把超过 5,000 字节的 schema 里的属性说明全部删掉，所以今天它的 agent 看到的 scrape、crawl、batch_scrape 参数都没有说明。不做延迟加载的客户端，一开始就要付约 22k token。描述的第一句决定 tool search 能不能搜到这个工具。

- [ ] **W7.1** 所有属性名、类型、枚举、默认值都不变，接受的参数也不变，只改说明文字：
  - `FORMATS_DESCRIPTION`：4,329 → ≤ 600 字符，每种格式一行，并注明示例在文档里；
  - `VERIFY_PROPERTY`：2,451 → ≤ 500 字符，列出检查类型；
  - `ACTIONS_SCHEMA` 的说明：2,509 → ≤ 600 字符；
  - `WEBHOOK_PROPERTY`、robotsOverride、lane、handoff、access：各 ≤ 250 字符；
  - crawl 和 batch_scrape 上共享的页面选项：写 `Same as scrape.`；
  - crawl 的 `maxPages`、`maxDepth`：补上说明。
- [ ] **W7.2** 顶层描述统一模板：
  - 第一句说清对象和返回内容，和 `@octocrawl/ai-sdk` 的描述对齐；
  - 有事实可写时才加 `Not for:` 和 `Next:`；
  - 删掉 REST、SDK 和 URL 的指引（包括 `tools.ts:455` 里 wait_batch 那句）；
  - get_batch、get_batch_items、wait_batch、cancel_batch、get_crawl、pause/resume_delivery_destination 的模板文字，换成它们实际返回的内容。
- [ ] **W7.3** 示例文字挪进现有的 `connect-mcp.md` 的 “Check the first result” 和 `docs/batch-crawl-map.md`，不新建文档。不加 `$ref`/`$defs`，不新增可空联合类型。
- [ ] **W7.4** 方案 (a)（按 D10 决定做不做）：在 crawl 和 batch_scrape 上，把嵌套的 `FORMAT_ITEMS` 的 anyOf（去掉说明后 1,708 字节）和 verify（1,169 字节）收成 `{type:'array'}` 和 `{type:'object'}`，加上 `Same as scrape`，校验仍然由服务器端的解析函数负责。
- [ ] **W7.5** `alwaysLoad`：只在 scrape 和 map 上设 `_meta['anthropic/alwaysLoad']: true`，前提是描述不超过 4,096 字符、schema 在 W2 的预算内。在 Claude Code 里用 `/context` 记录之前，效果算未测量。
- [ ] **W7.6** 在 CHANGELOG 的 Unreleased 下写一条。
- 验收：
  - W2 的预算收紧到：
    - 本地 inputSchema 加描述合计 ≤ 40,000 字符；
    - scrape、crawl、batch_scrape 各 ≤ 8,000 紧凑字节（结构本身 5,508–6,792，可以达到）；
    - 其余工具各 ≤ 5,000；
    - 采用 (a) 的话，crawl 和 batch_scrape ≤ 5,000。
  - 描述的 lint 检查：
    - 第一句 ≤ 200 字符，而且互不相同；
    - 不匹配 `/https?:\/\//`，不含 `utm_`；
    - 不含少数明确的指引短语（比如 `see the REST`、`use the SDK`）；
    - `tools.test.ts:596-607` 仍然通过。
  - `tools.test.ts` 现有的用例全部通过。
  - 在 Claude Code、Codex、Cursor、OpenCode 上做前后两轮 eval：已验证任务的比例不能下降，格式错误的 verify 契约不能增加。两份记录都保留。
- 指标：本地 tools/list 77,608 → ≤ 40,000 字符；最大的三段说明 4,329 / 2,509 / 2,451 → 各 ≤ 600；超过 Codex 5,000 字节预算的工具 3 → 3（不采用 (a)）或 1（采用 (a)）。
- 决定：D10。

## W8 带类型的结果与如实的结果预算　M

起因：判定字段有了类型，Evidence Record 和如实的失败判定在 code mode 和 Codex 里都能被程序读取。两个通道放同样的内容，是唯一同时适合 Cursor 和 Codex 的做法。Claude Code 超过 2.5 万 token 就截断，没有预算的页面可能悄悄丢掉结尾。内联 base64 既浪费 token，视觉模型也看不到。

- [ ] **W8.1** 在 scrape、get_scrape、get_crawl、get_batch、wait_batch、wait_crawl（W9 之后）、get_crawl_pages、get_batch_items，以及 crawl 和 batch 的 start（`{taskId, replayed?}`）上声明宽松的 outputSchema：允许 additionalProperties，required 只有 `status`。为这些字段写类型：`status` 和 `verification.status` 的枚举、failureReason、readiness、agentHints、evidenceRecord、finalUrl。hosted 副本带哪些 outputSchema，先测量再按 D11 定。
- [ ] **W8.2** 序列化顺序：判定字段在前（status、failureReason、blockReason、verification、readiness、agentHints、truncated），markdown 在后。
- [ ] **W8.3** 内容预算：在 `server.ts` 里实现，不放进导出的 `callTool`。上限按 W2 实测的 fixture 大小和 D11 设定，并且低于约 2.5 万 token。超出上限时截断 markdown，设 `truncated: true` 和数字 `truncatedAt`，再附一条按面不同的提示：
  - hosted：建议用 onlyMainContent 或 includeTags 缩小请求，不提 get_scrape（hosted 不提供它）；
  - 本地：同样的缩小建议，外加用 `get_scrape <id>`（debug）取完整记录。
- [ ] **W8.4** 列表类工具达到预算时停下，返回 `nextCursor`。get_scrape 是否受上限约束按 D11 定。`anthropic/maxResultSizeChars` 默认不设。
- [ ] **W8.5** 截图：只在 base URL 是本机回环地址时，改成 image content block，JSON 里保留 sha256、size 和本机能读到的 path，两个通道都去掉 base64（debug 下保留）。远程（hosted，以及 stdio 指向 api.octocrawl.dev）保持现状，因为 Cloud Run 内存里的 path 客户端读不到。弃用节奏按 D11。
- [ ] **W8.6** 可选：在结果最前面加一个 `summary` 字段（D11）。
- [ ] **W8.7** 在 CHANGELOG 的 Unreleased 下写一条。
- 验收：
  - 先写失败测试：success、blocked、empty_unverified、verification-failed 这几个 fixture 的结果都没有 structuredContent，`truncatedAt` 一直是 null。
  - 改完后：
    - ajv 用 outputSchema 校验每个 fixture 结果；
    - 每个面上 `JSON.parse(text)` 和 structuredContent 深度相等；
    - isError 结果不带 structuredContent；
    - scrape 序列化后第一个键是 `status`；
    - 超大 fixture 返回的结果不超过上限，带 `truncated: true`、数字 `truncatedAt` 和对应面的提示，hosted 的提示里不提 get_scrape；
    - `get_crawl_pages` 设 `maxResults: 200` 时在预算处停下，并返回 `nextCursor`；
    - 本机截图 fixture（TIMED 组）返回 image block，text 里没有 base64；
    - hosted 截图仍带 base64。
  - 重跑 W5 的 Cursor isError 冒烟测试。
- 指标：outputSchema 1/38 → 10 个以上；最大的 fixture 结果从 W2 实测值降到不超过 D11 定的上限；本机默认结果里的截图 base64 从“总是有”变成“从来没有”（远程不变）；eval 里被悄悄截断的结果：未知 → 0。
- 决定：D11。

## W9 长任务：wait_crawl、安全默认值、stdio 进度、上游中止测试　M

起因：agent 今天要自己写 get_crawl 的轮询。300–600 s 的同步等待超过 claude.ai 的 240 s，也会被 Claude Code 转到后台。本地 crawl 不写 maxPages 就没有上限。进度通知能重置 Claude Code 的空闲计时，也能让本人在等待时知道发生了什么。

- [ ] **W9.1** 新增 `wait_crawl`：基于 SDK 的 `waitCrawl`，用它自己的 `timeoutMs` 和 `WaitTimeoutError.last`。
  - `timeoutMs` 默认 30,000，上限和 wait_batch 统一（D12；如果选 120,000，要同时把 `tools.ts:649` 的 300,000 降下来，并写进 CHANGELOG）。
  - 超时返回当前的 crawl 状态，并附 `Next: wait_crawl again or get_crawl_pages`。
  - 遵守中止信号，只读。
  - hosted 上有 crawl 之前，不在 hosted 列出。
  - 本地工具数变成 39 个。
- [ ] **W9.2** crawl、batch_scrape、batch_products 的描述里写出 wait 步骤，以及 W5.8 的保留期说明。
- [ ] **W9.3** crawl 的 `maxPages` 默认值：只在请求里完全没有 `maxPages` 键时，由 MCP 层套用 D12 定的值，并在结果里回显。显式的 `null` 保持今天的含义（用服务器默认值，本地是无上限）。默认值的出处（行号待核）：
  - `listen.ts:173` 是 hosted 模式，值为 100；
  - 本地 serve 是 null（`listen.ts:203`）；
  - 10 来自 `host.ts:57` 的试点；
  - 8791 的 `localHost.ts` 没有设。
- [ ] **W9.4** scrape 超时：MCP 层的默认值降到 200 s 以下（D12），和 REST 及契约里的 `DEFAULT_SCRAPE_TIMEOUT_MS` 300,000 不同，要在 CHANGELOG 写明。my-browser 和 handoff 保留长等待，但在描述开头写清楚。
- [ ] **W9.5** 进度通知：新增 `McpServerOptions.progress`，只由 `stdio.ts` 打开。HTTP 主机永远不开，因为 JSON 响应模式会丢掉通知。导出的 `callTool` 的 options 加一个可选的 `onProgress`。打开且请求带 `_meta.progressToken` 时：
  - wait_batch 和 wait_crawl 在 tools.ts 里用 getBatch 和 getCrawl 自己轮询，发限速的 `notifications/progress`（比如 `12/40 pages`），不改 SDK；
  - 需要本人参与的等待（my-browser、handoff、hand_off_batch、import_login）每 10–15 s 发一次心跳，告诉本人该做什么。
- [ ] **W9.6** 上游中止：扩展 `httpCancellation.test.ts`，测试被取消的 scrape 是否释放浏览器租约、是否不产生账本扣费，并记录结果。如果不会中止，在本文件里另开一项，那属于引擎改动。
- [ ] **W9.7** 在 CHANGELOG 的 Unreleased 下写清所有默认值变更，结果里回显实际用的值。
- 验收：
  - 先写失败测试：本地 fixture 站点上不带 maxPages 的 crawl，跟随的页数超过拟定的默认值；给了 progressToken 也不发进度。
  - 改完后：
    - 缺少 maxPages 键时套用默认值并说明；显式 null 的行为和今天一样；两种情况各有测试；
    - wait_crawl 在任务完成时返回完成状态，自己超时时返回运行中的状态和 Next 行，客户端取消时抛出取消，timeoutMs 超过上限时返回 isError；
    - 进度值严格递增，每 5 s 最多一条，结果之后不再发送，HTTP 主机上从不发送；
    - 取消测试记录引擎工作是否停止。
  - 在 Claude Code 里用 wait_crawl 真实爬一次 quotes.toscrape.com，记录命令、commit 和是否走代理。
- 指标：带有界等待的 crawl 0 → 1；不需要本人参与的工具里最长的默认同步等待 300,000 ms → ≤ 120,000（或按 D12）；发进度的 stdio 工具 0 → 6；取消后上游是否停止：从未核实变成已测试；完成一次 10 页 crawl 需要的调用次数在 eval 里测量。
- 决定：D12。

## W10 本地工具集和只读模式　M

起因：客户端对工具数有限制（VS Code 每次请求 128 个，Windsurf 总共 100 个），不做延迟加载的客户端会加载所有定义。16 个 Monitor 和 delivery 工具对大多数用户来说挤占了常用路径。只读模式能如实地提供一个不弹确认的本地 scrape，不用把会操作页面的那个 scrape 误标成只读。

- [ ] **W10.1** `stdio.ts` 解析 `--toolsets=core,crawl,batch,products,logins,monitor,delivery|all`（环境变量 `W2L_MCP_TOOLSETS`）和 `--read-only`（环境变量 `W2L_MCP_READ_ONLY`），映射到 `createMcpServer` 已有的 `allowedTools` 和 `tools` 选项。`core` 是 scrape、get_scrape、map；crawl 组包含 wait_crawl。
- [ ] **W10.2** `--read-only` 只列 W4 表里的只读工具，再加一个用 W6 的按面构建器生成的“只读 scrape”，标 `readOnlyHint: true`。这个 scrape 只去掉会以本人身份操作的选项：actions、mode authed、lane my-browser、handoff、access my-browser。正则 verify 检查、screenshot、robotsOverride、skipTlsVerification、access enhanced 都保留，因为它们在本地合法，也不以本人身份操作。
- [ ] **W10.3** 名称不认识时启动失败，并列出合法的名称。调用选择范围之外的工具时，按 W5 的协议错误规则返回消息，并说出打开它的 flag。
- [ ] **W10.4** W3 的 instructions 自动跟着工具集变。如果 D8 选了“自动切换”，也在这里实现。
- [ ] **W10.5** 环境变量写进 `server.json` 的 `environmentVariables`。在 `packages/mcp/README.md` 和文档里给出 Claude Code、Codex、Cursor、VS Code 的示例配置。
- [ ] **W10.6** 默认是 `all`（D13）。如果要改成精简默认，提前一个版本在 CHANGELOG 里预告，并在 instructions 里加一行说明 `--toolsets all`。
- 验收：
  - 先写失败测试：不管环境变量怎么设，stdio 服务器都列 38 个工具。
  - 改完后：
    - `--toolsets=core` 正好列 3 个工具；
    - `--read-only` 只列 readOnlyHint 工具，它的 scrape schema 里没有 actions、mode authed、lane my-browser、handoff，但还有正则检查和 screenshot；
    - 只读 scrape 的大小在 W2 实测后定目标：结构允许就 ≤ 5,000，否则 ≤ 8,000，并写明 Codex 仍会删掉说明；
    - 名称不认识时以非零退出码退出并列出名称；
    - 不带 flag 时列出全部工具；
    - W2 里出现每种配置的预算行。
  - 记录一次用 `--read-only` 的 Claude Code 交互会话。
- 指标：core 配置 38 → 3 个工具；`--read-only` 下本地 scrape 的 readOnlyHint false → true；`--read-only` 下 Codex auto 和 VS Code 里本地 scrape 的确认弹窗“每次都弹”变成 0（在 eval 记录之前只是根据客户端规则推断）。
- 决定：D13。

## E 评估（贯穿全程）

- [ ] **E1 静态检查**：从 W2 起放进 `npm test`，离线运行。按面分别检查：本地 all、core、read-only，hosted keyless，hosted OAuth（不带和带浏览器）。具体内容就是 W2–W10 验收里写的预算、覆盖率、schema 合法性、instructions、描述 lint、两个通道一致、错误格式。每个 PR 都要说明它动了哪一行预算、为什么。
- [ ] **E2 真实客户端里的固定任务集**：
  - **冻结时机**：W3–W6 合入或部署之前冻结。本地用 npm 上的 `@octocrawl/mcp` 0.5.0 当基线；hosted 用冻结时的线上 revision 加它的源码 SHA（冻结时用 gcloud 确认），保留它的 tag，以便以后复跑。
  - **轮次**：基线一轮，W1–W4 之后一轮，W5–W6 之后一轮，W7–W10 之后一轮。每轮开始前所有客户端重新连接，避免 tools/list 缓存影响对比。
  - **客户端**：Claude Code、Codex CLI（auto）、Cursor、OpenCode 必跑。VS Code Copilot、claude.ai、ChatGPT 需要 Howard 登录，没跑的记为“未运行”。
  - **驱动方式**：用脚本以无头方式跑（`claude -p`、`codex exec`、`cursor-agent`、`opencode run`），统计除确认弹窗以外的所有指标。确认弹窗另用小的交互样本测：每个客户端每轮 3 个任务，各跑一次。
  - **任务**：12 个，每个跑 3 次，用本地 fixture 和 `research/parity/sites.md` 里稳定的页面，URL 冻结后不换：
    - (a) 把一页读成 Markdown；
    - (b) 列出一个文档站的 URL；
    - (c) 读 20 个已知 URL；
    - (d) 爬一个最多 10 页的子树并总结，中间强制一次超时，再用同一个 `idempotencyKey` 重试；
    - (e) 把一句大白话的成功条件写成 verify 契约；
    - (f) 提取 JSON 字段；
    - (g) 带被拒绝选项的 hosted 调用，agent 要把拒绝原因转述出来；
    - (h) 本地 API 没启动，agent 要请本人运行 `npx octocrawl serve`；
    - (i) 未知或过期的任务 id；
    - (j) 注入一次限流；
    - (k) 超过内容上限的页面；
    - (l) 被拦截的页面，agent 要报告 blocked 和 failureReason，不无限重试，也不编造内容。
  - **每次记录**：
    - 任务是否通过（按任务自己的检查，和抓取的 status 分开）；
    - 假成功；
    - 第一个工具是否选对；
    - 参数校验错误；
    - 调用次数；
    - 确认弹窗（只看交互样本）；
    - 是否不靠人帮忙就从注入的错误中恢复；
    - 结果字符数；
    - 耗时；
    - 工具定义占用的 token（Claude Code `/context`）；
    - 是否引用了 finalUrl 或 Evidence Record。
  - **目标和结论**：目标等基线测完再定。在有记录证明之前，不宣称任何客户端侧的改善。
  - **工作量**：一轮约 12 × 3 × 4 次。一个人跑不完时可以减少任务或轮次，但减掉的部分要写成“未运行”，不能直接省略。
- [ ] **E3 外部试用**：一位非作者不靠帮助、按 Connect 页安装，遇到的每个问题记进 `research/trials/`。试用的发现优先于本清单的顺序：W7–W10 要等试用的发现处理完再开始。

## 不做（附原因）

- **改名、加前缀、名词开头**：原因见“定下的方向”第 1 条。
- **现在把页面交互从 scrape 拆成新工具**：这算改名级的改动。W10 的只读模式已经能提供一个如实、不弹确认的 scrape。只有 eval 显示默认 scrape 的确认弹窗损害了任务成功率，才重新考虑。
- **改 `LOCAL_HINT`、`HTTP_ONLY_HINTS` 这类共享常量**：REST 也在用，而且 PH item 1 要求保留“在本地运行”这句。
- **新建 `docs/mcp-first-use.md`**：AGENTS.md 要求不新增文档，示例挪进现有页面。
- **往 `host.ts` 接新功能**：它是没部署过的试点，ROADMAP 把它列在 P5。
- **把 `anthropic/maxResultSizeChars` 调高到 10 万–15 万**：Claude Code 有 2.5 万 token 的上限，超过 5 万字符就存成文件，正是这个机制让大结果还能用。调高只会更糟。
- **把 `/mcp` 和 `/mcp-oauth` 合成一个延迟认证的 URL**：只有 Claude 有相关文档，其他客户端的行为没有核实；现在的布局下登录已经能用。
- **OAuth 相关工作、重写取消逻辑**：都已经满足，W5 和 W9 只补测试。
- **MCP Tasks 扩展、`taskSupport`、2026-07-28 版规范的新特性**（ttlMs、cacheScope、server/discover、MRTR）：官方 SDK 最高只支持 2025-11-25，也没有客户端实现这个扩展。等 SDK 支持后再说。
- **用 form elicitation 征求同意**：客户端支持参差不齐，hosted 每次请求都是新的无状态服务器，收不到回复。任何时候都不用 form 模式收集秘密。
- **在 scrape 或付费浏览器通道上加 `requiresUserInteraction`**：它每次都弹确认，在无头模式下会直接拒绝调用。只给 import_login 加。
- **把多个工具合并成带 method 参数的工具，或改用 code mode**：这是改名级的破坏性改动，Directory 也禁止一个工具里读写混合。
- **动态启用工具集的 meta 工具**：规范规定工具集不能随其他请求的副作用变化。
- **`$defs`、`$ref`**：Cursor 和 Codex 在压缩时怎么处理 `$ref` 没有核实。
- **MCP Apps 证据卡片、prompt-injection 标记、按连接设置默认参数的 header**：这些是新功能，或者只有一家在做。以后作为 ROADMAP 事项单独提。
- **HTTP 主机上发送进度通知**：要改传输层，Cloudflare Worker 的缓冲和 Cloud Run 超时的影响都没有核实。
- **Firecrawl 形状的 Monitor MCP 接口**：在 ROADMAP Paused 表里。
- **hosted crawl、batch、Monitor、search、extract、浏览器 actions**：属于后面的阶段（PH 第 2 阶段、P5）。

## 风险

- **客户端效果全是推断**：几项客户端侧的效果是从厂商文档、源码和论坛帖子推断的，没在 Octocrawl 的运行里观察到，包括 annotations 减少弹窗、alwaysLoad、Cursor 只读 text、ChatGPT 对 readOnlyHint 的处理。计划不依赖这些推断成立。
- **字节目标未核实**：结构字节来自已经删掉的临时测试，W2 复测之前，W6、W7、W10 的字节目标都可能要调整。
- **outputSchema 可能导致结果被拒**：严格的客户端会拒绝不符合 outputSchema 的结果，Cursor 据报即使在 isError 时也会校验。缓解：schema 写宽松；错误结果不带 structuredContent；用 ajv 校验真实 fixture；在 Cursor 上做冒烟测试。
- **W5 是行为变更**：会影响那些捕获 callTool 被拒绝、或读 `error.data.code` 的脚本。缓解：保留 `<code>:` 前缀和 `_meta['octocrawl/error']`；导出的 callTool 不变；次版本发布；写进 CHANGELOG。
- **W7 瘦身可能伤到任务成功率**：可能删掉 agent 依赖的说明。缓解：名字、类型、枚举都不变，合入前用 eval 把关。
- **`_meta` 可能在 `/mcp-oauth` 上丢失**：W4.4 漏掉的话，新加的 `_meta` 在 `/mcp-oauth` 上会悄悄消失，由 W2.3 的检查兜底。
- **客户端缓存 tools/list**：改动要等用户重连后才能看到。hosted 改动在两次试用会话之间部署，并告知用户。
- **默认值变更影响省略参数的调用者**：会让他们感到意外。缓解：结果里回显实际用的值，写进 CHANGELOG。
- **取消后上游可能不停**：如果取消后上游工作（浏览器租约、代理时长、扣费）不停，用户要为没人读的结果付费。W9.6 会测；真要修，属于计划之外的引擎工作。
- **范围蔓延挤占 PA 时间**：W1–W4 保持小、只做增量；试用暴露出更紧急的问题时就停下来。

## 未核实

1. 客户端侧的所有改善效果，等 E2 的记录。
2. 结构字节和结果大小：W2 已测（见 W2 的“结果”）。真实网页上的结果大小还没测，等 E2。
3. `Implementation` 的 title 和 description 从哪个 SDK 版本开始支持，等 W3.4。
4. hosted `mode authed` 今天的实际行为，等 W6.3。
5. 取消后上游是否停止，等 W9.6。
6. Codex 用 `/mcp-oauth` 的效果：命令已经写进 Connect 页（W1.3），Howard 报告能用，但还没有带日期的真实客户端记录。等 E2 或一次单独的 Codex 登录记录。
7. 标“行号待核”的引用，动手前在当时的 `main` 上再查。

## 下次从这里继续

- W1–W6 都开了 PR（#555、#557、#558、#559、#560、#563），等合并。W5 和 W6 合并后，一起做一次 hosted 部署（只在 Howard 要求时）。
- 下一个是 W7（本地 schema 瘦身和描述前置）。按 D1，它要等外部试用的发现处理完再开始。开始前要先确认 W2 已经合并，因为 W7 要改 `toolSurface.budget.json`；W6 也已经让 hosted scrape 去掉了一些属性。
- 每完成一项：在这里打勾，补上 PR 编号，把“待 Howard 决定”里已经定了的移到“定下的方向”。
