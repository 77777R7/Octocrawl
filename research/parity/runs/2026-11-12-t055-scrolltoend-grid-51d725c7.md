# Real-site run 2026-11-12: scrollToEnd on a virtualised grid (access task T055)

Question: does `scrollToEnd` leave rows out of a real page whose list is virtualised, as the local fixtures in `packages/bench/test/listActions.integration.test.ts` (#955) show it can?

Source commit: `51d725c7` (origin/main, release 0.8.13); `npx tsc --build` run before the API started, so `dist/` matches the source.
Method: hand-run, not produced by `run-sites.mjs` or `run-set.mjs`. The local API was started with `W2L_API_PORT=8801 npm run api` and each read below was one `POST http://127.0.0.1:8801/v1/scrape`. Each arm was read once, on 2026-11-12; nothing was repeated, so run-to-run variation is unknown.
Network: proxied. `HTTPS_PROXY` / `HTTP_PROXY` (127.0.0.1:7890) were set in the shell and local mode follows them. The reference data below was fetched with `curl` in the same shell; whether it went through the proxy was not recorded.
URL: `https://ec.europa.eu/eurostat/databrowser/view/tps00001/default/table` (task T055 in `research/access/tasks.v1.json`).
Raw responses and scripts stayed outside the repository.

## Reference

Eurostat's dissemination API, `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tps00001?format=JSON&lang=EN` (dataset updated 2026-10-27): 54 `geo` values × 12 `time` values (2015–2026) = 648 cells, 581 with a value.

## Reads

| Arm | Request (besides `url`, `formats: ["markdown"]`) | Status | Rows read | Years read | Cells compared with the reference |
| --- | --- | --- | --- | --- | --- |
| A | none (`rawHtml` also asked) | success, warning `low_content_yield`, readiness `ready` | 0 (Markdown is 543 characters, no table) | none | none |
| B | `waitFor: 12000` | success, readiness `ready`, no warning | 54 of 54 | 2019–2026 (8 of 12) | 380 equal, 52 empty in both, 0 different |
| C | actions: wait for `.ag-row`; `scrollToEnd` with `itemSelector: ".ag-center-cols-container .ag-row"`, `waitMs: 1000`; wait 1500 ms | success; list step `stoppedBy: end`, `rounds: 2`, `items: 54` | 54 of 54 | 2019–2026 (8 of 12) | same Markdown size and columns as B |
| D | as C, with `selector: ".ag-body-viewport"` on the `scrollToEnd` | success; `stoppedBy: end`, `rounds: 2`, `items: 54` | 54 of 54 | 2019–2026 (8 of 12) | same as C |
| E | actions: wait for `.ag-row`; wait 3000 ms; `executeJavascript` setting `scrollLeft = 0` on `.ag-center-cols-viewport`; wait 2000 ms | success | 54 of 54 | 2015–2022 (8 of 12) | 395 equal, 37 empty in both, 0 different |

In arms B and E, 24 of the 456 cells in the Markdown were not compared: the script could not match their row names to a reference `geo` label (not investigated). The 2015–2018 and 2023–2026 columns are each absent from one of B and E.

From the page itself (arm B's `rawHtml`, arm E's script result):

- `aria-rowcount="56"`: the 54 `geo` rows plus 2 header rows, all present in the DOM. Rows are not virtualised here.
- `aria-colcount="14"`, but only 8 year columns (`col-id` 2019–2026) are in the DOM. The 14th column was not identified.
- The scrolling viewport had `scrollWidth` 1680, `clientWidth` 875 and `scrollLeft` 805 before arm E moved it to 0.

## What this shows

- On this page `scrollToEnd` read every row, and its report (`items: 54`, `stoppedBy: end`) was right. The vertical gap pinned by #955's fixtures did not show here.
- The grid is virtualised by columns. No read in arms A–D contains 2015–2018, and `scrollToEnd` and `scroll` move only vertically (`direction` is `up` or `down`, `packages/contracts/src/actions.ts`), so neither reaches them. Moving the grid left with `executeJavascript` brings 2015–2022 and drops 2023–2026: the two reads B and E together cover all 12 years, no single read does.
- Every read above has status `success` and readiness `ready`. None warns that 4 of the 12 year columns are not in the Markdown.
- A read with no wait (arm A) returns `success` with no table.

## Not established

- The extra 14th column.
- Whether the page's default view is meant to show 8 years.
- Whether other real pages are virtualised by rows, which would be the case the fixtures cover. This run found none.
- Run-to-run variation (one read per arm).
