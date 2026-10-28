# 每周复盘

状态：v0.1，2026-10-28。**提议，未经 Howard 批准**；负责人是 Howard（[decisions.md](decisions.md) S-04），是否建定时任务待定（S-18）。
这份文件规定每周看什么、拿什么判据去对、怎么记。**它不新增指标**：指标与周期在 [框架 §6.2](../core-seo-framework.md)，继续还是停的判据在 §6.4，数据卫生在 §6.5。

## 为什么要有它

框架写了每周要看什么，但之前没有任何东西在每周把数字取出来、拿判据去对、把决定记下来。此前没有周期性的取数与复盘：[measurement.md](../measurement.md) 写明 “No recurring task was created”，`weekly-report.mjs` 只在有人手工运行时才出报告，SEO 相关的定时任务都是一次性的检查。SEO 的改动因此成了一个个单点。复盘就是把「取数、判断、动手、复测、回写」连成一圈的那一步。

一条规则：**每个动作必须对得上框架里的一个条目**（章节号，或 S-/G- 编号）。对不上的想法不直接做，写进 [decisions.md](decisions.md) 作为对框架的修改提议，等 Howard 决定。

## 什么时候、谁来

- 每周一次，建议周一：Search Console 的数据滞后约 2 天，周一取到的窗口截止上周六。
- 里程碑另加：2026-11-13、11-20 的 Google AI Mode 12 题重测（框架 阶段 0）；2026-12-06 的 GTM 第 45 天复盘；2027-01-17 的第 16 周复盘。竞品表（[competitors.md](competitors.md)）每月或有重大变化时刷新。
- 负责人是 Howard（S-04）。项目目前只有他一个人，所以**一次复盘只占他读一页的时间**：取数、对判据、起草记录由 agent 做，记录开头有一块「需要你决定」，他读这一块、批准其中的动作；数字不让他手抄。
- 是否建每周定时任务：待定（S-18）。定时任务是仓库之外的常驻配置，建之前要 Howard 批准。没有批准之前，这份文件是手动执行的清单，由 agent 在 Howard 要求时跑。

## 一次复盘的步骤

1. **取数。**运行快照脚本 `NODE_USE_ENV_PROXY=1 W2L_PROJECT_ID=<项目> node scripts/seo/snapshot.mjs --update-tracker`（取数方法和限制见 [data-sources.md](data-sources.md)）。看摘要开头的「Not read」：没读到的来源在记录里写「未读」和原因，**不用上周的数填，不写 0**。记下快照编号、源提交、走代理还是直连。
2. **查数据卫生（框架 §6.5）。**窗口和上周一样长吗（不一样就不比较）；位置 64 到 99 的展示不当作增长；Firecrawl 对比数字注意任务集（50 个与 92 个不混用）；不用脚本抓 Google 搜索结果。
3. **填「数字」表。**数字从快照摘要抄，不重算；和上次复盘并排放。AI 助手来源的页面浏览数和 ChatGPT 的标记情况在摘要的「First-party site analytics」里。AI 助手来源的页面浏览数是下限（没有来源、没有标记的访问算直接访问）；ChatGPT 标记比例不是下限：它只算能认出是 ChatGPT 的访问（有标记，或有 ChatGPT 来源页），标记消失时表现为每天的 ChatGPT 访问变少，不一定是比例下降。Search Console 的「生成式 AI 表现」和 Bing 的「AI Performance」没有文档化的 API。每周定时任务用 Claude in Chrome 在 Howard 已登录的 Chrome 里**只读**这两个页面：只打开网址、读页面文字，不点任何控件、不导出（三个网址见 [data-sources.md](data-sources.md)）。页面文字原样存到 `<主检出>/.w2l/seo/manual-reads/<读数日期>/raw/`，合计、窗口和读数日期写进同目录的 `notes.md`。Chrome 没开、扩展没连上、没登录或页面读不到时，那个报告写「未读」和原因，不拿别处的数填。Howard 手工导出的文件放同一个目录，同样算一份读数。表里每个报告分别抄最新一份有数字的 `notes.md`，写明读数日期和窗口；它早于本次复盘当天，就写「上次读数 <日期>」，不当作本周读过；一份都没有就写「未读」。两个报告的窗口都不是 28 天，也互相不同，不相加。
4. **查新页面。**上线后第 2、4、8 周的页面，逐个看收录结论、第一次展示、第一个查询（追踪表 [page-tracker.md](page-tracker.md)）。追踪表里没有的写「未知」。
5. **对判据（框架 §6.4）。**每条判据填：条件、本周的值、状态（不适用、未到期、数据不足、未触发、触发）。数据不够就写数据不足，不下结论。
6. **GEO 一块。**协议（[geo-protocol.md](geo-protocol.md)）批准后才填；批准前这一块写「未启动」。
7. **写动作。**每个动作：做什么、对应的框架条目、是否需要 Howard 批准（框架里每个「做」都要批准）、做完的判断标准。需要他批准的汇总到记录开头的「Needs your decision」，一周的批准一次问完，不零散地问。
8. **回写。**这周变了的活表一并更新：追踪表（脚本已回填）、[internal-links.md](internal-links.md)（新页面上线前登记）、[keyword-map.md](keyword-map.md)（重读过 SERP 才改）；有决定就在 [decisions.md](decisions.md) 记一行；数字变了的框架行改成新数字并写明来源快照。
9. **存档。**记录写成 `research/seo/<日期>-weekly-review.md`，走一个 PR。**写完不再改**；错了在下一次复盘里更正并说明。

