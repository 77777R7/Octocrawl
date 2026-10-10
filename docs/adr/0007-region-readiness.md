# ADR 0007：任务所需区域的就绪

- 状态：已接受（Howard 2026-10-10 确认，三个问题都按建议）
- 日期：2026-10-10
- 前置：ROADMAP.md「PA · Enhanced access」第 11 项（#353）、[ADR 0006](0006-task-verification.md)（第 10 项，#355）

## 背景

第 11 项要求两件事：

- **等的是任务要的那块区域，不是整页。**
- **一个没就绪的结果要说明是哪一种：**
  - 还没加载完：可以在同一会话里再等，或者操作一下；
  - 加载了但没抽到：这是抽取的毛病，不该再付费重试；
  - 根本没给：路线、访问权限或地区的问题。

验收要求在四个真实页面上把这三种分开，并且第 1 项的健康对照和各批真实站点不能变差。四个页面是：一个还没加载完就被读的 x.com 页面、Tesla 的库存空壳、OECD 的表格、WSJ 的行情数据。

### 2026-10-10 在这四个页面上看到的情况

本地 API 跑在 `92411b4`，走代理。浏览器采样脚本每秒读一次 DOM：

- **x.com（my-browser 通道，`research/access/runs/2026-10-10-pa7-my-browser-13e2174.md` 的 L4）**
  - 第一次读到的文档是 386 KB，结果是 `failed`/`empty_unverified`。
  - 再读一次是 516 KB，这次通过了验证。
  - 原因在 `packages/api/src/chromeHandoff.ts:610`。这条通道在 `readyState` 为 complete、没有拦截、状态码 2xx 时就算"可以读了"，连续 3 次（每次间隔 500 ms）满足就读。它没有加载提示探测，也不检查页面是否还在变化。
- **WSJ 行情（T066）**
  - HTTP 通道拿到的是一个写着 "Loading…" 的空壳。`quality_client_rendered` 的原因是 `loading_text`，结果带 `client_rendered_suspected` 和 `low_content_yield` 两个警告。
  - 多数运行里，它升到 browser_local 后通过验证。今天有两次，执行阶梯升到 browser_local 之后又用回了 HTTP 的答案，成了假成功，原因还没查清（`research/access/runs/2026-10-10-pa4-steel-all-streaming-d24b38a.md`）。
- **OECD 表格（T010）**
  - 在 Chromium 里：
    - 前 12 秒正文一直是 235 个字符，没有加载提示，也没有进行中的请求；
    - 到 15 秒才出现 "Loading"，18 秒时正文长到 1.5k 字符；
    - 默认显示的是 "Overview" 标签，表格在 "Table" 按钮后面；
    - 点了之后 URL 变成 `vw=tb`，可是到 44 秒仍然没有 `<table>`。为什么没有表格，**未确认**。
  - browser_local 在常规 1.5 秒的稳定判断后就读了，结果是 `failed`/`empty_unverified`。
  - Steel 那边是 `success`，但没有表格，所以是假成功。
- **Tesla 库存（B003）**
  - 本地是 403 `bot_detected_generic`，属于根本没给（访问）。
  - Steel 拿到的是 200：库存页上有筛选器，"Results" 一节是空的，写着 "within 200 miles of"，后面没有地点，还有 "Don't see the Tesla you're looking for?"。
  - 结果是还在加载，还是因为 Steel 会话所在地区本来就没有结果，**未隔离**。

### 现有的信号

- **`LOADING_PROBE`**（`packages/bench/src/browserSettle.ts`）：只在全页正文不超过 4,000 字符时生效，查看有没有可见的 `aria-busy` 或简短的加载提示文字。
- **加载提示的等待：** 页面带加载提示时，最多再等 `LOADING_WAIT_MAX_MS` = 8 秒；读的时候提示还在，结果就带 `page_still_loading`。
- **HTTP 空壳：** HTTP 通道的空壳原因有 `script_shell`、`hydration_shell`、`loading_text`、`aria_busy` 等，对外是 `client_rendered_suspected` 警告。
- **其他警告：** `low_content_yield`（内容少的答案仍被采用）、`list_not_exhausted`（列表步骤没走到底）。
- **失败原因：** `waitFor` 被截止时间截短会给出 `timeout`；访问层的结果是 `blocked` 加原因、`http_error`、`policy_denied`；网络层是 `dns_error`、`connection_error`、`tls_error`；抽取器找不到正文是 `empty_unverified`。

