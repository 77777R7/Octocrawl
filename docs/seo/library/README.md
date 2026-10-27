# Octocrawl SEO 资料库

状态：v0.1，2026-10-28 建立。
一句话：**[核心 SEO 框架](../core-seo-framework.md) 是决定，这里是它用到的活数据、协议和题库；[研究记录](../../../research/seo/) 是冻结的证据。**Howard 在 2026-10-27 确认核心框架是 SEO 的核心，后续优化都围绕它做。

## 三层各管什么

| 层 | 在哪 | 怎么变 |
|---|---|---|
| 决定 | [`docs/seo/core-seo-framework.md`](../core-seo-framework.md) | 改框架要说明为什么改；所有「做」逐项批准后才实施 |
| 活数据、协议、题库 | `docs/seo/library/`（本目录） | 随时更新；每次更新留版本日志或在 [decisions.md](decisions.md) 记一行 |
| 冻结的证据 | `research/seo/<日期>-<主题>.md` | **写完不再改**；要新证据就新增一份带日期的记录 |

原始取数（JSON、GSC 响应、站内链接抓取）放在 `.w2l/seo/<日期>/`（git 忽略）。删除 worktree 前要先归档。

## 文件

| 文件 | 是什么 | 状态 | 更新时机 |
|---|---|---|---|
| [keyword-map.md](keyword-map.md) | 71 个关键词归哪个页面、现状如何（没有搜索量与难度） | 活表 v0.1 | 每次重读 SERP 或页面上线 |
| [competitors.md](competitors.md) | 11 个竞品的站点结构、采用度、第三方流量估算 | 活表 v0.1，2026-10-27 取数 | 每月或有重大变化 |
| [internal-links.md](internal-links.md) | 29 个页面当前的内链关系，新页面登记模板 | 活表 v0.1，2026-10-27 抓取 | **每个新页面上线前**登记 |
| [page-tracker.md](page-tracker.md) | 每个页面的主承接词、收录、28 天展示点击位置 | 活表 v0.1 | 每周 |
| [policy-gates.md](policy-gates.md) | 20 条发布闸门，来自 Google、Bing、IndexNow 官方规则 | **提议，未批准** | 官方政策变化时 |
| [data-sources.md](data-sources.md) | 每个数据从哪来、怎么重新取、有什么限制 | v0.1 | 取数方法变化时 |
| [geo-protocol.md](geo-protocol.md) | AI 助手可见度的观测协议：指标、采集、复查循环、规则、站点前置条件 | **提议，未批准**，没跑过 | 批准后每次试点后修订 |
| [geo-prompts.md](geo-prompts.md) | GEO 观测题库 v0.0.1：124 条 prompt，每条带来源，标应提及与否 | **未批准**，未被任何助手问过 | 见题库内的维护规则 |
| [decisions.md](decisions.md) | 决定与待决事项的记录 | 活 | 每次有决定 |

## 研究记录

| 日期 | 文件 | 内容 |
|---|---|---|
| 2026-10-27 | [core-seo-framework-research](../../../research/seo/2026-10-27-core-seo-framework-research.md) | Search Console 基线、11 个竞品 sitemap、71 个关键词 SERP 线索、HN 与 GitHub 社区信号、采用度与流量估算、外链途径、搜索引擎政策 |
| 2026-10-27 | [geo-research](../../../research/seo/2026-10-27-geo-research.md) | 官方爬虫与 AI 搜索文档、引用机制的学术与行业研究、稳定性与测量方法、追踪工具、AI 来源流量识别、coding agent 的发现渠道、外部题库的适配分析、站点实测 |

## 已有的相关文档（2026-10-16 那一批）

在核心框架之前写成，仍有效，但页面意图与计数以框架和本库为准。

| 文件 | 内容 | 关系 |
|---|---|---|
| [page-intent-map.md](../page-intent-map.md) | 页面与搜索意图 | 部分过时：框架 §4.1 接替；两篇后上线的文章没有收进去 |
| [measurement.md](../measurement.md) | GSC 与第一方指标字典 | 仍是指标口径的出处；基线数字以框架 §6.1 为准 |
| [ai-visibility.md](../ai-visibility.md) | 12 个固定问题与记录模板 | 是 GEO 唯一的基线；协议在它之上扩展 |
| [ai-answer-sample-2026-10-16.md](../ai-answer-sample-2026-10-16.md) | Google AI Mode 样本 | 冻结的基线；其中「hosted 抓取与批量被拒绝」的判断已过时 |
| [entity-confusion-analysis-2026-10-16.md](../entity-confusion-analysis-2026-10-16.md) | 为什么 AI 把 Octocrawl 说成 Octoparse | 「说对率」里「当成 Octoparse」一类的出处 |
| [claim-evidence.md](../claim-evidence.md) | 已核对的页面断言 | 写页面与核对要点时的依据；尚未获 Howard 批准外发 |
| [cloudflare-access-2026-10-16.md](../cloudflare-access-2026-10-16.md) | Cloudflare 对 AI 助手的拦截与例外规则 | GEO 站点前置条件的出处 |
| [audit-baseline.md](../audit-baseline.md)、[execution-log.md](../execution-log.md)、[2026-10-16-octocrawl-seo-task.md](../2026-10-16-octocrawl-seo-task.md) | 那一批的审计、执行日志、任务单 | 历史记录 |

## 更新规则

1. **未知不是 0。**没测到的写「未知」，不用估算或别处的数字填。
2. **每个数字能回到来源。**来源在研究记录或 [data-sources.md](data-sources.md) 里；回不去的不写。
3. **不改旧记录。**新证据 = 新的带日期的研究记录；活表更新时标取数日期。
4. **失败、被拦、不完整的也记。**不要在题集冻结后换题或删题。
5. **只写 Octocrawl。**旧名只留在 AGENTS.md 列出的标识符里。
6. **不搬用外部文档。**参考别家方案只借方法，用自己的话和自己的证据重写。
7. **SERP 线索不是名次。**搜索工具的结果列表不能当成 Google 或 Bing 的位置引用。
8. **没有测过的能力、站点、客户端，不写进页面或题库的「应提及」。**

## 新增一次调研的清单

1. 在 [decisions.md](decisions.md) 写下要回答什么问题、为什么现在做。
2. 写取数方法（命令、是否走代理、源提交），先在研究记录里留好位置。
3. 取数；被拦的写「被拦」；**至少让一个独立的验证者抽样复核**，并把它没复核的部分写出来。
4. 写成 `research/seo/<日期>-<主题>.md`，原始数据放 `.w2l/seo/<日期>/`。
5. 更新本库的活表和框架里引用它的数字，在 decisions.md 记一行。
