# P2 剩余任务清单（map 组之后）

依据：[ROADMAP.md](../ROADMAP.md) 的 P2 表和 P5 表、[AGENTS.md](../AGENTS.md)。核实基于 `main` 的 `3cfd6a8`（#103 合入 map 组之后），日期 2026-10-03。

## 总原则

- **流程**：每组一个分支、一个 PR，都从当前 `origin/main` 拉，在 `.claude/worktrees/` 下开新 worktree。分支落后 `main` 不超过一组。
- **先复现再改**：缺口先写一个会失败的测试（本地 fixture），`research/parity/sites.md` 有对应真实站点的，再补真实站点用例。
- **真实站点验收**：开 PR 之前先跑，记录写进 `research/parity/runs/<YYYY-MM-DD>-<label>-<commit>.md`，写明命令、commit，以及走代理还是直连。
- **状态 CSV**：每组完成后生成一份 `research/parity/status-<日期>-<组名>.csv`，形式和 M2 各组一样；同时更新 ROADMAP 的 Current phase 段落和 P2 表的 Status 行。
- **证据诚实**：没测过的值留 null 或写 unknown；失败、被拦、不完整的条目都留在分母里；`docs/evidence/` 和带日期的记录不改结论，只追加新记录。
- **对外动作**：发布 npm 或 PyPI、注册组织名、部署，都要 Howard 明确点头才做。
- **完成标准**：功能 solid，即能用、有测试、真实站点用例通过、行为与文档一致。PR 合并或测试全绿本身不算。

## 进度核实（roadmap 与代码对照）

| 项 | ROADMAP 写的 | `main` 上实际 | 结论 |
| --- | --- | --- | --- |
| map 组 | 7 solid、2 weak，"not yet merged"（P2 表第 100 行） | #103 已合入（`3cfd6a8`） | 完成；P2 表的 Status 行过时，要改 |
| 核心 29 项 | map 之后 22 solid | 核对 CSV 后同样是 22 solid、4 paused（search）、2 missing、1 partial | 一致。要到 25，还差 `cache-max-age`、`platform.sdk.js`、`platform.sdk.python` |
| 缓存 | P2 只要求 `maxAge`；P5 要求全部 4 项 | 完全没有。`maxAge` 在原生路由和 `/fc` 上都返回 400 `unsupported_parameter`（`packages/contracts/src/api.ts:720`、`firecrawl.ts:225`） | 从零开始 |
| 表格 → CSV | P2 一行 | 只有 GFM 表格（`extract-tf/src/markdown.ts:202`）；没有 `tableIndex`，也没有 CSV 输出；审计表里没有对应 id | 新功能 |
| PDF 选项 | 不在 P2 表里，属于审计的 M3 | PDF 文本已在 `main`（#69）。页标记一直开着，不能关；`parsers`、`pages`、`pageMarkers`、请求级 `maxPages` 在任何入口都不存在 | 4 个 id 都还是 missing |
| npm 包 | `@w2l/cli`、`@w2l/sdk`、`@w2l/mcp` | **没有 `packages/cli`**：`w2l` 命令挂在私有包 `@w2l/bench` 下面。所有包都是 `private: true`，只有 ESM，没有 README 和 `files` 字段。npm 上 `@w2l/*` 一个都查不到 | 需要先拆出 CLI 包 |
| Python 客户端 | `pip install w2l` | 不存在。PyPI 上 `w2l` 目前 404，名字看起来没人占 | 新建 |
| P0 包名注册 | 未勾选 | npm 组织是否已注册：仓库里查不到；需要用 Howard 的账号确认 | 卡在 Howard |
| CLI 的 M2 选项 | "w2l CLIs have no flags" | `w2l crawl` 和 `w2l scrape` 没有任何 M2 选项的 flag；`batch`、`map`、`serve` 三个子命令都不存在 | 一致，范围比"补 flag"大 |
| `w2l serve` on Windows | P2 一行 | 没有 `w2l serve`。服务入口是 `w2l-api`（`npm run api`）；`scripts/section-c/local-service.mjs:10` 只支持 macOS；CI 只跑 ubuntu | 先要有 `serve` |
| 1,000 URL `kill -9` | P2 一行 | 现有记录只覆盖 2 个 URL、1 个 loopback 主机（`docs/evidence/batch-crash-recovery*.json`） | 新测试 |
| 吞吐基准 | P2 一行 | 没有 `docs/benchmarks/`，也没有测"每分钟页数"的脚本 | 新建 |
| 两篇指南 | P2 一行 | 都没有。最接近的是 `docs/batch-scrape.md` | 新建 |
| 自定义 headers、移动视口 | P2 一行："Recorded in the Evidence Record" | 功能本身已 solid（M2 execution）；但 `evidenceRecord` 里**没有**这两个字段（`packages/contracts/src/evidenceRecord.ts:113-138`），只记在 trace 和合规记录里 | **原清单漏了这项**，建议并入缓存组 |
| map 组遗留：http lane 的 Content-Encoding | 已在记录中点名 | `fix/http-lane-content-encoding` 分支在另一个 session 的 worktree（`elastic-heisenberg-15ceb4`）里，还没有提交 | 属于别的窗口，这里不做 |

