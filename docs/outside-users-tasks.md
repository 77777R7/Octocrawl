# 外部用户：任务清单（Phase 0 起，2026-11-09）

**依据：**
- [ROADMAP.md](../ROADMAP.md) 的 Current phase（"十个外部用户"，2026-11-01 到 2026-11-29）、Direction 和 Paused；
- [AGENTS.md](../AGENTS.md)，[research/trials/](../research/trials/README.md) 的说明和[记录模板](../research/trials/TEMPLATE.md)；
- 2026-11-09 的四份文档（PR #912）：[用户画像](launch/2026-11-09-user-personas.md)、[分国家 GTM](launch/2026-11-09-gtm-by-region.md)、[调研记录](../research/market/2026-11-09-global-market-research.md)、[断言台账](../research/market/2026-11-09-claims-ledger.md)；
- 仓库外的 2026-10-23 GTM 最终方案和外联日志（`.w2l/handoff/`，不进仓库；目前只在 `suspicious-jemison-31a9bb` 工作树里，见 OD3）。方案的第 7 节（第 45 天评审）、Show HN 的日期和"激活"的口径沿用，名单和姓名不抄进本清单。

核实基于 `main` 的 `c059d36f` 加 PR #912，日期 2026-11-09（周一）。P0.7 的表基于 `2959bf95`（#912 合入后的 `main`）。

**目标：** 到 2026-11-29，十位非作者各用 Octocrawl 完成一个自己的真实任务，各有一份 `research/trials/` 记录（ROADMAP 的退出条件）。本清单是通向它的路线：联系谁、用什么材料、怎么量、什么时候停。它自己不加功能、不改引擎、不部署、不收款；引擎只修外部用户遇到并先复现过的问题（ROADMAP），由 M2 窗口决定。

**现实预期（先说在前面）：** 方案的先验是"每 10 条私信至少 1 个激活"。ROADMAP 要求从 11-01 起每周 10 条；到 11-29 大约是 40 条，扣掉没发的，按先验只有几个人。那 8 个账号的邮件算在第一周的 10 条里，不是额外的；他们已经碰过产品，回复率可能更高，但其中约一半可能只用过 Playground（估计，见起点表），其中一个在 10-27 已经联系过一次。所以十份记录**很可能到不了**，到不了是正常的结果，不是失败：要如实报"联系了多少、回复多少、同意多少、开始多少、完成多少"。

**完成标准（整轮，到 2026-12-20）：**
1. `research/trials/` 里有非作者的试用记录。分两个数报：**记录数**（开始的）和**完成数**（记录里"参与者自己的完成判断"为完成，且人工核对表里任务要求的每个字段都有"实际交付"，或明确写了"缺失"或"未知"，没有留空，并且**至少一个字段是实际交付**）。字段全是"缺失"或"未知"的记录算开始，不算完成，单独报数。ROADMAP 的退出按完成数。不足十份时写明差几份，并按"联系的人 → 回复的人 → 同意试用的人 → 开始 → 完成"逐级报数，分母含所有被联系的人。
2. 12-06 做完第 45 天评审（方案第 7 节的 A、B、C 三条规则，口径见"度量"），并且对美国、日本、韩国各写一条"继续 / 换打法 / 停止"的结论，对欧洲写一条同样的结论或"样本不足，不裁决"（欧洲一周只有一次访谈，规则见"度量"），每条带数字和分母（中国不做裁决，见 F2）。日本、韩国的文章晚于 11-22 发的，两周实验在 12-06 还没满，那条写"实验未满两周，暂缓"并写明新的裁决日期；评审照常做。
3. 画像的 T1 到 T5 和各地区的假设标成"成立 / 不成立 / 仍未知"，有记录的附记录编号，没有记录的写"无记录"（调研记录里的【未知】项不在其内）。不足 3 条独立记录或访谈支持的，写"仍未知"并列出已有的几条，不写"成立"（GTM 文档 §8：3 到 5 次访谈给不出比例）。
4. 本清单本身不引入引擎、部署、付款方面的改动；需要它们的事要么在 Phase 5 的冻结项里，写明重开条件，要么是 P4.0 里由 Howard 自己批准、只在 12-06 决定发布之后才做的 min-instances。

用法：做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

**编号：** P0.x 到 P4.x（Phase 5 只有冻结项 F1 到 F9，没有 P5.x）、OD1 到 OD14、F1 到 F9 只在本清单内有效。`docs/pa-enhancement-tasks.md` 的 Phase 0 到 4、ROADMAP 的 P0 到 P5 和 PA、PH、GTM 文档 §9 的 D1 到 D8、仓库外方案的 D2 到 D13、PR #911 的 D1 到 D10 另有所指，引用它们时写全名。**窗口：** "本窗口"指写这份清单的研究和 GTM 窗口，只写文档、记录和材料；"UI 窗口"管 `apps/public-web` 和预览部署；"M2 窗口"管引擎（CLAUDE.local.md 的分工）。

## 起点（2026-11-09）

| 项 | 数字 | 出处 |
| --- | --- | --- |
| 外部注册，最近 30 天 | 14（内部账号 3 个已排除） | `W2L_FUNNEL_INTERNAL=<内部账号> W2L_PROJECT_ID=octopus-w2l-20260924-7r7 NODE_USE_ENV_PROXY=1 node scripts/hosted/funnel.mjs --days 30 --json`，`c059d36f`，窗口 2026-10-10 到 11-09（UTC） |
| 其中有密钥或 MCP 连接 / 调用过托管 API / 跑过托管任务 | 4 / 8 / 0 | 同上；"调用过"含官网 Playground。有密钥或 MCP 连接的 4 个若都在那 8 个里，其余 4 个只可能用过 Playground；脚本分不出已删除密钥的账号，所以这是估计，不是下界 |
| 首次来源 | chatgpt.com 5，direct 3，未记录 6 | 同上 |
| MCP 连接 | 7,437 次 `initialize`，288 个客户端名称；没有 Cursor、Codex、OpenCode | 同上，含运营者自己的调用 |
| 非作者试用记录 | 0（`research/trials/` 只有 2026-10-16 的入口自检） | `ls research/trials` |
| 自 2026-11-01 起已发的外联消息数、回复数 | unknown | 仓库外的外联日志只有 2026-10-27 的一封邮件和几批私信草稿；Howard 对账（P0.3） |

## 待你决定

每条标出影响的任务。没决定的，按"默认"一栏先做，或者先做不受影响的部分。OD 是本清单的编号；括号里是 [GTM 文档 §9](launch/2026-11-09-gtm-by-region.md) 的对应编号，没有括号的是本清单新增的。

**现在要定：** ROADMAP 的筛选是"只定挡着试用的决定"。OD3、OD7 直接挡着试用外联（P0.3、P0.5、W2），OD1 决定第二、三周的分配。OD2、OD4、OD5、OD6、OD8、OD9 不挡任何一个试用，它们是 Phase 1 入口铺开的前提：没有否决就按默认走，不需要你现在逐条回答。

