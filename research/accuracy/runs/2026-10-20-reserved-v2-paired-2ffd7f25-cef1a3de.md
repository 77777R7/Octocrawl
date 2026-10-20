# Reserved set v2, same-day pair: main `2ffd7f25` against main `cef1a3de` (PA R2, Phase 2)

**Date:** 2026-10-20. **What:** the reserved-set run the Phase 2 exit condition asks for (`docs/pa-enhancement-tasks.md`, Phase 2: "保留集 v2 的同日配对运行记录在案"; `reserved.v2.json` `acceptance.rule`). This is the first time any candidate saw V01–V42. It is the extraction comparison on the frozen captures (retained bytes replayed through each commit); the live-access run of the same set belongs to K1 and is not part of this record.

## Conditions

| Item | Value |
| --- | --- |
| Control | `main` `2ffd7f2536d84184f0d1caf24cdd724b81ed7dad` (the task list's baseline, before Phase 1), extractor `extract-tf/30`, `VERIFIER_VERSION` `verify/9` |
| Candidate | `main` `cef1a3de56771a62b65bb7176370b37ad40c8972` (#637, all of Phase 1 and 2 merged), extractor `extract-tf/31`, `VERIFIER_VERSION` `verify/9` |
| Verifier in the run | Not invoked: no `verify` is sent, so every response has `verification.status` `not_requested` and the Evidence Record's verifier is `null` |
| Built with | Each commit in its own detached checkout: `npm ci`, `npx tsc --build`; Node v26.8.1 |
| Driver, plan, mappings, scorer | One driver for both sides, from this branch at `23bd62aa` (committed and pushed 2026-10-20 19:56:47 +08:00, before either run): `run_dev.mjs --engine`, `reserved-plan.v2.json`, `reserved_map.py`, `holdout_score.py` |
| Dataset | `.w2l/field-gold/reserved-v2/` (git-ignored); the runner checked `seal.json` (sha256 `1588c8d3…`, as in `reserved.v2.json`) and every sealed file's hash before running |
| Request | `dev-plan.v1.json`'s request, unchanged: formats markdown, tables, links; `onlyMainContent`, `fastMode` (HTTP channel only), `maxAge: 0`, `storeInCache: false`, timeout 30 s; no `json` format, no `verify` |
| Network | Direct, loopback only: each retained source served alone at `http://127.0.0.1:8863`, proxy variables removed by the runner. No request left the machine |
| Grant, browser, model, vendors | None. Cost $0 |
| Control run | 2026-10-20T11:56:58.543Z – 11:57:00.816Z (19:56:58–19:57:00 +08:00), first `startedAt` to last `finishedAt` of its 42 outputs |
| Candidate run | 2026-10-20T11:57:01.215Z – 11:57:03.626Z (19:57:01–19:57:03 +08:00); same UTC and local day as the control |
| Outputs | `.w2l/field-gold/runs/2026-10-20-reserved-v2-paired-2ffd7f25-cef1a3de/{control,candidate}/` (not committed) |

```sh
# each checkout: git worktree add --detach <dir> <commit>; npm ci; npx tsc --build
OUT=~/Code/w2l/.w2l/field-gold/runs/2026-10-20-reserved-v2-paired-2ffd7f25-cef1a3de
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/reserved-v2 $OUT control \
  --plan=research/accuracy/reserved-plan.v2.json --engine=<checkout of 2ffd7f25>
node research/accuracy/run_dev.mjs ~/Code/w2l/.w2l/field-gold/reserved-v2 $OUT candidate \
  --plan=research/accuracy/reserved-plan.v2.json --engine=<checkout of cef1a3de>
~/Code/w2l/.w2l/pyenv/bin/python research/accuracy/holdout_score.py ~/Code/w2l/.w2l/field-gold/reserved-v2 $OUT \
  --fixture-origin http://127.0.0.1:8863 --versions control,candidate \
  --cases V01,V02,…,V42 --out $OUT/field-results.json --markdown $OUT/fields.md
```

## Before the run

`reserved.v2.json` said the output-to-field mappings did not exist yet and had to be committed before the first run. They were written in this branch from the task text, the labels the pages print and record order, without any candidate output on these URLs and without gold values in the code. A clean-context review (a subagent that ran no Octocrawl code on the sources) found nine rule bugs (for example V15 taking the list's own link as record 1, V31 cutting titles at a date inside the title, V42 missing italic journal names); all were fixed and given synthetic controls in `test_reserved_map.py` before `23bd62aa` was committed. No mapping, selector, gold or request changed after the run.

Accepted mapping limits, known before the run: values that the page states only in attributes, JSON-LD or script data (V12 price, V14 prices, V30 incident data, V31 start times) cannot reach this request's output; a day without a year (V35 "Tuesday 20 Oct.") is not made into a date; `$` alone is not a currency; V11's name sits in a `role="heading"` div that the Markdown does not make a heading.

## Result

Every one of the 295 field slots and all 42 case outcomes are the same on both sides. Comparing the 84 raw responses key by key, the only differences other than timings, fetch times, scrape ids and the run commit are `extractor.version` (`extract-tf/30` → `extract-tf/31`), `document.confidence` on V12 (0.6 → 0.11) and V14 (0.6 → 0.15), and, following V12's lower confidence, a `low_content_yield` warning with an agent hint on the candidate's V12; Markdown, tables, links, metadata, status and readiness are equal.

| Measure | Control `2ffd7f25` | Candidate `cef1a3de` |
| --- | --- | --- |
| Tasks accepted (every required field fully correct, no duplicate, nothing fabricated) | 23/42 | 23/42 |
| Required fields fully correct | 229/294 | 229/294 |
| Wrong record / unbound value present / fabricated / duplicate records | 0 / 9 / 0 / 0 | 0 / 9 / 0 / 0 |
| Outcomes | 23 correct success, 18 false success (all `field_error`), 1 missed | same |
| False success among success results | 18/41 = 43.9%, one-sided 95% upper 57.9% | same |
| False success per request | 18/42 = 42.9%, one-sided 95% upper 56.7% | same |

N = 42 requests. Zero false successes would have bounded the rate at 1−0.05^(1/42) = 6.9%; with 18 the Clopper–Pearson bounds above apply. A false success here means the API answered `success` (no verify was sent) while at least one required field was not fully correct in the scored output; it says nothing about access.

By stratum (identical on both sides; slot counts are captured fields, required fully correct counts required captured fields):

| Stratum | Cases | Tasks accepted | Required fully correct | Subject matched | Relation | Unit kept | Date kept | Period kept | Unbound value present |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| article | 7 | 4 | 18/23 | 20/23 | 18/23 | 0/0 | 6/8 | 0/0 | 0 |
| product | 7 | 0 | 16/27 | 27/27 | 18/27 | 2/8 | 1/2 | 0/0 | 2 |
| list | 7 | 6 | 72/78 | 78/78 | 72/78 | 0/0 | 15/18 | 0/0 | 0 |
| table | 7 | 6 | 66/75 | 66/75 | 66/75 | 9/9 | 30/33 | 3/3 | 0 |
| dynamic | 7 | 3 | 25/55 | 49/55 | 34/55 | 9/15 | 8/25 | 3/3 | 5 |
| document metadata | 7 | 4 | 32/36 | 36/36 | 32/36 | 0/0 | 7/7 | 0/0 | 2 |
| **all** | 42 | 23 | 229/294 | 276/294 | 240/294 | 20/32 | 67/93 | 6/6 | 9 |

"Unit kept", "Date kept" and "Period kept" count fields whose unit, business date or period the page states and the output delivered with the right value; the denominators are the fields where the source states that context.

### Tasks not accepted (both sides)

Fields named `rN/field` with N the record in label order; the bracket lists the checks that failed.

| Case | Stratum | Status | Outcome | Required fields not fully correct |
| --- | --- | --- | --- | --- |
| V03 | article | `success` | false_success | `r1/updated` (value, date, relation) |
| V04 | article | `success` | false_success | `r1/author` (value, relation) |
| V07 | article | `blocked` | missed | `r1/title` (value, subject, relation); `r1/author` (value, subject, relation); `r1/published` (value, subject, date, relation) |
| V08 | product | `success` | false_success | `r1/price` (unit) |
| V09 | product | `success` | false_success | `r1/price` (unit); `r1/availability` (value, relation) |
| V10 | product | `success` | false_success | `r1/tax_basis` (value, relation) |
| V11 | product | `success` | false_success | `r1/name` (value, relation); `r1/price` (value, unit, relation) |
| V12 | product | `success` | false_success | `r1/price` (value, unit, relation); `r1/release_date` (value, date, relation) |
| V13 | product | `success` | false_success | `r1/tax_basis` (value, relation) |
| V14 | product | `success` | false_success | `r1/ebook_price` (value, unit, relation); `r1/ebook_list_price` (value, unit, relation) |
| V21 | list | `success` | false_success | `r1/author` (value, relation); `r1/published` (value, date, relation); `r2/author` (value, relation); `r2/published` (value, date, relation); `r3/author` (value, relation); `r3/published` (value, date, relation) |
| V26 | table | `success` | false_success | `r1/kind` (value, subject, relation); `r1/version` (value, subject, relation); `r1/released` (value, subject, date, relation); `r2/kind` (value, subject, relation); `r2/version` (value, subject, relation); `r2/released` (value, subject, date, relation); `r3/kind` (value, subject, relation); `r3/version` (value, subject, relation); `r3/released` (value, subject, date, relation) |
| V29 | dynamic | `success` | false_success | `r1/points` (date); `r1/submitted` (value, date, relation); `r2/points` (date); `r2/submitted` (value, date, relation); `r3/points` (date); `r3/submitted` (value, date, relation) |
| V30 | dynamic | `success` | false_success | `r1/name` (value, subject, relation); `r1/impact` (value, subject, relation); `r2/name` (value, subject, relation); `r2/impact` (value, subject, relation); `r3/name` (value, subject, relation); `r3/impact` (value, subject, relation) |
| V31 | dynamic | `success` | false_success | `r1/title` (value, relation); `r1/state` (value, relation); `r1/impact` (value, relation); `r1/started` (value, date, relation); `r2/title` (value, relation); `r2/state` (value, relation); `r3/title` (value, relation); `r3/state` (value, relation); `r3/started` (value, date, relation) |
| V35 | dynamic | `success` | false_success | `r1/date` (value, date, relation); `r1/max_temperature` (unit, date); `r1/min_temperature` (unit, date); `r2/date` (value, date, relation); `r2/max_temperature` (unit, date); `r2/min_temperature` (unit, date); `r3/date` (value, date, relation); `r3/max_temperature` (unit, date); `r3/min_temperature` (unit, date) |
| V36 | document metadata | `success` | false_success | `r1/first_creator` (value, relation); `r1/doi` (value, relation) |
| V37 | document metadata | `success` | false_success | `r1/first_author` (value, relation) |
| V38 | document metadata | `success` | false_success | `r1/std_alias` (value, relation) |

V07 came back `blocked` (`blockReason` `cloudflare_challenge`) on both commits although the retained bytes hold the article (its gold fields are captured from them), so it is counted as missed: a block classification on a served page. Not isolated.

## Judgement

- **Candidate not lower than the same-day control: yes.** Equal on every field, every case and every measure above; no field got better and none got worse.
- **No regressions to list.** On these 42 captures Phase 1 and 2 changed what this request delivers only in `document.confidence` for two product pages (and the warning that follows from it on V12).
- **What the run cannot show.** The request has no `json` format and no `verify`, so the Phase 2 changes to product facts (D), model candidates (F1/F2), same-capture candidates under a failing contract (F3a/F3b) and paid persistence (E) never reach the scored output; equality means they did not disturb Markdown, tables, links or metadata on these pages, not that they were measured. Which of the 65 required fields not fully correct (46 slots have no observed value; the rest have a wrong value, unit or date) fail because of the output and which because of the mapping is not separated (not isolated): the mappings are frozen, so this run cannot be used to tell them apart.
- The set is now opened for these two commits. Following the README's reserved-set protocol it can be kept as regression data; a later fresh acceptance claim needs new reserved tasks.

## Per-field marks

The scorer's `fields.md` for the candidate, without expected or observed values. The control's section is identical line for line (checked) apart from the version label.

✓ correct, ✗ wrong or missing, – unknown in the source (not scored), · not applicable. Fields are named rN/field, N the record in label order.

#### V01 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 4/4, all captured 4/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author_1` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author_2` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V02 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 3/3, all captured 3/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V03 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/4, all captured 3/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/updated` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/release_date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V04 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 2/3, all captured 2/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V05 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 3/3, all captured 3/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V06 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 3/3, all captured 3/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V07 (candidate): missed

status `blocked`, verification `not_requested`, same source ✓; required fully correct 0/3, all captured 0/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r1/author` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r1/published` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |

#### V08 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/4, all captured 3/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/product_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `r1/availability` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V09 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 2/4, all captured 2/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/sku` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✗ | – | · | ✗ |
| `r1/availability` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |

#### V10 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/4, all captured 3/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/product_code` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r1/tax_basis` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |

#### V11 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 1/3, all captured 1/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/price` | R | ✗ | ✓ | ✗ | ✗ | – | · | ✗ |
| `r1/release_date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V12 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 1/3, all captured 1/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✗ | ✓ | ✗ | ✗ | – | · | ✗ |
| `r1/release_date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

#### V13 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 4/5, all captured 4/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/product_number` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/price` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r1/tax_basis` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/availability` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V14 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 2/4, all captured 2/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/ebook_price` | R | ✗ | ✓ | ✗ | ✗ | – | · | ✗ |
| `r1/ebook_list_price` | R | ✗ | ✓ | ✗ | ✗ | – | · | ✗ |

#### V15 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/advisory_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/package` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/advisory_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/package` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/advisory_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/package` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V16 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/notice_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/notice_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/notice_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V17 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/posted_by` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/posted_by` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/posted_by` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V18 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/advisory_name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/advisory_name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/date` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/advisory_name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V19 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 9/9, all captured 9/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/arxiv_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/arxiv_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/arxiv_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V20 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/posted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V21 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 6/12, all captured 6/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/author` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/published` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/author` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r2/published` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/author` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/published` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

#### V22 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/cycle` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/released` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/latest_version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/cycle` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/released` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/latest_version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/cycle` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/released` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/latest_version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V23 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/status` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/end_of_life` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/status` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/end_of_life` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/status` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/end_of_life` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V24 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/country` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/population` | R | ✓ | ✓ | ✓ | – | – | ✓ | ✓ |
| `r1/yearly_change` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r1/land_area` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `r2/country` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/population` | R | ✓ | ✓ | ✓ | – | – | ✓ | ✓ |
| `r2/yearly_change` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r2/land_area` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |
| `r3/country` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/population` | R | ✓ | ✓ | ✓ | – | – | ✓ | ✓ |
| `r3/yearly_change` | R | ✓ | ✓ | ✓ | ✓ | – | · | ✓ |
| `r3/land_area` | R | ✓ | ✓ | ✓ | ✓ | · | · | ✓ |

#### V25 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 6/6, all captured 6/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |
| `r2/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |
| `r3/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |

#### V26 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/9, all captured 0/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/kind` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r1/version` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r1/released` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r2/kind` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r2/version` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r2/released` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |
| `r3/kind` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r3/version` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r3/released` | R | ✗ | ✗ | ✗ | · | ✗ | · | ✗ |

#### V27 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/initial_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/active_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/initial_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/active_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/branch` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/initial_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/active_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/security_support_until` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V28 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 12/12, all captured 12/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/current_minor` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/final_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/current_minor` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/final_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/current_minor` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/first_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r3/final_release` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V29 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 6/12, all captured 6/12; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/points` | R | ✓ | ✓ | ✓ | ✓ | ✗ | · | ✗ |
| `r1/submitted` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r2/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/points` | R | ✓ | ✓ | ✓ | ✓ | ✗ | · | ✗ |
| `r2/submitted` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r3/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/url` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/points` | R | ✓ | ✓ | ✓ | ✓ | ✗ | · | ✗ |
| `r3/submitted` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

#### V30 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/6, all captured 0/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r1/impact` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r2/name` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r2/impact` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r3/name` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |
| `r3/impact` | R | ✗ | ✗ | ✗ | · | · | · | ✗ |

#### V31 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/9, all captured 0/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/state` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/impact` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/started` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r2/title` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r2/state` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/title` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/state` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r3/started` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |

#### V32 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 10/10, all captured 10/10; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/last_update` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r2/period` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/temperature` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r2/short_description` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/period` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/temperature` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r3/short_description` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r4/period` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r4/temperature` | R | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `r4/short_description` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V33 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 3/3, all captured 3/3; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/name` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/latest_version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/released` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V34 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 6/6, all captured 6/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |
| `r2/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r2/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |
| `r3/currency` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r3/rate` | R | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ |

#### V35 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 0/9, all captured 0/9; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r1/max_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |
| `r1/min_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |
| `r2/date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r2/max_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |
| `r2/min_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |
| `r3/date` | R | ✗ | ✓ | ✗ | · | ✗ | · | ✗ |
| `r3/max_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |
| `r3/min_temperature` | R | ✓ | ✓ | ✓ | ✗ | ✗ | · | ✗ |

#### V36 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 3/5, all captured 3/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_creator` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/version` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/doi` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |

#### V37 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 5/6, all captured 5/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/number` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_author` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/status` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/type` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/created` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |

#### V38 (candidate): false_success (field_error)

status `success`, verification `not_requested`, same source ✓; required fully correct 5/6, all captured 5/6; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/rfc_number` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/std_alias` | R | ✗ | ✓ | ✗ | · | · | · | ✗ |
| `r1/status` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V39 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 4/4, all captured 4/4; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/edition_title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/work_title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V40 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 5/5, all captured 5/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/doi` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/osti_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V41 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 5/5, all captured 5/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/first_author` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/submitted` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/arxiv_id` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/primary_subject` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

#### V42 (candidate): correct_success

status `success`, verification `not_requested`, same source ✓; required fully correct 5/5, all captured 5/5; duplicates 0; required not captured 0, fabricated 0

| Field | Req | Value | Subject | Relation | Unit | Date | Period | Fully |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r1/title` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/journal` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/volume` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |
| `r1/published` | R | ✓ | ✓ | ✓ | · | ✓ | · | ✓ |
| `r1/doi` | R | ✓ | ✓ | ✓ | · | · | · | ✓ |

