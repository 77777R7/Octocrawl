# Real-site run 2026-10-06: hydration JSON parsed only where the answer is used

Follows [2026-10-06-oxylabs-browser-render-proxied-9a51b96.md](2026-10-06-oxylabs-browser-render-proxied-9a51b96.md).

## The problem

At `9a51b96`, `rawSignals` (`packages/extract-tf/src/render.ts`) did the following for every page:
- parsed each hydration JSON block (`__NEXT_DATA__`, or application/json of 2000 characters or more, up to 5 MB);
- collected the blocks' passages of text;
- searched the page's visible text for each passage.

Only one place uses the answer: the `hydration_shell` exemption, for a product page whose buy box the router found.

## Fix (`7fcddb5`)

- `rawSignals` keeps the JSON text unparsed.
- `extract.ts` calls `hydrationShown` after routing, only when `RouteDecision.buyBox` is set.
- The passages are compared with the cleaned page before its recommendations are cut, instead of with the raw page's visible text. That text is a subset of the old one, so the answer can only change from shown to not shown, which keeps `hydration_shell`, the conservative direction.

## Timing, on synthetic pages

**The pages:** three pages of about 5.7 MB were generated in a scratch directory, each with a 5.0 MB `__NEXT_DATA__` of 20,000 items:
- **listing:** 3000 cards from the start of the data;
- **worst:** 3000 cards from the end of the data, which the passage walk reaches first, so every passage it checks is shown;
- **product:** a buy-box product page whose related section holds the same 3000 cards.

**How it was timed:** `rawSignals` and `extractTf.extract`, three runs each after a warm-up.

| Page | `437d500` rawSignals ms | `9a51b96` rawSignals ms | `7fcddb5` rawSignals ms | `7fcddb5` extract ms |
| --- | --- | --- | --- | --- |
| worst | 6, 7, 6 | 48, 31, 31 | 5, 6, 5 | 160, 125, 124 |
| listing | 5, 5, 4 | 23, 12, 14 | 5, 5, 4 | 120, 125, 120 |
| product | 6, 5, 4 | 18, 18, 17 | 5, 5, 5 | 70, 84, 70 |

- The product page still pays for the parse, in `extract.ts` rather than in `rawSignals`. Its whole extraction took 70–84 ms, against 58–73 ms at `437d500`.
- The `9a51b96` and `437d500` figures were measured in the same session, with the earlier code put back in place for each measurement.
- The clean-context review of `9a51b96` measured 146 ms in `rawSignals` on its own 5.45 MB page. That page was not kept, so it was not re-measured here.

## Tests

`packages/extract-tf/test/route.test.ts`, "reads its hydration data's text only on a page whose buy box the router found":
- A listing with a 400-item data blob is extracted, and the test checks that no `JSON.parse` call receives a string over 20,000 characters.
- The oxylabs-shaped product page is extracted, and the test checks that its data blob is parsed.

The test failed before the change. Moving the buy-box condition after the parse fails it.

## Comparison: 184 saved pages

The same 184 pages as the record this follows were read with `9a51b96`'s and `7fcddb5`'s code. No page changed its Markdown, `render.reason`, confidence or page type.

## API runs at `7fcddb5`

The runs were proxied through the shell's `HTTPS_PROXY` (127.0.0.1:7890) at 04:15 UTC on 2026-10-06, each with `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`. Every response records `evidence.envProxy: 127.0.0.1:7890`.

| URL | Scrape | Result | Page type / confidence | Markdown | Warnings | Wall ms |
| --- | --- | --- | --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products/1 | `202b0744-6ef9-4c2a-b9e5-f834585a5aa0` | `success`, http | product / 0.45 | 539 | none | 1716 |
| https://sandbox.oxylabs.io/products/20 | `9ef0314c-3afb-4072-8f97-aa6d9a4e2075` | `success`, http | product / 0.45 | 476 | none | 496 |
| https://sandbox.oxylabs.io/products/1836 | `462930d5-e5ca-4bb2-b734-aadaf887bab1` | `success`, http | product / 0.45 | 701 | none | 498 |
| https://sandbox.oxylabs.io/products | `6d160efd-f62c-48be-88e8-7882cff68081` | `success`, http | article / 1 | 24262 | none | 690 |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `0f5c3572-93e3-4153-8622-4d3daca68879` | `success`, http | product / 0.75 | 1586 | none | 2409 |

Raw responses are under `.w2l/parity/2026-10-06-hydration-perf/` (git-ignored).

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/2026-10-06-lists-proxied-7fcddb5.md`, proxied, at `7fcddb5`, passed 8/8 cases and 34/34 checks, with the same page types and strategies as earlier runs.

## Checks

At `7fcddb5`:
- `npm run typecheck`: passed.
- `npm test`: 185 files, 2249 tests passed.
