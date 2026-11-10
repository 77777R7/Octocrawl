# 八爪鱼动画移植任务清单

依据：2026-11-10 Howard 的问题（"网页上点 Extract 会出来一只八爪鱼，怎么把它移植到真正的使用场景里，比如 Agent 调用、MCP、本地爬取时也能看到"）和同日的现状核查，以及 [ROADMAP.md](../ROADMAP.md)（当前阶段"ten outside users"）、[AGENTS.md](../AGENTS.md)、[docs/public-preview.md](public-preview.md)、[docs/mcp-client-ux-tasks.md](mcp-client-ux-tasks.md)。行号核实基于 `main` 的 `1c4c3d7f`，日期 2026-11-10。标"待核"的，动手前在当时的 `main` 上再查一次；标"未实测"的，是只读过文档或源码、没有在真实客户端里跑过。

起因：八爪鱼只活在网站上。离开网站之后，CLI 的 `scrape` 和 `map` 在结束前什么都不打印，`crawl` 和 `batch` 打印一行 task id 就静默轮询；MCP 的普通 `scrape` 不发进度，托管端完全不发。用户在终端和 Agent 客户端里既看不到品牌，也分不清是在跑还是卡住了。

目标体验一句话：**不管从哪里发起抓取，用户都能看到同一只八爪鱼跟着真实进度往下爬；看不了动画的地方，至少有一行说清现在到哪一步。**

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 各场景

| 场景 | 极致体验 | 现状 | 任务 |
| --- | --- | --- | --- |
| 1 CLI 单页（`octocrawl scrape`、`map`） | 终端里八爪鱼沿一页字符往下爬，结束后收成一行摘要 | 结束前不打印任何东西 | K1、K2、C1 |
| 2 CLI 多页（`crawl`、`batch`） | 八爪鱼加一行 `N/M` 计数 | 一行 task id，之后每 200 ms 静默轮询（`packages/cli/src/run.ts:293-299`） | C2 |
| 3 Agent 经本地 MCP 调用 | `octocrawl serve` 的终端底部有一块动态区域，每次调用八爪鱼爬一遍 | serve 只在启动时打印几行；stdio MCP 的 stderr 被客户端收走，用户看不到 | S1 |
| 4 Agent 客户端里的一行状态 | 工具运行时显示"robots 允许 · 正在读页面" | 只有 `wait_crawl`、`wait_batch` 和等用户点 Allow 的调用发 `notifications/progress`；普通 `scrape`、`map` 不发；托管端不发 | P1、P2 |
| 5 Claude Code 里的动画 | 工具调用期间，终端里画彩色字符格八爪鱼 | 没有；`plugins/octocrawl*` 只有 README 和 skill | M1（原型） |
| 6 my-browser | 点 Allow 之后，那一页变成"工作中"页面，显示批量进度 | Allow 页在授权期间一直开着（关掉即撤销，`packages/api/src/chromeHandoff.ts:227`），有字符海，但不反映进度 | B1（等 D5） |
| 7 Claude 网页和桌面、ChatGPT | 结果旁边一张卡片，八爪鱼重放这次抓取的阶段 | 没有 `ui://` 资源，capabilities 只有 `tools` | A1（搁置） |

## 待 Howard 决定

每条标出影响的任务。没决定的，按"默认"一栏先做，或者先做不受影响的部分。

