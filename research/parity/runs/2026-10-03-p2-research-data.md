# Live checks 2026-10-03: the researcher data group (P2)

Source commit: `b5952580dc5682bfa19b7b4f7b9c214f7632d562` (branch `claude/p2-research-data` on `main` at `f01fab5`; the code is `ccbe1c6`, the cases, the runner check and the cross-check script `b595258`), run from the TypeScript sources with `node --import tsx`.
Run: 2026-10-03T04:30:25Z → 04:31:10Z (the runner's clock).
Network: proxied. The local API printed `outbound https: and http: requests use the environment proxy 127.0.0.1:7890` at startup (HTTPS_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local). 12 of the 14 case responses record `evidence.envProxy` 127.0.0.1:7890. PD03 is a `/fc` response, which carries no `evidence`. PD04 was refused before any fetch.
Raw outputs: `.w2l/parity-p2-research-data-2026-10-03/` in the main checkout (git-ignored): `cases/` (the 14 responses and `results.json`), `run.md` (the runner's summary) and `crosscheck.jsonl` (the pandas comparison, one line per table).

Result: 14 of 14 cases, 63 of 63 checks.
- **Tables:** the 10 table pages were frozen before the run. They gave 28 tables. Every table was one GFM table of its Markdown, every row was as wide as its table, and every CSV hash was right. Compared cell by cell with pandas on the same HTML, no cell was shifted. 25 of the 28 tables were equal in every cell, and the other 3 differ for the reasons given below.
- **PDF:** the audit's three M3 PDF features passed their live checks.

## Commands

1. API, after checking that nothing listened on 8837: `W2L_API_PORT=8837 W2L_TASK_ROOT=.w2l/api-p2-rd node --import tsx packages/api/src/cli.ts`
2. Cases: `W2L_API_URL=http://127.0.0.1:8837 node research/parity/run-sites.mjs --only TB01,TB02,TB03,TB04,TB05,TB06,TB07,TB08,TB09,TB10,PD01,PD02,PD03,PD04 --record <scratchpad>/rd-run.md`.
   - The table cases ask for `formats: ["markdown", "tables", "rawHtml"]`.
   - Each one checks `tablesConsistent`:
     - one table per GFM table of the Markdown;
     - `tableIndex` running 0 to n−1;
     - every row `columns` wide;
     - each `csvSha256` the SHA-256 of its `csv`.
3. Cross-check: `.w2l/pyenv/bin/python research/parity/tables-crosscheck.py <run dir> TB01 … TB10`.
   - The environment is a virtualenv with pandas 3.0.6 and lxml 6.1.3.
   - The script reads each response's `rawHtml` (the page as the answering lane received it) with pandas' lxml table reader. That is the reader `read_html` uses, taken before its type inference, with colspan and rowspan repeated as W2L repeats them.
   - For each W2L table it takes the pandas table with the most equal cells and compares every cell after NFKC, whitespace removal and lower-casing.
4. The listener on 8837 was stopped afterwards. The user's MCP host on 8791 was not touched.

## Tables → CSV (ROADMAP P2 row)

| Case | Page | Lane | W2L tables (rows×columns, c = has caption) | pandas tables | Equal in every cell |
| --- | --- | --- | --- | --- | --- |
| TB01 | scrapethissite.com forms (hockey) | http | 26×9 | 1 | 1 of 1 |
| TB02 | webscraper.io test tables | http | 4×4, 4×4 | 2 | 2 of 2 |
| TB03 | webscraper.io multiple header rows | http | 6×4 | 1 | 1 of 1 |
| TB04 | Wikipedia, countries by GDP (nominal) | http | 2×1, 223×4c, 15×3c, 9×2, 10×2, 12×2 | 8 | 4 of 6 |
| TB05 | Wikipedia, countries by population | http | 242×6c, 14×2, 2×2 | 3 | 2 of 3 |
| TB06 | GOV.UK subnational electricity and gas 2024 | http | 9 tables (5×2 to 14×7) | 9 | 9 of 9 |
| TB07 | EIA Electric Power Annual table 1.1 | http | 40×15, 2×1, 9×10 | 5 | 3 of 3 |
| TB08 | books.toscrape.com product page | http | 7×2 | 1 | 1 of 1 |
| TB09 | BLS Employment Situation table A-1 | http, then browser_local | 64×10c | 1 | 1 of 1 |
| TB10 | Our World in Data grapher table | http, then browser_local | 232×6 | 1 | 1 of 1 |

The three tables that are not equal in every cell:

- **TB04 table 2 and TB05 table 0.** Each page has one empty `<tr>`: row 14 of the 15-row table, and row 236 of 242. W2L writes it as a row of empty cells as wide as the table. pandas returns an empty list for it. Both readers keep the row in the same place, and every other cell is equal.
- **TB04 table 5.** This is Wikipedia's "Economic classification of countries" navigation box. Its "Gross domestic product (GDP)" cell holds a small table. W2L writes that inner table as the cell's text, as its Markdown does: 12 rows. pandas lists the inner table's two rows as rows of the outer table: 14 rows. Rows 0 to 3 are equal, and W2L's rows 4 to 11 are pandas' rows 6 to 13.
- **pandas' extra tables** on TB04 and TB07 are one-row and one-cell tables, which W2L does not count as data tables (documented).

What this does not show:
- After this run, the review found that a span repeated into every slot let a small page make a huge CSV. The fix in `b9761a5` caps spans as browsers do and gives a table over 2,000,000 characters as `omitted: "too_large"`; `c924b81` adds one budget of 5,000,000 characters for all of a page's tables and counts each cell's CSV and JSON escaping. Both are unit-tested, each test failing without its fix, and neither was run live. None of the 28 tables here comes near either limit; the largest is 223×4.
- Captions came only from `<caption>`. GOV.UK writes its table titles as a bold paragraph above each table, so its 9 tables have `caption: null`, as documented.
- `onlyMainContent: false`, batch items, crawl pages and the provider lane are covered by fixture tests (`packages/api/test/tables.test.ts`, `packages/extract-tf/test/tables.test.ts`). They were not run live.

## PDF options (the audit's M3)

| Feature | Live check | What the run showed | Verdict |
| --- | --- | --- | --- |
| scrape-formats.pdf-parser | PD01 EIA International Energy Outlook 2023 (corpus R3), PD02 OVHcloud KPIs (S4), PD03 Insee Première (R2), PD04 | PD01 8/8: `parsers: [{ type: "pdf", mode: "fast", maxPages: 2, pages: true, pageMarkers: false }]` answered `success`, `file.pdf.pagesRead` 2 of `pageCount` 70, and a valid Evidence Record. PD02 7/7: `parsers: []` answered `success` with `markdown: null`, the `pdf_not_parsed` file warning and the same file `sha256` as the parsed request. PD03 6/6: `/fc` gave `data.metadata.numPages` 4. PD04 2/2: `mode: "ocr"` was refused with HTTP 400 `unsupported_parameter` before any fetch. | solid |
| scrape-formats.pdf-pages | PD01, PD03 | PD01: `pages` held 2 entries, the second with `pageNumber` 2. PD03: `/fc` with `pages: true` gave 4 entries in `data.pages`. | solid |
| scrape-formats.pdf-page-markers | PD01, PD02, PD03 | PD01: no `<!-- page` line with `pageMarkers: false`. PD02: the native default marked pages 2 and 3. PD03: `/fc` wrote no marker by default, and with `pageMarkers: true` the page 2 marker appeared. | solid |

What this does not show:
- `mode: "auto"` is accepted and reads the same text layer as `fast`. That is shown on fixtures only.
- A scanned PDF stays `failed` / `empty_unverified` (no OCR). That is unchanged and was not run here.
- `llm-agentic.parse.pdf-pages` was not done, as decided on 2026-10-03: it needs `/v2/parse` and file upload, which are Paused.