| # | 问题 | 影响 | 默认（未否决前按此） |
| --- | --- | --- | --- |
| OD1（D1） | 地区顺序：美国第一；日本、韩国各做两周零工程实验；欧洲只做定位与访谈；中国先本地优先 | Phase 1 全部 | 同意 |
| OD2（D2） | 日文、韩文、简体中文各一页说明，先放仓库根的 `README.<语言>.md`，不放官网 | P1.1 | 同意 |
| OD3 | 外联日志、名单和 `grant-credits.mjs` 现在只在 `suspicious-jemison-31a9bb` 工作树的 `.w2l/handoff/`，工作树一删就丢（分母记录也丢）。复制（不是移动）到主 checkout 的 `~/Code/w2l/.w2l/handoff/`（git 忽略）。**复制之后主 checkout 的是唯一的正本**，原处只读不再追加；如果还要在原处追加，每周一对账一次，并在进度里写以哪边为准。`grant-credits.mjs` 写生产 Firestore，复制过来但不运行，按 OD10 才用 | P0.3、P0.5、W2 | 同意，复制 |
| OD4（D3） | 注册 Kakao PlayMCP 和 Mistral Le Chat（先读条款） | P1.3、P1.4 | 先读条款，再注册 |
| OD5（D7） | 对外措辞：不再把"失败不计费"当第一卖点；先说 Markdown 与"更少 token"这类定性的话，再说 Evidence Record；不写没测过的百分比或具体数字。**你自己的两条规则不一致：** 方案第 2 节（2026-10-23）写"在第 3 节实测出来之前，不说'省 token'"；`docs/seo/core-seo-framework.md:36`、`:294`（2026-10-27）写"Markdown 与省 token 在前，不写未测的百分比"，官网和 README 现在就是后者。默认按较晚的那条；你要从严，改成"测出来之前不说"，P0.7 表里"省 token"一类就都要改 | P0.7、P0.8、P1.6 | 同意（按较晚的规则） |
| OD6 | 本地语言材料在你找到母语者校对之前不发布，不用机器翻译直接发；校对人的名字只记在仓库外的外联日志，"进度"里只写"已校对" | P1.1、P1.6 | 同意；找不到人就不发该语言 |
| OD7 | 给 8 个调用过 API 的外部账号各发一封只问一个问题的邮件，其中 10-27 已联系过的那个换成补一个问题或不再发。Privacy 页没有写会不会用注册邮箱联系用户；不读请求行（Privacy 承诺只有用户本人看得到）。P4.2 对发布带来的注册者同样按这条处理；Privacy 页要不要写明由你决定，改文案是 UI 窗口的事 | P0.5、W2 | 同意；邮件里不推销，不提额外积分 |
| OD8 | P1.2 和两篇文章里要用 Octocrawl 读 30 个文档站，需要一个账号的 key（HTTP 页 1 积分，浏览器页 5 积分；账号每月 1,000 积分，最坏 30 页 × 5 = 150 积分）。用你的账号，key 放 `.w2l/`，不进仓库 | P1.2、P1.6 | 同意 |
| OD9 | Phase 1 会推广托管 MCP 地址（PlayMCP、Le Chat、文章），而律师审查按 ROADMAP 推迟到十个人激活之后。接受这个风险（对外只说事实，不做法律承诺），或者把推广限定为"本地优先、托管作试用入口" | P1.3 到 P1.6 | 接受；措辞遵守 OD5 |

**之后再定：**

| # | 问题 | 影响 | 默认 |
| --- | --- | --- | --- |
| OD10 | 是否用额外积分感谢完成试用的人（机制在 `grant-credits.mjs`，只对有账户余额的登录账号有效，没有账号的参与者不适用） | P2.1 | 写完记录之后再给，不作为参加条件；数额你定 |
| OD11 | 12-06 评审之后，Show HN 是否继续。ROADMAP 写"11-29 之后做什么由 Howard 根据记录决定"，所以不预先承诺 12-13 | P3.5、P4.1 | 12-06 当天由你定；评审规则只是输入 |
| OD12（D6） | 付款、MoR 书面提问、律师审查：ROADMAP 推迟到至少十个人激活之后，本清单遵守 | F4 | 等十个人之后 |
| OD13（D8） | Dify 插件、魔搭 MCP 广场入驻是否需要工程：没评估过，不开工 | F3 | 11-29 之后再评估 |
| OD14（D4、D5） | Firecrawl 拦截页计费测试、大陆可达性测试：不在当前阶段的筛选里（见 F2、F8），不做 | F2、F8 | 冻结，写明重开条件 |

## 总原则

- **流程：** 每个任务组一个分支、一个 PR，从当前 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree；分支落后 `main` 不超过一个 PR。commit 加 `-s`，conventional 格式。开 PR 后马上开 Auto-fix。每个 PR 提交前交给 subagent 用干净上下文审，只列会阻止合并的问题（文件、行号、为什么错、怎样证明）。
- **范围：** ROADMAP 当前阶段的筛选：每件事都问"这对外部用户这周开始或继续用 Octocrawl 有帮助吗"，没有就等。所以：不做竞品测量、不做基准、不写对比文章、不推中国。**入口铺开是这条筛选的边界：** P1.1、P1.3、P1.4、P1.6、P1.8 带来的用户大多晚于 11-29，P1.3、P1.4、P1.5 的后半、P1.6、P1.8 不在退出条件里。放在 Phase 1 是因为外联要有"真实读取"的材料（P1.2），且日韩的两周实验要在 12-06 前走完。人手不够时的砍法：先砍 P1.8、P1.4、P1.3，再砍 P1.6，再砍 P1.1；P1.2、外联（W2）、访谈（W3）和试用（P2.1）不砍。引擎只修外部用户遇到并先复现过的问题；不部署（除非你说）；不收款；不改 ROADMAP 的文字（改它要你点头）。顺手发现的问题写成后续项。
- **谁做什么：** 邀请、私信、邮件、访谈、发布帖子由 Howard 做；工程侧不代发邀请、不代操作（`research/trials/README.md`）。本窗口只写文档、记录和材料，不替别的窗口协调或规划：给 UI 窗口、M2 窗口的东西是"列给 Howard 的清单"，由 Howard 决定交给谁。
- **外联数据不进仓库：** 名单、姓名、handle、邮箱、对方原话、私信内容只放仓库外的外联日志。试用记录按模板放进 `research/trials/`，用参与者代号，参与者同意后提交；记录里不含密钥、cookie、邮箱。
- **证据诚实：** 未测的值写 unknown，不写 0；联系过、没回复、没跑完的都留在分母，凡是出现"人数"或"次数"的数字都带上分母；带日期的记录只追加不改；每次实站运行写命令、commit、走代理还是直连、费用（不知道就写 unknown）。
- **对外措辞：** 以[画像](launch/2026-11-09-user-personas.md)和 [GTM](launch/2026-11-09-gtm-by-region.md) 的"不说"清单为准：不说"能读任何站"，不说"合规"或"proof"，不把"失败不计费"放在第一位，不提增强访问或绕过拦截。先说 Markdown 与"更少 token"这类定性的话，再说 Evidence Record；不写没测过的百分比或具体数字（OD5）。
- **不为了让假设成立而改措辞：** 画像里标【推】和【未知】的东西，要用试用和访谈验证。

## 阶段与依赖