| # | 问题 | 影响 | 默认（未否决前按此） |
| --- | --- | --- | --- |
| D1 | ROADMAP 当前阶段的规则是"这周能不能帮外部用户开始或继续用"。K1、K2、C1、C2、S1、P1 可以算作消除静默等待；M1、B1、A1 是品牌工作。前一组现在做，后一组等 2026-11-29 之后，是否同意？ | 全部 | 同意 |
| D2 | 搬哪一只。建议搬 Extract 窗口那只精灵八爪鱼（字符串数组，跟真实阶段走）。首页 hero 那只是从 webp 采样的，1,707 行，绑死 canvas 和首页布局，不搬。是否同意？ | K1 | 同意 |
| D3 | 共享内核放哪。新建一个零依赖的内部包（暂名 `@w2l/octopus`），网站、CLI、API 都从它导入；还是放进现有的 `@w2l/contracts`？ | K1 | 新建包；它不属于契约，也不该让 contracts 带上画图代码 |
| D4 | 终端动画默认开还是默认关。默认开的条件：stderr 是 TTY、不在 CI、没有设关闭开关。关闭开关用 `--no-motion` 加环境变量 `OCTOCRAWL_NO_MOTION`；`NO_COLOR` 只去颜色，不关动画。是否接受？ | C1、C2、S1 | 默认开，按上述条件 |
| D5 | B1 改 `chromeHandoff.ts` 和 Allow 页，属于引擎一侧。ROADMAP 写"引擎不接新工作"。现在排进来，还是等有试用记录说长批量期间用户不知道进度？ | B1 | 等试用记录，或 Howard 开口 |
| D6 | P1 给普通 `scrape` 发进度。进度消息里要不要带一个单行字符八爪鱼（例如行首几个字符），还是只发白话阶段文字？各客户端怎么排版这行字未实测。 | P1 | 只发阶段文字；字符八爪鱼等在 Claude Code 里看过实际效果再定 |
| D7 | P2 让托管端也发进度。托管的回答今天是整块发的（`enableJsonResponse: true`，`packages/mcp/src/serveHttp.ts:39`），要改成流式才发得出进度，会动到 Worker 和 Cloud Run 两层。做，还是只做本地？ | P2 | 只做本地；P2 列出但不开工 |
| D8 | 本地改动要发 npm 才到用户手里。随下一个 0.8.x 发，还是攒一个版本？ | C1、C2、S1、P1 | 随下一个 0.8.x |

## 定下的方向

1. **一只八爪鱼，一份代码。** 精灵帧和阶段模型只在共享内核里有一份；网站的 `crawlView.ts` 改为从它导入。今天网站上有五套互不共享的实现，这次不再加第六套。
2. **跟着真实阶段走，不跑在前面。** 沿用 `apps/public-web/src/crawlModel.ts:9-18` 的规则：没收到 `robots` 不往下爬，robots 不允许就不动，页面没读到不显示"读完"。拿不到阶段的场景只有"运行中"和"结束"两态，不编造中间进度。
3. **失败照实画。** 被挡、空页、超时各有一个结束姿态和一句原因，和结果里的 `status`、`failureReason` 一致。不用成功动画收尾一个失败的抓取。
4. **格子不动，字符变。** 沿用 `packages/api/src/scopePage.ts:57-61` 的规则：每个字符待在自己的格子上；有"减少动态效果"或关闭开关时静止。
5. **动画只走给人看的通道。** 终端里只写 stderr，stdout 继续只放数据；MCP 里只走进度通知，不进工具结果。
6. **结束后不留痕迹。** 终端动画结束时收成一行摘要，滚动历史里不留多行字符画。

## 不做的事

- **不往被抓取的页面里注入浮层。** 会改动 DOM，影响内容哈希和 Evidence Record；后台标签页用户也看不到。my-browser 今天不注入任何东西，保持这样。
- **不把字符画放进工具结果。** 结果是给模型读的，多出来的字符是 Agent 的 token，和"Markdown 优先、省 token"的卖点相反。
- **不为动画加工具、加 `_meta`、加 instructions 句子。** 本地工具列表有 50,000 字符上限（`packages/mcp/test/toolSurface.test.ts:134`），instructions 有 2,000 上限（`packages/mcp/test/instructionChecks.ts:15`）；余量按之前的记录只有几个到十几个字符，这次没有重新测量。
- **不在 stdio MCP 进程的 stderr 上画动画。** 客户端把它收进日志，用户看不到。
- **不搬首页 hero 八爪鱼。** 见 D2。
- **不引入终端 UI 依赖**（ora、ink、chalk 等）。今天 `packages/*` 里一个都没有；帧循环、光标隐藏和恢复自己写，几十行。
- **不新开托管的 live view 网址。** 竞品（Firecrawl、Hyperbrowser、Steel、Browser Use）给的是浏览器会话的观看链接，那是另一个产品形态。

## 现状（在 `1c4c3d7f` 上查到的）

网站：

