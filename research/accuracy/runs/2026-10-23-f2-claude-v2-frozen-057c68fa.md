# F2 measured with Claude on reserved set v2, frozen captures: `modelFallback` off, Claude Haiku 5.5, Claude Sonnet 5.5, all on `main` `057c68fa`

**Date:** 2026-10-23 (08:47:51–08:50:50 UTC). **What:** the first measurement of F2: Octocrawl's json model fallback, which keeps a model-written value only where the page states it (`docs/pa-enhancement-tasks.md`, F2). K1 left F2 null because no extraction model was configured ([2026-10-21-k1-w1-frozen-2ffd7f25-7ba113c9.md](2026-10-21-k1-w1-frozen-2ffd7f25-7ba113c9.md)). #694 added native Claude support (Messages API with structured outputs). Three arms ran on the same commit, the same day and the same sealed sources, with K1's json/verify + itemSelector request. Only `modelFallback` and the model differ between arms.

## Conditions

| Item | Value |
| --- | --- |
| Engine, driver, scorer | `main` `057c68fa20a3477ab57db6a06a246f5d4ceb0e76` (#694 merged), this checkout. `npm ci` and `npx tsc --build` ran after the branch switch, before any arm; `extract-tf/40`, `verify/9` |
| Sources | Sealed reserved set v2: `~/Code/w2l/.w2l/field-gold/reserved-v2`, seal `1588c8d3…` (checked by `run_dev.mjs` against the plan, with every sealed file's hash). Each case is served alone on loopback at `http://127.0.0.1:8863` |
| Request, arm off | `research/accuracy/reserved-plan-list.v2.json` unchanged (sha256 `b59d1ac3…`): K1's json/verify plan plus the `list` format with `itemSelector` on the 19 selected v2 list/table cases, `modelFallback: false`, `timeout` 30000, `fastMode`, HTTP channel only |
| Request, arms Haiku and Sonnet | The same plan with each of the 42 json formats' `modelFallback` set to `true` and nothing else changed (one-line `json` rewrite, recorded below). Written to `.w2l/…/plans/reserved-plan-list.v2.model-fallback.json`, sha256 `b5040644…` |
| Model | `W2L_EXTRACT_PROVIDER=anthropic`. `W2L_EXTRACT_MODEL` was `claude-haiku-5-5` or `claude-sonnet-5-5`. Effort was the default `low` (`W2L_EXTRACT_EFFORT` unset). Thinking was adaptive and omitted, with `max_tokens` 16000 and structured outputs carrying the strict-safe schema (every call in both arms had `modelUsage.strict: true`). No server-side fallbacks |
| Key | Anthropic API key from `~/Code/w2l/.w2l/access/anthropic.env`, a key scoped to one workspace that Howard created. Read into the shell environment with `set -a; . <file>; set +a` for the two model arms only. It was not printed, and it is not in any output or this record |
| Network | Loopback direct (`NO_PROXY` 127.0.0.1). The calls to `api.anthropic.com` were **proxied**: `HTTPS_PROXY=http://127.0.0.1:7890` (Clash) with `NODE_USE_ENV_PROXY=1`. Node reads the proxy at start, before `run_dev.mjs` removes the proxy variables, and keeps loopback direct. A direct request from this Mac got HTTP 403 and a proxied one HTTP 401 (no key), checked before the run. Arm off ran with the same variables and no key; it made no model call |
| Cost | From the API's `usage` in each answer (`json.modelUsage`), priced by the engine at the published rates (Haiku $0.10 / $0.50 per million input / output tokens up to a 100,000-token prompt, Sonnet $2 / $10). Haiku **$0.0211**, Sonnet **$0.4166**, total **$0.4377** of the $20 cap. No call's usage was unknown, and no prompt was over 100,000 tokens (largest 42,685, V38) |
| Outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-23-f2-claude-057c68fa/{off,haiku,sonnet}/`, `field-results.json`, `fields.md` (not committed). Every arm answered all 42 cases with no runner error |

```sh
R=~/Code/w2l/.w2l/field-gold/runs/2026-10-23-f2-claude-057c68fa; A=research/accuracy; V2=~/Code/w2l/.w2l/field-gold/reserved-v2
mkdir -p $R/plans && python3 -c "import json;p=json.load(open('$A/reserved-plan-list.v2.json'))
[f.update(modelFallback=True) for c in p['cases'] for f in c['request']['formats'] if isinstance(f,dict) and f.get('type')=='json']
open('$R/plans/reserved-plan-list.v2.model-fallback.json','w').write(json.dumps(p,ensure_ascii=False,indent=1)+'\\n')"   # 42 json formats
env -u W2L_EXTRACT_PROVIDER -u W2L_EXTRACT_MODEL -u ANTHROPIC_API_KEY NODE_USE_ENV_PROXY=1 \
  node $A/run_dev.mjs $V2 $R off --plan=$A/reserved-plan-list.v2.json                                   # 08:47:51–08:47:55
( set -a; . ~/Code/w2l/.w2l/access/anthropic.env; set +a
  export W2L_EXTRACT_PROVIDER=anthropic NODE_USE_ENV_PROXY=1
  W2L_EXTRACT_MODEL=claude-haiku-5-5  node $A/run_dev.mjs $V2 $R haiku  --plan=$R/plans/reserved-plan-list.v2.model-fallback.json   # 08:48:16–08:49:37
  W2L_EXTRACT_MODEL=claude-sonnet-5-5 node $A/run_dev.mjs $V2 $R sonnet --plan=$R/plans/reserved-plan-list.v2.model-fallback.json ) # 08:49:46–08:50:50
~/Code/w2l/.w2l/pyenv/bin/python $A/holdout_score.py $V2 $R --mapping json --fixture-origin http://127.0.0.1:8863 \
  --versions off,haiku,sonnet --cases V01,…,V42 --out $R/field-results.json --markdown $R/fields.md
```

## Results

Required fully correct is counted over the 294 required fields, all of them captured. False success is per request, with its one-sided 95% upper bound.

| Arm | Required fully correct | Values correct | Accepted | Success claims | False success (of 42) | Fabricated | Wrong record |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off (deterministic) | 120/294 | 132 | 2/42 | 6 | 4 (20.5%) | 1 | 0 |
| Claude Haiku 5.5 | **164/294** | 176 | **12/42** | 21 | 9 (34.4%) | 1 | 0 |
| Claude Sonnet 5.5 | **163/294** | 175 | **12/42** | 21 | 9 (34.4%) | 1 | 0 |

Arm off repeats K1 window 1's frozen list run exactly: 120/294, 2 accepted, and the same 4 false successes (V20, V21, V25, V34). That run was on `7ba113c9`; this one is on `057c68fa`.

**Model calls and values:**

| Arm | Cases with a model call | Calls | Input tokens | Output tokens | USD | Model values kept (`model` evidence) | Of those, correct | Dropped as `model_unsupported` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku | 21 | 21 | 200,514 | 2,087 | 0.0211 | 48 | 44 | 13 |
| Sonnet | 21 | 21 | 200,514 | 1,553 | 0.4166 | 47 | 43 | 13 |

- **The model ran on the 21 cases the deterministic path left incomplete without a selected list:** V01–V06, V08, V10–V14, V30, V33, V36–V42.
  - It did not run on the 19 selected list/table cases. When a `list` format names an `itemSelector`, the json is mapped from that list and no model is called (`docs/json-extraction.md`).
  - It did not run on V07, which stays `blocked` in all three arms, as in K1.
  - The same case and request gave the same prompt to both models, so the input tokens are equal.
  - No call was repaired (one call each), refused, cut off or timed out within the 30 s page deadline. No issue was `model_provider_error` or `model_timeout`.
- **Values the model wrote and the page states, by arm:**
  - Haiku: 44 of its 48 kept values are on required fields scored fully correct.
  - Sonnet: 43 of 47 kept values are fully correct. The exception is V37's `number`, which Sonnet got wrong and Haiku got right.
  - The remaining kept values are on V30 (4 for Haiku, 3 for Sonnet): record `name`s that the page does state, but in its notification options rather than the incidents the task asks for. V30's incidents exist only in a JSON attribute, as K1 noted.
  - The fabricated count stays 1, the same V31 list value as in arm off.
- **Dropped values:** 13 values in each model arm were not found on the page and were left out as `model_unsupported`, in the same cases for both models: V03 1, V04 1, V12 3, V13 1, V14 2, V30 5.
- **Gain:** the model arms add 44 (Haiku) and 43 (Sonnet) required fields fully correct, and 10 accepted cases each: V05, V06, V10, V11, V33, V36, V39–V42, on top of V09 and V18.
- **The 5 new false successes** are V01, V02, V08, V37 and V38, in both model arms.
  - On each, the model filled the missing fields, so the json became complete and the verify contract passed. The verify contract checks presence, not values.
  - The wrong field in each is a value the deterministic path read from the page: `title` from the first heading (V01, V02, V37, V38) and `availability` from JSON-LD (V08). Sonnet's V37 also has its wrong `number`.
  - In arm off these cases were `missed`, because the json was incomplete. The model did not write these errors. Filling the fields around them turned an honest incomplete into a claimed success.
- **Haiku and Sonnet differ by one field** (V37 `number`) and are otherwise the same case for case. At these prices, Sonnet cost 19.7 times as much as Haiku for this set.

**Per case, required fully correct** (only the cases where the arms differ):

| Case | off | Haiku | Sonnet | Case | off | Haiku | Sonnet |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V01 | 0/4 | 3/4 (false success) | 3/4 (false success) | V14 | 1/4 | 2/4 | 2/4 |
| V02 | 0/3 | 2/3 (false success) | 2/3 (false success) | V33 | 0/3 | 3/3 (accepted) | 3/3 (accepted) |
| V03 | 1/4 | 3/4 | 3/4 | V36 | 2/5 | 5/5 (accepted) | 5/5 (accepted) |
| V04 | 1/3 | 2/3 | 2/3 | V37 | 3/6 | 5/6 (false success) | 4/6 (false success) |
| V05 | 1/3 | 3/3 (accepted) | 3/3 (accepted) | V38 | 0/6 | 5/6 (false success) | 5/6 (false success) |
| V06 | 1/3 | 3/3 (accepted) | 3/3 (accepted) | V39 | 0/4 | 4/4 (accepted) | 4/4 (accepted) |
| V08 | 2/4 | 3/4 (false success) | 3/4 (false success) | V40 | 3/5 | 5/5 (accepted) | 5/5 (accepted) |
| V10 | 2/4 | 4/4 (accepted) | 4/4 (accepted) | V41 | 1/5 | 5/5 (accepted) | 5/5 (accepted) |
| V11 | 2/3 | 3/3 (accepted) | 3/3 (accepted) | V42 | 2/5 | 5/5 (accepted) | 5/5 (accepted) |
| V13 | 2/5 | 3/5 | 3/5 | | | | |

## What this measures and what it does not

- **These are saved bytes.** The results say nothing about live access, routing or freshness. v2 has been regression data since #639.
- **Firecrawl comparison:** Firecrawl's LLM json cannot read a loopback capture, so there is no like-for-like Firecrawl number for these sources. On the live pages in K1 it reached 118/294 (window 1) and 121/294 (window 2), with 23 and 26 of 42 false successes, against the same gold. In K1 the live pages had drifted from the frozen sources: Octocrawl's deterministic json scored 69 and 56 live against 120 here.
- **Effort:** one setting only, the default `low`. Output averaged 99 tokens per call on Haiku and 74 on Sonnet, thinking included. Other effort levels were not run.
- **Scope of the model gain:** the gain comes from the 21 cases without a selected list. The 19 list/table cases are unchanged, because the list path never calls the model.
- **Repetition:** one run per arm. Run-to-run variance of the models was not measured.

## Cost

$0.4377 in total (Haiku $0.0211, Sonnet $0.4166), counted from the API's usage on each call. Nothing else was spent: no browser, grant or vendor. The key's workspace balance was not read.