## G1 map 组（完成）

- [x] `POST /v1/map`、`/fc/v1/map`、MCP `map` 工具，以及 9 个审计 feature：7 个 solid，2 个 weak。#103，记录在 [runs/2026-10-03-m3-map.md](../research/parity/runs/2026-10-03-m3-map.md)。
- [ ] 顺手修一处文档：ROADMAP P2 表 map 行的 Status 改成"已合入 #103"。放进 G2 的 PR 里改。
- 遗留（不排期，已在记录中点名）：`map_timeout` 提示里统计的未读文件数，漏掉了读到一半被中断的那个文件；sitemap 条目里的 robots 排除目前只有 fixture 验证；`map-limit` 的修复（`45d707c`）还没在真实站点重跑。

## G2 缓存组（核心，约 4 天）

审计 id：`scrape-execution.cache-max-age`（core）、`cache-min-age`、`store-in-cache`、`lockdown-cache-only`，以及 `scrape-formats.metadata-cache-state`。按 Firecrawl v4.42.0 冻结的名字来做。

- [ ] **T2.1 缓存存储**
  - 键：规范化后的 URL，加上所有会影响输出的选项，包括 formats、`onlyMainContent`、`includeTags`、`excludeTags`、`headers`、`mobile`、`waitFor`、lane 限制等。键里的选项要逐项列出并配测试，不能漏。
  - 值：原始响应体（或指向它的 artifact）和原始抓取的完整 Evidence Record。
  - 存储放在 task root 下，复用现有 SQLite 和存储接口（ADR 0003）。
- [ ] **T2.2 请求选项**：`maxAge`、`minAge`、`storeInCache` 和仅缓存模式（Firecrawl 叫 `lockdown`）。要在 scrape、batch、crawl 三种请求，以及 REST、SDK、MCP、`/fc` 四个入口上都能用。
  - 仅缓存模式未命中时，返回有名字的错误，不发起任何请求。
- [ ] **T2.3 响应字段**
  - 命中时必须带 `cacheState: "hit"`、`cachedAt`（原始抓取时间），以及原始抓取的 Evidence Record：其中 `fetchedAt`、`robotsDecision` 和各个 hash 都取自原始抓取。
  - 只有真的去抓了，才能写 `miss`。没查缓存时写 `cacheState: null`，或者干脆不带这个字段，不能猜成 `miss`。
  - `/fc` 映射成 `metadata.cacheState` 和 `metadata.cachedAt`；同时删掉 `firecrawl.ts:47` 那条"left out until W2L has a cache"的说明，以及断言这两个字段不存在的测试。
