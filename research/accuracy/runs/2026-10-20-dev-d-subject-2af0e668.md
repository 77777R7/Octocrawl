# Development set on the D branch `2af0e668` against R1b (PA D)

**Date:** 2026-10-20. **What:** the development-set comparison D acceptance asks for (`docs/pa-enhancement-tasks.md`, D: "开发集字段正确率相对 R1b 不退步"). Same cases, request, dataset and scorer as the R1b baseline [2026-10-20-dev-baseline-cea1d4cb.md](2026-10-20-dev-baseline-cea1d4cb.md); only the engine differs.

## Conditions

| Item | Value |
| --- | --- |
| Engine source | branch `claude/pa-d-subject-fields-81fc25` at `2af0e668`: D1–D4 (`8be83684`) merged with `main` `f28ac403`, which includes R1b (#621) |
| Built with | `npm ci`, `npx tsc --build`; Node v26.8.1 |
| Dataset | `.w2l/field-gold/2026-10-17/` (git-ignored), the sealed set R1b used |
| Request | `dev-plan.v1.json`, unchanged: markdown, tables, links; HTTP channel only; no `json` format |
| Network | Loopback only (`http://127.0.0.1:8862`, proxy variables removed by the runner). No request left the machine |
| Grant, browser, model, vendors | None. Cost $0 |
| Outputs | `.w2l/field-gold/runs/2026-10-20-dev-d-subject-2af0e668/` (not committed) |

```sh
node research/accuracy/run_dev.mjs .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-20-dev-d-subject-2af0e668 main
.w2l/pyenv/bin/python research/accuracy/holdout_score.py .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-20-dev-d-subject-2af0e668 \
  --fixture-origin http://127.0.0.1:8862 --versions main \
  --cases D01,D02,D03,D04,D05,D06,D07,D08,D09,D10,H01,H02,H03,H04,H05,H06,H07,H08 \
  --out .w2l/field-gold/runs/2026-10-20-dev-d-subject-2af0e668/field-results.json \
  --markdown .w2l/field-gold/runs/2026-10-20-dev-d-subject-2af0e668/fields.md
```

(The `.w2l/` paths are in the main checkout, `~/Code/w2l/.w2l/`; the commands ran from the worktree with absolute paths.)

## Results

| Measure | R1b (`cea1d4cb`) | D branch (`2af0e668`) |
| --- | --- | --- |
| D01–D10 required fields fully correct | 34/86 | 34/86 |
| H01–H08 required fields fully correct | 62/75 | 62/75 |
| Wrong record / unbound value present / fabricated (D) | 0 / 7 / 0 | 0 / 7 / 0 |

`fields.md` is identical to the baseline's, and `field-results.json` is equal apart from run paths. In the 18 raw SDK responses the only value that differs from the baseline, other than times and the run commit, is `evidenceRecord.extractor.version` (`extract-tf/30` → `extract-tf/31`): the branch's engine ran, and its Markdown, tables and links are byte-for-byte the baseline's.

## What this does and does not show

No regression on the development or regression set. It does not measure the D change itself: `dev-plan.v1.json` asks for no `json` format, so the product facts D changes (subject, paths, conflicts) never reach the scored output, and D02 (Newegg offers) and D05 (OTTO variants) are scored on Markdown and tables only. D's own evidence is the D1 fixtures in `packages/extract-tf/test/product.test.ts` and the D5 real-site cases.
