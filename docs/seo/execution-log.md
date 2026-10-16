# Octocrawl SEO execution and release record — 2026-10-16

当前状态回填：首轮可执行交付和两批网站发布已完成；整份任务尚未全部闭环。下面历史章节保留当时事实，当前状态以本表及文末“已核验发布与剩余任务”覆盖。Cloudflare完整规则读取和固定地区SERP受阻；外部资料完整核对未完成；独立日期Google效果复测已排期但未执行。本次状态回填仅更新执行日志与同步task文件，不新增源码改动或部署；用户后续已授权提交、PR和合并这批文档。

## 首轮工作位置与边界（历史基线）

- Checkout: `/Users/howard07/.codex/worktrees/octocrawl-seo-20261016/w2l`
- Branch: `codex/octocrawl-seo-20261016`
- 基线：`bc47bf0e62b07c45b517c2761f1ccb8c7e599073`；执行 `git ls-remote` 与 `git fetch origin main`，确认当时远端主线相同。
- 原始任务：`/Users/howard07/Code/w2l/docs/seo/2026-10-16-octocrawl-seo-task.md`；只读副本在本 checkout 的 `.w2l/seo-20261016/task-source.md`。
- 检查了上级路径和基线仓库指令；适用仓库 `AGENTS.md` 与本次用户指令。读取了 ROADMAP 当前阶段，仅实施用户明确授权的 SEO 范围。未委派 Agent。
- 现有附件为空，其他 worktree 均属不同任务；新建并附加独立 worktree，没有切走旧分支。原目录 `codex/amazon-json-timing-mcp` 上所有 tracked dirty diff、Git status 与任务文件均逐字比较未变，根目录 `task.md` 未编辑、暂存或提交。
- 原始证据：本 checkout 的 `.w2l/seo-20261016/`，Git 忽略。日志/响应/CSV/截图不进入读者文章或提交。
- Runtime: Node `v26.8.1`，满足仓库声明 `>=22.13.0`；`npm ci --ignore-scripts` 安装独立依赖。安装了当前 Playwright 对应的官方 Chromium 测试运行时；未改 package manifest/lockfile。没有初始化额外抓取内核或付费供应商。

## 任务状态

| ID | 当前状态 | 已交付与剩余边界 |
| --- | --- | --- |
| SEO-00 | done | 独立主线 worktree 与工作边界已核验；本次文档分支从 b063b69f 建立。 |
| SEO-01 | in_progress | 公开检查、GSC基线、BIC事件关联及提案已完成；完整规则/顺序读取 blocked（403），Google/Bing影响未知，生产例外未应用。 |
| SEO-02 | done | 字典、导出、历史覆盖缺口及最小埋点修补完成；不声称已有两个完整可比观察窗口或完整漏斗。 |
| SEO-03 | in_progress | 映射、官方资料和定性优先级完成；固定地区 Google SERP 被验证页阻挡，未取得受控排名基线。 |
| SEO-04 | done | 范围内元数据、Schema、规范入口及构建/线上检查完成；无已证实框架缺陷，不重建框架。 |
| SEO-05 | done | 工具、API复制、MCP/RAG及首页身份表达已交付并发布；不扩展抓取能力。 |
| SEO-06 | done | 4.42.0真实客户端限定v1验证完成，迁移文已发布；双方Hosted性能/成本比较仍为conditional，未做且未宣称。 |
| SEO-07 | done | 四个合成判定fixture与复现步骤已发布；不等同于实站质量胜率，扩展区域案例尚未新增验证。 |
| SEO-08 | in_progress | Google单轮12题已记录；ChatGPT/Perplexity受阻，后续日期未到；PyPI/目录完整刷新未做。 |
| SEO-08A | in_progress | 诊断与网站修复上线 done；外部资料一致性 in_progress；Google纠错效果 conditional，等独立日期复测。 |
| SEO-09 | done | 本地/CI/发布/线上证据已交付并在本次回填；索引和引用效果保留未完成。 |

## 审阅顺序