- [ ] **T2.4 与 `useCached` 的关系**：审计（`core-features.csv:11`）说 `useCached` 不会生效，但这条早于 crawl resume 功能。核实后发现，`POST /v1/crawl/:id/resume` 会重新抓已有页面，只有 `useCached` 能让 resume 复用这个爬取任务自己的页面。所以保留 `useCached`，只在文档里写清它和 `maxAge` 的区别：前者只复用本任务的页面，后者跨请求复用缓存。（2026-10-03 修正）
- [ ] **T2.5（补进来的 P2 行，Howard 已确认并入）Evidence Record 记录自定义 headers 和移动设备**
  - 新增字段，例如 `request.headers`（凭证类 header 已经被拒，所以可以记名字和值）和 `request.device`。
  - 按 `packages/contracts/src/evidenceRecord.ts` 的版本规则，只做新增的改动留在 `w2l.evidence/1`：新字段在 schema 文件里是可选的（`EVIDENCE_RECORD_ADDED_KEYS`），W2L 照常每条都写。不升 `EVIDENCE_SCHEMA_VERSION`。（2026-10-03 修正：原来写的"升一次版本"不符合这条规则）
- [ ] **T2.6 文档**：缓存语义（默认值、哪些选项算进键、命中时证据里显示什么）写进 API 参考和 `docs/firecrawl-shim.md`。
- 验收：
  - 单元测试：命中、未命中、`minAge`、`storeInCache: false`、仅缓存模式未命中、键里每个选项各自的变化。
  - 真实站点：同一 URL 连抓两次，第二次 `cacheState: "hit"` 且 `cachedAt` 等于第一次的 `fetchedAt`；`maxAge: 0` 必须重新抓；batch 和 crawl 各跑一例；`/fc` 跑一例。
  - `npm run typecheck`、`npm test`。
  - 核心 29 项变成 23 solid。

## G3 研究者数据组

### 表格 → CSV

- [ ] **T3.1 输出形状**：新增 `tables` format，每个数据表一项 `{ tableIndex, caption, sourceUrl, csv, rows, columns }`。
  - 复用 `expandGrid` 展开 colspan 和 rowspan，复用 `dom.ts:119` 区分版式表格和数据表格。
  - 表格的 `tableIndex` 要和 `fieldEvidence` 里 `table[i]` 定位用的编号一致。
- [ ] **T3.2 CSV 规则**：符合 RFC 4180 的转义；表头行单独标出；合并单元格的处理方式写进文档（建议展开后重复填值）；单元格里的链接保留文本，URL 另存一列或者丢弃，二选一并写进文档。
- [ ] **T3.3 入口**：scrape、batch、crawl 一致；SDK、MCP、CLI 都能拿到；CLI 支持每个表写一个 `.csv` 文件。
- 验收：
  - 挑 10 个真实表格页，冻结后不再替换，例如 Wikipedia GDP 列表、OWID grapher、scrapethissite、GOV.UK 统计页、SEC 多表页、带 rowspan 的页面。
  - 每页逐格对照，0 错位；结果记录进 `research/parity/runs/`。
  - StatCan 在本机两种网络下都打不开，不选它。

### PDF 选项（审计 M3）

- [ ] **T3.4 `scrape-formats.pdf-parser`**
  - 支持 `parsers: ['pdf' | { type: 'pdf', mode?, maxPages? }]` 和 v1 的 `parsePDF`。
  - `mode: 'ocr'` 按名字拒绝，因为 roadmap 明确不做 OCR。
  - 响应里带 `numPages` 或 `totalPages`。
- [ ] **T3.5 `scrape-formats.pdf-pages`**：`pages: true` 时返回 `pages[{ pageNumber, markdown }]`。数据来自现成的 `FilePdfText.pages`。
- [ ] **T3.6 `scrape-formats.pdf-page-markers`**：`pageMarkers` 变成可开可关。原生入口默认保持开着（现有行为）；`/fc` 默认关，与 Firecrawl 一致。
- 不做：`llm-agentic.parse.pdf-pages`。它要 `/v2/parse` 和文件上传，属于 Paused 表（Howard 2026-10-03 确认跳过）。
- 验收：在 `research/pdf-corpus/` 的 10 份报告上，`maxPages`、`pages`、`pageMarkers` 各跑一遍；`/fc` 跑一例；`npm test`。

