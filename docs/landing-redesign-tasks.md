# Landing page 改版任务清单

设计稿：[Octocrawl Landing Redesign（Claude Design 画布）](https://claude.ai/artifact/GS5XkKXd6UbKAMZYWfi7eD)
- `Main.dc.html`：可交互的桌面版整页
- `Palette.dc.html`：场景配色和字符词汇

参考站：firecrawl.dev（发丝线单元格、ASCII 插图、图标网格）、attio.com（以产品演示为主角的交互）。不要列表卡片式的区块（Howard 2026-10-02 否掉了 What works today 的四张卡）。

## 总原则

- **保留现有设计风格与视觉效果。**
  - Hero 原样保留：山景、ASCII 章鱼、表单。
  - 沿用现有 tokens：`--navy #071b4f`、`--orange #f3683d`、`--text #14254a`、`--page #f7f8fb`。
  - 字体不变：Helvetica Neue 做正文和标题，品牌字用 Georgia italic，kicker 用 ui-monospace 蓝字加橙色方块。
- **动效只在字符层面发生**：只改字形、亮度、颜色，网格单元不位移，画面不扭曲。
- **只在可见时播放**，`prefers-reduced-motion` 时完全静止，标签页切到后台时暂停。
- **数据诚实**：页面上出现的数字和记录都来自真实运行记录，并写明命令或 commit；没有出处的位置留占位，不编造。
- **流程**：每组任务一个 PR，从当前 `origin/main` 拉新分支，在新的 worktree 里改 `apps/public-web`。
- 动效相关的改动，先在真实页面录一段短视频给 Howard 确认，再合并。

## P0 准备

- [ ] 从 `origin/main` 新建分支和 worktree（不要在 `codex/amazon-json-timing-mcp` 上改，那里没有 `apps/public-web`）。
- [x] 背景只用两类（Howard 2026-10-02 定）：
  - 深色区：蓝 × 橙原图，即 Hero 山景、海岸（Run it yourself）、地球（FAQ 前的 CTA）。
  - 浅色区：同一批图的墨线纸本版，multiply 叠在 `#f7f8fb` 上。
  - 紫、琥珀、青、薄荷等色族全部不用。
- [ ] 纸本版定稿：画布上的纸本图是算法映射出来的，需要确认可以直接用，还是重画。规格：1672×941 webp，单张 ≤ 250 KB。

## P1 结构与基础（1 个 PR）

- [x] **T1 区块骨架**（`sectionBar()` 按 `SECTION_BARS` 顺序自动编号，加区块时自动重排）
  - 每个区块顶部加 `[ 0N / 06 ] · LABEL` 计数条：数字用橙色，标签用 kicker 蓝。
  - 1200px 容器加左右 1px 竖线，区块之间用 1px 横线分隔。
  - 改动文件：`src/page.ts`、`src/styles.css`。
- [x] **T2 修排版问题**
  - 两条灰带：原因是 `.proof` 和 `.status-never` 的 `margin-bottom: 104px` 穿透出白色区块（margin collapse）；给浅色区块加 `display: flow-root` 修好。
  - Examples 左栏：改成 sticky，标题跟着右边长卡片一起停留。
  - Why 标题区：标题在左、导语在右。
- [x] **T3 Hero 到正文的字符溶解带**（`glyphBand()`，构建时生成）
  - 替换现在的硬切白底：用 `▓▒░×+:·` 逐行变稀，过渡到页面底色。
  - 构建时生成静态 `<pre>`，不需要 JS。
- [x] **T4 记录跑马灯**（Hero 下方；重复的那份列表对读屏隐藏）
  - 只放已记录的结果：docs.firecrawl.dev、amazon.sg B000NI69YA、linkedin.com/feed，以及 103/106、0.0%、62/72。
  - 实现：CSS marquee 加一份重复列表；悬停时暂停；reduced motion 时静止。
- [x] **T5 共享动效工具 `whenVisible(el, start, stop)`**（`src/motion.ts`，目前用于跑马灯）
  - 基于 IntersectionObserver，同时处理 `visibilitychange` 和 `prefers-reduced-motion`。
  - 后面所有动效都走这一个入口。
- [x] 页脚联系方式：邮箱 hello@octocrawl.dev 和 GitHub issues。
- 验证（全部做完）：
  - `npm run build --workspace @w2l/public-web`
  - 用 Playwright 截图 1440 和 390 两个宽度。
  - 确认预渲染出的 HTML 里包含全部正文。

## P2 What comes back 演示卡

- [x] **T6 用一张大演示卡替换 Examples 区**
  - 布局：左边是 ASCII 线框表示的原网页，右边是结果 ledger。
  - Markdown / Product JSON / Honest failure 三个 tab 同时切换左右两边。
  - 沿用 `main.ts` 里现有的 tab 键盘逻辑，以及现有的 ledger 数据和图注。
- [x] **T7 三张 ASCII 线框**
  - Markdown：标出 nav 和 footer 被去掉、main 被保留。
  - Product：标出每个字段在页面上的位置。
  - Failure：画出 robots.txt 检查到停止的流程。
  - 标注只写记录里有的内容。
- [x] 区块标题后面加一团淡淡的 ASCII 字符云，字符集 ` ·:+×#`，构建时生成。
- 验证：
  - tab 能用键盘操作（方向键、Home/End）。
  - 屏幕阅读器能读到完整的记录文本。

## P3 Why Octocrawl：Firecrawl 式两格（浅色纸本区）

- [x] **T8 左格 "Fewer false successes."**
  - ASCII 字符填充的对比条，tab 切换两个指标。数据来自 `docs/benchmark-gate.md` 的 run `35423895294` · `main@6dc2e6e`：
    - Verified completion：66.1 / 32.1 / 14.3
    - False success：0.0 / 67.9 / 81.8
  - 图下写清：固定合成测试集、自家测试、不是独立审计。不比较速度和成本。
- [x] **T8b 右格 "103 of 106 passed."**
  - 一张逐行淡出的记录表，底部放章鱼徽记和一条 ASCII 波纹。
  - 6 行全部来自同一份 run record：S01、S12（允许诚实的 blocked）、F10 通过，J05、J04、A36 没通过。
- [x] **T9 106 格运行图**，跨两格全宽，悬停或聚焦显示 case。
  - 数据来自 `research/parity/runs/2026-09-30-main-6024703.md`（`src/realSiteRun.ts`）：没通过的是 A36（未运行：缺联系地址，单独重跑 8/8）、J04（robots.txt 经代理超时）、J05（Cloudflare 验证页）。
  - 另外提供一个可访问的文字版。
- [x] 进入视口时，数字和对比条动画只播放一次（用 T5 的工具）。

## P4 What you can count on（Firecrawl 图四式）和 Run it yourself

- [x] **T10 节点图**：YOUR AGENT → Octocrawl → robots.txt ✓ → PUBLIC PAGE。
  - 节点之间用发丝线连接，Octocrawl 节点用章鱼标志，外面一圈橙色弧线。
- [x] **T10b 两格**
  - 左格 Checked fields：同心圆加 ASCII 光晕，中间放字段来源小表。
  - 右格 Five formats：4×2 图标网格（Markdown、Links、Page info、Fields、JSON、PDF、Copy、Download），悬停显示格式说明和文件类型。
- [x] **T10c 结果状态**：一排 5 个图标格（success / blocked / incomplete / timed out / failed），每格配原因。
- [x] **T10d Open source 格**：左边文字，右边 navy 终端。
- [x] **T11 Run it yourself**
  - 背景换成蓝色海岸原图，左侧压 navy 渐变。
  - 保留 4 个 tab 和 Copy 按钮；切 tab 时代码逐行打出。

## P5 状态、CTA、FAQ、页脚（新顺序）

页面顺序：… 06 Works today → 地球 CTA → FAQ（最后一个内容区）→ 页脚。

- [x] **T12 What works today 改成图标网格**，删掉原来的四张列表卡。
  - 可用能力：10 格，每格标"THIS PAGE"或"YOUR COMPUTER"。
  - Next：5 个虚线格。
  - On hold 和 Not planned 各压成一行文字。
- [x] **T13 地球 CTA**：放在 FAQ 前面。大字 "Start with one link."，第二个 URL 输入框接同一个 submit 逻辑和同一套额度提示。
- [x] **T14 FAQ**：左侧放 ASCII 字符云；保留 `<details>/<summary>` 结构。
- [x] **T15 页脚**，分五块：
  - 品牌和 Star 按钮
  - Product
  - Docs
  - Legal：Terms、Acceptable use、Privacy、AGPL-3.0
  - Contact：GitHub issues、仓库、邮箱、Contact 页
  - 依赖：terms 和 acceptable-use 页面要先发布；邮箱要由 Howard 提供。

## P6 收尾打磨

- [ ] 移动端 390px 整页检查：场景图降亮度，演示卡改成上下排列，106 格自动换行。
- [ ] 性能：
  - 首屏以下的场景图懒加载，用 IntersectionObserver 加背景 class。
  - 对比改版前后的 LCP 和 CLS。
- [ ] reduced motion 全页检查：所有动画静止，内容完整。
- [ ] 对比度检查：深色场景上的说明文字、浅色区的灰色文字。
- [ ] `npm run build` 加 docs 构建通过；预渲染、OG 卡、`llms.txt` 不受影响。

## 待 Howard 决定

1. 纸本版背景能否直接用，还是要重画（P0）。
2. Terms / Acceptable use 里待 owner 决定的部分：运营方、国家、适用法律、免责条款措辞。页面现在以草稿形式上线，带草稿提示。
