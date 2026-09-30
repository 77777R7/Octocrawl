# Seed-user manifest: the Applied Digital release after the table-region fix (2026-09-30)

Single-source check, from the local machine, of the one `sec_filing_html` source the two manifest runs captured: the Applied Digital fiscal Q4 2026 earnings release on `ir.applieddigital.com` (source `APLD-FY26` in [coos-manifest.v1.json](coos-manifest.v1.json), 11 numeric observations). In the [baseline](baseline-2026-09-30.md) and the [re-run](rerun-2026-09-30.md) its markdown was the non-GAAP reconciliation table alone (6,881 chars; `extract {pageType: 'collection', strategy: 'table', confidence: 0.2}`), which left 10 observations `not_found`: the capacity figures in MW and the two financing amounts in the release's prose.

## What changed

`9d68407` — the table strategy no longer returns the largest data table when that table carries less than half of the page's visible text. The region widens to the nearest ancestor that holds half of it (on this page, the cleaned body: the release is 198 sibling `<div>`s and `<table>`s with no `<p>`, its prose in `<div><font>`), so the prose and every table come out in document order, and the output reports the `article` strategy. A table that is most of its page (the scrapethissite forms table, the webscraper.io tables page, a readings table under a heading) is returned as before; fixture tests for both cases are in `packages/extract-tf/test/route.test.ts`.

## How it was run

- REST API started in this checkout from a build of the fix: `W2L_TASK_ROOT=.w2l/api node packages/api/dist/cli.js` (127.0.0.1:8787). The shell had `HTTPS_PROXY=http://127.0.0.1:7890` set, so the API used it as its operator proxy (`proxy_used` in the trace): a proxied fetch from this machine, not a direct one.
- One-URL manifest and the seed-user scripts: `printf '%s\n' '<the release URL>' > .w2l/coos-pilot/urls-applied-digital.txt`, then `node research/coos-pilot/run-baseline.mjs .w2l/coos-pilot/urls-applied-digital.txt .w2l/coos-pilot/run-2026-09-30-apld` (task `21a44ac7-bed4-4c6a-b08a-8514620c8771`, `operatorCheckoutCommit` `9d68407`, 1 URL, 1 completed, 05:03:13–05:03:18 UTC).
- `check-observations.py` was **not** run: the workbook is not on this machine. When `.w2l/coos-pilot/dataset.xlsx` is in place, `python3 research/coos-pilot/check-observations.py --workbook .w2l/coos-pilot/dataset.xlsx --batch .w2l/coos-pilot/run-2026-09-30-apld/batch-items.json` checks the 10 observations against this capture (every other source will report `source_not_in_batch`). Until then the 10 stay `not_found` in the counts above; nothing below is a value-check result.

## Result

| | Re-run (before) | This run (`9d68407`) |
| --- | --- | --- |
| Status / lane | `success` / http | `success` / http, HTTP 200, 485,049 bytes, 1 request, wall 2.3 s |
| Extract trace | collection / table / 0.2 | collection / article / 0.75 |
| Markdown | 6,881 chars, 1 table | 73,619 chars, 650 lines, 13 tables (314 rows) |
| Prose | none | the whole release: highlights, quotes, business descriptions, forward-looking statements, non-GAAP notes |

Strings the re-run record named as missing, looked up in the captured markdown: `$1.59 billion` and `$2.15 billion` are present, and `MW` occurs 17 times (300 MW twice, 200, 210, 150, 75, 175, 286, 1,410, 100, 106 and 180 MW). Whether these are the workbook's 10 rows is for the check script to say.

Every one of the 13 `<table>` elements is in the markdown, in document order, including the six two-row "title" tables that precede each statement (they come out as one-row tables with mostly empty cells). No digit is glued to a following letter anywhere in the text.

## Other table pages on the same build

Sandbox pages, one `curl` GET each, extractor run offline on the capture: webscraper.io `test-sites/tables` — `table` strategy, both tables with headers, 3 rows each, as in the first live batch; scrapethissite forms `per_page=100` — `table`, 100 rows plus header; `per_page=25` — routed `collection`/`article` before and after (its 25 pagination items keep it off the table rule), 25 rows plus header.

## Fetch count

The release was fetched three times from this machine for this change: one `curl` GET to profile the HTML and shape the fixture, one REST `POST /v1/scrape` with `debug: true`, and the batch run above (the record of the change). Three sandbox pages once each. No other site was touched.

## Follow-ups

- Run `check-observations.py` on this capture once the workbook is local, or fold the URL into the next 72-URL run.
- The six statement-title tables could be folded into the statement that follows; harmless for the value check.