## G4 发布组（约 8 天）

- [ ] **T4.0（Howard）注册包名**：npm 组织 `@w2l` 和 PyPI 名 `w2l`（P0 里还没勾）。需要 Howard 本人的账号。
- [ ] **T4.1 拆出 `@w2l/cli`**
  - 新建 `packages/cli`，`bin: w2l`，子命令 `scrape`、`crawl`、`batch`、`map`、`serve`。
  - 把 `@w2l/bench` 里的 `w2lCli`、`ladderCli`、`crawlCli` 迁过去；bench 只保留基准测试相关的命令。
- [ ] **T4.2 补 M2 选项的 flag**（M2 留下的尾巴）
  - crawl 的 URL 控制：`includePaths`、`excludePaths`、`regexOnFullURL`、`ignoreQueryParameters`、`deduplicateSimilarURLs`、`crawlEntireDomain`、`allowSubdomains`、`allowExternalLinks`、`sitemap`。
  - 任务类：`maxConcurrency`、`idempotencyKey`、`webhook`。
  - batch：`ignoreInvalidURLs`、`appendToId`。
  - formats：`images`、`attributes`、`screenshot` 及其参数、`html`、`rawHtml`、`json`。
  - 页面选项：`onlyMainContent`、`waitFor`、`timeout`、`includeTags`、`excludeTags`、`headers`、`mobile`、`fastMode`、`blockAds`、`removeBase64Images`。
  - map 的全部选项，以及 G2、G3 新增的 `maxAge`、`tables`、`parsers`。
  - 每个 flag 都要有 `--help` 文字和测试；flag 和 API key 的对应关系由 `PAGE_KEYS`、`CRAWL_KEYS`、`BATCH_KEYS`、`MAP_KEYS` 生成，避免以后再漏。
- [ ] **T4.3 `w2l serve`**：启动本地 API，复用 `w2l-api` 的代码；跨平台，不依赖 launchd。
- [ ] **T4.4 可发布的包**
  - `@w2l/sdk`、`@w2l/cli`、`@w2l/mcp` 去掉 `private`，加 `files`、README、`publishConfig`。
  - SDK 增加 CJS 构建（`platform.sdk.js` 审计缺口）。
  - `@w2l/contracts` 发布还是打包进去，要定下来。
  - 许可证：MIT 的 `@w2l/mcp` 依赖 AGPL 的 `@w2l/api`，G4 开始前定（见文末"仍待决定"）。
- [ ] **T4.5 Python 客户端**
  - 放在顶层 `python/`，用 httpx 和 Pydantic，按 `plan-to-70.md:171` 的计划；同步版本先行。
  - `w2l.batch(urls).to_pandas()` 返回 DataFrame，带证据列：`finalUrl`、`fetchedAt`、`status`、`reason`、`httpStatus`、`lane`、`rawSha256`、`outputSha256`、`cacheState`。
  - 测试用 `.w2l/pyenv` 虚拟环境，不用系统 pip。
- [ ] **T4.6 发布**：Howard 点头后再发 npm 和 PyPI。发布后在干净目录里验证 `npx @w2l/cli@latest scrape <url>`、`npm i @w2l/sdk`、`pip install w2l`。
- 验收：
  - `npm pack` 后在干净目录安装 tarball，跑通 scrape、batch、map；Python 端到端跑一个 batch 并导出 DataFrame。
  - 核心 29 项变成 25 solid（`platform.sdk.js`、`platform.sdk.python`）。
  - P1 遗留的"一行安装"在 macOS 上 5 分钟内出结果；Windows 放到 G5。

## G5 可靠性与性能组