| 阶段 | 内容 | 日期 | 依赖 | 退出条件 |
| --- | --- | --- | --- | --- |
| Phase 0 · 对齐与启动 | 做现在要定的决定、合并 PR、日志对账、第一周外联（8 个账号加 2 个）、口径核对、邀请材料 | 11-09 到 11-15 | 无 | P0.1 到 P0.9 完成；第一周 10 条已发或写明差几条；OD1 到 OD9 有结果 |
| Phase 1 · 入口铺开 | 30 个非英语文档站的读取、三份本地语言说明、PlayMCP 与 Le Chat、创作者联系（每周 2 条，到 11-29 发 4 条，其余之后继续）、日韩各一篇文章、第二周外联 | 11-16 到 11-22 | OD2、OD6、OD8；P1.2 先于 P1.1、P1.5、P1.6 | P1.1 到 P1.8 完成或写明为什么没做；第二周 10 条已发；P1.5 的创作者联系已开始（11-16 到 11-29 发 4 条，其余 6 条在 11-29 之后，不计入退出条件） |
| Phase 2 · 对话与试用 | 试用从有人同意起就开始，11-23 到 11-29 是收尾和补记录；每个试用当天写记录；问题清单；日韩中间读数；第三周外联；11-29 退出检查 | 11-23 到 11-29 | Phase 1 的材料 | `research/trials/` 的记录数和完成数、差几份、逐级分母都已写明。十份记录取决于 Howard 发出多少邀请、多少人回复并完成，本清单只能保证过程和记录 |
| Phase 3 · 复盘与定向 | 日韩两周裁决、复盘、画像和 GTM 的 v0.2、冻结项的重开判断、12-06 评审 | 11-30 到 12-06 | Phase 2 的记录；日韩文章至少发布两周 | 进度里有复盘；画像和 GTM 是 v0.2；评审的 A、B、C 有数字 |
| Phase 4 · 发布与跟进 | 只有你在 12-06 决定发，才发 Show HN；发布后 48 小时内跟进每个注册 | 12-07 到 12-20 | OD11 | 发布或推迟的决定写入进度；发布周的数字写入 |
| Phase 5 · 冻结项 | 不开工，只写重开条件 | — | — | — |

**每周固定的事**（不属于某个阶段，每周一做，对应的数字写进"进度"）：W1 每周数字；W2 外联 10 条；W3 访谈；W4 试用记录。见下面的"每周固定"一节。

## 度量

下面的"继续"和"停止"阈值是提议，没有来源，你可以改。凡是人数或次数，分母是被联系或被问到的总人数。

| 指标 | 怎么取 | 继续的信号 | 停止或换打法的信号 |
| --- | --- | --- | --- |
| 带来源的外部注册 | 漏斗脚本的"首次来源"表 | 某个新渠道两周内有 1 个以上外部注册（分母：该渠道发布的链接数） | 所有新渠道两周内都是 0 |
| 真实客户端名称 | 漏斗脚本的 MCP 客户端表，去掉目录和探测机器人 | 出现 Cursor、Codex、OpenCode 或 `claude-code` 且不是 Howard 自己（脚本分不开运营者的调用，所以由 Howard 判断） | 仍然只有探测 |
| 访谈 | 外联日志（仓库外），按周数 | 3 个人说"上周或这个月遇到过读不到的页面"（分母：访谈总数） | 被问到的人都说"没遇到" |
| 试用开始与完成 | `research/trials/` 加外联日志 | 有人用自己的任务跑完并写了记录 | 20 条消息没有一个回复 |
| 非英语文档假设 | P1.2 的记录 | 30 个站里至少 10 个同时是：Context7 缺、`llms.txt` 缺、Octocrawl 读得出（分母：30 个站；"读得出"= `status` 为 success 且 Howard 人工核对主体与源页一致，因为没配验证合同时 `verification` 是 not_requested）。名单是人挑的，所以这只证明"有这样的站"，不是比例 | 30 个站里 Context7 已有大多数，或同时满足的不足 3 个 |
| 欧洲 | 外联日志，按周数 | 至少 3 次欧洲访谈，且至少 2 人提到数据驻留或欧盟规则（分母：欧洲访谈总数） | 至少 3 次欧洲访谈都没人提到。访谈不足 3 次时写"样本不足，不裁决"，不写继续或停止 |

**"激活"的口径（用在 12-06 评审；F4 的"十个人激活"沿用这个口径，除非你另定）：** 方案的定义是"来自 agent 客户端，7 天内一个任务有至少 1 页成功或至少 3 次成功抓取，并且在第二个 UTC 日还有活动"。现在的漏斗脚本**算不出来**：它没有"成功页"、没有"第二个 UTC 日"，也把客户端名称和账号分开。所以本清单用一个能算的近似，并写明它的缺口：**外部账号在两个不同 UTC 日，当天的 `creditUsage/{uid}-{day}` 里 `credits` 大于 0**（那个集合保留 90 天；每次结算都会写这个文档，包括用了 0 积分的未读和被拒绝的调用，所以必须要求 `credits` 大于 0；Playground 的调用也算）。由 P0.3 写一个放在 `~/Code/w2l/.w2l/hosted/` 的只读脚本数它（git 忽略，每周重跑，输出只有计数，不含账号）。缺口：不能确认调用来自 agent 客户端，Playground 会让它偏高。方案口径的那个定义保留，等有办法算再换。

**12-06 评审（沿用方案第 7 节，看行为，不看自述；"激活账户"用上面的近似口径）：**
- A：发出 15 条以上私信后，激活账户加免密钥活跃地址少于 5（方案原文；免密钥地址按日志数、含运营者自己的调用，是上限；激活账户用上面的近似口径）。
- B：激活的账户里，在两个不同的 ISO 周都有 `credits` 大于 0 的调用（"每周回访"）的少于 2（方案原文的"第二个任务"算不出来，用它的近似）。
- C：访谈里对第 9 个问题（画像文档末尾：用不用 Context7 或 `llms.txt`、有没有它们没有的文档、多久碰到一次）回答"有，而且每周都会碰到"的少于 3 人（分母：访谈总数）。方案原文还要求"Octocrawl 能补上"，第 9 个问题问不出这一点，所以这里只数前两项，C 比方案的更容易成立，评审时要把这一点写出来。
- 结果：A 或 B 成立：切口换成 RAG 构建者，Show HN 推到 01-10。A、B 都不成立：Show HN 可以按 12-13 发；只有 C 成立时先把文案转向"引用页面"和"登录后的内部文档"再发。最后由你定（OD11）。

**不当作增长信号的：** npm 和 PyPI 下载量、目录上架数、星数。

## 每周固定（贯穿各阶段）

- [ ] **W1 每周数字（本窗口，Howard 提供 gcloud 登录）。** 每周一（11-16、11-23、11-30；12-06 评审前再取一次）跑漏斗脚本（`--days 7 --json`，带内部账号排除，`NODE_USE_ENV_PROXY=1`），把外部注册、首次来源、客户端名称、"激活账户"（见度量）、`research/trials/` 记录数写进"进度"。验收：每个周一一行，每个数带分母（激活账户 / 外部注册；开始 / 同意；完成 / 开始）；取不到的写 unknown，不写 0；首行（11-16）还要写自 11-01 起累计的"联系、回复、同意、开始、完成"人数（Howard 从日志对账）。
- [ ] **W2 外联（Howard）。** 每周 10 条，来自仓库外的名单（ROADMAP）。第一周（11-09 到 11-15）：8 个调用过 API 的外部账号（OD7）加 2 个现有 40 人名单里的人；第二、三周按分配：美国 5、韩国 2、日本 2、欧洲 1（提议，不是证据）；美国的 5 条里 3 条给有自己任务的人，2 条给创作者或策展人（P1.5），因为创作者是放大器，不是试用候选。给日本、韩国的第一条消息用英文，或由你找的母语者帮忙写，不发机器翻译。后续追问不占配额。验收：外联日志每条有日期、渠道、原因、回复、是否同意试用；进度里写已发、已回复、同意、开始的人数；发不满 10 条时写差几条和原因。
- [ ] **W3 访谈（Howard）。** 提议：每周 3 次，到 11-29 共 9 次，其中美国至少 5，日本、韩国、欧洲各至少 1（它们第一周没有消息，第二周才开始，按先验 4、4、2 条消息换不来更多；GTM 文档里的"3 次"也是争取的目标，不是下限）。问题用画像文档的 9 个，先问"最近一次"，不问"会不会"。日文和韩文的访谈需要母语者帮忙或用英文进行（OD6）。验收：外联日志每次有日期和摘要；进度里写访谈数、各地区的人数和被问到的总人数，差几次写明。
- [ ] **W4 试用记录（参与者、Howard）。** 从有人同意起就做，不等 Phase 2；见 P2.1。