### 缺的是什么

1. **稳定判断是整页的。** 连续两次快照相同就结束等待，所以一个稳定的空壳（OECD 前 12 秒）也会让等待结束。
2. **没有哪条通道会说不就绪是哪一种。** 执行阶梯只能看状态和内容多少。
3. **my-browser 通道没有加载判断。**

## 决定

### 1. 区域从哪里来

- **有契约时：** 任务要的区域，就是请求里 `verify` 契约（ADR 0006）的那些判定。浏览器通道在页面上直接对一份 DOM 视图跑一遍这些判定。
- **列表格式：** `formats: [{type: 'list', itemSelector, fields}]` 的 `itemSelector` 和 `fields` 也算区域：要求记录在，记录的字段也齐。
- **以后的 `verify.region`：** 一个容器的 CSS 选择器，按 ADR 0006 的说法作为新增键另加，这次不做。
- **不带契约的请求：** 还是只按整页信号判断，等待方式和现在一样。

### 2. 在浏览器通道里等区域就绪

适用于 browser_local、provider 和 my_browser 三条通道。

**DOM 视图。** 在现有的稳定判断（和调用方的 `waitFor`、`actions`、列表步骤）之后，如果请求带了契约，就每 500 ms 读一次页面的 DOM 视图，交给 ADR 0006 的 `verify(contract, view)`：
- `markdown` 用 `body.innerText`，`markdownIncludes`、`markdownMatches`、`markdownCountMin` 就在它上面跑；
- `tableCount` 填可见的 `<table>` 和至少两行的 `role=table`/`grid` 的个数，`minTables` 用它，不去数 Markdown 里的表格（ADR 0006 第 2 节）；
- `list` 按 `itemSelector` 读出记录；
- 没有 `json`：`field` 这类判定在 DOM 视图上会报 "not available in this view"，判断就绪时跳过，不算通过也不算不通过。

**什么时候算就绪：** 下面两种情况满足任意一种。
- 所有判定在连续两次读取中都通过，而且计数（ADR 0006 的 `observedCount`）没有变化；
- 契约写了 `emptyOk`，页面稳定，并且列表区域确实是空的。

**等多久。**
- 默认最多再等 10 秒；
- 不超过请求的 `timeout`，并且要留出截取页面的时间；
- 不额外花钱，用的是同一个会话；
- 过了期限仍没就绪，就读页面里当时有的内容，并记下结果没有就绪。

**DOM 视图只用来判断就绪。** 交给调用方的验证结论仍然只看抽取后的结果（ADR 0006）。每次等待写一条 trace 事件 `region_wait`，记下等了多久、最后一次各个判定的计数，以及有没有就绪。

### 3. 结果说明是哪一种

每个 scrape 结果和每个 crawl 页面都带：

```json
"readiness": { "state": "not_loaded", "basis": ["page_still_loading"], "waitedMs": 8000 }
```

`state` 有四种取值：`ready`、`not_loaded`、`not_extracted`、`not_served`。`basis` 写判断依据的信号代码，只写信号名，不带页面原文。

| state | 什么时候 |
| --- | --- |
| `not_served` | 状态是 `blocked`（含登录墙 `login_wall`、地区限制 `geo_restricted`），或失败原因是 `http_error`、`policy_denied`（robots 或策略拒绝）、`dns_error`/`connection_error`/`tls_error`。或者，有契约时页面已经稳定、没有加载提示，DOM 视图上判定也不通过 |
| `not_loaded` | 读的时候页面还显示加载提示（`page_still_loading`）。或 HTTP 通道是空壳（`client_rendered_suspected`）。或等到期限时页面还在变。或 `waitFor` 被截短。或列表步骤因为截止时间停下。或有契约时 DOM 视图上判定不通过、页面还在变 |
| `not_extracted` | 有契约时：DOM 视图上判定通过，抽取后的结果上不通过。没有契约时：`empty_unverified`，但页面已经稳定、没有加载提示，可见正文也不少（阈值在实现时用真实页面定，写进测试） |
| `ready` | 有契约时验证通过。没有契约时：`success`/`partial`，而且上面那些信号都没有 |