## 判据表（抄自框架 §6.4，阈值是内部提议）

| 判据 | 条件 | 触发后 |
|---|---|---|
| 位置变化的评价 | 一批页面上线后至少 4 周，且每个页面组至少 100 次展示 | 不到就写「未到期」或「数据不足」，不评价位置 |
| 证据页试点 | 4 周后过半数页面是「已抓取，尚未编入索引」或仍无展示 | 不加量，先检查页面是否真有独有内容（G1） |
| 重复或软 404 | 一批页面的大多数被 Google 判为重复或软 404 | 停发，检查模板（G4、G17） |
| 楔子切换 | GTM 第 45 天（2026-12-06）复盘触发「切换楔子到 RAG 构建者」 | B 组页面优先级下调，D 组上调 |

## 记录模板

复制到 `research/seo/<日期>-weekly-review.md`（记录用英文，和其他研究记录一致）：

```markdown
# SEO weekly review YYYY-MM-DD

Snapshot: <id>, source commit <sha>, working tree clean|dirty, run proxied|direct. Compared with: <earlier review date|none>.
Run by: <agent session>, for Howard (owner, decision S-04). Search Console window: <start> to <end> (<days> days).

## Needs your decision
- <action or question, the framework item it comes from, and what happens if it waits>. (Write "nothing this week" if there is nothing.)

## Not read this week
- <source>: <reason>. (Unknown, not zero.)

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review | Change |
|---|---:|---:|---:|
| Impressions (28 days) | | | |
| Clicks | | | |
| Average position | | | |
| Impressions on pages averaging position 20 or better, of all | | | |
| Visible queries naming octocrawl | | | |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | | | |
| Site visitors, last 7 days (visitor-days) | | | |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | | | |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day (a tag that has gone shows as fewer views a day) | | | |
| Search Console "generative AI" report and Bing "AI Performance" (no documented API; read by the weekly task in Howard's signed-in Chrome, read-only; for each report copy the newest notes.md in manual-reads that has numbers for it, with its read date and window; write "not read" and the reason if there is none) | | | |

## Index changes since the last review
- <path>: <verdict> to <verdict>

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|

## GEO (only after the protocol is approved; otherwise "not started")

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|

## Library and framework updates made
- <file>: <what changed and from which snapshot>

## Open questions and things that could not be checked
```

## 不做的事

- 不抓 Google 搜索结果做排名（政策 G20）；需求数据来自 Search Console。
- 不把没测到的写成 0，不用别处的数填空。
- 不在复盘里直接改页面：改页面是「动作」，要对得上框架条目，需要批准的先批准。
