# ADR 0006：任务验证与抓取状态分开

- 状态：已接受（Howard，2026-10-10）
- 日期：2026-10-10
- 前置：ROADMAP.md「PA · Enhanced access」第 10 项（#353）、ADR 0005

## 背景

2026-10-10，Howard 决定 PA 先做任务验证和区域就绪，再扩付费能力（#353）。原因是"抓取状态"和"任务完成"现在是一回事：

- 飞书表格页判了 `success`，内容是一个隐藏面板的文字，表格单元格一个都没有（`research/access/runs/2026-10-09-my-browser-final-round2-b6c7524.md`）。
- 已登录的 GitHub 首页、一个还没加载完的 x.com 页面没有 verified（`research/access/runs/2026-10-10-pa7-my-browser-13e2174.md`）。
- 2026-10-09 的 Steel 运行，30 次付费调用只有 6 次给出 verified 的答案（`research/access/runs/2026-10-09-pa4-steel-all-loading-76a1c70.md`）。

现状（`origin/main` `2ea30bf`）：

- **"任务完成"只在产品外面判断。** `research/access/run-set.mjs` 的 `judge()` 支持 `markdownIncludes`、`markdownMatches`、`markdownCountMin`、`minTables`、`listRecordsMin`、`field` 六种判定。92 个任务实际只用了 `markdownMatches`（89 个任务）、`markdownCountMin`（73）、`minTables`（6），请求都是 `{"formats":["markdown"]}`。
- **产品里只有 JSON 抽取会对照调用方的要求。** `json.status` 是 `complete | incomplete | invalid`，但不改变顶层 `status`。`list`、`tables`、`attributes` 只报告数量和形状，不做判断。
- **后面的决定都只看状态。** `CONTENTFUL_STATUS = {success, partial}` 决定这些地方：
  - 执行阶梯在哪一级停下（`ladder.ts`）；
  - 供应商路由的成功率（`vendorRouter.ts` 的 `contentful / attempts`）；
  - 批量任务的 `succeeded` 计数（`engine.ts`）；
  - 页面缓存只存 `success` 的页（`pageCache.ts`）；
  - `access.completion`。

## 决定

### 1. 请求：可选的任务契约 `verify`

`verify` 是一个页面选项，加进 `PAGE_KEYS`：scrape 每次请求一份；batch 和 crawl 每个任务一份，作用于每一页。

```json
"verify": {
  "checks": [
    { "type": "markdownMatches", "pattern": "Price", "flags": "i" },
    { "type": "markdownCountMin", "pattern": "\\$\\d", "min": 5 },
    { "type": "minTables", "min": 1 },
    { "type": "listRecordsMin", "min": 10 },
    { "type": "recordFields", "fields": ["name", "price", "url"], "min": 5 },
    { "type": "field", "path": "json.price", "present": true }
  ],
  "emptyOk": false
}
```

- **判定类型和 `run-set.mjs` 的六种完全一致**，参数和判法都一样，所以第 1 项的任务原样就能作为契约发给产品。
- **新增一种 `recordFields`**：`list.records` 里至少有 `min` 条记录，同时具备列出的所有字段（不在该记录的 `missing` 里）。它对应"名称、价格、链接属于同一条记录"这类要求。
- **`emptyOk: true`** 表示空结果也算完成，例如搜索没有结果。此时 `empty_verified` 的页面算通过。
- **上限**：最多 32 条判定；每个正则最长 1,000 个字符；`markdownMatches` 和 `markdownCountMin` 用 `new RegExp` 前要先编译检查，编译不通过就整个请求 HTTP 400。
- **托管服务拒绝正则判定**（`markdownMatches`、`markdownCountMin`），按名字返回 400。原因是 JavaScript 正则没法限时，一个回溯爆炸的正则会卡住事件循环。#343 刚查明，事件循环被卡住就会导致连接重置。其他四种判定托管服务可以用。
- **`/fc` 兼容层不提供 `verify`**，它是 Octocrawl 自己的选项。
- **`verify` 的键是封闭的**，不认识的键返回 400。以后要加键属于新增改动，例如第 11 项可能要的 `verify.region`：一个容器的 CSS 选择器，和 list 的 `itemSelector` 配合，用来等这块区域而不是整页。本 ADR 不实现它。

