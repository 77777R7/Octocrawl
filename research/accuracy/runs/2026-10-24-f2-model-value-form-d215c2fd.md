# A model-written document number in the form the field asks for: frozen captures, `main` `5c1db14e` against `d215c2fd`, with Claude Haiku 5.5

**Date:** 2026-10-24 (control: off arms 11:16:24–11:16:59 UTC, Haiku arm 11:17:40–11:18:28 UTC, replay 11:20:29 UTC; candidate `d215c2fd`: off arms 11:33:27–11:33:45 UTC, Haiku arm 11:33:46–11:34:33 UTC, replay 11:34:43 UTC; first candidate `840e73d4` 11:16–11:20 UTC, see below). **What:** the fix Howard asked for on 2026-10-24 after the live run [2026-10-24-f2-live-v2-453b2105.md](2026-10-24-f2-live-v2-453b2105.md) (#705). There, on V37 (peps.python.org, PEP 8), Claude Haiku 5.5 wrote `PEP 8` into the schema's `number` field where the gold has `8`, and the json was a false success. It was the first live false success that came from a value the model wrote.

## Diagnosis

Read from `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-f2-live-v2-453b2105/model/V37.json` (read only) and the case in `research/accuracy/reserved-plan-list.v2.json`:
- The schema types `number` as a **string**: `{ number, title, first_author, status, type, created }`, all strings and all required. The verify contract checks only that each field is present.
- The content title was `PEP 8 – Style Guide for Python Code`. #696's `withoutDocumentNumber` rule cut it to `Style Guide for Python Code`, because the schema asks for the number in a field of its own. The deterministic path read title, status, type and created. Nothing on the page labels the number, so `number` was missing and the model was called.
- The model answered `number: "PEP 8"`. The schema check accepts any string, and the grounding check (`modelLocator`) found `PEP 8` on markdown line 1, so the value was kept with `model` evidence. With every field present, the json was `complete` and the verify contract passed.
- So each check worked as written. The gap was that the json held the number with its series prefix in the one field the schema had set aside for the number, while the same request's title had been read on the premise that the series and number belong in that field.

## The rule (`840e73d4` and the review fix `d215c2fd`; tests first in `7d524946`)

Candidates weighed:
1. *Number or integer schema type:* already safe. Strict structured output cannot write a string there, and without strict mode the schema check refuses `PEP 8`, triggers the repair round, and leaves the field missing (`model_output_invalid`, `missing_required`). Nothing reads `PEP 8` as `8` by dropping words, and the change keeps it that way.
2. *String field that asks for the title's document number:* this is V37's case, and the rule chosen. The decision reuses #696's logic as it is. When the content title opens with a document series' number (`PEP 8 – …`, `RFC 9112: …`) and a top-level string field asks for that number (`number`, `no`, `num`, or a key named after that series, such as `pep_number`, `rfcNumber` or `pep`), a model value that is exactly that series and number (`PEP 8`, `pep 8`, `PEP-8`) becomes the number alone (`8`). This is the reading under which the title was already cut. The page text the model wrote is what the page is searched for, and the evidence records it as `text: "PEP 8"`, with `normalized: "8"`. A field whose own checks `8` breaks (a `pattern` or `enum` that asks for `PEP 8`, a `minLength`) keeps what the model wrote: `840e73d4` took the number out before the schema check, so such a field lost its value, which a clean-context review found; `d215c2fd` fixes it, with the counterexamples added to the test first.
3. *Otherwise:* the value is kept as written. That covers another document's number (`PEP 20`), a field that is not the document's number (`id`, `rfc_number` on a PEP page), a title that does not open with a series number, the number alone (`8`) and a price.

Nothing is guessed: the number comes from the title the page states, and a value the rule does not cover keeps today's behaviour. API-level json only; `EXTRACTOR_VERSION` stays `extract-tf/45`. The extractor's output (Markdown, document title, list) is unchanged, as the off arms below show.

## Conditions of the run

| Item | Value |
| --- | --- |
| Engines | control: `main` `5c1db14eeb00ad1ea7a73be17a8daf3a05831348`, a fresh detached worktree in the session scratchpad (`npm ci --prefer-offline --ignore-scripts`, better-sqlite3's built binding copied from this checkout, `npx tsc --build`). Candidate: this branch at `d215c2fdf7413a4ce4cd5392ceaec51dee0f92a2`, `npx tsc --build` after the commit (and, for the first candidate run, `840e73d4734cd32feea7db2607a2925fd976a643` the same way). Both `dist/` carry `extract-tf/45` |
| Driver, scorer | `research/accuracy/run_dev.mjs --plan --engine` and `holdout_score.py` (R3; `--mapping json` for the json plans, `markdown` otherwise), as on `main`, run from the candidate checkout in `~/Code/w2l/.w2l/pyenv` |
| Sources | Reserved set v2 (seal checked by the driver) on `http://127.0.0.1:8863`; dev and regression set `2026-10-17` (D01–D10, H01–H08) on `http://127.0.0.1:8862` |
| Plans | `reserved-plan.v2.json`, `reserved-plan-json.v2.json`, `reserved-plan-list.v2.json` (the off arm), `dev-plan.v1.json`, `dev-plan-json.v1.json`, `dev-plan-list.v1.json`; Haiku arm: the F2 record's `reserved-plan-list.v2.model-fallback.json` (sha256 `b5040644…`, `reserved-plan-list.v2.json` with `modelFallback: true` and nothing else, checked) |
| Model arm | Claude Haiku 5.5, `W2L_EXTRACT_PROVIDER=anthropic`, `W2L_EXTRACT_MODEL=claude-haiku-5-5`, default effort `low`. Run once on each engine, control first. Key from `~/Code/w2l/.w2l/access/anthropic.env`, read into the shell for the model arms only, not printed and not in any output |
| Replay | V37 alone (a one-case copy of the model-fallback plan, sha256 `00f27b02…`) through both engines, with `W2L_EXTRACT_PROVIDER=openai` pointed at a local stub on `127.0.0.1:8796` that answers with the Haiku control arm's V37 json data as written (`number: "PEP 8"`, `first_author: "Guido van Rossum"` and the four page-read fields) |
| Network | Off arms and replay: loopback direct, proxy variables removed. Haiku arms: `api.anthropic.com` **proxied** (`HTTPS_PROXY=http://127.0.0.1:7890`, `NODE_USE_ENV_PROXY=1`, `NO_PROXY=127.0.0.1,localhost`); loopback direct |
| Outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-f2-model-value-form-d215c2fd/{dev,dev-json,dev-list,v2,v2-json,v2-list,v37-replay}/`, with `field-results.json` and `fields.md` per plan; `v2-list/` holds `control`, `candidate`, `haiku-control`, `haiku-candidate`. The control outputs are copied from the first run's directory `…-840e73d4/` (same engine, not re-run), which keeps the `840e73d4` candidate outputs. Not committed |

```sh
R=~/Code/w2l/.w2l/field-gold; P=$R/runs/2026-10-24-f2-model-value-form-d215c2fd; A=research/accuracy
# label:engine = control:<main 5c1db14e worktree>, candidate:<this checkout at d215c2fd>; proxy variables removed
node $A/run_dev.mjs $R/2026-10-17  $P/dev      <label> --plan=$A/dev-plan.v1.json           --engine=<engine>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-json <label> --plan=$A/dev-plan-json.v1.json      --engine=<engine>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-list <label> --plan=$A/dev-plan-list.v1.json      --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2       <label> --plan=$A/reserved-plan.v2.json      --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-json  <label> --plan=$A/reserved-plan-json.v2.json --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-list  <label> --plan=$A/reserved-plan-list.v2.json --engine=<engine>
# Haiku arms, once per engine (key from anthropic.env; proxied as above):
W2L_EXTRACT_PROVIDER=anthropic W2L_EXTRACT_MODEL=claude-haiku-5-5 node $A/run_dev.mjs $R/reserved-v2 $P/v2-list haiku-<label> \
  --plan=$R/runs/2026-10-23-f2-claude-057c68fa/plans/reserved-plan-list.v2.model-fallback.json --engine=<engine>
# Replay: W2L_EXTRACT_PROVIDER=openai W2L_EXTRACT_BASE_URL=http://127.0.0.1:8796/v1, a stub answering the control arm's V37 data
node $A/run_dev.mjs $R/reserved-v2 $P/v37-replay replay-<label> --plan=<V37-only copy of the model-fallback plan> --engine=<engine>
~/Code/w2l/.w2l/pyenv/bin/python $A/holdout_score.py $R/reserved-v2 $P/v2-list --mapping json --fixture-origin http://127.0.0.1:8863 \
  --versions control,candidate,haiku-control,haiku-candidate --cases V01,…,V42 --out $P/v2-list/field-results.json --markdown $P/v2-list/fields.md
# likewise v2 (--mapping markdown), v2-json, v37-replay (--cases V37); dev, dev-json, dev-list with $R/2026-10-17, :8862, --cases D01,…,D10,H01,…,H08
```

## Results with the R3 scorer

Required fully correct is counted over the required fields; false success is per request. These counts come from the R3 scorer as it is on `main` today. They compare only within this record: they are not comparable with earlier frozen records, which used earlier scorer versions.

| Plan, arm | control `5c1db14e` | candidate `d215c2fd` |
| --- | --- | --- |
| v2-list off (the v2 off arm) | 176/294, accepted 9/42, false success 0 | same |
| v2-json off | 34/294, accepted 1/42, false success 0 | same |
| v2 (Markdown) | 229/294, accepted 23/42, false success 18 | same |
| dev, D group | 51/140, accepted 1/10, false success 6 | same |
| dev, H group | 75/75, accepted 8/8, false success 0 | same |
| dev-json (D / H) | 0/140, 0/75 | same |
| dev-list (D / H) | 27/140, 6/75 | same |
| **v2-list, Haiku** | 219/294, accepted 23/42, **false success 1 (V37)** | **220/294**, accepted 24/42, **false success 0** |
| **V37 replay** (stub answering `PEP 8`) | false success, 5 of 6 | **correct success, 6 of 6** |

- **Off arms:** on all 180 off requests, the `status`, Markdown, json, list, tables and verification of the candidate equal the control's, for `840e73d4` and for `d215c2fd`. The change does not touch the deterministic path.
- **Haiku arms:** the control again answered `number: "PEP 8"` on V37 on the frozen capture, reproducing #705's false success. On both candidate runs (`840e73d4` and `d215c2fd`) the model answered `8` itself (evidence `text: "8"`, no `normalized`), so the candidate's V37 gain is the model's own variation, not the rule. On `d215c2fd`, V14 and V30 differ from the control in what the model wrote: V14's two rejected ebook prices (`0` against `7`, both `model_unsupported`) and V30's fifth record name and the `impact` texts, which were left out as unsupported. Neither case has a title that opens with a series number, so the rule cannot apply to them, and neither changes the score. V03 and V39 differ only in token counts. `840e73d4`'s run scored the same: 220/294, accepted 24/42, false success 0.
- **Replay:** the same model answer through both engines on V37's frozen page. Control keeps `PEP 8`, a false success. The candidate gives `number: "8"` with evidence `{ source: "model", evidencePath: "markdown line 1", text: "PEP 8", normalized: "8" }`, no issues, and a correct success.

## Limits

- **One model run per engine.** Run-to-run variance was not measured. The rule's effect on V37 is shown by the replay, which used a stub, not by a live call.
- **Only V37 exercises the rule** in these sets. No other case has a title opening with a series number together with a field that asks for it.
- **The deterministic path still leaves `number` missing** on V37: the off arm cannot fill it, because the page labels no number. Reading the number from the title is not part of this change.
- **The verify contract** still checks presence, not values.

## Cost

| Item | Spend |
| --- | --- |
| Claude Haiku 5.5 | **$0.063464**: control $0.021051, candidate `840e73d4` $0.021180, candidate `d215c2fd` $0.021233, 21 calls each, all `strict: true`, none with an unknown cost (`json.modelUsage.externalCostUsd`, published rates; cap $1) |
| Replay, off arms | $0: local stub, loopback only. No Firecrawl, grant, vendor or browser |