## Phase 0 · 对齐与启动（11-09 到 11-15，不改代码）

- [x] **P0.1 合入 PR #912（Howard）。** 2026-11-09 17:39Z 合入，`main` 的 `2959bf95`（squash）。 本清单的提交也推到同一个 PR，所以合入的是四份文档加本清单加对 GTM、画像、调研记录的几处更正。验收：PR 已合入 `main`；若你改了地区顺序或画像，同一天改文档。
- [ ] **P0.2 做 OD1 到 OD9（Howard）。** 验收：上面"现在要定"的每一行在"进度"里有日期和结果；没回复的按默认做并写"按默认"。
- [ ] **P0.3 日志对账和基线（Howard 对账，本窗口备脚本）。** (a) OD3 通过后把外联日志复制到主 checkout 的 `.w2l/handoff/`；(b) Howard 从日志对账自 2026-11-01 起已发的外联消息数、回复数、同意试用的人数，填进"起点"表的最后一行；(c) 本窗口写一个只读脚本，放在 `~/Code/w2l/.w2l/hosted/`（git 忽略，每周重跑），按"激活"的近似口径数外部账号（读 `creditUsage`，要求 `credits` 大于 0；输出只有计数，不含账号、邮箱、URL）。验收：起点表最后一行有数字或写明"日志里没有记录"；脚本的输出在进度里有一行；仓库里没有账号标识。
- [ ] **P0.4 来源标记（本窗口，Howard 确认）。** 附录 A 的 `utm_source` 名字固定，所有 Howard 发布的链接都带。站点已经把首次来源写进 `w2l_src`，代码和测试在 `packages/public-preview/src/site.ts`、`packages/public-preview/test/site.test.ts`、`auth.test.ts`。限制：只有人先打开官网才会写入；通过 PlayMCP 或 Le Chat 直接添加 MCP 地址的人不会经过带标记的链接，他们会被记成 `via:mcp-oauth`、`direct` 或引荐域名；提交仓库的 Hacker News 读者先到 github.com，归因看 GitHub Traffic 的引荐网站，不看 `utm_source`。所以目录和连接器渠道靠客户端名称和访谈里问一句"你是怎么找到的"。验收：Howard 确认附录 A 的命名。第一周的邮件和私信不带链接（附录 C），所以链接抽查放到 11-23 的 W1：已发出的带链接消息抽查至多 5 条，不足 5 条就全查，进度里写"查了 N 条，N 条带标记"，一条都没发写 0 of 0。
- [ ] **P0.5 外联名单（Howard 定人，本窗口的 scout 查公开帖子）。** 仓库外。(a) 8 个调用过 API 的外部账号：Howard 在 Firebase 控制台里按 `creditUsage` 找，只在控制台看，不读请求行，不导出到仓库，并标出 10-27 已联系过的那个；(b) 现有 40 人名单里还没联系的人；(c) 新增候选，供第二、三周用：日本、韩国、欧洲各一批，方法同 40 人名单（公开帖子、公开 handle、对方原话不超过 12 个词，不记邮箱）；(d) 创作者和策展人名单 10 个（公开频道，来源写清，供 P1.5）；(e) 日文、韩文、简体中文的校对人候选（OD6），到 11-15 前每种语言至少有一位候选，没有就不做该语言的 P1.1 和 P1.6。验收：日志里有第一周的 10 个人、新增候选日本不少于 10、韩国不少于 10、欧洲不少于 6、创作者 10 个、校对人候选；每人有 Fit 代号；仓库里没有姓名或 handle。
- [ ] **P0.6 第一周外联发出（Howard）。** 就是 W2 的第一周，单列出来是因为 ROADMAP 从 11-01 就要求每周 10 条，不能等材料齐了再开始。验收：进度里写已发人数和回复数；少于 10 条写差几条和原因。
- [x] **P0.7 口径核对（本窗口）。** 2026-11-10 做完，结果表在"进度"。 检查所有对外的页面和文件有没有与调研冲突的话：`README.md`、`apps/public-web/content/*.md`、`apps/public-web/src/*.ts` 的页面文案、博客文章里的比较句，以及给 AI 看的文件（有则查）。检查项：是否说了"能读任何站"一类的话；是否把"失败不计费"放在第一位；是否用了"合规""proof"；README 的 Quick start 和官网首页先讲托管、帖子先讲本地（外联日志 2026-11-03 记过，你当时选了暂时不改 README）。验收：一张表放进"进度"，每行有文件和行号、现在的句子、建议；站点的行列给 Howard，由你决定交给 UI 窗口；本任务不改站点。
- [ ] **P0.8 邀请和访谈材料（本窗口，Howard 审）。** 附录 C 放英文邀请信、5 分钟任务提示和访谈开场；9 个访谈问题在[画像文档](launch/2026-11-09-user-personas.md)末尾。给日本、韩国的邀请由 Howard 亲手写（英文，或母语者帮忙）；日文、韩文、简体中文的邀请信和任务提示版本，等母语者校对后再出，不先写机器版。验收：Howard 审过并在进度里写日期。
- [ ] **P0.9 第一周访谈（Howard）。** 就是 W3 的第一周：3 次，对象优先是回复了的外部账号。验收：进度里写访谈数和被问到的人数（差几次写明，0 次也写）。

## Phase 1 · 入口铺开（11-16 到 11-22）

