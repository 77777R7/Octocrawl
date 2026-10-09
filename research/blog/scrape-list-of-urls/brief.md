# Brief: scrape-list-of-urls

- **Query**: `scrape list of urls` · en-US · desktop · checked 2026-10-10
- **Primary task**: read a known list of URLs into one result set, with every failure kept and explained.
- **Adjacent questions**: how many at once? what happens to failed URLs? can it resume after a crash? how do I page through results? CSV output?
- **content_boundary**: batch from a URL file (CLI) and over MCP/REST, outputs (`--out`: Markdown per page, results.csv, results.jsonl), paging through items, keeping failures, limits.
- **must_not_cover**: finding the URLs (→ find-all-pages-on-a-website); chunking for RAG (→ web-scraping-for-rag).
- **Canonical check**: replaces `/docs/guides/batch-results/` → **update + move**, 301.

## Demand

Autocomplete: scrape list of urls · web scraper list of urls · scrape data from list of urls. Related: "scrape multiple urls", "firecrawl scrape multiple urls", "batch scrape". Volume/KD unknown.

## Top 5 (Google, 2026-10-10)

| # | URL | Type | Words | H2s / approach | Tables / code / images | Date | JSON-LD |
|---|---|---|---|---|---|---|---|
| 1 | simplescraper.io/features/scrape-list-of-urls | feature page | 552 | turn links into data, FAQ | 1 / 0 / 0 | none | FAQPage |
| 2 | octoparse.com/blog/scrape-data-from-multiple-urls | tutorial | 2,328 | use cases, no-code, Python, best practices, which method | 1 / 7 / 1 | none | Article |
| 3 | forum.webscraper.io/t/…/5200 | forum | 57 | none | 0 / 0 / 0 | 2020-04-11 | WebSite |
| 4 | chromewebstore.google.com/… Simplescraper | extension listing | not audited (store listing) | | | | |
| 5 | firecrawl.dev/tools/url-extractor | tool page | 1,261 | how it works, who it's for, FAQ | 1 / 0 / 0 | none | SoftwareApplication, FAQPage |

## Gaps

- None shows what happens to the URLs that fail, or keeps them in the output with a reason.
- None shows resuming or paging through a long result set.
- Result 5 extracts links, which is a different task (finding URLs, not reading them).

## Product Connection Contract

| Field | Answer |
|---|---|
| Search problem | Read a URL list reliably and account for every row. |
| Product position | Octocrawl batch, on your own computer (not hosted). |
| Placement | First section, with the real run. |
| Reader value | One row per URL, failures kept with reason, evidence columns per row, Markdown files written for you. |
| Not a fit | Hosted Octocrawl does not batch (scrape one by one there); more than 1,000 URLs need several batches; pages behind login need the my-browser lane. |
| Evidence and link | Runs below; links to /blog/find-all-pages-on-a-website/. |

## Claims to verify

1. `npx octocrawl@0.3.2 batch --urls-file urls.txt --formats markdown --out out` on a list with one failing URL: per-row status, failure reason, files written, time.
2. results.csv columns as written.
3. MCP `batch_scrape` → `get_batch_items` paging, if run.
4. Limit: 1 to 1,000 URLs per batch.

## Visual plan

- Screenshot: results.csv opened, with the failed row visible.
- Original diagram: URL list → batch → per-row status and files.
- Cover: sailboat on a mountain lake.
