# Octocrawl field gold set

This set supplies source-grounded engineering annotations for 18 real task URLs: ten development-used captures and eight reserved captures. It does not establish product accuracy, a new access score, independent economic truth or non-author acceptance. The reserved group has no generated or inspected candidate output.

`field-gold-plan.v1.json` froze the tasks and split before the eight reserved captures. Candidate v7 `ca94fdd5e2fd28e892418ba6fa7938b94eeeb3aa` remains frozen. The data work starts separately from main `a7f88cc8`; it changes no production extractor or verifier. These task definitions supplement the frozen 92 predicates; they do not replace them or alter old scores.

## Contents and scope

| Group | Cases | Purpose |
| --- | --- | --- |
| Development | D01–D10 | Census vintage, Newegg offers, Skyscanner associated dates/carriers/fares, Nasdaq shadow table, OTTO duplicates/variants, Yahoo empty history, AliExpress login, Temu CAPTCHA, signed CoinGecko changes, Walmart source error |
| Reserved | H01–H08 | RFC header, Gutenberg daily books, NASA constants, GOV.UK dated holidays, NIST SI prefixes, IANA registry, W3C recommendation, MDN method reference |

The reserved set targets field semantics on accessible public HTML. It does not represent difficult-site access rates or every retail/travel failure. Exact reserved URLs were absent from the frozen access/parity task inputs; that check does not prove absence from all prior browsing or model training.

The source pack contains 227 field slots: 173 captured values and 54 required-but-not-captured fields. Of captured fields, 15 have an unresolved source unit and 22 have an unresolved business timestamp. These are construction counts, not accuracy percentages. Optional boundary/context fields are distinguished from required task fields. Four source cases have no requested target records; their required values remain null rather than being filled with navigation, current quotes, login text or zeros.

Raw sources, captures and annotations stay in a private ignored dataset, normally `.w2l/field-gold/2026-10-17/`, with the same structure in the separately delivered archive:

```text
plan.json
seal.json
source-audit.json
cases/D01/capture.json
cases/D01/source.html
cases/D01/gold.json
...
cases/H08/...
```

`field-gold-manifest.v1.json` records hashes and counts without committing raw pages, labels or batch output. `field-gold.schema.json` describes the annotations. A full snapshot is retained, while the task selects named fields or the first three complete distinct records. H05 explicitly asks for four prefixes. Selected-field coverage never means complete inventory/history coverage.

## Label and evidence rules

- Grain is one field within one identified source record. Product variants, flight routes/dates and historical rows retain their identities. For example, OTTO product and variation IDs are separate; extra image links are not records.
- Values are read from retained source HTML, its explicit attributes and the named task region. The annotation code does not import the production extractor/verifier or derive expectations from converted Markdown or configured verification results.
- Each captured value has a raw source hash, record span, structural path, exact quote, decoded-text character offsets and UTF-8 byte offsets. Line endings are preserved. Unit/date/period context has its own source evidence. HTML entities are decoded once; inline decimal pieces remain associated.
- Known, unknown and not_applicable are distinct. Unknown is null, never 0. A real0 remains a value. Only explicit source currency/context identifies a currency; `$` alone is insufficient. Capture time is not publication date, quote time, departure date, vintage or reporting date.
- English and German decimal notation is parsed with Decimal, without rounding. Percentage direction preserves the displayed magnitude using the same component's signed source sort and direction class. A displayed 0.0% does not establish an exact underlying zero or a direction. SI superscripts remain exponents. Date precision is preserved; an RFC month does not become a fabricated day.
- Skyscanner's full year and currency are explicit in the same-card URL and are checked against its visible date. GOV.UK binds year/region via the selected table caption. A publication/update date is kept separate from an HTTP response date.
- Engineering labels and source-byte checks are ready. Non-author human review remains pending. A source contradiction, unavailable unit or missing business time is recorded rather than resolved by assuming a different source's value.

## Run the offline source audit

Use Python 3.12 or newer and a virtualenv. The auditor uses only the standard library; it performs no network calls and runs no candidate.

```sh
python3 -m venv .w2l/pyenv
.w2l/pyenv/bin/python -m unittest discover -s research/accuracy -p 'test_*.py' -v
.w2l/pyenv/bin/python research/accuracy/audit_gold.py .w2l/field-gold/2026-10-17 --output .w2l/field-gold/2026-10-17/source-audit.json
```

The source audit checks hashes, quotes, offsets, record association, unit/date derivations, percentage-column association, null handling, distinct field/entity keys and reserved leakage. The seal rejects later changes to tasks, sources and labels. Offline synthetic controls test wrong values, currencies, years, record association, period, missing-as-zero, zero direction, source hashes, offsets and reserved exposure. They are not counted among the 18 real cases.

This audit establishes annotation/source coherence. It cannot independently prove every annotation's interpretation or the external world's truth. Eighteen schema-valid cases and nine rejected mutations on actual sources supplement the eighteen synthetic controls. The private worksheet exposes the selected source evidence for another reviewer to adjudicate.

## Reserved-set protocol

1. Preserve plan, source, annotation and seal hashes. Raw HTTP capture records the named user agent, proxy, robots decision, redirect chain, actual time and first outcome. No challenge solving, identity rotation, enhanced grant, paid provider or model is used. Resource pauses resume only never-attempted tasks.
2. Keep H01–H08 separate from tuning and do not run a candidate during set preparation. Labels can be reviewed; generated candidate answers are the boundary. Holdout annotations are not secret from their source adjudicator, so this is reserved evaluation rather than a claim of independent human blinding.
3. Before opening the set, fix candidate/control commits, task requests, field mappings, normalization, required dimensions, denominators and budgets. Run once and retain failures. Apply no selector/predicate repair to improve that run.
4. Record candidate outputs separately with an unseal event. Opened samples may be retained as regression data, but cannot continue to be called an untouched holdout for a version tuned on them. Replace contaminated reserved tasks before any later fresh acceptance claim.

## Accuracy accounting for later evaluation

| Measure | Required accounting |
| --- | --- |
| Field correctness | Delivered field has the correct entity, value, requested unit/date/period and source association. Report matched/mismatched and unavailable dimensions separately. No product score exists yet. |
| Required-field completeness | Correctly delivered required fields over those the snapshot actually supplies. Separately report required fields the capture never supplied; an empty denominator is null, not 100%. |
| Duplicates | Use task entity/variant keys and record boundaries. Report duplicate source cards and duplicate delivered records separately. |
| Evidence location | A delivered value maps to the correct same-capture record/cell/text. Count wrong-record citations separately from missing citations. |

The later worksheet must include observed value, entity identity, unit/date/period, output location, source locator, decision and rationale. A production `passed`, a source audit, and independent accuracy acceptance remain separate states. Do not use this set to backfill old access outcomes or claim healthy 25/25, cross-date stability, deployment or an outside trial.