- [ ] **P1.1 三份本地语言说明（OD2、OD6；本窗口起草，Howard 找母语者校对；在 P1.2 之后）。** 文件：仓库根的 `README.ja.md`、`README.ko.md`、`README.zh-CN.md`，`README.md` 顶部导航加三个链接。每份不超过一屏：一行安装命令、一个来自真实读取的例子（附保存下来的 Evidence Record 节选；日文和韩文版的例子取自 P1.2 的托管读取，页面里写明"托管读取"；简体中文版因为只讲本地路线，要用本地 `npx octocrawl` 把同一个站重读一次，另存一份记录，写命令、commit、走代理还是直连，因为托管读取遵守 robots.txt 而本地读取用户给定的 URL 不一定，两条路线的结果不能互相代替）、读不到时怎么看记录的三句话、限额，数字取自 `README.md`，不加没有来源的话。**内容取决于读者能不能用到：** 日文和韩文版用托管的一行命令（`claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp`，免密钥每天 20 页，账号每月 1,000 积分，登录后页面走本地 `npx octocrawl`）；简体中文版只写本地 `npx octocrawl` 路线，不推托管域名（可达性没测，Claude 在大陆不可用，见 F2）。验收：进度里写"已校对"，校对人的名字只记在外联日志；相对链接有效；散文里不出现裸 `W2L`（Evidence Record 节选里的 `w2l.evidence/1`、`W2L_*` 等标识符照原样保留，不改）；不碰官网文件。
- [ ] **P1.2 非英语文档站读取（OD8；本窗口）。** 假设：Context7 从 GitHub 收录时跳过正文主要不是英文的页面，网站来源是否也跳过没读到（调研 §4.6）。日文、韩文、简体中文各 10 个文档站，共 30 个。选法写在运行前：不抓搜索结果页（搜索引擎的条款不允许，也不可复现）；由 Howard 或各语言的校对人各提供 10 个自己常用或听说的本地文档站，写下选择理由，**在查 Context7 之前**冻结，冻结后不替换。名单是人挑的，这是外联和文章的素材清单，不是基准，不报比例或"Context7 覆盖率"；度量只用"有多少个站同时满足"这个存在性的数。每站记：Context7 里有没有（在 Context7 网站上手动搜一次，查不了就写 unknown）、`/llms.txt` 是否 HTTP 200 且不是 HTML 外壳（`curl`，不花积分）、Octocrawl 托管读取的 `status`、`verification`、`readiness`（花积分，OD8）。它的用处是外联和文章的素材（"我读了你们的文档站，这是结果"），同时检验这个假设。验收：`research/market/non-english-docs-sites.v1.txt`（冻结的 URL 表）和 `research/market/runs/<日期>-non-english-docs-<commit>.md`（命令、本 checkout 的 commit、读取当时线上托管 revision 的源 commit（`W2L_SOURCE_COMMIT`，Howard 从 Cloud Run 读，读不到写 unknown）、直连或代理、积分用量，分母含所有失败和 unknown）；`research/market/runs/` 随本任务新建。之后 P1.1、P1.5、P1.6 里出现的每一个"读取例子"都来自这份记录；说"Context7 没有这个站"之前，要在记录里有它的手动检查结果。
- [ ] **P1.3 Kakao PlayMCP（OD4、OD9；Howard）。** 先读条款和审核要求（调研没读到），记下外国公司能不能注册、需要什么。能注册就用远程 MCP 地址注册。验收：进度里有条款的阅读日期和结论；注册成功则记上架地址；之后在客户端名称里找它带来的连接。
- [ ] **P1.4 Mistral Le Chat 自定义 connector（OD4、OD9；Howard 的账号）。** 添加 `https://mcp.octocrawl.dev/mcp`，读一页，记账号档位、客户端版本、结果。验收：进度里一行；截图放仓库外。若免费档不允许自定义 connector，如实记下。
- [ ] **P1.5 创作者与策展人（美国，Howard；在 P1.2 之后）。** 名单 10 个（来自 P0.5 的 (d)）：做过 Context7、Playwright MCP、Claude Code 教程的频道和账号（证据是时间上对得上，不是因果，调研 §7.1）。每周 2 条，占美国的配额，所以 11-16 到 11-29 发 4 条，其余在 11-29 之后继续，不计入退出条件。每条消息带一个真实例子：用 Octocrawl 读一个已手动确认 Context7 没有的文档站，附整页 Markdown 和收据。例子优先取 P1.2 记录里"Context7 缺且读得出"的站；创作者读不了那个语言，或 P1.2 里没有这样的站时，Howard 手动确认 Context7 没有的任一英文文档站，读一次，附在同一份记录末尾，标为补充，不进 30 站的分母；仍然没有例子的消息不发，写明差几条。验收：外联日志里 10 个人各一行；进度里写已发数（计划 4 条）、回复数，以及每条用了哪份记录里的哪个例子。
- [ ] **P1.6 日文和韩文文章各一篇（OD5、OD6、OD8、OD9；Howard 发）。** Zenn（日文）、Velog（韩文），韩文再投一次 GeekNews。内容是一次真实的读取：用 P1.2 里发现的一个本地语言文档站，写命令和 Evidence Record 节选，不夸大。本窗口起草，母语者校对后由你发；不用机器翻译直接发。链接带 `utm_source`（附录 A）。**时间：** 要在 11-22 前发出，两周的实验才能在 12-06 前走完；P1.2 和校对没赶上就推迟，实验窗口顺延，在进度里写新的日期。验收：URL 和发布日期写进进度；发布后第 7 天记浏览数或反应数，取不到写 unknown。
- [ ] **P1.7 外联第二周和访谈第二周（Howard）。** W2、W3 的第二周：10 条消息、3 次访谈，按分配含日韩欧；日文和韩文的访谈需要母语者或用英文。验收：同 W2、W3，访谈数带被问到的人数。
- [ ] **P1.8 其他渠道动作（机会性，Howard；不在退出条件里）。** GTM 文档 §4 里列过、这里没有单列的动作：Cursor 论坛、r/ClaudeAI、r/mcp 发帖（你用自己的话）、connpass 的 MCP 活动申请 LT、Claude Code Meetup Seoul 的联系。做了记进度，没做不影响退出；欧洲"Evidence Record 与欧盟规则"一页说明冻结（F9）。

## Phase 2 · 对话与试用（11-23 到 11-29）

- [ ] **P2.1 试用（主线）。** 从有人同意起就开始，不等 11-23。每个同意的人，按 `research/trials/README.md` 自己选任务、自己操作；工程侧不代操作。**记录谁写：** 模板由参与者填；参与者让 Howard 在通话里代填的，由参与者确认，"记录提交人"一栏写明；本窗口只检查模板各项是否有内容，不代填、不代操作。试用当天写，文件名 `research/trials/YYYY-MM-DD-<参与者代号>.md`，代号不含姓名；保留第一次失败；"参与者自己的完成判断"一栏必填；未知写未知，不写成功。验收：每份记录的模板各项都有内容或写明"未知"；不含密钥、cookie、邮箱。记录入库：参与者确认后，由 Howard 交给本窗口，本窗口在每周四（11-12、11-19、11-26）和 11-28（周六）把新记录放进一个 PR，Howard 合入，不改记录内容。这份记录不自动构成非作者准确性验收签核（模板最后一句）。参与者用的是登录账号并愿意时，写完记录之后由 Howard 按 OD10 给额外积分；没有账号的参与者不适用。
- [ ] **P2.2 问题清单（本窗口）。** 每份试用记录之后，把里面的阻碍列成表放进"进度"的"Found"：试用代号、现象、发生时间、是否已复现（是 / 否 / unknown）、卡住了谁。不在本清单里修；这张表给 Howard，由你交给 M2 窗口决定修什么，先复现再改（AGENTS.md 的 parity 规则）。验收：每份试用记录都有对应的行，或写明"无阻碍"。
- [ ] **P2.3 日本和韩国的中间读数（本窗口，11-29）。** 各自文章发布后的浏览数或反应数、带 `utm_source` 的外部注册数、回复数、访谈数，分母同度量表；只写数字，不下结论（结论在 P3.1）。验收：进度里一行；取不到的写 unknown。
- [ ] **P2.4 11-29 退出检查（本窗口）。** 数 `research/trials/` 里非作者的记录：记录数和完成数。验收：进度里写"完成 N / 10，开始 M"，只数已合入 `research/trials/` 的记录，另报"已确认、未合入"的份数；不足时写差几份和逐级分母；不改 ROADMAP 的文字（改不改由你定）。

## Phase 3 · 复盘与定向（11-30 到 12-06）

