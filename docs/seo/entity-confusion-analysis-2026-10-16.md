# Google 为什么把 Octocrawl 说成 Octoparse — 2026-10-16

## 结论与证据等级

本次最有依据的解释是：**回答在“Firecrawl 替代品”的检索/综合过程中选用了描述 Octoparse 的资料，随后把题目中的 Octocrawl 错接到 Octoparse 上。官网身份信号不够集中、同类别表述和名字相似可能增加这种风险；尚不能证明它们各自的因果权重。** 这不是已确认的官方别名、公司关系或 Google 全局实体库错误。

这是对一次固定采样及一项附加诊断的分析。我们没有 Google 内部的 query fan-out、候选文档排序、实体链接、知识图谱或生成日志；不能断言算法为什么选了某个词，也不能将一次错误推广为所有用户的稳定结果。

## 已确认的事实

1. 原12题中的 C2 问的是 `When should I choose Octocrawl instead of Firecrawl?`，回答开头自行建立 Octoparse/Octocrawl 别名关系，随后表格两列比较的是 **Octoparse 与 Firecrawl**。它不是仅拼错一次名字，而是后续产品对象也换了。该题未引用 Octocrawl 官网或官方仓库。
2. 正文引用包括 Octoparse 的 [Firecrawl alternatives](https://www.octoparse.com/blog/firecrawl-alternatives)、[OpenClaw scraping](https://www.octoparse.com/blog/openclaw-for-web-scraping)、Octoparse 首页及视频。第一篇明确是 Octoparse 与其他替代品的比较；第二篇讨论 **OpenClaw** 与 Octoparse MCP。2026-10-16 可检索原文均未检出 `Octocrawl`。因此没有证据说这些原文把两品牌声明为别名；错误关联至少存在于观察到的回答中。
3. 这种问题不止 C2：B2 接到了另一同名 Python 侦察爬虫并否认实际 verification.status 字段；S1 编造 `.com` 域名及 `@octocrawl/mcp-server`；B3 把本地 crawl/batch 能力套到 Hosted。六个名称出现不能算六个正确识别或推荐。完整题目、原文、实际链接、账号/模式和时间见 [固定样本](ai-answer-sample-2026-10-16.md)。
4. 我们首页现有搜索标题是 `Octocrawl — No-Code Web Scraper and Web Scraping API`；meta keywords 包括 `Octoparse alternative`。正文 hero 是较通用的内容价值主张，产品定义/官网/仓库身份并未在开头集中形成一个简短答案。已有文档 Introduction 的定义更具体。以上来自 `apps/public-web/index.html`、`src/page.ts`、`content/introduction.md`，不是对流量损失的估计。
5. 官网**已有** Organization、WebSite、SoftwareApplication，Organization.sameAs 已指向官方 GitHub；不是“缺 Schema 导致混淆”。首轮还实际看到24个已索引页面、25条 sitemap 以及某重点工具已索引；不能把本题解释成全站未收录。首页 publisher/软件身份仍可检查一致性，但增加 Schema 不保证消歧。
6. Cloudflare 的日志确有10条 verified `AI Assistant` 请求被 BIC 拒绝，首轮4个普通 urllib Ray 也精确对应 BIC。但 available category 不揭示具体模型/厂商，这些不是 Googlebot 记录，也不是本题的抓取 trace。不能据此声称“因为 Cloudflare 挡了 Google，所以推荐 Octoparse”。详见 [访问诊断](cloudflare-access-2026-10-16.md)。

来源访问说明：直接 web open 与一次浏览器导航起初超时；随后搜索返回并可检索两篇 Octoparse 原文。未绕过验证码或访问控制。这里的“未检出”只覆盖当次取回正文，不是所有历史版本、隐藏内容或整个互联网的否定。

## 原因判断：哪些更有依据

| 因素 | 当前证据与判断 | 尚不能推断什么 |
| --- | --- | --- |
| 选择了另一产品的来源并错误综合 | C2实际引用和比较对象都指向Octoparse；原文不支持别名。**直接证据最强** | 看不到 Google 内部召回过程，无法区分每一步的责任 |
| 名字/类别相近导致实体解析偏移 | Octo* 命名与 scraping/MCP/no-code/alternative 语义重叠；B2/S1也出现近名或同名错接。**合理解释** | 没有实验测出名字相似度的因果权重；不能说Google强制把品牌改名 |
| 官网身份与同类关键词竞争 | 泛化标题和非定义式开头是可复核的类别/身份信号；keywords只作为内容卫生项记录。**潜在因素，未证明因果** | Google不使用meta keywords作为常规排名信号；不能声称删掉关键词就会提高排名或修复AI回答 |
| 可引用的准确品牌材料不足/不够可发现 | 12题0个官方正文引用；现有身份分散。**值得改善来源可发现性** | 0引用不等于Google未读过官网；未测竞品外链/权威度，不能编造“域名权重太低”的定量原因 |
| CDN访问阻挡降低部分工具取源机会 | verified AI Assistant BIC403已观察到。**独立真实缺口** | 无Google特定抓取证据，不能作为本题唯一根因或Google/Bing全部受阻证明 |
| 个性化与生成波动 | 原样本已登录、Auto、地区仅请求US、真实出口未知。**重要混杂因素** | 一次回答没有因果识别力，不能推算品牌错误率或稳定排名 |

[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)说明AI Mode可能跨相关子问题检索并综合不同来源，且模型/链接可能变化；这说明为何应检查来源与实体，但不能证明本题实际执行了哪种 fan-out。[Google meta tags 文档](https://developers.google.com/search/docs/crawling-indexing/special-tags)说明 keywords 不用于排名。因此后续调整以身份准确、页面意图和减少无依据比较为目的，不制造meta关键词排名论。

## 附加诊断：给出官方域名与页面上下文后

本轮另问：`When should I choose Octocrawl (octocrawl.dev) instead of Firecrawl?`。这次生成的对象转回 Octocrawl，提到本地运行、Evidence Record 与有限 v1 shim，没有再把 Octoparse当作别名；仍有“every result”等过宽表述，也未出现官方正文引用。

**重要限制：UI显示 `You sent: 1 tab` 并带Octocrawl首页标题。** 因此它同时获得域名提示和附加网页上下文；不是纯粹“只加域名”的受控A/B测试，也不是发布后修复效果。本轮网站尚未发布时就能观察到此变化，说明提示上下文和答案波动都可能影响实体识别。该题不并入原12题分母，也不替换原错误答案。

原始记录与截图：`.w2l/seo-20261016/release/entity-domain-context.{json,ax.txt,png}`。只保留当次可见UI和链接，未读模型隐藏状态。

## task md 原覆盖与本次补充

原任务已覆盖：SEO-08/7.1 固定问题、实际引用、描述准确性与复测；7.2 网站/GitHub/npm/PyPI/目录一致性；SEO-05 首页定位；SEO-01 CDN/verified-bot核查。**没有覆盖完整的实体错误修复闭环**：错误对象归因、引用原文核实、身份定义/元数据干扰审计、具体修复与技术验收，以及“正确实体”和“被引用”分开衡量。

已在任务总表加入 **SEO-08A（P1）**，正文放在 **7.3**，紧随原抽样/外部资料章节；并给SEO-06、SEO-09及T0后观测增加交叉依赖。原路径和SEO checkout中的任务文件保持一致。不是另造一套计划或把品牌修复塞进产品抓取内核。

该新增任务分三段：

1. **A 诊断**：保留错误回答和来源，审计已有身份信号，明确事实/推测；本轮已完成。
2. **B 修复（todo）**：现有首页/介绍集中准确身份，复核泛化title和无比较支撑的关键词；必要时补FAQ、稳定Schema关联与已核实官方资料；准确连接MCP/limits/reference。外部条目/Cloudflare规则写入另行界定授权。
3. **C 验收（todo）**：渲染与公开身份正确先验收；原12题保持不变，诊断变体单列；T0后独立日期复测正确实体、能力、入口和引用，保留模型/地区/个性化差异。网站已改不等于Google已纠正。

本次发布此前已验证的工具/MCP/RAG改动与两篇范围明确的文章，能增加准确的能力与迁移材料；**并未实施SEO-08A全部身份修复，也没有宣称已经解决Google混淆**。下一轮优先做可控的B项，再按C项观察。无需等有排名/引用增长才验收发布是否成功。
