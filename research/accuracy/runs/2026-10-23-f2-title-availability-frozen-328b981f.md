# F2's five new false successes, after fixing the title and availability reads: reserved set v2 frozen captures, `main` `057c68fa` against `7b1906ef` (title) and `328b981f` (title and availability), with Claude Haiku 5.5

**Date:** 2026-10-23 (model arm 09:16:28–09:17:16 UTC, off arms 16:24:37–16:25:31 UTC). **What:** the re-score Howard asked for after [2026-10-23-f2-claude-v2-frozen-057c68fa.md](2026-10-23-f2-claude-v2-frozen-057c68fa.md). In that record, turning on F2's model fallback raised required fully correct from 120 to 164/294, and raised false successes from 4 to 9 of 42. The new false successes were V01, V02, V08, V37 and V38. In each, the model filled the fields around a wrong value the deterministic path had read, and so made the json complete: `title` from the main content's first heading (V01, V02, V37, V38) and `availability` from JSON-LD (V08). There are two fixes, each with a failing test first:

- **Title** (`7b1906ef`, branch `claude/f2-subject-title`): the content title is the heading the page's declared title names (`docs/json-extraction.md`).
- **Availability** (`328b981f`, branch `claude/f2-availability-words`, on top of the title fix): a product's availability is reported in the words the page shows in microdata.

The branches' heads, `7f14e7ed` (title) and `346d99d6` (availability), differ from the commits measured here only in one sentence of `docs/json-extraction.md`, corrected after the last review. The code is the same.

## Conditions