1. [基线与访问证据](audit-baseline.md)：生产、源码、GSC与未知项分别记录。
2. [页面意图与选择](page-intent-map.md)：为何改这些页面、为何不重写其他页面。
3. [衡量字典与真实计数](measurement.md)：原始数据粒度/覆盖、少量测试访问、事件能力边界。
4. [AI可见性](ai-visibility.md) 与 [12题实际回答](ai-answer-sample-2026-10-16.md)：GSC Beta与平台抽样分别记录。另见[客户端验证](firecrawl-client-verification.md)、[Cloudflare日志与提案](cloudflare-access-2026-10-16.md)。
5. [迁移草稿](drafts/firecrawl-migration.md)、[质量案例草稿](drafts/http-200-task-completion.md)保留审阅阶段文本；它们在PR #526转为两篇公开文章，当前发布地址和验证见文末。
6. [事实证据表](claim-evidence.md)：逐项能力、版本、模式、时间和限制。

## 读者可见与行为修改

| 位置 | 修改及原因 |
| --- | --- |
| `src/page.ts` | 首页FAQ纠正 capability hint 的请求日志说法：当前已是POST body；自动生成的FAQ Schema随正文保持一致 |
| `src/tools/linkExtractor.ts`、对应HTML入口、`toolSections.ts` | 搜索标题/描述、hero、hub和FAQ明确 sitemap+起始页链接、500上限、不递归爬完所有页面；共享错误说明不承诺识别所有错误 |
| `src/tools/conversionExample.ts`、Markdown/Text页面、`tools.css` | 同一合成HTML实际转换为Markdown/纯文本；展示heading/link/table/code差异、输入、日期和局限；长代码在容器内横向滚动 |
| `content/connect-mcp.md` | 连接/工具存在与任务内容完成分开；解释not_requested/passed/readiness和实际排错 |
| `content/blog/web-scraping-for-rag.md` | 不自动导入partial/空正文/明确失败或未就绪结果；当前guard用合成样本核验，历史0.3.2/47chunks证据保留原日期，未伪装重跑 |
| `analytics.ts`、`main.ts`、`docs.js`、`mapResults.ts`、`scrapeCode.ts` | 复用原事件：加页面path，复制完成才计数，补map导出/产品代码复制；修复map提取链接被导航点击记录的隐私缺口 |
| `docsPages.mjs`、`blogPosts.mjs`、`build-docs.mjs` | 仅实质更新页面的lastmod/updatedDate移到16 Oct，历史实测日期不改 |

## 验证与证据

- `npm run build:public`：PASS；前端TypeScript/Vite/文档生成完成。已有734.8kB decorative ASCII chunk警告与基线相同；没有声称性能或Core Web Vitals改善。
- `npm run typecheck`：PASS。仓库测试类型检查覆盖范围按现有tsconfig执行；新增应用测试另由Vitest实际执行。
- 最后一次聚焦联合运行：**12个测试文件，153项通过，0失败/跳过**，结果 `.w2l/seo-20261016/final-tests.json`。包括page/tool/hub/docs/blog/API页面、格式转换、隐私/站点接收、预览、任务状态浏览器和Firecrawl合同fixture；未运行全量困难站点/冻结产品验收。
- 埋点7项接收端回归：Beacon与fallback只交付一次，路径参数最小化，未知URL字段拒收，DNT/GPC客户端与服务端抑制，提取链接不记导航。原map选择器复现为2个事件而非1个；修复后通过。证据 `map-link-before-fix.log` / `analytics-tests.log`。
- 实际构建页的浏览器检查：6个重点页面 × 1440/390宽度，12个视图，HTML状态200、1个H1、Schema解析、无页面横向溢出/页面脚本错误。使用真实本地接收端与注入抓取fixture验证文本复制/下载、失败复制不计数、map复制/CSV、API与MCP文档代码复制、私网拒绝。`browser-qa.json`及各宽度截图。首页更改另做390宽度FAQ正文/Schema及截图；最终共享工具文案与首页又做1440/390共8个视图复核，见`final-render.json`。无全站视觉通过声明。
- Get code复制另测成功/拒绝写入，实际本地日志只新增1个成功事件：`get-code-browser.json`。
- 转换样例由真实converter生成并逐字比较：`conversion.json`。RAG准确执行文章Python区块：7个合成输入、5项保守跳过、3个chunks；`rag-fixtures.json`。质量稿中的完整复现命令也实际执行：`quality-reproduce.log`。
- 未mock的公开正对照：从**本地**预览服务真实HTTP读取 example.com，返回可读内容且UI明确 `Page read · Task unverified`；`local-positive.tool.json`。不是对任意站点、字段准确性或Hosted API的验证。
- 25个本地sitemap URL与生产成员完全一致；39份HTML检查；索引页title/description唯一、1个H1、self canonical、Schema可解析；真实静态内链/锚点零断链。动态auth路径不误报静态缺页。`built-audit.json`。
- `git diff --check` PASS。两篇草稿不出现在生产构建的sitemap/llms。原checkout dirty diff/status/task文件逐字未变。

