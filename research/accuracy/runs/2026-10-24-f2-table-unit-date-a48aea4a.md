# The unit and as-of date a table states, on a selected table row's numbers: frozen captures, `main` `f0d321dd` against `a48aea4a`

**Date:** 2026-10-24 (both engines 07:20:20–07:21:00 UTC, paired, one plan after another; earlier candidates `d0ff1e0c` at 07:07:00–07:07:41 and `0c4ee9b1` at 07:15:30–07:16:05 UTC, each with its control). **What:** the engine change Howard decided on 2026-10-24. A fact check that day found that on reserved v2 V25 and V34, Octocrawl's json read every rate correctly on the frozen captures but scored 3 of 6 fully correct, because the gold also asks for each rate's unit and date and the json delivered neither. This record states the rules built, what the frozen captures show, and how the R3 scorer would have to read the result.

## What the gold asks for, and where the page states it

Read only from `~/Code/w2l/.w2l/field-gold/reserved-v2/cases/<case>/{gold.json,source.html}` (sealed 2026-10-20) and `~/Code/w2l/.w2l/field-gold/2026-10-17/cases/`; not committed.

| Case | Field (×3) | Gold unit, gold evidence | Gold date, gold evidence |
| --- | --- | --- | --- |
| V25 rba.gov.au exchange rates | `rate` | `Units of Foreign Currencies per Australian Dollar`, the table's `<caption>` | 2026-10-19, the value column's header `<th><strong>19 Oct 2026</strong></th>` (the other columns are other days) |
| V34 x-rates.com top 10 | `rate` | `1.00 USD`, the value column's header (the next column, `inv. 1.00 USD`, is the inverse rate) | 2026-01-01, `<span class="ratesTimestamp">Jan 01, 2026 03:50 UTC</span>`, the block just before the table, after its `h1` and a `Top 10` span |
| V24 worldometers population | `land_area` | `Km²`, the header `Land Area (Km²)` | none |
| V24 | `yearly_change` | `%`, in the value cell (`0.87%`) | none |

