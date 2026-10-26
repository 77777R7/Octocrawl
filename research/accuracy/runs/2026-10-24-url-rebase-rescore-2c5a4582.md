# Frozen json runs re-scored after the json mapping's url rebase, scorer `2c5a4582`

**Date:** 2026-10-24. **What:** the json mapping (`json_map.py`) did not rebase a url value served from a frozen replay's fixture origin, so every url a replay answered as `http://127.0.0.1:8863/…` (reserved v2) or `http://127.0.0.1:8862/…` (D and H) scored wrong. The Markdown mappings always rebased (`holdout_score.rebase_url`). This record re-scores the frozen json runs that earlier records cite, with the scorer before and after the fix, on the saved outputs. No engine, model, Firecrawl or live fetch ran. The earlier records stay as written; this record supersedes their url counts.

## The defect and the fix

- Reproduced first: `test_reserved_map.py` `test_json_mapping_rebases_fixture_origin_urls` failed on `main` `1db65530` (observed `http://127.0.0.1:8863/news/1/` against `https://example.org/news/1/`) and passes on `2c5a4582`.
- The fix: a `url`-typed field whose value starts with the fixture origin is rebased onto the case's own origin, as the Markdown mappings do. Any other value is left exactly as delivered. A live run passes `--fixture-origin http://127.0.0.1:1`, which no live answer carries, so live scores do not change: re-scoring #701's live outputs with `2c5a4582` gives `field-results-json.json` and `field-results-md.json` rows identical to #701's.
- Only fields typed `url` are affected: V15–V18, V20, V21 and V29 (three each) in reserved v2, and D02, D03, D05, D07, D08, D10 and H02 in the D/H sets.

## Conditions

| Item | Value |
| --- | --- |
| Scorer before | `research/accuracy/` at `main` `1db65530` (`git archive`), unchanged since #700 |
| Scorer after | `research/accuracy/` at `2c5a4582` (this PR) |
| Outputs | The saved outputs of each run below, as the records name them; not re-run |
| Re-score outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-url-rebase-rescore-2c5a4582/` (`runs.txt`, `<run>_<dir>.{before,after}.json`, `summary.txt`). Not committed |
| Check | "Before" reproduces the cited records: for example #700's v2-list control and candidate at 125 and 152 of 294 |

```sh
G=~/Code/w2l/.w2l/field-gold; OUT=$G/runs/2026-10-24-url-rebase-rescore-2c5a4582; P=~/Code/w2l/.w2l/pyenv/bin/python
# for each line "<run> <dir> <versions>" of $OUT/runs.txt, with D/H: $G/2026-10-17, :8862, D01–D10,H01–H08; V: $G/reserved-v2, :8863, V01–V42
$P <scorer>/holdout_score.py <dataset> $G/runs/<run>/<dir> --mapping json --fixture-origin <origin> --versions <versions> --cases <cases> \
  --out $OUT/<run>_<dir>.<before|after>.json
```

## What changes

Required fields fully correct (frozen rule, same source kept), accepted cases and false successes, before → after.

| Run (record) | Directory, version | Required correct | Accepted | False success | Cases that change |
| --- | --- | --- | --- | --- | --- |
| K1 window 1 frozen (`2026-10-21-k1-w1-frozen-2ffd7f25-7ba113c9.md`) | v2-list control, candidate | 120 → 132 | 2 → 4 | 4 → 2 | V16, V17 +3; V20, V21 +3, false success → correct success |
| | dev-list control, candidate | 27 → 33 of 161 | 0 → 0 | 0 → 0 | D03, D05 +3; H02's three urls now correct, still not fully correct (date) |
| F2 Claude frozen (`2026-10-23-f2-claude-v2-frozen-057c68fa.md`) | off | 120 → 132 | 2 → 4 | 4 → 2 | as K1 v2-list |
| | haiku | 164 → 176 | 12 → 14 | 9 → 7 | as K1 v2-list |
| | sonnet | 163 → 175 | 12 → 14 | 9 → 7 | as K1 v2-list |
| Title and availability (`2026-10-23-f2-title-availability-frozen-328b981f.md`) | v2-list control | 120 → 132 | 2 → 4 | 4 → 2 | as K1 v2-list |
| | v2-list title | 124 → 136 | 2 → 4 | 4 → 2 | as K1 v2-list |
| | v2-list candidate | 125 → 137 | 2 → 4 | 4 → 2 | as K1 v2-list |
| | v2-list haiku-057c68fa | 164 → 176 | 12 → 14 | 9 → 7 | as K1 v2-list |
| | v2-list haiku-8cd34d30 | 169 → 181 | 17 → 19 | 4 → 2 | as K1 v2-list |
| | dev-list control, title, candidate | 27 → 33 of 161 | 0 → 0 | 0 → 0 | as K1 dev-list |
| List columns, #700 (`2026-10-24-f2-list-loss-v2-90bef962.md`) | v2-list control | 125 → 137 | 2 → 4 | 4 → 2 | as K1 v2-list |
| | v2-list candidate | **152 → 164** | **5 → 7** | **4 → 2** | as K1 v2-list |
| | dev-list control, candidate | 27 → 33 of 161 | 0 → 0 | 0 → 0 | as K1 dev-list |

Of 294 in reserved v2 and 161 in D/H. Every case stays in every denominator.

**No change** in the other cited directories, because none of their json answers carries a url that starts with the fixture origin: the json/verify pair (`2026-10-20-json-verify-paired-2ffd7f25-d094e319.md`, dev and reserved), the D6 OTTO pair (`…-5beacbf3-878c2d81`), the three D6 pairs of 2026-10-22 (leads `1ec2b158`, aggregate `42fce5cb`, split `5a0910b4`), and every `dev-json` and `v2-json` directory above.

A wider scan, with a scratch script outside the repository, of all 171 output directories under `runs/` with json answers (live runs excluded) found the same pattern and nothing else: required counts change only on V16, V17, V20, V21, D03 and D05, by their three url fields, wherever an answer delivered those records (H02's three urls become correct values but stay not fully correct).

## What it means for the false successes

- **On the frozen captures, V20 and V21 were false successes only because of this scoring defect.** With the urls rebased, both are correct successes in every arm of every list run above. Octocrawl's remaining frozen false successes on #700's candidate are 2, not 4: V25 and V34.
- The live false successes are not affected: a live answer's urls were always scored as delivered. Their causes are in [2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md](2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md).
- The records named above keep their numbers as written. Where a later record compares with them, it should use the counts here.