可重复的维护检查（在本checkout执行）：

```bash
npm run build:public
npm run typecheck
npx vitest run apps/public-web/test/page.test.ts apps/public-web/test/toolPage.test.ts apps/public-web/test/toolsHub.test.ts apps/public-web/test/docsPages.test.ts apps/public-web/test/blogPosts.test.ts apps/public-web/test/scrapePage.test.ts apps/public-web/test/markdownText.test.ts apps/public-web/test/analytics.integration.test.ts apps/public-web/test/taskCompletion.integration.test.ts packages/public-preview/test/site.test.ts packages/public-preview/test/preview.test.ts packages/contracts/test/firecrawl.test.ts
W2L_PUBLIC_PREVIEW_PORT=18876 npm run public:preview:local
```

本轮本地服务已在 `127.0.0.1:18876` 启动供审阅；如果进程已退出，最后一条命令可重建启动。仅本机、内存quota、无登录后台。临时检查脚本在`/tmp`运行并在结束时清理；可维护的功能回归保留在仓库测试中。

验证时曾遇到的测试设置问题：缺Playwright Chromium运行时、测试logger选项名和fixture DOM默认导航、测试定位器/事件观察时序；修正测试环境/脚本后实际结果如上。没有将失败当作通过，也没有因此改变产品抓取行为。

## 首轮发布前外部状态（历史快照，已由文末发布汇总更新）

- 本轮变更：本地；本地提交后用 `git log -1` 查看交付commit，`git diff bc47bf0..HEAD` 审阅全部改动。
- Push：未执行。PR：未创建。Merge：未执行。Deploy/发布：未执行。生产Cloudflare/GSC/Cloud Run设置：未修改。
- 索引：本轮改动尚未上线，不能有其索引结果；基线24 indexed / 工具URL已索引属于原生产状态。
- AI引用：GSC Beta基线2次展示，与后续Google AI Mode单轮12题独立；该轮6次名称出现、0次Octocrawl官方正文引用，不代表稳定推荐或变更效果。
- 没有购买、付费运行、联系外部人员或创建定时任务。

审阅后若继续：先决定是否接受这批本地网页/埋点变更；任何推送、PR或发布需用户后续明确授权。迁移稿已完成限定版本实际客户端核验，可审阅收紧后的v1稿；尚未注册公开路由。Cloudflare已有verified-category阻挡证据与最小提案，但完整配置/顺序仍需只读复核，生产修改另等授权。发布后的观测从真实T0开始，不从今天开始计增长。

## 同日追加：SEO-06 / SEO-08 / SEO-01