- [ ] **T5.1 1,000 URL、20 个域名，中途 `kill -9` 再恢复**
  - 通过门槛：loopback fixture，20 个 `*.test` 或 `*.localhost` 主机名，每个 50 个 URL，可重复跑，进 CI。
  - 断言 0 丢、0 重：每个 URL 恰好完成一次，服务端命中计数等于 1，状态里的计数前后一致。
  - 再跑一次真实站点版本（20 个公开域名）并留记录，只作为参考。
- [ ] **T5.2 吞吐基准**，结果写进 `docs/benchmarks/`
  - HTTP lane：32 并发、跨域，目标 ≥500 页/分钟、p50 <800 ms。
  - 浏览器 lane：8 个 context，目标 ≥60 页/分钟、p95 <8 s。
  - 脚本放进 `packages/bench`；每份结果写明机器配置、网络环境（代理或直连）和 commit。
  - 没达标就如实写出来，不调口径。
- [ ] **T5.3 `w2l serve` 在 Windows 上稳定**
  - 新增 GitHub Actions `windows-latest` job：安装、`serve`、跑一个 loopback batch、停止、重启、resume。
  - 一键安装（`npx @w2l/cli@latest scrape`）在 Windows 上 5 分钟内出结果。
  - 是否还需要一台真实 Windows 机器，G5 开始前定（见文末"仍待决定"）。

## G6 两篇指南

- [ ] **T6.1 "URL 列表 → 带证据的 CSV"**：以数据中心来源为例，用种子用户清单里的公开 URL，不碰 workbook。走 CLI 和 Python 两条路径，讲清每个证据列是什么意思、失败行为什么要留着。
- [ ] **T6.2 "在论文里引用网页数据"**
  - 讲 Evidence Record 各字段怎么写进方法部分，访问日期和 hash 怎么引用。
  - 提醒涉及个人数据可能需要伦理审批。
  - Evidence Pack 是 Pro 功能，只提一句，不作为前置条件。
- 验收：找一个非作者按指南走一遍并留下记录，这也算进 P2 出口的"非作者安装"。

## P2 出口（不是 agent 任务）

- [ ] 核心 29 项中 25 项 solid（G2 加 1，G4 加 2）。
- [ ] 种子用户用 W2L 产出的数据跑一次回归。
- [ ] 一个非作者在干净机器上独立装好 W2L，并跑完第一个 batch。

## 建议顺序与依赖

G2 → G3 → G4 → G5 → G6。

- G4 的 T4.2 要用到 G2、G3 新增的选项，所以排在它们后面。
- G5 的 Windows 项依赖 G4 的 `w2l serve` 和已发布的 CLI；T5.1、T5.2 不依赖 G4，可以先做。
- G6 依赖 G3 的 CSV 输出和 G4 的 Python 客户端。
- T4.0（注册包名）现在就可以让 Howard 去做，不必等前面几组。

## 决定记录

Howard 2026-10-03 确认：

1. **缓存默认值**：原生入口默认 `maxAge: 0`，即不复用，除非请求里显式要求；`/fc` 只认请求里显式传入的 `maxAge`，不套用 Firecrawl 的 4 小时默认值。
2. **T2.5 并入缓存组**：headers 和移动设备写进 Evidence Record。后来核实，这是 v1 内的新增改动，不升 schema 版本（见 T2.5）。
3. **PDF 只做 3 项**：`llm-agentic.parse.pdf-pages` 跳过（需要文件上传，属于 Paused）。
4. **1,000 URL 测试的门槛**：loopback 的 20 个主机名作为通过门槛，真实 20 域名的那次只作为参考记录。
5. **许可证**（2026-10-03 确认）：`@w2l/cli` 和 `@w2l/mcp` 用 AGPL-3.0-only，内置引擎，一行 npx 即可使用；`@w2l/sdk` 和 Python 的 `w2l` 用 MIT。

仍待决定：

- **Windows 验收**（G5 前定）：只用 CI 的 `windows-latest`，还是另外在一台真实 Windows 机器上跑一次。