- **HTTP 通道：** 不渲染，所以判断不了"加载了但没抽到"。空壳算 `not_loaded`，要换浏览器读。
- **Evidence Record：** 新增一个可选块 `readiness: { state, basis }`，登记进 `EVIDENCE_RECORD_ADDED_KEYS`。

### 4. 执行阶梯

ADR 0006 已经在质量跳级前面留了一个位置：带契约时遇到 `checks_failed`，先问这里的分类器。

| 分类 | 阶梯怎么做 |
| --- | --- |
| `not_loaded`，在浏览器通道 | 先用第 2 节剩下的等待时间在同一会话里再等，然后重新验证。还不就绪，再按现有的跳级规则升级 |
| `not_loaded`，在 HTTP 通道 | 升到 browser_local。这一步不花钱，和现在的质量跳级一样 |
| `not_extracted` | 不升到付费的级别，免费的级别照常可以走。结果带上 `not_extracted` 返回，写进路线历史，但不算这个供应商失败 |
| `not_served` | 照现有的访问路线升级，受 mode、access、grant 和预算限制 |

不带契约的请求，执行阶梯照旧。

### 5. my-browser 通道

- 判断"可以读了"时加两条：用 `LOADING_PROBE` 看有没有加载提示；页面在两次读取之间不再变化（文档大小和正文长度）。
- 最多再等 8 秒，到期就读，标成 `not_loaded`。
- 带契约时也照第 2 节等区域就绪。

## 实现顺序

1. **PR 1：通用的分类，不依赖第 10 项。**
   - 加 `readiness` 字段（contracts、Evidence Record、各条通道），只用现有信号判断。
   - my-browser 通道补上第 5 节的加载判断和稳定判断。
   - 用本地 fixture 测试四种情况。
2. **PR 2：在 ADR 0006 的 PR 1（契约和验证器）合入之后做。**
   - 浏览器通道按第 2 节等区域就绪；
   - 用 DOM 视图把 `not_extracted` 和 `not_served` 分开。
3. **PR 3：执行阶梯接上分类器。** 按第 4 节，在 ADR 0006 留的位置接入。
4. **验收运行：**
   - 第 1 项的 92 个任务带契约跑一遍；
   - 健康对照的几批真实站点各跑一遍；
   - 需要登录的 my-browser 页面跑一遍；
   - 每份记录写明命令、提交，以及是否走代理。

第 11 项的验收：四个页面上能把三种情况分开。目前已经知道 x.com 和 WSJ 是 `not_loaded`；Tesla 本地是 `not_served`；Steel 拿到的那份和 OECD 还要看等区域就绪之后的结果。同时，健康对照和各批真实站点都不能变差。

## 后果

- 带契约的请求，在浏览器通道上最多会多等 10 秒，但不多花钱。
- 页面加载完但抽取没抽到时，不会再为它付费升级。
- 不带契约的请求只多一个 `readiness` 字段，行为不变。
- OECD 这样的页面，默认显示时根本没有表格，要操作才有。光靠等待解决不了，结果会如实标成 `not_loaded`（等到期限页面还在变），或 `not_served`。要拿到表格，调用方得自己写 `actions`。产品要不要替调用方猜该点哪里，不在这个 ADR 里定。

## Howard 的确认（2026-10-10）

1. **`readiness` 是不是每个结果都带，就绪的也带 `ready`？** 确认：都带。和 `verification.status` 的 `not_requested` 一样，客户端不用先判断字段有没有。
2. **区域就绪的等待默认上限多少？** 确认：10 秒，调用方可以通过 `timeout` 放宽。OECD 光是显示 Overview 就要 16 秒，10 秒不够，它会被标成 `not_loaded`。
3. **`not_extracted` 时，只禁止升到付费的级别，免费的级别照走？** 确认：是。
