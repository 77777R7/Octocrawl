# Octocrawl reserved field acceptance

The first run opens H01–H08 from the source pack prepared by #556. Its plan, runner and scorer were committed before any reserved source entered a product candidate. Runtime source bodies and labels remain outside Git.

## Fixed population and comparison

Candidate: ca94fdd5e2fd28e892418ba6fa7938b94eeeb3aa (v7). Control: 15c689bec3c35457f07cedfced9d44411736e18e (main observed for this unit). Preserve both trees; the research branch is not a product candidate or integration update.

There are 77 source-captured field slots (75 required, two optional) across eight tasks. All remain in the denominators. The development group's 54 required-but-not-captured slots stay separate; they are not eight-task acceptance failures or successes. The prior source seal stays immutable; a separate unseal event records candidate exposure. These samples cease to be untouched for a version tuned on the results.

Each version makes one compact SDK request per task, through a real loopback HTTP fixture and production engine/API. Both receive identical retained bytes. Formats, main-content selection, identity-only verification, timeout, order, fields, context rules and metric definitions are in `holdout-plan.v1.json`. Raw source paths are preserved on the fixture; only fixture-origin URLs may be rebased to the original origin for comparison. Actual serialized URLs and HTTP wires are retained. No browser, model, external target request or paid provider is used. This isolates extraction/delivery on the saved bytes, not original-host routing, freshness or live access success.

## Frozen mapping and scoring

`holdout_score.py` maps the requested fields to final SDK Markdown/tables/metadata. Structured tables are primary; Markdown pipe tables are used only if no nonempty table array exists. The scorer never joins rows by price or other desired value. Entity keys, named sections, table captions/columns, business dates and units remain attached. It does not import the production verifier or fill missing values from labels.

Fully correct means the value, entity, known unit/date/period and same-source provenance all match. Report required fully correct /75, all fully correct /77, correctness among observed fields, value-only correctness, missing fields, unresolved dimensions, selected-record duplicates and source locatability separately. A task needs every required selected field and no selected-record duplicate. An identity check can pass without task acceptance; do not relabel this as the frozen access benchmark's false-success count.

Source locatability is the independent reviewer's output location plus sealed source proof and matching raw hash. It is not a claim that the product generated a per-field citation. Explicit product field citations were not requested. Extra records outside the selected target scope are not full-inventory acceptance or duplicate-rate evidence. Article duplicate rates are not estimated. Unexpected output shapes remain unresolved by the frozen scorer; later diagnostic reading may explain a limitation but cannot change its primary score.

## Execution and boundaries

Run the 15 synthetic scorer controls before opening. Hash the plan and executable review code. With runtime config, dataset and output directory outside Git:

```sh
node research/accuracy/run_holdout.mjs --run /absolute/private/runtime-config.json
python research/accuracy/holdout_score.py /absolute/private/dataset /absolute/private/outputs --fixture-origin http://127.0.0.1:8862 --out /absolute/private/field-results.json
```

Actual tests/API/acceptance activity or the recorded scheduled guard pauses before the next slot and closes owned services. A started slot is never rerun; only untouched slots can resume. Retain raw SDK objects, HTTP request/response, exceptions, attempts, fixture reads and resource checkpoints. No code/selector/contract changes after the unseal event. No failure replacement, full access rerun, merge, deployment or package publication. Non-author review remains pending.
