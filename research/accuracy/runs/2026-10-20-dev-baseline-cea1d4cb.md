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

- **D01 Census** 3/5: the population cell carries two private-use icon-font characters (U+E840, U+E83F) before the number, so the delivered value does not parse as a number; the fact's mnemonic and its unit code exist only as attributes.
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

✓ correct, ✗ wrong or missing, – unknown in the source (not scored), · not applicable. Fields are named `rN/field`, N the record in label order; values and entity IDs are left out (they are labels and output), and `fields-with-values.md` in the output directory has them.

### D01 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/5, all captured 3/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/geography` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/measure` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/mnemonic` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `r1/population` | R | ✗ | ✓ | ✗ | ✗ | ✓ | · | ✗ |
| `r1/vintage` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### D02 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 6/12, all captured 6/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `r2/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r2/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `r3/sku` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |

### D03 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 2/18, all captured 2/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/departure_display` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `r1/departure_iso` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/carrier` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `r1/route` | R | ✗ | ✓ | ✗ | · | ✓ | · | ✗ |
| `r1/starting_price` | R | ✗ | ✓ | ✗ | ✗ | ✓ | · | ✗ |
| `r2/url` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r2/departure_display` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/departure_iso` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/carrier` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/route` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/starting_price` | R | ✗ | ✗ | ✗ | ✗ | ✗ | · | ✗ |
| `r3/url` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r3/departure_display` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/departure_iso` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/carrier` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/route` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/starting_price` | R | ✗ | ✗ | ✗ | ✗ | ✗ | · | ✗ |

### D04 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/18, all captured 0/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r1/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r1/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r1/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r1/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r1/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r2/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r2/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r2/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r2/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r2/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r3/date` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/close` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r3/volume` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r3/open` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r3/high` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |
| `r3/low` | R | ✗ | ✗ | ✗ | – | ✗ | · | ✗ |

### D05 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 9/15, all captured 9/15; duplicates 1; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r2/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r2/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r3/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/variation_id` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |

### D06 (main): false_success (no_target)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 2/3; duplicates 0; required not captured 21, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/no_rows_message` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/date_header` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r5/current_quote_price_not_history` | o | ✗ | ✗ | ✗ | ✗ | – | · | ✗ |

### D07 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 1/2; duplicates 0; required not captured 9, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/heading` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/boundary_instruction` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |

### D08 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 2/2; duplicates 0; required not captured 15, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/heading` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/boundary_instruction` | o | ✓ | ✓ | ✓ | · | · | · | ✓ |

### D09 (main): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 14/18, all captured 14/18; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r1/change_1h` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `r1/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r1/change_7d` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `r1/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r2/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r2/change_1h` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `r2/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r2/change_7d` | R | ✗ | ✓ | ✗ | ✓ | – | ✓ | ✗ |
| `r2/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r3/coin` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r3/change_1h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r3/change_24h` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r3/change_7d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| `r3/change_30d` | R | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |

### D10 (main): correct_non_success

status `failed`, verification `not_requested`, same source ✓; required fully correct 0/0, all captured 0/3; duplicates 0; required not captured 9, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/error_type` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/status_code` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/status_message` | o | ✗ | ✓ | ✗ | · | · | · | ✗ |

### H01 (main): missed

status `success`, verification `failed`, same source ✓; required fully correct 0/7, all captured 0/7; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/document_id` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `r1/title` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `r1/category` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/publication_month` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/author_1` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/author_2` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/author_3` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

### H02 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 15/15, all captured 15/15; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/ebook_id` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/author` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/download_count` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H03 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `r2/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `r3/quantity` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/symbol` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/value` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |

### H04 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r1/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r1/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r2/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r2/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r2/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r3/date` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r3/weekday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| `r3/holiday` | R | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |

### H05 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 12/12, all captured 13/13; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/page_updated` | o | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r5/prefix` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r5/symbol` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r5/decimal_factor` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H06 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 9/9, all captured 10/10; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/registry_updated` | o | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/code` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/description` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r4/reference` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

### H07 (main): false_success (field_error)

status `success`, verification `passed`, same source ✓; required fully correct 0/6, all captured 0/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | ✗ | · | ✗ |
| `r1/status` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/recommendation_date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/conformance_level_1` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/conformance_level_2` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/conformance_level_3` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

### H08 (main): correct_success

status `success`, verification `passed`, same source ✓; required fully correct 8/8, all captured 8/8; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/method` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/last_modified` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/parameter_callbackFn` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/parameter_element` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/parameter_index` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/parameter_array` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/parameter_thisArg` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/return_value` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

