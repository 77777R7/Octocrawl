# Development-set baseline on `main` `cea1d4cb` (PA R1b)

**Date:** 2026-10-20 (run 03:42 UTC). **What:** the "before" value for D, D6 and F acceptance (`docs/pa-enhancement-tasks.md`, R1b). Ten development cases D01–D10 and eight regression cases H01–H08 from the field gold set (`research/accuracy/README.md`), each replayed once from its retained source bytes through the production engine, API and SDK, and scored field by field with `holdout_score.py`.

## Conditions

| Item | Value |
| --- | --- |
| Engine source | `main` `cea1d4cb` (#619). The run used branch `claude/pa-r1-dev-baseline` at `6bd643a9`, which adds only `research/accuracy/` files to `cea1d4cb`; `git diff cea1d4cb 6bd643a9 -- packages` is empty |
| Built with | `npm ci`, `npx tsc --build`; Node v26.8.1 |
| Dataset | `.w2l/field-gold/2026-10-17/` (git-ignored), seal SHA-256 `2aa8c018…9c33`, matching `field-gold-manifest.v1.json`; the runner checks every sealed file hash before the first request |
| Request | `dev-plan.v1.json`: formats markdown, tables, links; `onlyMainContent`, `fastMode`, `maxAge: 0`, no cache, 30 s timeout; HTTP channel only. H cases keep #562's identity check (`markdownIncludes`); D cases send no `verify` |
| Network | Loopback only: each case is served alone at `http://127.0.0.1:8862`, the runner deletes `HTTP(S)_PROXY`/`ALL_PROXY` and sets `NO_PROXY=127.0.0.1,localhost`. Neither proxied nor direct to any site: no request left the machine (19 fixture reads: 18 sources, one 404 for `/robots.txt`) |
| Grant, browser, model, vendors | None. Cost $0 |
| Scorer | `holdout_score.py` at `3f56e02a` (same scoring as `e4b671d5`; later commits changed only the Markdown report) |
| Outputs | `.w2l/field-gold/runs/2026-10-20-dev-baseline-cea1d4cb/` (raw SDK responses, `field-results.json`, `fields-with-values.md`; not committed) |

Commands, from the repository root:

```sh
node research/accuracy/run_dev.mjs .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-20-dev-baseline-cea1d4cb main
.w2l/pyenv/bin/python research/accuracy/holdout_score.py .w2l/field-gold/2026-10-17 .w2l/field-gold/runs/2026-10-20-dev-baseline-cea1d4cb \
  --fixture-origin http://127.0.0.1:8862 --versions main \
  --cases D01,D02,D03,D04,D05,D06,D07,D08,D09,D10,H01,H02,H03,H04,H05,H06,H07,H08 \
  --out .w2l/field-gold/runs/2026-10-20-dev-baseline-cea1d4cb/field-results.json \
  --markdown .w2l/field-gold/runs/2026-10-20-dev-baseline-cea1d4cb/fields.md
```

(The `.w2l/` paths were in the main checkout, `~/Code/w2l/.w2l/`, and the commands ran from the worktree with absolute paths.)

## Results

### Fields

"Fully correct" needs the value, the subject (entity), the relation (the value read from its own subject's record), every known unit, date and period, and the same source hash. A context the source leaves unknown is not scored. Fields the capture never had (`required not captured`) are outside the correctness denominators and are reported apart.

| Measure | Development D01–D10 | Regression H01–H08 |
| --- | --- | --- |
| Required fields fully correct | **34/86** (39.5%) | **62/75** (82.7%) |
| All captured fields fully correct (incl. optional) | 39/96 | 64/77 |
| Value correct (with subject) | 42/96 | 67/77 |
| Fields observed in the output | 50/96 | 67/77 |
| Subject matched | 65/96 | 77/77 |
| Relation correct | 42/96 | 67/77 |
| Unit kept, where the source states one | 18/26 | 6/6 |
| Date kept, where the source states one | 10/38 | 55/68 |
| Period kept, where the source states one | 12/12 | 12/12 |
| Value from another record of the same field (wrong record) | 0 | 0 |
| Right value present in the output but not bound to its subject | 7 | 0 |
| Required fields the capture never had | 54 | 0 |
| Values delivered for those (fabricated) | 0 | 0 |
| Duplicate selected records | 1 (D05) | 0 |

H01–H08 match #562's first acceptance run on 2026-10-17 (6/8 tasks, 62/75 required, 64/77 all), so `main` has not moved on the regression set since `15c689be`. The H mappings mark the subject by document identity, so "subject matched" is 77/77 there even for fields the output lacked.

### Tasks and false success

A success result is status `success` with verification not `failed`. A false success is a success result whose task is not accepted: `field_error` when the capture had the target records and some required field is wrong or missing, `no_target` when the capture had no target records (D06–D08, D10 are boundary pages) and the API still answered success.

| Measure | Development | Regression |
| --- | --- | --- |
| Requests (N) | 10 | 8 |
| Tasks accepted | 0/6 deliverable | 6/8 |
| Correct non-success on a boundary page | 3 (D07, D08, D10: `failed` / `empty_unverified`) | – |
| Missed (deliverable, not a success result) | 0 | 1 (H01: verification failed) |
| False successes | 7 (6 `field_error`, 1 `no_target`: D06) | 1 (H07, `field_error`) |
| Error among success results | 7/7 = 100%, upper 95% 100% | 1/7 = 14.3%, upper 95% 52.1% |
| False success per request | 7/10 = 70%, upper 95% 91.3% | 1/8 = 12.5%, upper 95% 47.1% |
| Upper 95% bound had there been zero false successes, 1−0.05^(1/N) | 25.9% | 31.2% |

Upper bounds are one-sided 95%: 1−0.05^(1/N) at zero, Clopper–Pearson otherwise. With N this small they say little; they are here so later runs are reported the same way.

### What fails, by case (development)

- **D01 Census** 3/5: the population cell carries two private-use icon-font characters (U+E840, U+E83F) before `341,784,857`, so the delivered value does not parse as the number; the mnemonic `PST045225` and unit `ABS` exist only as attributes.
- **D02 Newegg** 6/12: names and URLs right; SKUs exist only as attributes; prices right but the page's explicit `USD` is not delivered (`$` alone is not a currency).
- **D03 Skyscanner** 2/18: the deal cards are not in the delivered Markdown; only the "Cheapest flight found" summary row links the first offer.
- **D04 Nasdaq** 0/18: the history table is a shadow-DOM component; the delivered tables have the right shape but every cell is empty.
- **D05 OTTO** 9/15: product IDs, URLs, prices and euro right; variation IDs absent; the first product appears twice. Each card's product link is delivered with the bare URL as its text (the anchor's `aria-label` is not used); the full name survives only as the image's alt text, which the mapping does not read as the name.
- **D06 Yahoo** `no_target`: the page has no history rows and says so; the API answered success. No rows were invented.
- **D07 AliExpress, D08 Temu, D10 Walmart**: `failed` (`empty_unverified`) with nothing invented; the D08 boundary text was kept, D07 kept one of two, D10 none of three.
- **D09 CoinGecko** 14/18: four negative percentage changes lost their sign (the D6 "signed percentage" item); prices, periods and USD right.

Regression: H01 failed its identity check (the RFC header is not in the output, as on 2026-10-17); H07's WCAG title, status and dates are missing.

## Scorer changes made after reading this run's outputs

The D01–D10 mappings were committed (`f85021f8`) before the run. Reading the outputs found three scorer defects, fixed in `3769b6cd` and `e4b671d5`, each with a control; the outputs were not re-run.

| Change | Effect |
| --- | --- |
| D06's date-header mapping referred to an undefined name and crashed | Scoring could not finish before the fix |
| Fully correct required unknown contexts to be true, against #562's protocol ("known unit/date/period"); H01–H08 have no unknown contexts | D required fully correct 20/86 → 34/86 (D05 +3, D09 +11); H unchanged |
| Newegg's "More options" link (same item, with a query) counted as a second record | D duplicates 2 → 1; D02 no longer a duplicate |

Both result files are kept in the output directory (`field-results.scorer-3769b6cd.json` and `field-results.json`).

## Limits

- Replays of saved bytes through the HTTP channel only. They measure extraction and delivery, not access, routing, freshness or browser rendering; D03 and D04 would need the browser to show the cards and table.
- The development set was used for tuning before #556; it is not an unbiased sample, and H01–H08 are no longer a holdout. Neither number is a product accuracy claim.
- Annotations are engineering labels checked against source bytes (`annotationStatus: engineering_source_checked`); non-author review is still pending.
- The mappings are this scorer's reading of the output; an output shape they do not anticipate counts as missing.

## Per-field correctness

✓ correct, ✗ wrong or missing, – unknown in the source (not scored), · not applicable. Values are left out (they are labels and output); `fields-with-values.md` in the output directory has them.

### D01 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/5, all captured 3/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `US/PST045225/geography` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `US/PST045225/measure` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `US/PST045225/mnemonic` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `US/PST045225/population` | R | ✗ | ✓ | ✗ | ✗ | ✓ | · | ✗ |
| `US/PST045225/vintage` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### D02 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 6/12, all captured 6/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `34-236-753/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `34-236-753/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `34-236-753/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `34-236-753/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `1TS-000D-1TE80/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `1TS-000D-1TE80/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1TS-000D-1TE80/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1TS-000D-1TE80/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `1TS-000A-15W75/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `1TS-000A-15W75/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1TS-000A-15W75/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1TS-000A-15W75/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |

### D03 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 2/18, all captured 2/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `offer-1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `offer-1/departure_display` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `offer-1/departure_iso` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `offer-1/carrier` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `offer-1/route` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `offer-1/starting_price` | R | ✗ | ✓ | ✗ | ✗ | ✓ | · | ✗ |
| `offer-2/url` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `offer-2/departure_display` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-2/departure_iso` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-2/carrier` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-2/route` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-2/starting_price` | R | ✗ | ✗ | ✗ | ✗ | ✗ | · | ✗ |
| `offer-3/url` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `offer-3/departure_display` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-3/departure_iso` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-3/carrier` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-3/route` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `offer-3/starting_price` | R | ✗ | ✗ | ✗ | ✗ | ✗ | · | ✗ |

### D04 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/18, all captured 0/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AAPL/10/15/2026/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `AAPL/10/15/2026/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/15/2026/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/15/2026/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/15/2026/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/15/2026/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/14/2026/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `AAPL/10/14/2026/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/14/2026/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/14/2026/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/14/2026/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/14/2026/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/13/2026/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `AAPL/10/13/2026/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/13/2026/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/13/2026/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/13/2026/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `AAPL/10/13/2026/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |

### D05 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 9/15, all captured 9/15; duplicates 1; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1996119966/1996119866/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1996119966/1996119866/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `1996119966/1996119866/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `1996119966/1996119866/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `1996119966/1996119866/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `2085076160/2085076237/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `2085076160/2085076237/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `2085076160/2085076237/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `2085076160/2085076237/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `2085076160/2085076237/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `2035349268/2035349269/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `2035349268/2035349269/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `2035349268/2035349269/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `2035349268/2035349269/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `2035349268/2035349269/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |

### D06 (main): false_success (no_target)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 2/3; duplicates 0; required not captured 21, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `historical_table_boundary/no_rows_message` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `historical_table_boundary/date_header` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `non_target_current_quote/current_quote_price_not_history` | o | ✗ | ✗ | ✗ | ✗ | – | · | ✗ |

### D07 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 1/2; duplicates 0; required not captured 9, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `boundary/heading` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `boundary/boundary_instruction` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |

### D08 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 2/2; duplicates 0; required not captured 15, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `boundary/heading` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `boundary/boundary_instruction` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |

### D09 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 14/18, all captured 14/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `coin-1/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `coin-1/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `coin-1/change_1h` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `coin-1/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-1/change_7d` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `coin-1/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-2/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `coin-2/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `coin-2/change_1h` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `coin-2/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-2/change_7d` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `coin-2/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-3/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `coin-3/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `coin-3/change_1h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-3/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-3/change_7d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `coin-3/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |

### D10 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 0/3; duplicates 0; required not captured 9, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `source_error/error_type` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `source_error/status_code` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `source_error/status_message` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |

### H01 (main): missed

status `success`, verification `failed`, same source ✓; required fully correct 0/7, all captured 0/7; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RFC9110/document_id` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `RFC9110/title` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `RFC9110/category` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `RFC9110/publication_month` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `RFC9110/author_1` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `RFC9110/author_2` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `RFC9110/author_3` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

### H02 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 15/15, all captured 15/15; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ebook-1342/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-1342/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-1342/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-1342/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ebook-1342/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-84/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-84/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-84/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-84/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ebook-84/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-2701/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-2701/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-2701/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ebook-2701/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ebook-2701/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H03 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `day/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `day/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `day/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `Julian_year/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `Julian_year/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `Julian_year/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `Julian_century/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `Julian_century/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `Julian_century/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |

### H04 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `england-wales/1 January/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/1 January/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/1 January/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/26 March/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/26 March/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/26 March/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/29 March/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/29 March/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `england-wales/29 March/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |

### H05 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 12/12, all captured 13/13; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `page/page_updated` | o | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quetta/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quetta/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quetta/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronna/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronna/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronna/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronto/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronto/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `ronto/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quecto/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quecto/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `quecto/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H06 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 10/10; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `registry/registry_updated` | o | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-200/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-200/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-200/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-404/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-404/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-404/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-429/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-429/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `http-status-429/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H07 (main): false_success (field_error)

status `success`, verification `passed`, same source ✓; required fully correct 0/6, all captured 0/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `WCAG2.2/title` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `WCAG2.2/status` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `WCAG2.2/recommendation_date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `WCAG2.2/conformance_level_1` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `WCAG2.2/conformance_level_2` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `WCAG2.2/conformance_level_3` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

### H08 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 8/8, all captured 8/8; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Array.prototype.map()/method` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/last_modified` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/parameter_callbackFn` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/parameter_element` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/parameter_index` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/parameter_array` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/parameter_thisArg` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `Array.prototype.map()/return_value` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