- [ ] **P3.1 各地区裁决（本窗口）。** 日本、韩国：从各自的文章发布日起满两周后写（文章晚于 11-22 发的，裁决顺延到满两周之后，并在进度里写新日期）；按度量表的规则写：继续 / 换打法 / 停止，附数字和分母。美国：按带来源的外部注册、客户端名称、访谈和试用，写同样一条。欧洲：按度量表的欧洲一行写：继续 / 换打法 / 停止，或"样本不足，不裁决"（访谈不足 3 次时），并写访谈次数和"数据驻留"被提到的次数（分母：欧洲访谈总数）。中国不做裁决（F2）。验收：四段，每段带数字、分母和进度里的记录编号，欧洲一段有明确的裁决或"样本不足"。
- [ ] **P3.2 复盘（本窗口）。** 写进本清单的"进度"，不新建复盘文档（AGENTS.md：没有被要求就不加新的状态或证据文档）。对画像的每一层（T1 到 T5）和每个地区的假设，写"成立 / 不成立 / 仍未知"，有记录的附试用记录编号或数字，没有的写"无记录"；重点验证的几条：T3 是不是入口、T4 是不是付费层（谁付费仍无来源）、T5 有没有买家侧证据、非英语文档楔子（P1.2）、日韩谁先。验收：每条判断可追到记录编号，或写明"无记录"。
- [ ] **P3.3 画像和 GTM 的 v0.2（本窗口）。** 两份文档加"v0.2（日期）"和变更表，只改被证据推翻或确认的地方；未验证的保持原标注。2026-11-09 的调研记录不改（带日期的记录只追加）。验收：变更表里每行有记录编号。
- [ ] **P3.4 冻结项的重开判断（本窗口）。** 对 Phase 5 的每一项，看有没有试用记录或访谈满足它自己那一行的重开条件。验收：一张表放进进度：项、证据行、建议；你来定。
- [ ] **P3.5 第 45 天评审（12-06，周日；本窗口备数，Howard 定，OD11）。** 按"度量"里的 A、B、C 算数，用 11-30 的数字加 12-06 当天再取一次的数字，结果和计算口径写进进度。验收：A、B、C 各有数字、分母和口径；结论是"12-13 发 / 先换文案再发 / 推到 01-10 / 不发"之一，由你定。

## Phase 4 · 发布与跟进（12-07 到 12-20，条件执行）

- [ ] **P4.0 发布前检查（本窗口备清单，Howard 做；只在 12-06 决定发布之后，12-07 到 12-12）。** 方案第 3 节的门槛（R1、R2、R3、R5）是否仍在线；min-instances=1 由你批准并部署（方案第 8 周；本清单不部署、不代批；AGENTS.md：部署只在你开口时做）。决定不发或推到 01-10，就不做这一项。"不上线新工具"约束的是本窗口，不含这一项。验收：进度里写每项的结果和日期，或写"未发布，未做"。
- [ ] **P4.1 Show HN（Howard；只有你在 12-06 决定发，OD11；P4.0 通过后）。** 提议 12-13（周日）16:00 UTC，提交仓库，不提交博客；你守 3 小时，第二天早上集中回一轮；发布前一周不上线新工具。归因：HN 读者先到 github.com，README 的链接带 `utm_source=github`，所以官网的 `firstSource` 分不出 HN；看 GitHub Traffic 的引荐网站，并在访谈和邮件里问一句"你是怎么找到的"。验收：发布或推迟的决定和时间写进进度；发布周的外部注册数和激活账户数写进进度，各带分母（注册里联系了几人、回复几人、同意几人）。
- [ ] **P4.2 发布后跟进（Howard；本窗口备计数）。** 发布带来的注册，按 OD7 的结论由 Howard 联系（只问一个问题；OD7 没通过就只回 issue 和评论）；同意试用的走 P2.1。本窗口只备注册的计数，不联系任何人。验收：外联日志每人一行；每个数带分母；12-20 前写发布周总结一行。

## Phase 5 · 冻结项（不开工）

每一项的重开条件逐项写。ROADMAP 当前阶段对阶段 H 冻结项的规则（适用于 F6）是"外部用户说需要，并记在 `research/trials/` 里"；付款类（F4、F5）按 ROADMAP 的"至少十个人激活"；其余（F1、F2 的第一步、F3、F7、F8、F9）是本清单自己的条件，各行写明。

| # | 项 | 为什么冻结 | 重开条件 | 归谁 |
| --- | --- | --- | --- | --- |
| F1 | 官网多语言页 | 构建把 `<html lang="en">` 写死（`apps/public-web/scripts/build-docs.mjs`），没有多语言字段，文档页描述有 140 到 160 个字符的长度测试（`test/docsPages.test.ts`），对日文、韩文、中文不一定合适；需要改构建 | `readme-ja`、`readme-ko`、`readme-zh-cn` 来源（附录 A）有外部注册，或至少 3 位非英语参与者提出 | UI 窗口 |
| F2 | 大陆可达性测试、备案、面向中国的托管 | 这周没有一位大陆用户在等；可达性未测（`octocrawl.dev` 在 GreatFire 没有数据，`mcp.`、`api.` 没查）；没有找到要求境外托管服务备案的条文，也没有明确豁免；收款只能一次性；Claude 在大陆不可用。第一步是从两个大陆观测点测三个域名的 DNS、TLS 和 GET，每个时段至少三次，记录放 `research/market/runs/` | 第一步（可达性测试）：至少 1 位大陆开发者主动联系并愿意访谈或试用（记在外联日志或 `research/trials/`；与 GTM 文档一致）。本清单不给中国发消息（W2 中国 0 条，W3 没有大陆访谈），所以这个条件只可能来自主动找上门的人。备案属于法律事项，按 F4 的条件；面向中国的托管属于阶段 H，按 F6 的条件。均受 OD14 约束 | Howard 先测，再看引擎、运维 |
| F3 | Dify 插件、魔搭 MCP 广场入驻 | 是否需要工程没评估（OD13）；Dify 的网站同步文档目前只举了 Jina Reader 与 Firecrawl | 至少 1 位试用者说他们用 Dify 或魔搭 | M2 窗口 |
| F4 | 付款、MoR 书面提问、律师审查（含"托管直接抓取"与"本地 Chrome"的区别，*Amazon v. Perplexity* 之后） | ROADMAP 当前阶段推迟到至少十个人激活之后（OD12） | 十个人激活，或你改 ROADMAP | Howard |
| F5 | 日元、韩元、人民币定价 | 现在没有任何定价；付款也冻结 | F4 解冻 | Howard |
| F6 | 托管的监控、投递、登录、增强访问的后续工作 | ROADMAP 当前阶段把阶段 H 的这些冻结；托管的增强访问是阶段 H 的主线（2026-10-27 推翻了 10-22 "不开放"的决定），`hosted_chrome` 2026-10-31 随账户开关发布，其余不再推进 | 试用记录说需要 | M2 窗口 |
| F7 | GEO 任务清单 | 另一个窗口在做（PR #911，开放）。本清单没有读它，也不用它的发现；"chatgpt.com 5 个"这个数字来自上面起点表里的漏斗运行 | 由那个窗口决定 | PR #911 的作者窗口 |
| F8 | Firecrawl 拦截页计费测试和对照文章 | ROADMAP 当前阶段"Benchmark work waits"，且没有一位试用者在等它；我们不做"Firecrawl 会对验证码页收费"这种没测过的话（OD5） | 一位试用者或访谈对象问起与 Firecrawl 的差别，并且你要发对比内容；测试设计见调研记录 §11.3（那里写的是付费账号，GTM 文档 D4 写的是免费账号，重开时由你定用哪个）。受 OD5、OD14 约束 | Howard、本窗口 |
| F9 | 欧洲"Evidence Record 与欧盟规则"一页说明（GTM 文档 §4.4 动作 1） | 法律文本都围绕训练，对"按需抓取"的适用没有定论；律师审查按 ROADMAP 推迟（F4）；措辞要极小心，只写记录了什么 | F4 解冻，或你要提前并改 ROADMAP | Howard、UI 窗口 |