- 当前工作仍属同一SEO审阅批次，在原独立分支继续；新一轮 `git fetch origin main` 仍为bc47bf0e，未引入主线漂移或其他窗口变更。
- 新增可维护 `scripts/seo/verify-firecrawl-client.mjs`；官方SDK装在/tmp，未改仓库依赖。真实API→合成目标10/10符合预期，含v2/JSON/未知参数/skip拒绝；先前公开目标SDK调用的成功、真实404及错误改写完整保留。脚本不mock SDK/engine，不将负例PASS记成能力支持。
- 聚焦验证：脚本语法检查通过；真实SDK集成10/10；既有Firecrawl合同24/24。此轮没有应用源代码改动，因此未重复首轮整站构建/153项套件，前述首轮通过记录仍标原范围。
- Google AI Mode 12个固定问题各新问题采一次，保存原回答/实际href/AX/DOM与截图；ChatGPT B1显示Model not found，Perplexity B1要求注册。没有重写问题刷答案、登录新账号或执行生成代码。
- 现有Wrangler OAuth可读Cloudflare事件；七天77条，10条AI Assistant BIC block；与首轮4个CF-RAY精确匹配。rulesets/Bot Management GET403和GraphQL失败查询均保留；没有扩大授权范围。
- 本轮追加原始证据在 `.w2l/seo-20261016/followup/`，私有/忽略；77份追加证据的SHA-256清单与validation-summary.json已保存；只提交可审阅文档、草稿和复现脚本，未提交日志/截图/客户端依赖。
- 新API仅loopback供测试，检查后停止；原18876网页预览保留。所有网站/规则/SDK兼容范围结论均按实测边界，未推送、开PR、部署、发布或改生产配置。

## 发布批次（2026-10-16，用户后续明确授权）

本节覆盖此前“仅本地、不推送/PR/合并/部署/发布”的边界：用户已授权本批PR、合并、网站部署及文章发布；未授权Cloudflare安全规则、外部目录/外联或npm/PyPI版本发布。下述发布状态以追加记录及实际PR/Cloud Run证据为准，旧章节保留当时事实。

- 两篇经验证稿已转成读者内容并注册 `/blog/firecrawl-v1-migration/`、`/blog/http-200-task-completion/`；复用现有插画资源，通过可选cover字段复用，不复制大图。博客共8篇，sitemap共27URL，HTML与Markdown、Schema/内链已生成。
- `npm run build:public`、`npm run typecheck`、12文件153项聚焦测试PASS；新文章1440/390四视图均1H1、canonical/Schema正常、图片可读、无全页横向溢出；27索引URL标题/描述唯一、实际静态引用零断链。
- [实体混淆分析](entity-confusion-analysis-2026-10-16.md)已完成；task md新增总表SEO-08A/P1与7.3的诊断、实施、复测闭环，SEO-06/09/T0观测交叉引用。原路径任务文件与本checkout版本相同。A诊断完成，B实施/C效果复测未完成；不将本批发布称为Google纠错完成。
- 附加域名诊断题带自动页面上下文，答案回到Octocrawl但无官方引用；保留混杂，不并入原12题。直接来源访问的超时和web取回正文的范围均记录。
- 发布前检查与后续发布原始证据保存在 `.w2l/seo-20261016/release/`。该段记录的是发布前阶段；两批PR/merge/deploy实际结果见下一节。

## 已核验发布与剩余任务（2026-10-16状态回填）

本节按已保存的发布原始记录及本次只读PR状态复核填写，不重跑产品测试，不把记录时间冒充本次线上复测。此前的“未推送/PR/部署/创建计划”只描述对应历史阶段。