### 2. 验证器：对任意一份页面视图运行

验证器是 `packages/runtime` 里的纯函数，签名是 `verify(contract, view)`，其中 `view = { status, markdown, tables, list, json }`，不直接绑在最终的 FetchResult 上。产品对最终结果构造一份 view；第 11 项可以用页面原始 DOM 的文本另造一份 view，用同一份契约再跑一遍：

- DOM 里有、Markdown 里没有，就是"读到了但没抽到"。这是抽取的问题，不该再花钱重试。
- DOM 里也没有，就是"还没加载完"或"网站根本没给"。

view 里的字段都可以缺：

- `minTables` 有 `view.tableCount` 就用它，没有才数 `view.markdown` 里的 GFM 表格；后者和 `run-set.mjs` 的判法一致。DOM 视图可以把可见的 `<table>` 和 `role=table`/`grid` 的数量填进 `tableCount`。
- 一份 view 里没有某类判定需要的部分（例如 DOM 视图没有 `json`，`field` 判定就没法跑），这条判定记为 `passed: null`，`observed` 为 "not available in this view"，不算通过也不算失败。对最终结果构造的 view，这类判定照常判失败。

### 3. 结果：`verification`，顶层 `status` 不变

每个 scrape 结果、batch 和 crawl 的每一页（`CrawlPage`）、webhook 的 page 事件都带上：

```json
"verification": {
  "status": "failed",
  "verifier": "verify/1",
  "contractSha256": "…",
  "reason": "checks_failed",
  "checks": [
    { "index": 0, "type": "markdownMatches", "data": true, "passed": true },
    { "index": 1, "type": "markdownCountMin", "data": true, "passed": false, "observedCount": 2, "asked": 5, "observed": "2 matches, at least 5 asked" }
  ]
}
```

- **`status`** 取三个值：`passed`（每条判定都通过）、`failed`、`not_requested`（请求没带 `verify`；此时只有 `{"status":"not_requested"}`）。
- **`reason`**：`passed` 时为 `null`；`failed` 时取下面三个之一：
  - `checks_failed`：页面读到了，有判定没过；
  - `page_not_read`：页面没有读到内容，状态不是 `success`、`partial` 或 `empty_verified`，判定没有运行；
  - `empty_not_allowed`：`empty_verified`，但请求没有 `emptyOk`。
- **`checks[].data`** 和 `run-set.mjs` 的 `isData` 判法一致。`observed` 用一句话说明实际看到了什么，不带页面原文，供人看。
- **计数类判定**（`markdownCountMin`、`minTables`、`listRecordsMin`、`recordFields`）另给结构化的 `observedCount` 和 `asked`。第 11 项判断"多次读取结果稳定"，靠比较相邻两次读取的这些数字。
- **`contractSha256`** 是契约规范化后的哈希；**`verifier`** 是验证器版本，规则同 `EXTRACTOR_VERSION`：判法一变就升版本。
- **顶层 `status` 照旧，表示抓取状态。** 已有客户端不受影响。"任务完成"看 `verification.status === "passed"`。
- **Evidence Record** 新增可选块 `verification: { status, verifier, contractSha256, reason, failed: [type…] }`，登记进 `EVIDENCE_RECORD_ADDED_KEYS`，不改已有字段的含义。

### 4. 谁读验证结果

只有带契约的请求，以下行为才会变；不带契约的请求一切照旧。

