# Lead cards of a news collection, same-day pair: main `d0653e9c` against the D6 branch `63a84154`, then `1ec2b158` (PA D6)

**Date:** 2026-10-22 (UTC+8; the replays ran 2026-10-21 UTC). **What:** the no-regression comparison D6 asks of each slice (`docs/pa-enhancement-tasks.md`, D6), for the lead-cards slice: on a collection or listing page where the list strategy picked a list, the cards before it of the template its items repeat, inside the same main and outside sidebars, navigation, recommendation and promoted regions, are kept with it. It replays the development and regression sets (D01–D10, H01–H08) and reserved set v2 (V01–V42, regression data since #639) on their retained bytes, with the Markdown request and with the json/verify request, on current `main` and on the branch.

Nothing was tuned on any of these sets. Reserved set v2 is used as regression data only.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50`, `extract-tf/34` (the same control outputs as the aggregate-offers and split-tables slices' pairs, run in this worktree at `d0653e9c` before any change) |
| Candidate | branch `claude/pa-d6-collection-leads` at `63a84154` (`extract-tf/37`): one test commit and one engine commit on `d0653e9c` |
| Built with | `npx tsc --build` in this worktree; Node v26.8.1 |
| Requests | `dev-plan.v1.json` and `dev-plan-json.v1.json` (D/H), `reserved-plan.v2.json` and `reserved-plan-json.v2.json` (V), unchanged |
| Driver, mapping, scorer | `run_dev.mjs --plan`, `holdout_score.py` (`--mapping json` for the json requests), all as on `d0653e9c` |
| Network | Loopback only (`http://127.0.0.1:8862` for D/H, `:8863` for V), proxy variables removed by the driver. No request left the machine |
| Cost | $0: no grant, browser, model or vendor |
| Outputs | control `.w2l/field-gold/runs/2026-10-22-d6-rest-control-d0653e9c/`; candidate `.w2l/field-gold/runs/2026-10-22-d6-leads-63a84154/`, with the control outputs copied in for scoring (not committed) |

The commands are those of the aggregate-offers slice's record (`2026-10-22-d6-aggregate-paired-d0653e9c-42fce5cb.md`, PR #672), with `P=$R/runs/2026-10-22-d6-leads-63a84154` for the candidate.

## Results

| Set and request | Control `d0653e9c` | Candidate `63a84154` |
| --- | --- | --- |
| D01–D10, Markdown | 34/86, 0/10 accepted, 7 false successes | 34/86, 0/10 accepted, 7 false successes |
| H01–H08, Markdown | 75/75, 8/8 accepted, 0 | 75/75, 8/8 accepted, 0 |
| D01–D10, json/verify | 0/86, 0/10 accepted, 0 | 0/86, 0/10 accepted, 0 |
| H01–H08, json/verify | 0/75, 0/8 accepted, 0 | 0/75, 0/8 accepted, 0 |
| V01–V42, Markdown | 229/294, 23/42 accepted, 18 | 229/294, 23/42 accepted, 18 |
| V01–V42, json/verify | 29/294, 1/42 accepted, 0 | 29/294, 1/42 accepted, 0 |

No field or outcome of any case changed, and the responses' status, Markdown, tables, links and json are identical between control and candidate for all 120 requests.

A clean-context review of `63a84154` found three blocking cases: a layout wrapper sharing one utility class with the list's cards was taken whole, with the most-read and sponsored sections inside it; the region was pruned in the page itself, so the rendering checks after it read the page with content missing (a hydration list the page shows reported as partly shown); and partner, paid, trending and other sections' headings and class names were not known. The fix `1ec2b158` takes one story per card (at most one heading, long links to at most two places), prunes a detached copy used only for the content written out, and widens the secondary names and headings; its fixtures fail on `63a84154`. The candidate side was replayed again at `1ec2b158` (outputs `.w2l/field-gold/runs/2026-10-22-d6-leads-1ec2b158/`): the same table, all 120 responses identical to the control.

## What this does and does not show

- No regression on the development, regression or reserved v2 sets: no page in them is a collection whose list the list strategy picks with cards of its template above it.
- It does not measure the change. Its evidence is the fixtures in `packages/extract-tf/test/collectionLeads.test.ts` (two fail on `main`, at the test commit) and real-site case M18 in `research/parity/sites.md`: `main` proxied 1/2 (25 distinct article links), branch proxied 2/2 at `63a84154` and `1ec2b158` (36, under Lead story, News, Opinion & Analysis and More Technology); direct, www.ft.com could not be reached on either ([records](../../parity/runs/)).