## 进度

- 2026-11-09：清单写成，核实基于 `c059d36f` 加 PR #912。起点见上面的"起点"表。PR #912 开放，Auto-fix 已开。Phase 0 未开始。
- 2026-11-09：第一版经三位干净上下文审查员逐条核对（48 条意见），改了这些：外联从本周开始，不等到 11-16；Firecrawl 计费测试、大陆可达性测试、对照文章按 ROADMAP 的筛选移到冻结项（F2、F8）；"激活"改成能算的近似口径并写明缺口；日期按周日、周一重排（12-06 是周日）；两周实验的裁决挪到 Phase 3；Show HN 不预先承诺；决定重新编号避免与其他文档的 D 重名；试用记录由谁写说清楚；窗口名只用 CLAUDE.local.md 里有的；GTM 文档的 D2、D4、D5、D6 与风险一、时间表，调研记录里关于托管增强访问的一句（ROADMAP 2026-10-27 已推翻 10-22 的决定），也一起改了。
- 2026-11-09：读了仓库外的 GTM 最终方案和外联日志后，与四份文档对齐了三处：(1) 官网构建把 `lang` 写死为 `en`，所以本地语言说明改成仓库根的 `README.<语言>.md`；(2) GTM 文档 D6 原来的默认值是提前问 MoR，与 ROADMAP 的"付款、MoR、律师推迟到十个人激活之后"冲突，已改成遵守 ROADMAP；(3) 方案第 3 周的 Polar 提问同样受 ROADMAP 的 2026-11-01 决定约束，本清单不做（F4）。
- 2026-11-10：第二、三轮干净上下文审查（共 36 条）后改了：完成数要求至少一个字段实际交付；欧洲有裁决规则或"样本不足"；`utm_source` 里分语言页，漏斗才分得出；P4.0 只在 12-06 决定发布之后做；P1.2 记托管 revision 的源 commit，且不报比例；P1.5 有无例子的退路；试用记录每周四和 11-28 入库；OD 分成挡着试用的和不挡的，并写了砍法顺序；"省 token"没测过，不说；OD3 写明正本；GTM 文档的律师、访谈下限、欧盟页三处与本清单对齐。

- 2026-11-10：PR #912 已合入（`2959bf95`），P0.1 完成，Phase 0 开始。

- 2026-11-10：**P0.7 口径核对结果。** 方法：9 组文件各一个 scout 逐文件读，每组再由一个质疑者重读被引的行，最后一个覆盖检查员在全仓库按关键词找没被覆盖的文件；总共 19 个 agent。之后我用脚本核对了下表每一条引文都在所引的文件和行（53 条，有 1 条的行号差一行，已按实际行写）。检查项和类别见 GTM 文档 §2 与本清单的"对外措辞"。本任务不改任何文件，表给你；站点文件的修改交给谁由你决定。
  - **"省 token"一类（只有 OD5 改成"测出来之前不说"才算冲突；按默认，这些定性的句子不用改，只有没测过的费用或百分比要避免）：**

    | 文件:行 | 现在的句子 | 建议 |
    | --- | --- | --- |
    | `README.md:12` | "Fewer tokens than raw HTML. Every result records how it was read." | 删去前一句 |
    | `plugins/octocrawl/README.md:3` | "…your agent reads in fewer tokens than raw HTML." | 去掉这半句 |
    | `plugins/octocrawl-openai/plugin.json:26` | "…that ChatGPT and Codex can read in fewer tokens than raw HTML." | 去掉这半句 |
    | `apps/public-web/scrape/index.html:7` 和 `:13`，以及 `apps/public-web/src/product/scrapePage.ts:13` | "…fields your agent reads in fewer tokens than raw HTML…" | 三处要一起改：HTML 是手写的入口文件，`test/scrapePage.test.ts:26` 要求它的 meta 与 `SCRAPE_DESCRIPTION` 一字不差 |
    | `apps/public-web/content/blog/hosted-crawl-and-batch-jobs.md:48` | "Because the agent pays for every character it reads." | 小节只写量过的大小（7 页约 3.2 MB HTML 对 41,254 个 Markdown 字符），不写 token 或费用 |

  - **"任何站 / 任何页"类：**

    | 文件:行 | 现在的句子 | 建议 |
    | --- | --- | --- |
    | `apps/public-web/content/blog/find-all-pages-on-a-website.md:100` | "Try it on any site, no sign-up →" | "Map a public site, no sign-up →" |
    | 同文 `:120` | "You want a list in seconds, for any site" | "…for a public site" |
    | `apps/public-web/src/product/scrapePage.ts:267` | "Octocrawl turns any public page into clean, sourced data…" | "…a public page it can read…"，读不到时记录会写原因 |
    | `apps/public-web/tools/website-to-text/index.html:7` 和 `:13`，以及 `apps/public-web/src/tools/websiteToText.ts:11` | "Extract the readable text of any public web page…"（没有写读不到会怎样） | 去掉 any，补一句"读不到时给原因"；三处要一起改（`test/toolPage.test.ts:41` 要求 HTML 与源头一致） |
    | `apps/public-web/scripts/siteNav.mjs:38` | "Any public page as clean Markdown" | "A public page as clean Markdown, or the reason it could not be read" |
    | `apps/public-web/src/tools/toolSections.ts:55` | "Signed in, run any page on your credits…" | 去掉 any |
    | `apps/public-web/src/tools/urlToMarkdown.ts:10`，以及 `apps/public-web/tools/url-to-markdown/index.html:7` 和 `:13` | "Convert any public web page to clean Markdown…When a page can’t be read, you get the reason." | 优先级低：已写读不到时给原因，只是 any 一词；三处一起改 |

  - **增强访问、绕过拦截的措辞：**

    | 文件:行 | 现在的句子 | 建议 |
    | --- | --- | --- |
    | `apps/public-web/content/connect-mcp.md:133` | 先说托管不提供代理、验证码、隐身，随后指向自己服务器上的 access grant | 去掉这一指向，或改成中性说法并注明 robots.txt 仍然遵守、被拦的页仍记为 blocked |
    | `apps/public-web/content/blog/claude-code-web-scraping.md:96` | "on your computer you can get through the check yourself in your own Chrome." | "…where you sign in or finish a site's own check yourself. The site may still refuse the read." |
    | `apps/public-web/src/product/scrapePage.ts:295` | "With enhanced access set up on your computer, Octocrawl goes on to read those in the Google Chrome installed there" | 加上"如果你有权读取；仍可能被拒绝" |
    | `apps/public-web/src/product/scrapePage.ts:321` | "Starts light. <b>Climbs</b> when a page fights back." | "Starts light. <b>Steps up</b> only when a page needs it." |

  - **与别的产品比较：**

    | 文件:行 | 现在的句子 | 建议 |
    | --- | --- | --- |
    | `apps/public-web/content/blog/find-all-pages-on-a-website.md:49` | Screaming Frog 免费版的 500 个 URL 与不渲染 JavaScript 的限制 | 来自它的文档，文中第 9 行也说没测过；在句子旁写明来源和日期，或去掉限制 |
    | `apps/public-web/content/blog/scrape-list-of-urls.md:3` | "The second half is the one most tools skip." | 改成只说本工具：读回来少了的话，你就要自己猜缺了哪几页 |

  - **"proof"：** `apps/public-web/content/blog/claude-code-web-scraping.md:72` 的 "**For proof**, ask for the final URL and fetch time from the evidence record" 用了这个词，建议改成 "To check a read, ask for…"。其余 proof、guarantee 的公开用法都是否定句（"not proof"、"does not guarantee"：`terms.md:48`、`limits.md:83`、`introduction.md:40`、`amazon-product.md:3`、`find-all-pages-on-a-website.md:7`、`urlToMarkdown.ts:44`、`websiteToText.ts:28`）。"合规"、"compliant"：没有公开用法，只有字段名 `compliance`。
  - **"失败不计费"：** 没有哪一处把它当标题或第一句，所以不算冲突；但下面这些公开句子都写了"被拦的页不收费"，记在这里，你若要降低它的位置再改：`apps/public-web/content/scrape.md:115`、`apps/public-web/src/page.ts:26`（"Is it free?" 一问）、`apps/public-web/scripts/build-docs.mjs:427`、`apps/public-web/src/product/scrapePage.ts:341` 和 `:410`、`apps/public-web/scripts/dashboardPages.mjs:67`（"Not charged · 30 days" 一格）和 `:117`（"…costs nothing"）。
  - **不当作冲突、记在这里的：** (1) `docs/access.md`、`docs/scrape-options.md`、`docs/local-setup.md`、`docs/hosted-api.md`、`packages/api/src/hints.ts`、`packages/contracts/src/api.ts` 里关于增强访问、验证码求解的文字，是对功能的事实描述和给调用者的提示，不是推广措辞，ADR 0005 和 ROADMAP 的方向就是这样；`ROADMAP.md` 是仓库里的规划文件，不是推广文字（但 `README.md:212` 链到它，所以它是公开可读的）。(2) `apps/public-web/content/scrape.md:69-75` 里的 39,370 和 15,463 个 token 是同一页两种选择器下的 Markdown token 数，不是 Markdown 对 HTML 的比，所以不构成"省 token"的测量。
  - **谁先谁后（lead_order，信息性）：** 托管在前：`README.md` 的 Quick start、`llms-install.md`、`connect-mcp.md`、`introduction.md`（先是浏览器预览）、`packages/ai-sdk/README.md`、官网首页的 Get code 对话框、`/llms.txt`、博客 `claude-code-web-scraping`、`hosted-crawl-and-batch-jobs`、`web-scraping-for-rag`。本地在前：`packages/cli/README.md`、`packages/mcp/README.md`（托管在第 45 行）、`packages/sdk/README.md`、官网首页 Get started 窗口的第一个标签（`npx octocrawl scrape`）、博客 `firecrawl-v1-migration`、`scrape-list-of-urls`、`scrape-website-with-login`（登录只能走本地）。2026-11-03 的外联日志里你选了暂时不改 README，本表只记现状。
  - **没读完的（unknown，不是没有）：** `packages/mcp/src` 里的大文件（`hostedApi.ts` 等）和 `packages/api/src/hints.ts` 只按关键词检索，没有逐行读；`packages/sdk/src`、`python/src` 的文档字符串与报错、`apps/public-web/public/docs-assets/*.js` 的页面文字、`apps/public-web/scripts/dashboardPages.mjs`、`docs/` 下其余公开文档（`docs/guides/`、`docs/cli.md` 等）、`examples/`、`cloudflare/` 的错误页没有查；官网首页其余文案由 `src/main.ts`、`src/page.ts` 渲染，只查了 head 和 JSON-LD 以外的关键词。
  - **顺手发现，不在 P0.7 范围，也不改：** `packages/public-preview/src/preview.ts:393` 向访客打印 "…so W2L did not fetch the page."；AGENTS.md 把代码打印的信息视为标识符、改名要有意为之，所以列为后续项，由你决定要不要改。