Of the 60 cases of reserved v2 and the dev set, 54 have a known unit or date somewhere. Only these three state one in the table around the value (a caption, a header, or the text just before the table). In the others, the unit or date is in the value cell itself (V18, V22, V23, V26–V29, V38, H03, H04, D09's `%`), in another element of the page (D09's currency selector, H05's footer, H06's list above the table, H02's other table), or the value is not in a table at all. No case has a unit row inside the table. The 19 list cases of v2 are V15–V29, V31, V32, V34 and V35; the dev set's are D02, D03, D05, D09 and H02–H04.

## The change (`d0ff1e0c` and the review fixes `0c4ee9b1` and `a48aea4a`, tests first in `aaa9af7a`)

For json read from a list with an `itemSelector`, a number read from a table row, by a list field or from a header-named column (#700), now has in its `json.evidence` entry:
- `text`, `normalized` and `conversion`, D3b's reading of a page-text number;
- `context.unit` and `context.date`: the unit and the as-of date (an ISO day) that its table states for the columns it was read under;
- `contextEvidence.unit` / `.date`: the page's text each was read from, and where it stands (`… record 0 table caption`, `… record 0 column 4 "19 Oct 2026" header`, `… record 0 table, block 1 before it (span.ratesTimestamp)`).

`json.data` and the schema are not changed. The Evidence Record's `fieldEvidence[…].reading.unit` carries the unit, and `reading` is now non-null for these numbers. The date stays in `json.evidence`, as D3b's context does.

**Where each is read.** extract-tf (`list.ts`) reports, with each column of a selected row, the list fields read from a cell under its header. Once per table (`FetchResult.listTables`, which each column points to by index), it reports the table's own text: its `<caption>`, and the blocks just before it back to and including the heading that introduces it.
- At most 4 blocks are read, each at most 200 characters. A caption longer than that is not read.
- A longer block, a list, a form, a `nav` or another table ends the blocks.
- A table that is the first element of its wrappers is introduced by what stands before them, up to three levels.
- The table's text counts against the columns' character budget once.

The API (`tableContext.ts`) decides what each text states:
- **Unit:**
  - a caption or block that states one: a rate `Units of … per …` (not `Units of study`), `Unit:` / `Currency:` followed by a unit, or `In` / `Figures in` / `Expressed in` followed by a unit. It is kept as written, without the lead-in;
  - a header's trailing bracketed qualifier that is a unit (`Km²`, `P/Km²`, `[EUR]`);
  - a header that is an amount of a currency, or a currency code (`1.00 USD`), as the whole header.
  A unit is a currency code or sign Octocrawl knows, a percent, or a listed measure as it is written (`kW`, `Km²`, `MB`; no capital letter alone), with a scale (`millions`) or a per. So `(est.)`, `(2024)`, prose and a column's abbreviation (`(HR)`, `(G)`, `(W)`) are not units.
- **As-of date:** a header, a header's qualifier or a caption that is one day, with at most a time and zone after it and `As of` / `As at` / `Effective` / `Updated` before it. A block before the table counts only as a timestamp (a time after the day, as V34's) or with such a lead-in: a day alone there can be the page's own date, such as a post's.
  - Not dates: a year, a month, a range, or a date inside a sentence.
  - A column of dates is the rows' data, not an as-of date.
  - The header of another column gives no date.
- **Disagreement:** statements that give different values leave that entry out, with `field_ambiguous` on the value's path; the value stays. The percent or currency the number's own text states (D3b) stays in `context`; a table unit that cannot be it (`Km²` for `17.8%`, `EUR` for `$12.50`) is left out the same way, and one that can (`USD` for `$12.50`, or a scale alone such as `millions` for `€12`, where `m`, `k` and `b` are scales) is given beside it. A table that states neither gives nothing, and no issue: the existing issue codes all mark the json incomplete, and a missing unit is not a missing field.
- `EXTRACTOR_VERSION` is `extract-tf/45`; #702, open, holds `/44`.

**Tests, each failing before the change** (fixtures minimized from V25, V34 and V24):
- `packages/extract-tf/test/list.test.ts`: fields per column, caption, blocks back to the heading, a field inside a link, and the cases that end or skip the blocks.
- `packages/api/test/listJson.test.ts`: V25 caption plus header date, V34 header currency amount plus the timestamp block, V24 qualifier on a #700 column, and a percent in the value's own text.
  Counterexamples: no unit; a prose caption, a range and a year; `Units of study` and `Units of measurement used in this report`; `(HR)`, `(G)`, `(W)`, `(T)`; a day alone before the table; conflicting units; conflicting dates; a date column that is data, beside a date header over another column; a cell percent or currency against a table unit.
- `packages/api/test/listJsonSubject.integration.test.ts`: end to end over HTTP, with the Evidence Record's `reading`.

## Conditions of the run

| Item | Value |
| --- | --- |
| Commit history | `d0ff1e0c` ran first (07:07 UTC). A clean-context review then found four blockers: the table text was copied into every column of every row, outside the budget; measures matched without case, so `(HR)` read as hours; any `Units of …` caption was a unit; a currency in the number's own text was never weighed against the table's unit. It also questioned taking a bare day before the table. `0c4ee9b1` fixes all five as described above. A second review found that a table's scale alone (`Revenue (millions)` over `€12`) was reported as disagreeing with the cell's currency; `a48aea4a` fixes it. All three runs give the same Markdown, list, json and Evidence Record `fieldEvidence` on all 180 requests; the `a48aea4a` run equals `0c4ee9b1`'s on both arms, all 360 responses. The results below are `a48aea4a`'s |
| Engines | control `main` `f0d321dd2b42c8d1a6ff4b2c6f0fd58cb9e0d6a4`, a fresh detached worktree: `npm ci --prefer-offline --ignore-scripts`, then better-sqlite3's built binding copied from this checkout (same version 12.11.1, same lockfile), then `npx tsc --build`. Candidate `a48aea4a` (this branch), `npx tsc --build` after the commit, `dist/` checked to carry `extract-tf/45` |
| Driver, scorer | `research/accuracy/run_dev.mjs --plan --engine` and `holdout_score.py` (R3; `--mapping json` for the json plans, `markdown` otherwise), unchanged on this branch, run from the candidate checkout in `~/Code/w2l/.w2l/pyenv` |
| Sources | Reserved set v2 (seal checked by the driver) on `http://127.0.0.1:8863`; dev and regression set `2026-10-17` (D01–D10, H01–H08) on `http://127.0.0.1:8862` |
| Plans, unchanged | `reserved-plan-list.v2.json` (the list arm), `reserved-plan-json.v2.json` (the off arm), `reserved-plan.v2.json`, `dev-plan.v1.json`, `dev-plan-json.v1.json`, `dev-plan-list.v1.json` |
| Network | Loopback, direct: the proxy variables were removed. No model, no Firecrawl, no live page, no browser; $0 |
| Outputs | `~/Code/w2l/.w2l/field-gold/runs/2026-10-24-f2-table-context-a48aea4a/{dev,dev-json,dev-list,v2,v2-json,v2-list}/{control,candidate}/`, each plan with `field-results.json` and `fields.md`; `whatif/` holds the what-if scores below. The `d0ff1e0c` and `0c4ee9b1` runs are beside it. Not committed |

The first attempt at 07:06 failed for every control case: `--ignore-scripts` had left better-sqlite3 unbuilt. Its outputs were deleted, and both engines were run again from the start.

```sh
R=~/Code/w2l/.w2l/field-gold; P=$R/runs/2026-10-24-f2-table-context-a48aea4a; A=research/accuracy
# label:engine = control:<main f0d321dd worktree>, candidate:<this checkout at a48aea4a>; proxy variables removed
node $A/run_dev.mjs $R/2026-10-17  $P/dev      <label> --plan=$A/dev-plan.v1.json           --engine=<engine>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-json <label> --plan=$A/dev-plan-json.v1.json      --engine=<engine>
node $A/run_dev.mjs $R/2026-10-17  $P/dev-list <label> --plan=$A/dev-plan-list.v1.json      --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2       <label> --plan=$A/reserved-plan.v2.json      --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-json  <label> --plan=$A/reserved-plan-json.v2.json --engine=<engine>
node $A/run_dev.mjs $R/reserved-v2 $P/v2-list  <label> --plan=$A/reserved-plan-list.v2.json --engine=<engine>
~/Code/w2l/.w2l/pyenv/bin/python $A/holdout_score.py $R/reserved-v2 $P/v2-list --mapping json --fixture-origin http://127.0.0.1:8863 \
  --versions control,candidate --cases V01,…,V42 --out $P/v2-list/field-results.json --markdown $P/v2-list/fields.md
# likewise v2 (--mapping markdown), v2-json; dev, dev-json, dev-list with $R/2026-10-17, :8862, --cases D01,…,D10,H01,…,H08
```

## Results with the R3 scorer: control = candidate on every plan

All cases are in every denominator (42 for v2, 18 for D01–D10 plus H01–H08).

| Set and request | Required fully correct | Values correct | Unit preserved | Date preserved | Accepted | False success |
| --- | --- | --- | --- | --- | --- | --- |
| V01–V42, json/verify + list (list arm) | 152/294 | 167 | 7/32 | 46/93 | 5/42 | 4 (V20, V21, V25, V34) |
| V01–V42, json/verify (off arm) | 34/294 | 34 | 7/32 | 1/93 | 1/42 | 0 |
| V01–V42, Markdown | 229/294 | 240 | 20 | 67 | 23/42 | 18 |
| D01–D10 + H01–H08, json/verify + list | 27/215 | 60 | 0/32 | 9/106 | 0/18 | 0 |
| D01–D10 + H01–H08, json/verify | 0/215 | 2 | 0 | 0 | 0/18 | 0 |
| D01–D10 + H01–H08, Markdown | 126/215 | 136 | 27 | 88 | 9/18 | 6 |

The list arm's 152/294, 5 accepted and 4 false successes equal #700's frozen candidate (`90bef962`). Per field, every scored row is the same on both engines. The R3 scorer cannot see this change; the next section says why.

**Every request that changed.** Compared on all 180 requests of the six plans:
- Byte-identical on both engines: Markdown, the `list` output, `json.status`, `json.data` and `json.issues`. No `field_ambiguous` or other issue was added anywhere.
- `json.evidence` changed on six requests, all in the list plans. No key an entry had before changed; the change only adds keys.
  - **V25:** all 21 rates carry `context: { unit: "Units of Foreign Currencies per Australian Dollar", date: "2026-10-19" }`. They are located at `table caption` and `column 4 "19 Oct 2026" header`, as the gold states.
  - **V34:** all 10 rates carry `context: { unit: "1.00 USD", date: "2026-01-01" }`. They are located at `column 2 "1.00 USD" header` and `table, block 1 before it (span.ratesTimestamp)`, as the gold states.
  - **V24:** the 79 `land_area` values carry `unit: "Km²"` from `column 7 "Land Area (Km²)" header`, and the 234 `yearly_change` values carry `unit: "%"` from their own text. `population`, under `Population 2026`, has no date: a year is not one.
  - **D02, D05, D09:** their prices gained `text`/`normalized`/`conversion`, and the currency mark of their own text (`€`, `$`) in `context.currency`, D3b's rule for numbers read from text. No table context: their lists are not tables, or their tables state no unit.
- The Evidence Record's `reading` is now present for these numbers. Its `unit` is the table's unit on V25, V34 and V24's `land_area`, and the text's mark elsewhere.

## How the gold's unit and date would be matched

The R3 scorer's json mapping does not read this. `research/accuracy/json_map.py:37-44` takes a field's unit only from a `currency` property of the same `json.data` object, and only for fields named `*price*`. It takes the date only from the value itself, for a date field, or from a sibling `iso_date` field in the same object. The gold compares `norm(observed)` with the gold value exactly (`holdout_score.py:421-424`). So under `--mapping json`, a known unit or date on a `rate` or `land_area` field is never met, whatever the engine delivers outside `json.data`.

A mapping that matches the gold would do this, for a field whose gold unit or date is known and which json_map leaves empty: take `context.unit` (then `context.currency`) and `context.date` from the `json.evidence` entry whose `path` is the field's pointer. Changing the scorer belongs to the parallel evaluation session. This branch does not edit `research/accuracy`; the proposal is handed over in the sessions' shared notes.

**What-if, not the R3 scorer.** A scratch wrapper outside the repository ran `holdout_score.py` with exactly that addition patched into `json_map.json_mapped`, on these outputs:

| Request | Required fully correct | Unit preserved | Date preserved | Accepted | False success |
| --- | --- | --- | --- | --- | --- |
| v2 list arm, control | 152/294 | 7/32 | 46/93 | 5/42 | 4 |
| v2 list arm, candidate | 164/294 | 19/32 | 52/93 | 7/42 (+V25, V34) | 2 (V20, V21) |
| v2 off arm, either | 34/294 | 7/32 | 1/93 | 1/42 | 0 |
| dev list, either | 27/215 | 0/32 | 9/106 | 0/18 | 0 |

- **Per case:** V25 3 → 6 of 6, V34 3 → 6 of 6. Both cases were false successes: they passed the presence contract with the units and dates missing. They are now accepted.
- **V24:** 3 → 9 of 12. Its `land_area` and `yearly_change` units now match.
- **Unchanged:** no other case. The off arm reads no list, so nothing changes there. D09's price unit stays unmet: the gold's `USD` comes from a currency selector outside the table, and the text's `$` is a different string.
- **Use of these numbers:** they show what the engine output would score under such a mapping. They are not R3 results and not a claim about the live pages.

## Checks

- `npm run typecheck`: passes.
- `npm test` on `a48aea4a` (proxy variables removed): 312 of 313 files and 3886 of 3887 tests pass, 1 todo. The one failure is `packages/bench/test/installedChrome.integration.test.ts` "waits out a check that clears itself, reading the page it then shows, …", which fails on `main` on this Mac too.
- Two clean-context reviews of the diff: the first found the four blockers fixed in `0c4ee9b1`, the second the scale case fixed in `a48aea4a` (Commit history, above). The second also noted, as not blocking, that `Price (min)` reads `min` and `Score (h)` reads `h` as units, abbreviations that are ambiguous; the evidence quotes the header they were read from.

## Not done

- **Live effect not measured.** No live page, Firecrawl or model was called. That the live pages still state the same caption, header and timestamp was not checked.
- **A unit row** is not read. #700's columns need exactly one header row, and a second row of units makes the table give no columns at all. No case in either set has one.
- **Footnotes** are not read.
- **Tables JSON reads without a selected list** (the off arm's page-wide labels and tables) get no table context.
- **The date is not in the Evidence Record.** It is reported in `json.evidence` only, as D3b's context is.
- **A cell's currency mark and a table's unit** are not compared with each other: the mark goes to `context.currency`, the table's unit to `context.unit`. A table stating `USD` over a cell `€5` would carry both.
- **Duplicated date reading.** The day reader in `tableContext.ts` repeats the patterns of `modelEvidence.ts`'s `datesIn`, which is not exported. Merging the two is left as a follow-up.
