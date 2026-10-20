# json/verify request, same-day pair: main `2ffd7f25` against main `d094e319` (PA Phase 2)

**Date:** 2026-10-20. **What:** #639 showed that the Markdown, tables and links request cannot reach D (product facts) or F (model and same-capture candidates). This run measures the same two sets with a request that carries a json schema and a verify contract per case. It covers the development and regression sets (D01–D10, H01–H08) and reserved set v2 (V01–V42), on `2ffd7f25` and on current `main`, on the retained bytes.

This run's result is what the Phase 2 exit condition and F's acceptance now ask for. On the requester's instruction after #639, they read "on the json/verify request, the candidate is not lower than the same-day `2ffd7f25` control" instead of "the development set rises relative to R1b".

Reserved set v2 was already registered as opened by #639 (`research/accuracy/README.md`). Nobody tuned anything on it, or on the development set, for this request; the request shapes and the mapping were committed before this run and not changed after it.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `2ffd7f2536d84184f0d1caf24cdd724b81ed7dad`, extractor `extract-tf/30`, `VERIFIER_VERSION` `verify/9` |
| Candidate | `main` `d094e319a716b9d7b42d0e7ecd456e00ca001513` (after #638; engine as of #637), extractor `extract-tf/31`, `VERIFIER_VERSION` `verify/9` |
| Built with | Each commit in its own detached checkout: `npm ci`, `npx tsc --build`; Node v26.8.1 |
| Request shapes | `dev-plan-json.v1.json`, `reserved-plan-json.v2.json`, written by `json_plans.py`. Committed at `78f323f7` ("before any run"), then corrected after a clean-context review at `556d6a10` (2026-10-20 20:43:38 +08:00), still before any run |
| Driver, mapping, scorer | `run_dev.mjs --plan --engine`, `json_map.py`, and `holdout_score.py --mapping json`, all at `556d6a10` for all four runs |
| Request | The #639 request (markdown, tables, links; `onlyMainContent`, `fastMode` on the HTTP channel only; `maxAge: 0`, `storeInCache: false`; timeout 30 s), plus one `json` format and one `verify` per case |
| json schema | The task's fields: names, types (`number` for integer and decimal, otherwise `string`; percentages stay text), required flags and record grouping from the frozen task definition. A `currency` property is added where the task text asks for a currency. Repeated records go in a required `records` array. No gold value, unit or date is in any plan |
| verify | `json.status` equals `complete`; every required field present; each of the task's records present by index (`json.data.records.<k>.<field>`). Types come from the schema itself: there is no type check in `verify` |
| modelFallback | `false` on both sides. No extraction model (`W2L_EXTRACT_BASE_URL`, `W2L_EXTRACT_MODEL`) is configured on this machine, so the deterministic path is measured, and **F2 (a model value is kept only where the page states it) is not measured** |
| Network | Direct, loopback only (`http://127.0.0.1:8862` for the dev set, `:8863` for v2), with proxy variables removed by the runner. No request left the machine |
| Cost | $0: no grant, browser, model or vendor |
| Runs (first `startedAt` to last `finishedAt`) | Dev control 12:43:51.402Z–12:43:53.777Z; dev candidate 12:43:54.188Z–12:43:56.559Z; v2 control 12:43:56.838Z–12:43:59.267Z; v2 candidate 12:43:59.545Z–12:44:02.009Z. All on 2026-10-20 (20:43–20:44 +08:00) |
| Outputs | `.w2l/field-gold/runs/2026-10-20-json-verify-paired-2ffd7f25-d094e319/{dev,reserved}/{control,candidate}/` (not committed) |

```sh
R=~/Code/w2l/.w2l/field-gold/runs/2026-10-20-json-verify-paired-2ffd7f25-d094e319
python research/accuracy/json_plans.py ~/Code/w2l/.w2l/field-gold/2026-10-17 ~/Code/w2l/.w2l/field-gold/reserved-v2   # wrote the two plans
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/2026-10-17 $R/dev control   --plan=research/accuracy/dev-plan-json.v1.json --engine=<checkout of 2ffd7f25>
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/2026-10-17 $R/dev candidate --plan=research/accuracy/dev-plan-json.v1.json --engine=<checkout of d094e319>
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/reserved-v2 $R/reserved control   --plan=research/accuracy/reserved-plan-json.v2.json --engine=<checkout of 2ffd7f25>
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/reserved-v2 $R/reserved candidate --plan=research/accuracy/reserved-plan-json.v2.json --engine=<checkout of d094e319>
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py ~/Code/w2l/.w2l/field-gold/2026-10-17 $R/dev --mapping json \
  --fixture-origin http://127.0.0.1:8862 --versions control,candidate --cases D01,…,D10,H01,…,H08 --out $R/dev/field-results.json --markdown $R/dev/fields.md
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py ~/Code/w2l/.w2l/field-gold/reserved-v2 $R/reserved --mapping json \
  --fixture-origin http://127.0.0.1:8863 --versions control,candidate --cases V01,…,V42 --out $R/reserved/field-results.json --markdown $R/reserved/fields.md
```

Before the run, every one of the 60 requests was checked with each commit's own `parseScrapeRequest`, and all were valid on both.

## Review before the run

A subagent with a clean context reviewed `78f323f7` without running anything. Two of its findings were fixed in `556d6a10` before any run:

- A percent typed as a number could never match the visible signed percent the task asks for, so percentages now stay text.
- A value whose source states a date (a close, a price) had no date in the mapping. It now takes the date of its own object's date field.

Two further findings are properties of the request, so they are reported here rather than worked around:

- **Records are never filled.** Without a model or a `list` format with an `itemSelector`, the deterministic json path does not fill arrays (`packages/api/src/structured.ts`, `mapSchema`). The `records` of 34 cases (D02–D10, H02–H06, V15–V32, V34, V35) therefore stay unfilled on both commits, and their verify fails. An `itemSelector` is a CSS selector for one page; it cannot be derived from the task text.
- **Some task names miss the product-fact keys.** The product-fact path matches the lowercased property name exactly, so the task's names `product_id`, `product_code` and `product_number` (V08, V10, V13) do not reach it, while `name`, `price`, `currency`, `availability` and `sku` do.

Units other than a currency, and periods, are not in this output, so those context checks cannot pass for the json mapping (`json_map.py`).

**After the run**, one change was made, and no request, mapping or scoring rule changed:

- The plan files carried a `recordEntities` list copied from the gold entity ids, and some dev-set ids are label values (SKUs, ebook ids, row dates). The runner never sent that list and `json_map.py` never read it: the mapping recomputes the grouping from the frozen task definition.
- It was replaced with a record count. The regenerated plans have byte-identical requests and the same scope fields; checked by comparing each case's `request`, `url` and record count.
- The two pre-run commits on this branch, `78f323f7` and `556d6a10`, still contain the list.

## Results

### Development and regression sets (18 cases)

| Group | Side | Cases | Accepted | Required fully correct | Observed | Subject | Relation | Unit kept | Date kept | Period kept | Verify passed | Outcomes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| development (D) | control | 10 | 0 | 0/86 | 0/150 | 8/96 | 0/96 | 0/26 | 0/38 | 0/12 | 0 | correct_non_success 4, missed 6 |
| development (D) | candidate | 10 | 0 | 0/86 | 0/150 | 8/96 | 0/96 | 0/26 | 0/38 | 0/12 | 0 | correct_non_success 4, missed 6 |
| regression (H) | control | 8 | 0 | 0/75 | 2/77 | 23/77 | 1/77 | 0/6 | 0/68 | 0/12 | 0 | missed 8 |
| regression (H) | candidate | 8 | 0 | 0/75 | 2/77 | 23/77 | 1/77 | 0/6 | 0/68 | 0/12 | 0 | missed 8 |
| **all** | control | 18 | 0 | 0/161 | 2/227 | 31/173 | 1/173 | 0/32 | 0/106 | 0/24 | 0 | correct_non_success 4, missed 14 |
| **all** | candidate | 18 | 0 | 0/161 | 2/227 | 31/173 | 1/173 | 0/32 | 0/106 | 0/24 | 0 | correct_non_success 4, missed 14 |

- control: false success among success results 0/0 (upper 95% n/a); per request 0/18 (upper 95% 15.3%)
- candidate: false success among success results 0/0 (upper 95% n/a); per request 0/18 (upper 95% 15.3%)

### Reserved set v2 (42 cases)

| Group | Side | Cases | Accepted | Required fully correct | Observed | Subject | Relation | Unit kept | Date kept | Period kept | Verify passed | Outcomes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| article | control | 7 | 0 | 4/23 | 6/23 | 20/23 | 4/23 | 0/0 | 0/8 | 0/0 | 0 | missed 7 |
| article | candidate | 7 | 0 | 4/23 | 6/23 | 20/23 | 4/23 | 0/0 | 0/8 | 0/0 | 0 | missed 7 |
| product | control | 7 | 1 | 14/27 | 17/27 | 27/27 | 15/27 | 7/8 | 0/2 | 0/0 | 1 | correct_success 1, missed 6 |
| product | candidate | 7 | 1 | 14/27 | 16/27 | 27/27 | 14/27 | 7/8 | 0/2 | 0/0 | 1 | correct_success 1, missed 6 |
| list | control | 7 | 0 | 0/78 | 0/78 | 0/78 | 0/78 | 0/0 | 0/18 | 0/0 | 0 | missed 7 |
| list | candidate | 7 | 0 | 0/78 | 0/78 | 0/78 | 0/78 | 0/0 | 0/18 | 0/0 | 0 | missed 7 |
| table | control | 7 | 0 | 0/75 | 0/75 | 0/75 | 0/75 | 0/9 | 0/33 | 0/3 | 0 | missed 7 |
| table | candidate | 7 | 0 | 0/75 | 0/75 | 0/75 | 0/75 | 0/9 | 0/33 | 0/3 | 0 | missed 7 |
| dynamic | control | 7 | 0 | 0/55 | 0/56 | 4/55 | 0/55 | 0/15 | 0/25 | 0/3 | 0 | missed 7 |
| dynamic | candidate | 7 | 0 | 0/55 | 0/56 | 4/55 | 0/55 | 0/15 | 0/25 | 0/3 | 0 | missed 7 |
| document metadata | control | 7 | 0 | 11/36 | 13/36 | 36/36 | 11/36 | 0/0 | 1/7 | 0/0 | 0 | missed 7 |
| document metadata | candidate | 7 | 0 | 11/36 | 13/36 | 36/36 | 11/36 | 0/0 | 1/7 | 0/0 | 0 | missed 7 |
| **all** | control | 42 | 1 | 29/294 | 36/295 | 87/294 | 30/294 | 7/32 | 1/93 | 0/6 | 1 | correct_success 1, missed 41 |
| **all** | candidate | 42 | 1 | 29/294 | 35/295 | 87/294 | 29/294 | 7/32 | 1/93 | 0/6 | 1 | correct_success 1, missed 41 |

- control: false success among success results 0/1 (upper 95% 95.0%); per request 0/42 (upper 95% 6.9%)
- candidate: false success among success results 0/1 (upper 95% 95.0%); per request 0/42 (upper 95% 6.9%)

"Observed" counts slots with any delivered value. "Subject" is true for every field of an object that exists, including a single-subject object whose values are missing. The scorer counts a context check only where the source states that context.

### Fields that changed

Over all 522 field slots (227 in the dev sets, 295 in v2), exactly one field differs between the two commits:

| Case | Field | Control `2ffd7f25` | Candidate `d094e319` | Direction |
| --- | --- | --- | --- | --- |
| V12 (product) | `price` (required) | value matches, unit wrong: the first JSON-LD offer's price, with that offer's currency (not the task's), and `currency` filled from the same offer | price and currency left out with `field_ambiguous` (the page's offers state different prices and currencies) | worse: value, relation and source-locatable checks; not fully correct on either side |

Likely cause, **not isolated**: D1–D5 (#628) leave a product field out with `field_ambiguous` when its declared sources disagree. GOG declares one offer per currency, and the control's price matched only because that offer's amount equals the USD price. No other field, outcome, verify result or json status differs.

## Judgement

- **On the measures the exit condition names, the candidate is not lower.** Required fields fully correct, tasks accepted, outcomes, verify results and false success are equal on both sets:
  - development and regression sets: 0/161 required fields fully correct on both commits;
  - reserved set v2: 29/294 on both commits.
- **On four field counts it is one lower, all from V12 `price`** (above, not isolated). On reserved v2:
  - observed values: 36 → 35;
  - value correct: 30 → 29;
  - source-locatable: 30 → 29;
  - field relation: 30 → 29. Whether that single field counts against "not lower" is a decision for Howard.
- **False success is 0 on both sides.** The json/verify contract fails almost every case: verify passed on V09 only, on both commits. So:
  - per request: 0/18 on the dev sets (one-sided 95% upper bound 15.3%) and 0/42 on v2 (6.9%);
  - among success results: 0/0 and 0/1.

  #639's Markdown-only request had 18/42 false successes on v2 for both commits. The contract turns them into misses: it does not make the fields correct.
- **What this run measures and what it does not.**
  - It does reach D on product pages: V12's ambiguity, and the product facts behind V08–V14's name, price and currency.
  - It does not reach F2, because no model is configured.
  - F3a/F3b's same-capture candidates run when a contract fails with readiness `not_extracted`. Their output did not change any scored value here, because the json extraction does not read those candidates.
  - Most of the 0 and low scores come from the request: arrays left unfilled, and task field names the deterministic path does not know. Those parts are equal on both sides by construction and say nothing about the difference between the commits.

## Decision (Howard, 2026-10-20)

Added after the run; the results above are unchanged.

1. **V12 `price` is an acceptable abstention, not a regression.** The control's answer had a value that matched only by coincidence, with the wrong currency. The candidate abstains with `field_ambiguous` on conflicting offers, which is what D is for.
2. **The Phase 2 exit condition is met (2026-10-20, Howard's ruling on V12).** On the json/verify request, the candidate is not lower than the control.
3. **The D/F gains are not proven.**
   - No extraction model is configured here, so F2 was not measured.
   - The deterministic json path does not fill arrays, so list records need an `itemSelector` or a model.
   - Both measurements move to K1, where the comparison against competitors gets a model configuration (the same on both arms) and `itemSelector`s for the list and table tasks.

## Per-field marks

The scorer's `fields.md` for each set is kept in the run directory under `.w2l/`. Every per-field mark is identical between the two sides, except V12 `price` above.
