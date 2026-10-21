# OTTO selected variant and price kinds, same-day pair: main `5beacbf3` against the D6 branch `878c2d81` (PA D6)

**Date:** 2026-10-21. **What:** the no-regression comparison D6 asks of each slice (`docs/pa-enhancement-tasks.md`, D6), for the second slice: a variant the request URL selects by a declared PropertyValue, and a visible price told apart from a starting price, a list price and an instalment. It replays the development and regression sets (D01–D10, H01–H08) and reserved set v2 (V01–V42, regression data since #639) on their retained bytes, with the Markdown request and with the json/verify request, on current `main` and on the branch.

Nothing was tuned on any of these sets. Reserved set v2 is used as regression data only.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `5beacbf351c1eb3d1a97a51036266250f926d13a`, `extract-tf/33` |
| Candidate | branch `claude/pa-d6-otto-variant-e2c51a` at `878c2d8199c1d0a239a2fbfb26bb9e0bbbf5737b`, `extract-tf/34`: one test commit and one engine commit on `5beacbf3` |
| Built with | Control in its own detached checkout (`npm ci --ignore-scripts`, `npm rebuild better-sqlite3`, `npx tsc --build`); candidate in the branch worktree (`npx tsc --build`); Node v26.8.1 |
| Requests | `dev-plan.v1.json` and `dev-plan-json.v1.json` (D/H), `reserved-plan.v2.json` and `reserved-plan-json.v2.json` (V), unchanged |
| Driver, mapping, scorer | `run_dev.mjs --plan --engine`, `holdout_score.py` (`--mapping json` for the json requests), all as on `5beacbf3` |
| Network | Loopback only (`http://127.0.0.1:8862` for D/H, `:8863` for V), proxy variables removed. No request left the machine |
| Cost | $0: no grant, browser, model or vendor |
| Outputs | `.w2l/field-gold/runs/2026-10-21-d6-otto-paired-5beacbf3-878c2d81/{dev,dev-json,v2,v2-json}/{control,candidate}/` (not committed) |

```sh
R=~/Code/w2l/.w2l/field-gold; P=$R/runs/2026-10-21-d6-otto-paired-5beacbf3-878c2d81
# for v in control (--engine=<checkout of 5beacbf3>) and candidate (--engine=<this worktree>):
node research/accuracy/run_dev.mjs $R/2026-10-17 $P/dev $v --engine=…
node research/accuracy/run_dev.mjs $R/2026-10-17 $P/dev-json $v --plan=research/accuracy/dev-plan-json.v1.json --engine=…
node research/accuracy/run_dev.mjs $R/reserved-v2 $P/v2 $v --plan=research/accuracy/reserved-plan.v2.json --engine=…
node research/accuracy/run_dev.mjs $R/reserved-v2 $P/v2-json $v --plan=research/accuracy/reserved-plan-json.v2.json --engine=…
# then, per directory:
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py $R/2026-10-17 $P/dev [--mapping json] --fixture-origin http://127.0.0.1:8862 \
  --versions control,candidate --cases D01,…,D10,H01,…,H08 --out $P/dev/field-results.json --markdown $P/dev/fields.md
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py $R/reserved-v2 $P/v2 [--mapping json] --fixture-origin http://127.0.0.1:8863 \
  --versions control,candidate --cases V01,…,V42 --out $P/v2/field-results.json --markdown $P/v2/fields.md
```

## Results

Required fields fully correct (over required fields the capture supplies), tasks accepted:

| Set and request | Control `5beacbf3` | Candidate `878c2d81` |
| --- | --- | --- |
| D01–D10, Markdown | 34/86, 0/10 accepted | 34/86, 0/10 accepted |
| H01–H08, Markdown | 75/75, 8/8 accepted | 75/75, 8/8 accepted |
| D01–D10, json/verify | 0/86, 0/10 accepted | 0/86, 0/10 accepted |
| H01–H08, json/verify | 0/75, 0/8 accepted | 0/75, 0/8 accepted |
| V01–V42, Markdown | 229/294, 23/42 accepted | 229/294, 23/42 accepted |
| V01–V42, json/verify | 29/294, 1/42 accepted | 29/294, 1/42 accepted |

Per field: no field of any case changed in value, subject, relation, unit, date, period or full correctness (0 of 227 D/H field slots and 0 of 295 V field slots, under both requests). Per case: every outcome is the same. The responses' status, Markdown, tables, links and json (status, data, issues) are identical between control and candidate for all 120 requests.

## What this does and does not show

- No regression on the development, regression or reserved v2 sets.
- It does not measure the change. None of the 60 cases is a product page that declares several variants by a PropertyValue, or that shows a starting price, a list price or an instalment beside its price without declaring one; D05 (OTTO) is a listing, scored on Markdown. The change's evidence is the D6 fixtures in `packages/extract-tf/test/product.test.ts` (three fail on `main`, at `5c0dbb7c`) and the real-site case J08 in `research/parity/sites.md`, which OTTO refused with HTTP 400 on 2026-10-21 on main and on the branch, proxied and direct ([records](../../parity/runs/)).

## Re-run after the review fixes (`23c50125`)

A clean-context review of `878c2d81` found four blocking cases in the visible-price fallback and in telling declarations apart; `23c50125` fixes them (commit message and the three new fixtures and perf test in `packages/extract-tf/test/product*.test.ts`). The candidate side was replayed again on `23c5012535a761f6e8d1d4ebe686b38bc71075b4`, same four requests, same commands with `--engine=<this worktree>` and the control outputs above copied unchanged; outputs `.w2l/field-gold/runs/2026-10-21-d6-otto-paired-5beacbf3-23c50125/`.

The result is the same as the table above: D 34/86 (0/10 accepted), H 75/75 (8/8), v2 229/294 (23/42) on the Markdown request; D 0/86, H 0/75, v2 29/294 (1/42) on the json/verify request; no field, outcome or response (status, Markdown, tables, links, json) differs from the control.