## 下次从这里继续

Phase 0：P0.1 已完成，P0.7 已完成（结果在"进度"，要不要改、交给谁由你定；与 OD5 联动：只有你把 OD5 改成"测出来之前不说"，"省 token"那几处才是要改的）。P0.2（做 OD1 到 OD9）是你的；P0.5（外联名单，你定人、我的 scout 查公开帖子）、P0.6（第一周 10 条外联）和 P0.9（第一周访谈）也是你的，不要等材料齐；P0.3（日志对账和基线脚本）、P0.4（来源标记表）、P0.8（邀请材料，附录 C 已有草稿，等你审）我可以直接做，P0.3 要你先决定 OD3，并提供 gcloud 登录。

## 附录 A：来源标记（`utm_source` 的固定名字）

每个渠道只用一个名字，所有链接带 `?utm_source=<名字>&utm_medium=<类型>`。目录、连接器、下载和 Hacker News 不会经过带标记的链接，靠客户端名称、GitHub Traffic 的引荐网站和访谈。

| 渠道 | `utm_source` | `utm_medium` |
| --- | --- | --- |
| GeekNews | `geeknews` | `post` |
| Velog | `velog` | `post` |
| Zenn | `zenn` | `post` |
| Qiita | `qiita` | `post` |
| V2EX | `v2ex` | `post` |
| LINUX DO | `linuxdo` | `post` |
| HelloGitHub | `hellogithub` | `post` |
| YouTube 创作者 | `youtube` | `creator` |
| Cursor 论坛 | `cursor-forum` | `post` |
| Reddit | `reddit` | `post` |
| GitHub README 的语言页 | `readme-ja`、`readme-ko`、`readme-zh-cn`（漏斗只报 `utm_source`，所以语言写在这里；英文 README 已经在用 `github`） | `readme` |
| 一对一私信或邮件 | `dm` | `outreach` |
| Hacker News | 无（提交的是仓库） | 看引荐主机名 |

## 附录 B：每周取数命令

- 漏斗：`W2L_FUNNEL_INTERNAL=<内部账号，逗号分隔> W2L_PROJECT_ID=octopus-w2l-20260924-7r7 NODE_USE_ENV_PROXY=1 node scripts/hosted/funnel.mjs --days 7 --json`（内部账号列表在主 checkout 的 `.w2l/funnel-internal.txt`，不要打印；这个 worktree 里没有 `.w2l`）。
- 试用记录数：`ls research/trials/` 去掉 `README.md`、`TEMPLATE.md` 和 2026-10-16 的入口自检。
- 公开包：`curl https://api.npmjs.org/downloads/point/last-week/<包名>`；PyPI 用 `https://pypistats.org/api/packages/<包名>/overall?mirrors=false` 的日序列求和（`/recent` 的 `last_month` 是过期值，见调研记录 0.3 与台账的审查备注）。

## 附录 C：邀请与访谈材料（英文草稿；日文、韩文、简体中文等母语者校对后再出）

**邀请，一对一，由 Howard 亲手写、改成自己的话：**
> I built Octocrawl, an open-source tool that lets a coding agent read a web page as Markdown and tells you plainly when it could not. I am looking for people who have a real page or a list of pages they need to read with an agent. If you have one, would you try it on that and tell me where it breaks? It takes about five minutes: one command, your own URL. If it fails, that is the most useful result for me.

**5 分钟任务提示（给对方）：**
> I need `<你的 URL>` read, and I want `<你要的内容或字段>`, for `<你的用途>`. Use Octocrawl. Keep the actual response, the final URL and the Evidence Record. Tell me whether the page was read, whether the checks passed, and what is still missing. If the source did not deliver what I asked for, say so; do not use another page instead.

**访谈开场：** 先问"最近一次"（上次让 agent 读一个页面、结果是空的或被拦，是什么时候）；不问"你会不会"。其余 8 个问题见画像文档末尾。每个人 20 分钟；答案只记摘要在外联日志里。
