# The json mapping reads #704's unit and date from `json.evidence`: frozen and live outputs re-scored, scorer `3b1bde6a`

**Date:** 2026-10-24. **What:** since #704 (`main` `09b3ca0f`, `extract-tf/45`), a number read from a selected table row carries the unit and as-of day its table states, in `json.evidence[<path>].context.unit` / `.date`, with `contextEvidence` locators. `json.data` is unchanged. Howard asked on 2026-10-24 that the R3 json mapping read them. This record re-scores saved outputs with that mapping. No engine, model, Firecrawl or live fetch ran. Earlier records stay as written.

## The mapping change

- `json_map.py` takes a field's unit from `context.unit` and its date from `context.date` of the `json.evidence` entry whose `path` is the field's pointer, when present and a string. Its existing fallbacks come after: a `*price*` field's unit from `json.data.currency`, and a date from a sibling date field.
- It reads only what the evidence states. With no context it infers nothing: the controls check that a record without context keeps unit and date `None`.
- `context.currency`, the mark of the number's own text (`$`, `€`, from D3b), is **not** read. It would replace a declared currency (`USD` in `json.data.currency`) with a symbol; a control checks that it does not.
- Failing first: `test_json_mapping_takes_unit_and_date_from_the_evidence_context` in `test_reserved_map.py` failed on `3b92cb09` (this branch with `main` merged) and passes on `51727d5c`.
- **Cause labels** (`live_rescore.py`, `3b1bde6a`): `schema_scope` no longer applies to a unit or date that the answer states anyway (in its evidence context). A wrong stated unit or date is the answer's own, so it falls through to the other rules (normally `extraction`). The control is `test_a_wrong_unit_the_answer_states_in_its_evidence_is_not_schema_scope`. No #701 label changes, because no #701 answer states one.

## Frozen outputs of #704

#704's outputs `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-f2-table-context-a48aea4a/` (control `main` `f0d321dd`, candidate `a48aea4a`; record [2026-10-24-f2-table-unit-date-a48aea4a.md](2026-10-24-f2-table-unit-date-a48aea4a.md)), scored with three scorers:

| v2 list arm (json/verify + list) | Scorer `1db65530` (`main` before this PR) | `3b92cb09` (url rebase, #703) | `3b1bde6a` (url rebase + evidence context) |
| --- | --- | --- | --- |
| Control `f0d321dd`: required correct / accepted / false success | 152/294 / 5 / 4 (V20, V21, V25, V34) | 164 / 7 / 2 (V25, V34) | 164 / 7 / 2 (V25, V34) |
| **Candidate `a48aea4a`** | 152/294 / 5 / 4 (V20, V21, V25, V34) | 164 / 7 / 2 (V25, V34) | **176 / 9 / 0** |
| Candidate: unit preserved / date preserved | 7/32 / 46/93 | 7/32 / 46/93 | **19/32 / 52/93** |

- The first column reproduces #704's record: 152/294, 5 accepted, 4 false successes.
- From the url rebase to the context, the candidate changes on V24 (3 → 9 of 12: the `land_area` units `Km²` and the `yearly_change` units `%`), V25 (3 → 6 of 6) and V34 (3 → 6 of 6). V25 and V34 go from false success to correct success. No other case changes.
- That is the same +12 as #704's what-if (152 → 164), now on top of the url rebase's +12. **With both, Octocrawl's list arm has no false success left on the frozen captures (0 of 42; one-sided 95% upper bound 6.9%).**
- **No change anywhere else:** the v2 json arm (34/294, 1 accepted, 0 false successes) and the D/H json and list arms (0 and 33 of 161) are the same with both scorers, for control and candidate. No D/H answer has a context unit or date (#704: D02, D05 and D09 carry only `context.currency`), and the json arms read no list.

## Live outputs of #701, against the gold and the same-day reference

#701's answers were produced by `main` `f0d321dd`, before #704. Their `json.evidence` carries `context.currency` and `context.offerType` on V08–V11, V13 and V14, and no `context.unit` or `context.date` anywhere. So the mapping change cannot change them, and it does not:
- `field-results-json.json` and `field-results-md.json` are byte-identical to #701's.
- `live-rescore.json` and `live-rescore.txt` are identical to [2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md](2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md), apart from the plan hash, which is the same set.

| Arm | Required correct, gold / same-day | Accepted | False success of 42, gold / same-day | Causes against the gold |
| --- | --- | --- | --- | --- |
| Octocrawl off | 89 / 132 | 4 / 7 | 5 / 2 | drift 3 (V18, V20, V21), schema_scope 2 (V25, V34) |
| Octocrawl + Haiku | 121 / 157 | 15 / 17 | 4 / 2 | drift 2 (V20, V21), schema_scope 2 (V25, V34) |
| Firecrawl json | 126 / 156 | 12 / 14 | 28 / 26 | extraction 12, unknown 11, schema_scope 3, drift 2 |

V25 and V34 stay `schema_scope` live because #701's engine stated no unit or date for them. Whether #704's engine states them correctly on the live pages needs a live run with `extract-tf/45`; none was made here.

## Conditions and commands

| Item | Value |
| --- | --- |
| Branch | `claude/f2-eval-sameday` (#703) with `origin/main` `4d51a590` merged (`3b92cb09`, no conflicts), then `51727d5c` (mapping) and `3b1bde6a` (cause rule) |
| Scorers | "before" `research/accuracy/` at `3b92cb09` and `main`'s at `1db65530` (`git archive`); "after" at `51727d5c`, re-run at `3b1bde6a` with identical rows (`json_map.py` is the same in both) |
| Outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-json-context-rescore-3b1bde6a/` (`704_<dir>.{before,after}.json`, `704_v2-list.main-1db65530.json`, `summary-704.txt`) and `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-f2-live-v2-07d8fb45-sameday-3b1bde6a/`. Not committed |
| Network, spend | None. Python in `~/Code/w2l/.w2l/pyenv` |

```sh
G=~/Code/w2l/.w2l/field-gold; P704=$G/runs/2026-10-24-f2-table-context-a48aea4a; OUT=$G/runs/2026-10-24-json-context-rescore-3b1bde6a; P=~/Code/w2l/.w2l/pyenv/bin/python
# <dir> in dev-json dev-list (D/H: $G/2026-10-17, :8862, D01–D10,H01–H08) and v2-json v2-list ($G/reserved-v2, :8863, V01–V42)
$P <scorer>/holdout_score.py <dataset> $P704/<dir> --mapping json --fixture-origin <origin> --versions control,candidate --cases <cases> --out $OUT/704_<dir>.<before|after>.json
# live: as in the same-day record, with RS=$G/runs/2026-10-24-f2-live-v2-07d8fb45-sameday-3b1bde6a
$P research/accuracy/live_rescore.py $RS --gold $G/reserved-v2 --sameday $G/sameday-v2-2026-10-24 > $RS/live-rescore.txt
```

## Checks

- `cd research/accuracy && ~/Code/w2l/.w2l/pyenv/bin/python -m unittest discover -s . -p 'test_*.py'`: 82 tests, OK.
- The same-day spot check (36 fields) is still pending with Howard; nothing here depends on it except the same-day column, as before.
