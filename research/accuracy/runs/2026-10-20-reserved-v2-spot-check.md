# Reserved set v2: spot check and V31 correction (PA R2)

**Date:** 2026-10-20. **Set:** `research/accuracy/reserved.v2.json` (42 tasks, 295 field slots), annotated by Claude Code session pa-r-eval-sets from the retained source bytes in `.w2l/field-gold/reserved-v2/`. Decision 3 (2026-10-20): this session labels, Howard or one outside reviewer spot-checks 20%.

## Non-author spot check

| Item | Value |
| --- | --- |
| Reviewer | Howard |
| Date | 2026-10-20 |
| Sample | 62 fields: ceil(20%) of each stratum (article 5, product 6, list 16, table 15, dynamic 12, document metadata 8), seeded draw (seed 20261020), listed in `annotation.spotCheck.fields` |
| Result | **62 of 62 agreed**, 0 disagreed |

This is the only non-author check. The two items below are engineering checks by sessions in the same group; they are not counted as independent review.

## Engineering checks (not non-author review)

- **Mechanical check, 62/62 passed.** The PA coordinating session ran a script over the 62 sampled fields: source hash, byte and character offsets, evidence inside the subject's record span, value found in the source.
- **Independent subagent review:** 60 agree, 0 disagree, 2 uncertain (`V09/product/availability`, `V38/doc/published`). Both are spelling questions, not wrong values:
  - the page shows an availability label where the label is the schema.org URL;
  - a month is written as words where the scorer elsewhere uses `YYYY-MM`.

  They are handled in the scorer, not the labels: `holdout_score.py` now treats a schema.org ItemAvailability URL and its label as the same value, and a month-precision date in words or as `YYYY-MM` as the same value. Each rule has a failing-first control in `test_holdout_score.py`. Re-scoring the R1b run gives identical summaries.

## Correction outside the sample: V31

The same review found one real error outside the sample. In V31 (Cloudflare status history), the task asks for each entry's start time. The labels had taken the timestamp shown on each card instead; that is an update time (entry 1) or a completion time (entries 2 and 3). The page's embedded incident data, after the cards in `source.html`, carries the start times.

| Field | Before | After |
| --- | --- | --- |
| `V31/entry-1/started` | card timestamp (last update) | start time in the embedded incident data; same calendar date, so the value is unchanged and the evidence and relation changed |
| `V31/entry-2/started` | card timestamp (completion) | `unknown`, optional, with a reason: the page states no start time for this entry, and the title's date is not taken as one |
| `V31/entry-3/started` | card timestamp (completion) | scheduled start in the embedded maintenance data; one calendar day earlier |

`V31/entry-1/started` was in the sample. Howard agreed with its value, and the value did not change.

V31 now has 10 field slots, 9 captured. The set has 295 slots, 294 captured.

## Reseal

- Before the correction: plan `7d9b6919…`, seal `dccf0617…`.
- The correction and the spot-check result (`spotCheck.by`, `checkedAt`, `status` in every `gold.json`) went into a new seal. The new plan and seal hashes and the per-case annotation hashes are in `reserved.v2.json`; the old ones are kept under `corrections[0].before`.
- `audit_gold.py .w2l/field-gold/reserved-v2` passes on all 42 cases after the reseal.
- No candidate has run on the set before or after the correction (`candidateRuns` is empty).

## Note for later checks

Read `source.html` with `open(p, encoding='utf-8', newline='')` or decode the raw bytes. V08, V09, V14 and V40 use CRLF line endings, and Python's default newline translation shifts every character offset after the first line break.