- Extract 时有两只八爪鱼同时动。首页 hero 那只（`apps/public-web/src/heroOctopus.ts`，1,707 行）只跟 `aria-busy` 的开始和结束，中间是定时器。Extract 窗口那只（`crawlView.ts` 1,055 行、`crawlModel.ts` 223 行）跟服务器阶段。
- 精灵是字符串数组：`MANTLE`、`ARMS`（两个步态）、`SQUASH`（`crawlView.ts:75-98`）。`crawlCap` 等布局函数是纯函数，有测试（`apps/public-web/test/crawlModel.test.ts`）。`crawlView.ts` 的绘制部分依赖 canvas，没有测试。
- 阶段来自 `/api/preview` 的 NDJSON 流：`started`、`robots`、`page`，然后是结果。`packages/public-preview/src/preview.ts:138-146` 把引擎的 trace 事件 `robots_checked` 和 `extract` 翻成这两个阶段，经 `createExecutionScope` 的 `onTrace` 接出来（`:167`）。
- 另外三套：Get started 的海（`octopusSwim.ts`）、/scrape/ 的 Agent 八爪鱼（`product/agentOctopus.ts`）、Playground（`public/docs-assets/dashboard-octopus.js`，只有 `idle` 和 `running`）。
- 颜色是写死的 RGB（橙 `243,104,61`、深蓝 `20,37,74` 等），没有用 CSS 变量。

CLI：

- 命令是 `scrape`、`crawl`、`batch`、`map`，加 `serve` 和 `login`（`packages/cli/src/flags.ts:10`、`run.ts:60-61`）。
- 给人看的文字已经全部走 stderr；stdout 是 JSON 或 Markdown（`run.ts:164-165`、`:179`、`:235-237`）。
- 只有一处 TTY 判断：`process.stdout.isTTY`，用来决定要不要在 stderr 加一行结束摘要（`cli.ts:17`、`run.ts:169-175`）。没有 `stderr.isTTY`、`NO_COLOR`、CI 判断。

本地 API 和 MCP：

- `octocrawl serve` 跑的是本地 REST API，启动行全部写 stderr（`run.ts:357`、`packages/api/src/cli.ts:93-123`）。
- 引擎的 scope 由请求的 context 建出来（`packages/api/src/engine.ts:2277`），`onTrace` 是 context 上已有的钩子，但 `packages/api` 今天没有把阶段往外发。待核：`scrape` 的 REST 路由和 CLI 的进程内调用各自怎么把 `onTrace` 传进去。
- 多页任务已有事件流：`GET /v1/crawl/:id/events`、`/v1/batches/:id/events`（`packages/api/src/app.ts:321-322`），SDK 的 `JobWatcher` 在用。
- MCP 进度：带 `progressToken` 的调用才发（`packages/mcp/src/server.ts:123-124`）；`wait_crawl`、`wait_batch` 最多每 5 秒一条（`tools.ts:833`、`:839`），等人的调用每 12 秒一条心跳（`server.ts:179-188`）。stdio 开着（`stdio.ts:34`），托管没开。

各客户端（来自文档和源码，未实测）：

- `notifications/progress` 的 `message`：Claude Code 显示（一度回退，2.1.153 修复）。2026-11-10 在 Claude Code 2.1.251 的终端里实测 `wait_batch`：文字在工具调用那一行下面单独一行，`⎿  3/5 pages done (60%)`，原地更新，括号里的百分比是 Claude Code 按 `progress` 和 `total` 自己加的，调用结束后这一行消失；普通 `scrape` 当时只有 `Calling octocrawl · 6s…`，下面没有文字。不带 `total` 时怎么显示没有测；Cursor 不显示（2026-07 官方论坛）；Codex CLI 不显示（TUI 里对应分支是空的）；Claude 桌面、VS Code Copilot、Cline 没找到来源。
- MCP Apps（SEP-1865，2026-01-26 定稿）：Claude 网页和桌面、ChatGPT、Goose 支持，VS Code 标为实验，Cursor 有用户报告渲染失败；Claude Code 不渲染。iframe 是否在工具运行期间就挂载，规范没有写明。
- Claude Code mod：插件可以在 `ToolProgress`、`Spinner` 等位置画字符格（`Raster`），终端里每秒最多 30 次重绘。工具钩子能不能匹配 `mcp__octocrawl__*`，以及 mod 能不能拿到 MCP 进度消息，都没有测过。

