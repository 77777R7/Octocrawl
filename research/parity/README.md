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
| `score.mjs` | `node research/parity/score.mjs` recomputes the baseline and each milestone's projected score |
| `real-site-test-set.md` | Proposed public test sites mapped to features, with a first live batch of 12 URLs; none verified from the audit environment |
| `core-status-2026-09-29.csv`, `core-status-2026-09-29.md` | The 29 core features re-scored on 2026-09-29 against the code at `7e2a7b3`, with tests, real-site cases and gaps; `node research/parity/score.mjs --status research/parity/core-status-2026-09-29.csv` scores with them |

Statuses describe the code at `97ef3a4`. A feature becomes solid only when its real-site check passes, recorded with the command and source commit.

## Records from the `claude/vigilant-keller-nkskez` branch (2026-09-30)

Ported into `main` on 2026-09-30. These records were made on that branch's code, not on `main`; each names its commit. `reaudit-2026-09-30.json` and `reaudit-2026-09-30b.json` are per-feature status records in that branch's format (`{ id: { status, evidence } }`); `status-2026-09-30-vigilant-keller.csv` is the same content in the `--status` shape `score.mjs` reads here.

| File | Contents |
| --- | --- |
| `live-batch-1-2026-09-30.md`, `live-batch-1-wikipedia-2026-09-30.md`, `live-batch-1-m1-recheck-2026-09-30.md`, `live-batch-1-rerun-2026-09-30.md` | The first live batch of 12 URLs: first run, the Wikipedia re-run, the re-check after that branch's M1 items 1–4, and the full re-run at its S1 head (pass 8, partial 3, fail 1) |
| `m1-live-checks-2026-09-30.md`, `reaudit-2026-09-30.json` | That branch's M1 feature checks and re-audit (25.0% tier-weighted on its scheme) |
| `m2-live-checks-2026-09-30.md`, `reaudit-2026-09-30b.json` | Its html / rawHtml / includeTags / excludeTags checks (26.8%) |
