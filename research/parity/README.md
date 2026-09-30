# Firecrawl parity audit (2026-09-28)

W2L compared feature by feature with Firecrawl v2. The feature list was built from Firecrawl's official JS SDK `@mendable/firecrawl-js` 4.42.0, its MCP server `firecrawl-mcp` 3.25.5 and the Python SDK `firecrawl-py` 4.45.0, then each feature was audited against the W2L source at commit `97ef3a4` (the later `79cfce2` changed only session config). A second agent re-checked every audit; its 90 corrections (62 features) are applied and listed per feature.

Scoring: solid = 1, weak = 0.6, partial = 0.4, missing = 0; tier weights core = 3, common = 2, niche = 1.

| | Features | Score |
| --- | --- | --- |
| All, tier-weighted | 312 | 18.7% |
| All, unweighted | 312 | 15.1% |
| Core tier | 29 | 36.6% |

| File | Contents |
| --- | --- |
| `feature-matrix.csv` | One row per Firecrawl feature: tier, external dependency, W2L status, surfaces, effort, missing params, weaknesses, real-site check, verifier corrections |
| `core-features.csv` | The 29 core-tier features only |
| `feature-audit.json` | Full audit data, including code evidence (`file:line`) and tests per feature |
| `plan-to-70.md` | Milestones M1–M5 to reach 70% tier-weighted parity, with the files each change lands in |
| `milestones.json` | Feature ids per milestone |
| `score.mjs` | `node research/parity/score.mjs` recomputes the audit baseline, the current score after dated re-audits, and each milestone's projected score |
| `reaudit-2026-09-30.json` | Re-audit of the 21 M1 features after the M1 commits: status per feature with the commit and tests as evidence; applied on top of the audit by `score.mjs` |
| `real-site-test-set.md` | Proposed public test sites mapped to features, with a first live batch of 12 URLs |
| `live-batch-1-2026-09-30.md` | Run record of the first live batch through the local MCP service at `c0ab92a`: 4 pass, 5 partial, 2 fail, 1 not testable from that network; nine W2L findings |
| `live-batch-1-wikipedia-2026-09-30.md` | Re-run of the batch's URL 6 (Wikipedia GDP table) from the cloud session: pass on the applicable criterion; the spanned-header check moves to the second batch |

Statuses in `feature-audit.json` describe the code at `97ef3a4` and are not edited; a later status lives in a dated `reaudit-*.json` with its evidence. A feature becomes solid only when its check passes, recorded with the command and source commit.