## 任务

### Phase 0：共享内核

- [x] **K1 抽出精灵和阶段模型。**（#921，`@w2l/octopus`） 新包（名字见 D3），零依赖，不碰 DOM。内容：`MANTLE`、`ARMS`、`SQUASH` 字符串，`crawlCap`，以及一个 `frame(state, t)`，返回字符网格和每格的色调。`state` 含已见阶段、是否结束、结束原因。网站的 `crawlView.ts` 和 `crawlModel.ts` 改为从它导入，画面不变。
  - 完成标准：`apps/public-web` 的现有测试全过；新包有帧快照测试，覆盖未开始、robots 允许、robots 拒绝、读到页面、成功、失败；在 `public:preview:local` 上人工看一遍 Extract，和改动前一致。
- [x] **K2 把单页抓取的阶段接出来。**（#922，`scrapeStages`，`packages/api/src/stages.ts`） 让本地 API 的 `scrape` 能把 `robots` 和 `page` 两个阶段交给调用方，做法照 `preview.ts:138-146`。只增不改：不传监听就和今天一样。
  - 完成标准：一个本地 fixture 测试，断言阶段顺序是 robots 在前、page 在后，robots 拒绝时没有 page；不改任何结果字段。
  - 做完后的边界：只有进程内调用引擎的一方拿得到阶段（CLI 是这样）；只有 HTTP 通道报阶段，从浏览器起步的抓取一个都不报；REST 的回答里没有阶段。本地用户给了网址时 robots 拒绝会被覆盖并照抓，阶段里带 `overridden`。

### Phase 1：终端

- [x] **C1 `scrape` 和 `map` 的终端八爪鱼。**（`packages/cli/src/motion.ts`） 写 stderr。启用条件和关闭开关见 D4。Ctrl-C、异常退出时恢复光标。结束时清掉动画区，留一行摘要（今天 `run.ts:169-175` 那一行）。`map` 没有阶段，只有两态。
  - 完成标准：测试覆盖非 TTY 时一个转义字符都不写、stdout 字节和今天完全一样、关闭开关生效、中断后光标恢复序列已写出；在真实终端里对一个公开页面和一个 robots 拒绝的页面各跑一次，记录命令和 commit。
  - 做完后的样子：15 行（一页 14 行字符加一行状态），终端不足 49 列或 17 行时只画状态行；150 ms 内答完的调用（缓存命中）什么都不画；结果一到立刻清掉，不为落地动画多等，所以没有结束姿态，失败原因由原有的那行 stderr 说。stderr 的文字行和今天一样，没有新增摘要行。`TERM=dumb` 也不画。运行期间写到 stderr 的整行（命令自己的提示、引擎的 `console.error` 日志）先清掉画面、打印、再重画，留在滚动历史里（`motionTerminal`）；C2 的提示行走同一条路。已知缺口：运行中按回车，终端回显的换行会让画面错开一行，结束后滚动历史里留下一行残画。
- [x] **C2 `crawl` 和 `batch` 的终端八爪鱼。** 在 `settled` 的轮询里（`run.ts:293-299`）取计数，八爪鱼旁边一行 `N/M`。等用户点 Allow 的提示行（`handoffPrompts`，`run.ts:261-275`）照常打印，不被动画区盖住。
  - 完成标准：同 C1，另加一条：动画期间打印的提示行完整保留在滚动历史里。
  - 做完后的样子：batch 的状态行是 `3/20 pages done`，八爪鱼的位置就是完成的比例；my-browser 的 batch 等用户点 Allow 时前面加 `Waiting for you in Chrome`。crawl 不知道总共有多少页，所以只有 `Crawling <host> · 7 pages fetched`，八爪鱼停在顶上不往下走。任务一结束（或 Ctrl-C）先清画面，再打印结尾那行；`--handoff` 阶段不画。