| Item | Value |
| --- | --- |
| Engines | control `main` `057c68fa20a3477ab57db6a06a246f5d4ceb0e76`, title `7b1906ef`, candidate `328b981f` (both fixes). Each ran from its own checkout (`--engine`) after `npm ci` and `npx tsc --build`; `extract-tf/40`, `/41`, `/42` |
| Driver, scorer | `run_dev.mjs --plan` and `holdout_score.py` (`--mapping json` for the json plans), both run from the candidate checkout and unchanged since `057c68fa` |
| Sources | Reserved set v2, `~/Code/w2l/.w2l/field-gold/reserved-v2`, seal `1588c8d3…` (checked by `run_dev.mjs`), served on `http://127.0.0.1:8863`. Development and regression set `~/Code/w2l/.w2l/field-gold/2026-10-17` (D01–D10, H01–H08), served on `http://127.0.0.1:8862` |
| Plans, unchanged | V: `reserved-plan-list.v2.json` (sha256 `b59d1ac3…`, the F2 record's arm off), `reserved-plan.v2.json` (`f6513beb…`), `reserved-plan-json.v2.json` (`cfa1a39f…`). D/H: `dev-plan.v1.json` (`6444c4d1…`), `dev-plan-json.v1.json` (`eb509f4a…`), `dev-plan-list.v1.json` (`6132b9cb…`) |
| Model arm | Claude Haiku 5.5: `W2L_EXTRACT_PROVIDER=anthropic`, `W2L_EXTRACT_MODEL=claude-haiku-5-5`, default effort `low`. Plan: the F2 record's `reserved-plan-list.v2.model-fallback.json` (sha256 `b5040644…`), which sets `modelFallback: true` on the 42 json formats and nothing else. It ran once, on `8cd34d30`, a commit before the review fixes (see "Which commit the model arm ran on") |
| Key | The Anthropic API key in `~/Code/w2l/.w2l/access/anthropic.env`, read into the shell for the model arm only. It was not printed and is not in any output or this record |
| Network | Every off arm: loopback direct, with the proxy variables removed. The model arm: calls to `api.anthropic.com` **proxied** (`HTTPS_PROXY=http://127.0.0.1:7890`, `NODE_USE_ENV_PROXY=1`, `NO_PROXY=127.0.0.1,localhost`); loopback stayed direct |
| Outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-23-f2-title-availability-328b981f/{dev,dev-json,dev-list,v2,v2-json,v2-list}/{control,title,candidate}/`. `v2-list/` also holds `haiku-8cd34d30/` (this run's model arm) and `haiku-057c68fa/` (the F2 record's Haiku arm, copied in for scoring), with `field-results.json` and `fields.md`. Not committed |

```sh
R=~/Code/w2l/.w2l/field-gold; P=$R/runs/2026-10-23-f2-title-availability-328b981f; A=research/accuracy
# per engine (label:checkout = control:057c68fa, title:7b1906ef, candidate:328b981f), proxy variables removed (16:24:37–16:25:31):
node $A/run_dev.mjs $R/2026-10-17  $P/dev      <label> --plan=$A/dev-plan.v1.json           --engine=<checkout>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-json <label> --plan=$A/dev-plan-json.v1.json      --engine=<checkout>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-list <label> --plan=$A/dev-plan-list.v1.json      --engine=<checkout>
node $A/run_dev.mjs $R/reserved-v2 $P/v2       <label> --plan=$A/reserved-plan.v2.json      --engine=<checkout>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-json  <label> --plan=$A/reserved-plan-json.v2.json --engine=<checkout>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-list  <label> --plan=$A/reserved-plan-list.v2.json --engine=<checkout>
# model arm, once, in the 8cd34d30 checkout (09:16:28–09:17:16):
( set -a; . ~/Code/w2l/.w2l/access/anthropic.env; set +a
  export W2L_EXTRACT_PROVIDER=anthropic NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 NO_PROXY=127.0.0.1,localhost
  W2L_EXTRACT_MODEL=claude-haiku-5-5 node $A/run_dev.mjs $R/reserved-v2 <out>/v2-list haiku \
    --plan=$R/runs/2026-10-23-f2-claude-057c68fa/plans/reserved-plan-list.v2.model-fallback.json )
~/Code/w2l/.w2l/pyenv/bin/python $A/holdout_score.py $R/reserved-v2 $P/v2-list --mapping json --fixture-origin http://127.0.0.1:8863 \
  --versions control,title,candidate,haiku-057c68fa,haiku-8cd34d30 --cases V01,…,V42 --out $P/v2-list/field-results.json --markdown $P/v2-list/fields.md
# the other directories likewise, with --versions control,title,candidate (D/H: $R/2026-10-17, :8862, --cases D01,…,D10,H01,…,H08)
```

## Results

**Reserved v2 with K1's json/verify + itemSelector request** (the F2 record's plan). Required fully correct is counted over the 294 required fields, all of them captured. False success is per request, with its one-sided 95% upper bound.

| Arm | Required fully correct | Values correct | Accepted | Success claims | False success (of 42) | Fabricated | Wrong record |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off, `main` `057c68fa` | 120/294 | 132 | 2/42 | 6 | 4 (20.5%) | 1 | 0 |
| off, title `7b1906ef` | 124/294 | 136 | 2/42 | 6 | 4 (20.5%) | 1 | 0 |
| off, both `328b981f` | **125/294** | 137 | 2/42 | 6 | 4 (20.5%) | 1 | 0 |
| Haiku, `main` `057c68fa` (F2 record) | 164/294 | 176 | 12/42 | 21 | 9 (34.4%) | 1 | 0 |
| Haiku, both (`8cd34d30`) | **169/294** | 181 | **17/42** | 21 | **4 (20.5%)** | 1 | 0 |

**The five cases**, required fully correct (outcome):

| Case | Field | Gold | off `057c68fa` | off `328b981f` | Haiku `057c68fa` | Haiku `8cd34d30` |
| --- | --- | --- | --- | --- | --- | --- |
| V01 | `title` | Better HTTP/1 connection reuse | 0/4 | 1/4 | 3/4 (false success) | 4/4 (accepted) |
| V02 | `title` | Announcing Rust 1.99.0 | 0/3 | 1/3 | 2/3 (false success) | 3/3 (accepted) |
| V08 | `availability` | In stock | 2/4 | 3/4 | 3/4 (false success) | 4/4 (accepted) |
| V37 | `title` | Style Guide for Python Code | 3/6 | 4/6 | 5/6 (false success) | 6/6 (accepted) |
| V38 | `title` | HTTP/1.1 | 0/6 | 1/6 | 5/6 (false success) | 6/6 (accepted) |

- In the off arms these cases stay `missed`, because their json is still incomplete without the model.
- In the Haiku arm all five are correct successes. The 4 false successes left are V20, V21, V25 and V34, the same 4 as in every off arm and in K1 window 1.

**What was wrong on each page, and the rule now used:**

- **V01 (go.dev).** The main content's first `h1` is the blog's own heading, a link to `/blog/`. The post's title is the second `h1`, and the `<title>` opens with it (`… - The Go Programming Language`). Rule: when the first `h1` is one link to another page, a later `h1` is the title if it opens the declared title and is at least as long as every part outside it.
- **V02 (Rust blog).** There is no `h1`, so the `<title>` was read with the blog's name in it (`Announcing Rust 1.99.0 | Rust Blog`). The post's title is its `h2`. Rule: when the main content has no `h1`, an `h2` that opens the declared title and is at least as long as every part outside it.
- **V38 (IETF datatracker).** The `h1` holds `HTTP/1.1` and a `<small>` subtitle, `RFC 9112 also known as STD 99`. Rule: a heading is compared with the declared title (`RFC 9112 - HTTP/1.1`) both with and without its `<small>` subtitle. The first `h1` stays the title when it matches the declared title or any of its parts.
- **V37 (peps.python.org).** The `h1` is `PEP 8 – Style Guide for Python Code`. The gold title leaves out the number, which the schema asks for in a `number` field of its own. Rule, in json only: when the schema asks for the document's number in a field of its own (`number`, `no`, or a field named after the series such as `pep_number`; not `phoneNumber`), a title that opens with a document series' number (`PEP 8 – `) is read without it. `document.title` keeps the whole heading.
- **V08 (Adafruit).** The JSON-LD offer declares `http://schema.org/InStock`, which was read as `InStock`. The page shows `In stock` in an `itemprop="availability"` outside any itemscope, and the gold quotes that. Rule:
  - Such an element is a statement about the subject only when the page declares no other product (nested related items included) and its words name a schema.org ItemAvailability value.
  - When the subject's statements agree, the words microdata shows are reported.
  - When they disagree (the offer's `InStock` beside a shown `Out of stock`), the field is left out with `field_ambiguous`.
- **Tests.** Each rule is tested in `packages/api/test/structured.test.ts` and `packages/extract-tf/test/product.test.ts`, with fixtures minimized from these captures and the reviewers' counterexamples (below). Each test fails on `057c68fa`.

**Model calls** (Haiku, `8cd34d30`):
- 21 calls, on the same 21 cases as the F2 record.
- 200,485 input and 1,913 output tokens (F2 record: 200,514 and 2,087).
- 48 values kept as `model`; 13 dropped as `model_unsupported`, in the same cases as there.
- Every call had `modelUsage.strict: true`. No call's cost was unknown.

**Every other request, off arms:**

| Set and request | `main` `057c68fa` | title `7b1906ef` | both `328b981f` |
| --- | --- | --- | --- |
| D01–D10, Markdown | 51/140, 1/10 accepted, 6 false successes | 51/140, 1/10, 6 | 51/140, 1/10, 6 |
| H01–H08, Markdown | 75/75, 8/8 accepted, 0 | 75/75, 8/8, 0 | 75/75, 8/8, 0 |
| D01–D10, json/verify | 0/140, 0/10, 0 | 0/140, 0/10, 0 | 0/140, 0/10, 0 |
| H01–H08, json/verify | 0/75, 0/8, 0 | 0/75, 0/8, 0 | 0/75, 0/8, 0 |
| D01–D10, json/verify + list | 21/140, 0/10, 0 | 21/140, 0/10, 0 | 21/140, 0/10, 0 |
| H01–H08, json/verify + list | 6/75, 0/8, 0 | 6/75, 0/8, 0 | 6/75, 0/8, 0 |
| V01–V42, Markdown | 229/294, 23/42 accepted, 18 | 229/294, 23/42, 18 | 229/294, 23/42, 18 |
| V01–V42, json/verify | 29/294, 1/42, 0 | 33/294, 1/42, 0 | 34/294, 1/42, 0 |

**What changed between `main` and `328b981f`, response by response.** The comparison covered all 180 requests: status, Markdown, tables, links, list, and json `status`/`data`/`issues`/`evidence`. Markdown changed on none of them.

- **V01, V02, V08, V37, V38:** json changed, and on V01, V02 and V38 `document.title` too, as shown above.
- **V04 (The Conversation):** `document.title` and the json `title` are the same heading, with its no-break space now an ordinary space, because a heading that matches the declared title is read with its whitespace collapsed. The scorer reads both alike. The json `title` evidence is now `h1[0]` instead of `title`. The value was always read from the `h1`; the old code named `<title>` because the two texts were equal.
- **H07 (WCAG 2.2):** the json `title` evidence changed from `title` to `h1[0]`, for the same reason. The value did not change.
- No other request changed.

**Which commit the model arm ran on.** The Haiku arm ran once, on `8cd34d30`. After it, four clean-context reviews found blocking cases, now fixed in `7b1906ef` and `328b981f`:
- a document number cut from `COVID-19: Latest updates`, and from a title when the schema's only number field was `phoneNumber` or `caseNumber`;
- a site's name in an `h2` or a later `h1` read as the title;
- the wrong index in an unscoped availability path;
- `Auf Lager`, a nested related product's card or another seller's Offer making availability ambiguous;
- an `og:availability` value preferred over JSON-LD.

The model's input is the request's prompt, the deterministic json data and the page's Markdown (`modelInput` in `packages/api/src/structured.ts`). On all 42 V cases of this plan, Markdown and json (`status`, `data`, `issues`, `evidence`) are identical between `8cd34d30` and `328b981f`. The one difference is V37's `document.title`, whole on `328b981f`, which is not part of the model's input. So the model arm was not run again. That it would give the same result on `328b981f` is inferred from the code and the off outputs, not measured by a second model run.

## What this measures and what it does not

- **Saved bytes only.** These are saved bytes; they say nothing about live access, routing or freshness. v2 has been regression data since #639, and these fixes were made by looking at five of its cases.
- **Sonnet was not re-run.** In the F2 record it differed from Haiku by one field (V37 `number`).
- **One model run.** Run-to-run variance was not measured.
- **Firecrawl.** There is no like-for-like number on loopback captures, as the F2 record explains. A same-day live comparison is next.
- **Verify contract.** The verify contract checks presence, not values. That is why a wrong deterministic value turned into a false success once the model filled the other fields. Changing it was out of scope here.

## Cost

$0.0210 for the Haiku arm, from the API's usage on each call, priced by the engine at $0.10 / $0.50 per million input / output tokens; the cap was $1. Nothing else was spent: no browser, grant or vendor.
