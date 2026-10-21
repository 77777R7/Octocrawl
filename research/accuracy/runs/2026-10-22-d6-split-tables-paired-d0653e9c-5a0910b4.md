# Split standings tables, same-day pair: main `d0653e9c` against the D6 branch `cd60c260`, then `ca915262`, `7dc31e9a` and `5a0910b4` (PA D6)

**Date:** 2026-10-22 (UTC+8; the replays ran 2026-10-21 UTC). **What:** the no-regression comparison D6 asks of each slice (`docs/pa-enhancement-tasks.md`, D6), for the split-tables slice: two adjacent tables that are one table drawn as a fixed name column beside its scrolling values are joined back. It replays the development and regression sets (D01–D10, H01–H08) and reserved set v2 (V01–V42, regression data since #639) on their retained bytes, with the Markdown request and with the json/verify request, on current `main` and on the branch.

Nothing was tuned on any of these sets. Reserved set v2 is used as regression data only.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50`, `extract-tf/34` (the same control outputs as the aggregate-offers slice's pair, run in this worktree at `d0653e9c` before any change) |
| Candidate | branch `claude/pa-d6-split-tables` at `cd60c260` (`extract-tf/36`): one test commit and one engine commit on `d0653e9c` |
| Built with | `npx tsc --build` in this worktree; Node v26.8.1 |
| Requests | `dev-plan.v1.json` and `dev-plan-json.v1.json` (D/H), `reserved-plan.v2.json` and `reserved-plan-json.v2.json` (V), unchanged |
| Driver, mapping, scorer | `run_dev.mjs --plan`, `holdout_score.py` (`--mapping json` for the json requests), all as on `d0653e9c` |
| Network | Loopback only (`http://127.0.0.1:8862` for D/H, `:8863` for V), proxy variables removed by the driver. No request left the machine |
| Cost | $0: no grant, browser, model or vendor |
| Outputs | control `.w2l/field-gold/runs/2026-10-22-d6-rest-control-d0653e9c/`; candidate `.w2l/field-gold/runs/2026-10-22-d6-split-cd60c260/`, with the control outputs copied in for scoring (not committed) |

The commands are those of `2026-10-22-d6-aggregate-paired-d0653e9c-42fce5cb.md`, with `P=$R/runs/2026-10-22-d6-split-cd60c260` for the candidate.

## Results

| Set and request | Control `d0653e9c` | Candidate `cd60c260` |
| --- | --- | --- |
| D01–D10, Markdown | 34/86, 0/10 accepted, 7 false successes | 34/86, 0/10 accepted, 7 false successes |
| H01–H08, Markdown | 75/75, 8/8 accepted, 0 | 75/75, 8/8 accepted, 0 |
| D01–D10, json/verify | 0/86, 0/10 accepted, 0 | 0/86, 0/10 accepted, 0 |
| H01–H08, json/verify | 0/75, 0/8 accepted, 0 | 0/75, 0/8 accepted, 0 |
| V01–V42, Markdown | 229/294, 23/42 accepted, 18 | 229/294, 23/42 accepted, 18 |
| V01–V42, json/verify | 29/294, 1/42 accepted, 0 | 29/294, 1/42 accepted, 0 |

No field or outcome of any case changed, and the responses' status, Markdown, tables, links and json are identical between control and candidate for all 120 requests.

A clean-context review of `cd60c260` found two blocking cases: side-by-side leaderboards whose headings had no text (an SVG icon, an image, a tab button that cleaning removes) were joined, and the adjacency check ran a text comparison for every pair of tables before any cheap check (quadratic; 5,000 layout tables took 4 s). The fix `ca915262` finds the pairs on the page as received, allows only empty div/span wrappers between the halves, and checks structure first; its fixtures fail on `cd60c260`. The candidate side was replayed again at `ca915262` with the same four requests (outputs `.w2l/field-gold/runs/2026-10-22-d6-split-ca915262/`): the same table, and again all 120 responses identical to the control. A second review of `ca915262` found the tables of two tab panels joined (the tabs sit outside the element holding both panels); `7dc31e9a` keeps two halves apart when a wrapper between them is a region of its own (a tab panel or dialog, one with `aria-labelledby` or `hidden`, one whose id the page's controls point at), with fixtures failing on `ca915262`. Replayed again at `7dc31e9a` (outputs `.w2l/field-gold/runs/2026-10-22-d6-split-7dc31e9a/`): the same table, all 120 responses identical to the control. A third review found panes hidden by an inline style or `aria-hidden`, and class-only tabs, still joined; `5a0910b4` counts those wrappers as regions of their own and keeps two tables apart when the wide one's first column is names of its own (distinct texts without a digit), fixtures failing on `7dc31e9a`. Replayed at `5a0910b4` (outputs `…-split-5a0910b4/`): the same table, all 120 responses identical to the control. The fourth review found nothing blocking; it named one narrow case still joined wrongly (two class-only tab panes, neither hidden, tables of the same length, a narrow table of at most two columns, and a second table whose first column holds digits, such as dates), left as a known limit.

## What this does and does not show

- No regression on the development, regression or reserved v2 sets: no page in them has two adjacent tables the rule joins.
- It does not measure the change. Its evidence is the fixtures in `packages/extract-tf/test/splitTables.test.ts` (three fail on `main`, at `0bc674cd`) and real-site case M17 in `research/parity/sites.md`: 1/4 checks on `main` proxied and direct, 4/4 on the branch proxied and direct at `5bd45799` (the engine of `cd60c260` with the case's header check corrected; the runs at `cd60c260` failed only that check) and at `ca915262`, `7dc31e9a` and `5a0910b4` ([records](../../parity/runs/)).
