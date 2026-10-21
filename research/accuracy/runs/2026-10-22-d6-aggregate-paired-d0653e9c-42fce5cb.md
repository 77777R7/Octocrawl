# Aggregate offers, same-day pair: main `d0653e9c` against the D6 branch `42fce5cb` (PA D6)

**Date:** 2026-10-22 (UTC+8; the replays ran 2026-10-21 UTC). **What:** the no-regression comparison D6 asks of each slice (`docs/pa-enhancement-tasks.md`, D6), for the aggregate-offers slice: a product that declares only AggregateOffers keeps the grid of offers its page shows when the heading before it names the product and its prices fill the declared range, and no visible price is read as its one price. It replays the development and regression sets (D01–D10, H01–H08) and reserved set v2 (V01–V42, regression data since #639) on their retained bytes, with the Markdown request and with the json/verify request, on current `main` and on the branch.

Nothing was tuned on any of these sets. Reserved set v2 is used as regression data only.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50`, `extract-tf/34` |
| Candidate | branch `claude/pa-d6-aggregate-offers` at `42fce5cb` (`extract-tf/35`): one test commit, the engine commit `81adf9c3` and the review fixes `7aee862a` and `42fce5cb` on `d0653e9c` |
| Built with | Both in this worktree with `npx tsc --build`: control before any change (the worktree was at `d0653e9c` and clean), candidate after; Node v26.8.1 |
| Requests | `dev-plan.v1.json` and `dev-plan-json.v1.json` (D/H), `reserved-plan.v2.json` and `reserved-plan-json.v2.json` (V), unchanged |
| Driver, mapping, scorer | `run_dev.mjs --plan`, `holdout_score.py` (`--mapping json` for the json requests), all as on `d0653e9c` |
| Network | Loopback only (`http://127.0.0.1:8862` for D/H, `:8863` for V), proxy variables removed by the driver. No request left the machine |
| Cost | $0: no grant, browser, model or vendor |
| Outputs | control `.w2l/field-gold/runs/2026-10-22-d6-rest-control-d0653e9c/{dev,dev-json,v2,v2-json}/control/`; candidate `.w2l/field-gold/runs/2026-10-22-d6-aggregate-42fce5cb/` (and `…-81adf9c3/`, `…-7aee862a/` for the commits before the review fixes), with the control outputs copied in for scoring (not committed) |

```sh
R=~/Code/w2l/.w2l/field-gold
# control, at d0653e9c (P=$R/runs/2026-10-22-d6-rest-control-d0653e9c, label control); candidate, at 42fce5cb (P=$R/runs/2026-10-22-d6-aggregate-42fce5cb, label candidate):
node research/accuracy/run_dev.mjs $R/2026-10-17 $P/dev <label>
node research/accuracy/run_dev.mjs $R/2026-10-17 $P/dev-json <label> --plan=research/accuracy/dev-plan-json.v1.json
node research/accuracy/run_dev.mjs $R/reserved-v2 $P/v2 <label> --plan=research/accuracy/reserved-plan.v2.json
node research/accuracy/run_dev.mjs $R/reserved-v2 $P/v2-json <label> --plan=research/accuracy/reserved-plan-json.v2.json
# then, per directory, with both labels in it:
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py $R/2026-10-17 $P/dev [--mapping json] --fixture-origin http://127.0.0.1:8862 \
  --versions control,candidate --cases D01,…,D10,H01,…,H08 --out $P/dev/field-results.json --markdown $P/dev/fields.md
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py $R/reserved-v2 $P/v2 [--mapping json] --fixture-origin http://127.0.0.1:8863 \
  --versions control,candidate --cases V01,…,V42 --out $P/v2/field-results.json --markdown $P/v2/fields.md
```

## Results

Required fully correct over required fields the capture supplies, tasks accepted, false successes:

| Set and request | Control `d0653e9c` | Candidate `42fce5cb` |
| --- | --- | --- |
| D01–D10, Markdown | 34/86, 0/10 accepted, 7 false successes | **47/86**, 0/10 accepted, 7 false successes |
| H01–H08, Markdown | 75/75, 8/8 accepted, 0 | 75/75, 8/8 accepted, 0 |
| D01–D10, json/verify | 0/86, 0/10 accepted, 0 | 0/86, 0/10 accepted, 0 |
| H01–H08, json/verify | 0/75, 0/8 accepted, 0 | 0/75, 0/8 accepted, 0 |
| V01–V42, Markdown | 229/294, 23/42 accepted, 18 | 229/294, 23/42 accepted, 18 |
| V01–V42, json/verify | 29/294, 1/42 accepted, 0 | 29/294, 1/42 accepted, 0 |

The one case that changed is D03, Skyscanner's London to Paris route page (a Product with an AggregateOffer, lowPrice 20 GBP in the capture of 2026-10-16), on the Markdown request: required fully correct 2/18 → 15/18. Thirteen fields went from wrong to fully correct (the three offers' departure date, carrier and starting price; the second and third offers' URL; the second offer's route and ISO date and the third's ISO date); none went the other way, no field is fabricated or bound to a wrong record. D03 stays a false success (field error): three required fields are still wrong on both sides. Its json/verify response's Markdown changed the same way, and its json did not (the json plan reads no offer records from this page). Every other response (status, Markdown, tables, links, json) is identical between control and candidate, on all 120 requests.

The commits before the review fixes (`81adf9c3`, `7aee862a`) gave the same table and the same D03 fields. Clean-context reviews of `81adf9c3` and `7aee862a` each found blocking cases (a single shop's variant price range declared as an AggregateOffer kept neighbouring product grids; a grid of other products whose prices fell inside the range was kept; a number before a "£64" price was read in its place); each fix has its fixtures in `packages/extract-tf/test/product.test.ts`, failing on the commit before it. The third review found nothing blocking.

## What this does and does not show

- No regression on the development, regression or reserved v2 sets, and the slice's own effect on the one retained page of its kind (D03).
- The price rule (no visible price read as the subject's when it declares aggregate offers only) changes no scored field here: D03's json plan has no product price. It is shown by the fixtures in `packages/extract-tf/test/product.test.ts` (D6 aggregate group, failing on `main` at `cf175b15`) and on a Kayak route page captured on 2026-10-22, where `main` read `$88` from the page as the product price and the branch reports none.
- Real-site case M16 in `research/parity/sites.md`: 3/4 checks on `main` direct (no deal cards), 1/4 proxied (that capture was Skyscanner's bot check; an earlier proxied run not kept as a file had the page and failed the deal-card checks), 4/4 on the branch, proxied and direct, at `81adf9c3`, `7aee862a` and `42fce5cb` ([records](../../parity/runs/)).