| 地方 | 带契约时 |
| --- | --- |
| 执行阶梯 | 一页读到了但验证失败（`checks_failed`），先交给第 11 项的就绪分类器判断，再决定要不要升级：`not_loaded` 在当前会话里有限时地等待或执行 actions，然后重新验证，仍不过才升级（HTTP 通道的壳页面升到本地浏览器，不花钱）；`not_extracted` 不走付费级；`not_served` 按访问路线升级，在本次请求的 mode 和 access 允许的范围内，和现有的 quality hop 一样受预算和 grant 限制。分类器由第 11 项实现，第 10 项在质量跳级前留出调用它的位置；第 11 项接上之前，`checks_failed` 按 `not_served` 处理。每一级尝试的 verification 都写进 trace（`verification_checked` 事件），不只最终结果。最后挑结果时，验证通过的优先，其次才比内容多少 |
| 供应商路由历史 | `VendorOutcome` 加 `verified: boolean \| null`；有值时，成功率按 verified 算，不按 contentful |
| 批量、crawl 报告 | 加 `verified` 和 `verificationFailed` 两个计数，放在 `succeeded` 旁边；`succeeded` 含义不变 |
| 页面缓存 | 存取规则不变；命中缓存的页同样要验证，结果写进 `verification` |
| `access.completion` | 不变，仍由状态推出 |
| handoff 替换后的页 | 重新跑一遍验证，和现在重新跑 JSON 抽取一样 |
| `run-set.mjs` | 把任务的判定作为 `verify` 发给产品，记录产品给出的结果，和自己的判定逐题对比，不一致的题列在记录里 |

### 5. 各个入口

- **REST**：scrape、batch、crawl 都接受 `verify`，也都返回 `verification`。
- **MCP**：`scrape`、`batch_scrape`、`crawl` 工具加 `verify` 参数，输出里带 `verification`。
- **CLI**：`--verify '<json>'`，由 key 列表自动生成。
- **SDK**：类型从 contracts 来。
- **Python 客户端**：参数透传；表格视图加一列 `verification`。
- MCP 的工具 schema 是手写的，这次顺带加一个测试，保证 scrape 和 batch 工具的参数和 `SCRAPE_KEYS`、`BATCH_KEYS` 一致。

## 本 ADR 合入时的边界

本 ADR 只记录设计，不改代码。实现分三个 PR：

1. **契约和验证器**：`verify` 的解析和上限；验证器是纯函数，放在 `packages/runtime`；`verification` 写进 scrape、CrawlPage、webhook 和 Evidence Record；`VERIFIER_VERSION`。
   - 一致性测试：用同一批固定样本，分别跑 `run-set.mjs` 的 `judge()` 和产品的验证器，结果必须逐条一致。
2. **入口**：MCP、CLI、SDK、Python，以及 `run-set.mjs` 发送契约并逐题对比。
3. **执行阶梯和统计改看验证结果**：上表"执行阶梯""供应商路由历史""批量、crawl 报告"三行。

第 10 项的验收：
- 第 1 项全部 92 个任务以契约形式发给产品，产品的结果和 `run-set.mjs` 自己的判定逐题一致；
- 第 8 项那批需要登录的页面也照样验证一遍；
- 两份记录都写明命令和提交。

## 后果

- 调用方第一次能直接让产品回答"任务完成了没有"，不用自己写判定。
- 带契约的请求在验证失败时可能往下一级走，花更多时间；在 `enhanced` 下也可能多花付费调用。但都在调用方已经批准的 grant 和预算以内，而且每一次都会记录。
- 第 11 项（区域就绪）用 `verification.reason`、失败的判定和它们的结构化计数，再对 DOM 视图跑一遍验证器，把 `checks_failed` 细分成 `not_loaded`、`not_extracted`、`not_served`；`page_not_read` 交给访问路线处理。两项的接口在第 2、3 节和第 4 节的"执行阶梯"一行。
- 托管服务暂时不能用正则判定，等有了能限时的正则引擎再开放。

## Howard 的确认（2026-10-10）

1. 带契约时，验证失败可以让执行阶梯继续往下一级走，先过第 11 项的就绪判断；在 `enhanced` 下可能多花付费调用，都在已批准的 grant 和预算以内。
2. 托管服务先拒绝正则判定（`markdownMatches`、`markdownCountMin`），等有能限时的正则引擎再开放。
3. 顶层 `status` 保持抓取状态不变，"任务完成"只看 `verification`。
