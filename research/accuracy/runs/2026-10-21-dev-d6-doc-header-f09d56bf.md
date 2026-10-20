# Development set on the D6 document-header branch `f09d56bf` against R1b (PA D6)

**Date:** 2026-10-21 local (2026-10-20 UTC). **What:** the comparison D6 asks of each slice (`docs/pa-enhancement-tasks.md`, D6: "开发集 D01–D10 相对 R1b 无退步"), for the first slice, an RFC/W3C document's header and status/date. Same cases, request, dataset and scorer as the R1b baseline [2026-10-20-dev-baseline-cea1d4cb.md](2026-10-20-dev-baseline-cea1d4cb.md); only the engine differs.

## Conditions

| Item | Value |
| --- | --- |
| Engine source | branch `claude/pa-d6-doc-header-3e7f16` at `f09d56bf`: one commit on `main` `db80379b` (main-content selection keeps a flat document's header; `extract-tf/32`) |
| Built with | `npx tsc --build`; Node v26.8.1 |
| Dataset | `.w2l/field-gold/2026-10-17/` (git-ignored), the sealed set R1b used |
| Request | `dev-plan.v1.json`, unchanged: markdown, tables, links; HTTP channel only; H cases keep their `markdownIncludes` identity check |
| Network | Loopback only (`http://127.0.0.1:8862`, proxy variables removed by the runner). No request left the machine |
| Grant, browser, model, vendors | None. Cost $0 |
| Outputs | `.w2l/field-gold/runs/2026-10-21-dev-d6-doc-header-f09d56bf/` (not committed) |

```sh
node research/accuracy/run_dev.mjs .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-21-dev-d6-doc-header-f09d56bf main
.w2l/pyenv/bin/python research/accuracy/holdout_score.py .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-21-dev-d6-doc-header-f09d56bf \
  --fixture-origin http://127.0.0.1:8862 --versions main \
  --cases D01,D02,D03,D04,D05,D06,D07,D08,D09,D10,H01,H02,H03,H04,H05,H06,H07,H08 \
  --out .w2l/field-gold/runs/2026-10-21-dev-d6-doc-header-f09d56bf/field-results.json \
  --markdown .w2l/field-gold/runs/2026-10-21-dev-d6-doc-header-f09d56bf/fields.md
```

(The `.w2l/` paths are in the main checkout, `~/Code/w2l/.w2l/`; the commands ran from the worktree with absolute paths.)

## Results

| Measure | R1b (`cea1d4cb`) | D6 branch (`f09d56bf`) |
| --- | --- | --- |
| D01–D10 required fields fully correct | 34/86 | 34/86 |
| H01–H08 required fields fully correct | 62/75 | **75/75** |
| All captured fields fully correct, D / H | 39/96 / 64/77 | 39/96 / 77/77 |
| Tasks accepted, D / H | 0/6 / 6/8 | 0/6 / **8/8** |
| False successes, D / H | 7 / 1 (H07) | 7 / **0** |
| Wrong record / unbound value present / fabricated (D) | 0 / 7 / 0 | 0 / 7 / 0 |

### Fields that changed

All 13 are in H01 and H07; `fields.md` is otherwise identical to R1b's.

| Case | Field | R1b: value / date / fully | Branch: value / date / fully |
| --- | --- | --- | --- |
| H01 RFC 9110 (missed → correct success) | `r1/document_id` | ✓ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/title` | ✓ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/category` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/publication_month` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/author_1` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/author_2` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/author_3` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| H07 WCAG 2.2 (false success → correct success) | `r1/title` | ✓ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/status` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/recommendation_date` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/conformance_level_1` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/conformance_level_2` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |
| | `r1/conformance_level_3` | ✗ / ✗ / ✗ | ✓ / ✓ / ✓ |

H01's identity check (`markdownIncludes` on the header) now passes, so its verification went from `failed` to `passed`.

### Raw responses

In the 16 other cases the delivered `markdown`, `tables` and `links` are byte-for-byte R1b's, and every status is the same. H01's Markdown grew from 7,347 to 571,101 characters (R1b delivered the Collected ABNF appendix alone; the branch delivers the whole RFC, header first) and its `tables` changed with it; H07's grew from 42,547 to 165,193 (R1b delivered section 6, the Glossary, alone).

## Limits

- Same as R1b: replays of the bytes captured on 2026-10-17 through the HTTP channel only; the set was used for tuning and H01–H08 are regression data, not a holdout. The reserved set v2 was not run.
- H01 and H07 are the pages this slice was written for, so their gain shows the slice works on them, not that it generalizes. The fixtures in `packages/extract-tf/test/documentHeader.test.ts` are synthetic and the negative cases there are what guards other pages.