- [x] **S1 `serve` 终端的活动区。** 有请求进来时，在终端底部画一次八爪鱼和一行"谁在读什么"（工具或路由、host、阶段）；空闲时只留一行。启动行和之后的日志行照常往上滚。只在 stderr 是 TTY 时启用。
  - 完成标准：测试覆盖并发两个请求时显示不串行、非 TTY 时输出和今天逐字节相同；用 Claude Code 经 stdio MCP 调一次 `scrape`，在 serve 终端里看到动画，记录命令和 commit。
  - 做完后的样子：空闲时一行 `Waiting for calls · N answered so far`。有 scrape 或 map 调用时画八爪鱼，每个调用一行：调用方（请求里的 `origin`，去掉 `mcp-` 前缀和版本号）、scrape 或 map、host、这个调用自己的阶段、已用时间；八爪鱼跟着运行最久的那个调用。crawl 和 batch 从开始到结束各有一行，写已记录的页数（来自引擎的 job 事件，没有总数）；服务器启动时接着跑的旧任务不发开始事件，所以没有行，batch 结束后 handoff 记录的页面也不会把行带回来。最多显示 4 行，其余计数。150 ms 内答完的调用只计数不显示。请求里的文字只显示可打印字符。服务器经 `runApiServer` 的 `onActivity` 把这些事告诉 CLI（`ServerActivity`，`packages/api/src/activity.ts`）；不传监听时一个阶段都不听，和以前一样。

### Phase 2：MCP 进度

- [ ] **P1 普通 `scrape` 发阶段进度。**（`map` 没有阶段可报，不发。分三步：① 本地 API 的 `/v1/scrape` 带 `Accept: application/x-ndjson` 时逐行回阶段，已做；② SDK 的 `scrape` 加 `onStage`，已做；③ MCP 把阶段发成进度，不带 `total`。） 依赖 K2。MCP 服务器是本地 API 的 REST 客户端，而 REST 的回答今天不带阶段，所以要先让阶段经 REST 传出来（例如 `/v1/scrape` 的流式回答），这一步算在 P1 里。只在调用带 `progressToken` 时发；文字是白话阶段，一行以内（措辞见 D6）。不改工具列表和 instructions。
  - 完成标准：测试断言带 token 时收到 robots 和 page 两条、不带时一条不发、工具列表和 instructions 的长度测试仍过；在 Claude Code 里实际看一次，把看到的排版写进本文件"现状"一节，替换"排版方式不明"。
- [ ] **P2 托管端进度。** 见 D7，列出但不开工。

### Phase 3：之后再议

- [ ] **M1 Claude Code mod 原型。** 放进 `plugins/octocrawl`。先只验证三件事：工具钩子能否匹配 `mcp__octocrawl__*`；mod 能否拿到进度消息或只能知道开始和结束；`Raster` 画出来的八爪鱼在终端和桌面 Code 标签页里各是什么样。mod 是不经沙箱的代码，用户要明确信任才会装，原型结论里要写这一点。
  - 完成标准：一页结论，写清三个问题的答案和是否值得做成正式功能。只在 Howard 开口后写。
- [ ] **B1 Allow 页变成工作中页面。** 见 D5。点 Allow 之后，页面上的八爪鱼按批量的真实计数往下爬，文字显示 `N/M` 和当前 host；Revoke 按钮和"关掉即撤销"的行为不变。进度由 Octocrawl 经 CDP 写进这一页，不碰被读的页面。
- [ ] **A1 MCP Apps 结果卡片。** 搁置。解冻条件：托管端有外部用户从 ChatGPT 或 Claude 网页稳定使用（今天 ChatGPT 来的注册没有产生过 key），并且确认了 iframe 的挂载时机。届时另开清单，因为它要加 resources capability 和工具 `_meta`，会碰到上面的长度上限。

## 发布和验证

- Phase 0 到 Phase 2 一项一个 PR，从当时的 `origin/main` 拉分支；K1 和 K2 互不依赖，可以并行。
- K1 改网站代码，随下一次 preview 部署上线；只在 Howard 要求时部署。
- C1、C2、S1、P1 随 npm 版本到用户手里（见 D8）。
- 终端里的真实运行记录写进各自的 PR 描述，不新开 evidence 文档。