| 批次 | PR / merge | 源码 / 发布证据 | 验收范围 |
| --- | --- | --- | --- |
| 首轮网站、埋点和两篇内容 | [#526](https://github.com/77777R7/Octocrawl/pull/526)，11:21:08上海时间合并，merge `98127d4136614551de6841e67faa04a75b931e54` | source `0d1a066f8c35071aa7fd9c2a72b6e8bc6ca2a0e4`；[发布JSON](../../.w2l/seo-20261016/release/release-result.json)；[CI](https://github.com/77777R7/Octocrawl/actions/runs/38843966671) | 本地153项；远端247文件/2976通过/2跳过，Windows通过，崩溃恢复8/8；27URL公开核验 |
| 品牌身份与准确入口 | [#527](https://github.com/77777R7/Octocrawl/pull/527)，14:13:49合并，merge `b063b69f7854907451dd8a4513a8d5e55f432f97` | source `13226e8faf7e813e1fe5617e609d743a11ad9a4c`；[发布JSON](../../.w2l/seo-08a/release/release-result.json)；[CI](https://github.com/77777R7/Octocrawl/actions/runs/38858816065) | 本地86项/272引用；远端同上；[线上交付](../../.w2l/seo-08a/release/public-delivery.json)：27URL、3重点HTML逐字节、10JS/CSS哈希及6桌面/手机视图通过 |

两批构建源码树分别与合并后的主线树一致；没有将PR状态当成部署证明。第二批发布核验记录（14:19前）为 `w2l-public-preview-identity-13226e8f` / `r89identity` 接收100%流量，`r88seo` / `w2l-public-preview-seo-0d1a066f` 保留回滚。环境及密钥引用保留不变。当前文档整理没有重新读取生产流量，也没有再部署。

已公开：[Firecrawl v1迁移](https://octocrawl.dev/blog/firecrawl-v1-migration/)、[HTTP200与任务完成案例](https://octocrawl.dev/blog/http-200-task-completion/)、[首页](https://octocrawl.dev/)、[介绍](https://octocrawl.dev/docs/)、[MCP](https://octocrawl.dev/docs/connect-mcp/)。源码与文章的限定版本/合成fixture范围不因发布而扩大。IndexNow通知200/27URL不证明已索引；第一批CDN清理OAuth401未执行，第二批未清缓存，实际版本文件匹配。

### 未完成项和明确条件

| 子项 | 状态 | 缺少什么 / 下一个动作 | 证据 |
| --- | --- | --- | --- |
| Cloudflare相关配置、顺序及效果 | in_progress | 控制台已读相关zone配置，单条例外已Active；Wrangler接口仍403，真实verified命中/放行及Google/Bing影响待核验 | [追加访问及应用记录](cloudflare-access-2026-10-16.md) |
| 生产BIC例外应用 | done | 相关配置复核、精确dry-run和用户单列授权完成；15:25:32应用并逐字段回读，日志开启，仅跳过BIC；效果验收仍在上一项 | 同上 |
| 固定地区Google SERP | blocked | 验证页阻挡；保留backend搜索发现，不能标受控地区排名完成 | [意图映射](page-intent-map.md) |
| 两个完整观察28天窗口 | conditional | 已导出相邻日历窗，但历史覆盖不足；等待可比数据，无法补造前窗历史 | [衡量字典](measurement.md) |
| ChatGPT / Perplexity完整抽样 | blocked | B1分别Model not found/注册门槛；各余11题未测，不以零代替 | [原始AI样本](ai-answer-sample-2026-10-16.md) |
| PyPI和目录逐条一致性核对 | todo | 尚未完成新核对/具体错项与建议文字，不是已经证实缺权限；不改第三方条目 | [资料清单](ai-visibility.md) |
| Hosted竞品性能/成本表及扩展区域质量案例 | conditional | 未取得双方可比实测/冻结样本或新增区域复现；现有限定迁移和最小fixture文章已完成 | [客户端记录](firecrawl-client-verification.md)、[质量文章](https://octocrawl.dev/blog/http-200-task-completion/) |
| 新抓取/索引检查 | conditional | 2026-10-23 10:00上海时间；已创建计划，未执行 | [计划记录](../../.w2l/seo-08a/release/followups.json) |
| 原12题独立日期复测/Google纠错验收 | conditional | 2026-11-13和11-20各10:00；每题分别判实体、能力、入口和官方正文引用；已排期不等于完成 | [原基线](ai-answer-sample-2026-10-16.md)、[计划记录](../../.w2l/seo-08a/release/followups.json) |
| 外联/购买/第三方资料改写、60/90天自动运行 | deferred | 本批未授权，未执行；不扩大已有两项限定计划 | [当前task](2026-10-16-octocrawl-seo-task.md) |

两项计划本次只读确认ACTIVE：`octocrawl`（一次10月23日检查）、`octocrawl-google-ai-12`（两次11月独立采样）。原12题及10月16日样本保持原文件不变，不追加当日重测来刷结果。

### 本次文档同步范围

- 从 `origin/main@b063b69f7854907451dd8a4513a8d5e55f432f97` 建立本地分支 `codex/seo-task-status-20261016`。
- 维护本执行日志，并把同一份v1.2 task写入本checkout与 `/Users/howard07/Code/w2l/docs/seo/2026-10-16-octocrawl-seo-task.md`；其他历史报告/草稿保留原时点。
- 原dirty checkout的根 `task.md`、tracked diff和其他未跟踪文件保留。状态回填完成时尚未提交、推送、创建PR或部署；用户随后已授权这批文档的提交与合并，实际提交状态以Git/PR为准。上述网站发布状态只属于#526/#527。

## 15:25:32追加：SEO-01单条BIC例外已应用

- 状态回填文档已在[PR #529](https://github.com/77777R7/Octocrawl/pull/529)于15:09:18合并，merge `0c27a7bf912ae43d4511c3c2dabb07972a7a6b33`；4项CI均通过，没有网站部署。此次记录分支 `codex/seo01-bic-exception-20261016` 从该最新主线建立。
- 用户登录控制台后，相关zone配置读取可用；Wrangler OAuth安全配置接口仍403。单独授权精确例外后，先再次对原JSON执行服务器dry-run，HTTP200/success，随后部署一次。
- 15:25:32应用：ruleset `1d4beb2b55e5423db6b756069d64f2d3` v1，rule `82f36f42e92a4ab0aa74e34608de6411` v1。回读全部获批字段一致，Active、products=[bic]、logging.enabled=true，列表1/5。全局BIC仍on，Bot Management前后响应相同。只新增这一条规则，未扩大路径、类别、方法或跳过产品。
- 回滚入口已只读确认：该规则自己的Menu > Disable，未执行。保留应用前无custom entrypoint的404、真实PUT200及新GET200，规则/版本与截图可定位。不删除整套规则，不关闭全局BIC。
- 应用后约2分钟的GraphQL窗口返回0条事件；这不是零访问或零命中结论。9次reference-fetch被工具私网地址校验挡在网站检索之前；另3次web工具报告不可访问，无ray/状态/身份，不归因为Cloudflare。真实verified AI Assistant命中及成功正文、Google/Bing影响仍未验收；没有伪装UA或关闭工具保护。
- 15:32:02普通urllib默认UA请求robots仍403/1010，新ray `a4b55e12ac89d3dd-KIX`已在截至15:34:05的后续GraphQL窗口精确关联：bic/block/403、verified类别为空、sampleInterval1。该窗口共返回这一条事件，未返回新skip规则事件；此负例不代替真实AI Assistant成功验收或零流量结论。
- [完整访问记录](cloudflare-access-2026-10-16.md)、[本地应用manifest](../../.w2l/seo-task-status-20261016/cloudflare/application/manifest.json)。原12题及历史基线不变；task升级v1.3并同步原入口。应用阶段这3份文档仅在本地；用户随后授权这批记录提交、PR并在CI通过后合并，实际Git/PR状态另列，原dirty checkout其他工作保留。

## 15:50–15:54追加：真实AI客户端读取通过，身份/规则关联仍待验收

- Codex通过已安装Firecrawl MCP读取MCP介绍与文档介绍两页，请求maxAge=0/basic、HTML及Markdown，无UA伪装或stealth回退。两次均返回目标statusCode200、完整正文、正确主标题和官方MCP/仓库入口；交付URL与带标记的请求URL一致。分别保存17,375/10,353字符Markdown、34,329/20,231字符HTML及哈希、scrapeId；各报告1 credit。
- 返回数据没有CF-RAY或verified身份。15:50:03至15:54:31的GraphQL窗口HTTP200、无错误、返回0条事件，不能关联新规则ID/身份/响应，SEO-01继续in_progress。不能把MCP成功读取解释为Cloudflare识别了AI Assistant，或归因给该例外。
- OpenAI web工具两次精确URL读取不可访问；独立Google AI Mode精确URL访问探针遇unusual-traffic/reCAPTCHA，未取得回答，不解验证码、不再生回答。它不是原12题复测，原题/答案/计数/独立日期安排均未更改。
- [客户端验收manifest](../../.w2l/seo-task-status-20261016/cloudflare/acceptance/manifest.json)包含完整交付、响应检查、GraphQL窗口和受阻记录。本轮只提交既有task、Cloudflare报告和本执行日志3份文档；不提交原始日志/截图，不再改生产规则或部署网站。
