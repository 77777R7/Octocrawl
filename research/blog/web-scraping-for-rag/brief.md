# Brief: web-scraping-for-rag

- **Query**: `web scraping for rag` · en-US · desktop · checked 2026-10-10
- **Primary task**: turn web pages into clean text chunks for a retrieval pipeline, each chunk traceable to its source.
- **Adjacent questions**: why Markdown rather than HTML for an LLM? how to split pages into chunks? how to avoid re-embedding unchanged pages? which pages failed and what to do with them? how to count tokens?
- **content_boundary**: one page → Markdown with its evidence; what the Markdown keeps; many pages with map + batch; a chunking script that keeps URL, fetch time and hash; dedupe on the Markdown hash; filter on status.
- **must_not_cover**: choosing a vector database or embedding model (out of scope, one line); finding the pages (→ find-all-pages-on-a-website); bulk lists in depth (→ scrape-list-of-urls).
- **Canonical check**: replaces `/docs/guides/rag-markdown/` → **update + move**, 301.

## Demand

Autocomplete: web scraping for rag · web scraper for rag · web scraping vs rag · best web scraper for rag. Related: "website to markdown for llm", "url to markdown for llm", "convert website to markdown for llm". Volume/KD unknown.

## Top 5 (Google, 2026-10-10)

| # | URL | Type | Words | H2s (abridged) | Tables / code / images | Date | JSON-LD |
|---|---|---|---|---|---|---|---|
| 1 | browserless.io/blog/web-scraping-for-rag | tutorial | 4,624 | what scraping adds, pipeline, best stack, headless browsers ranked, proxies, LLM-ready, legal | 1 / 8 / 1 | none | (blocked by tool) |
| 2 | medium.com/@shravankoninti/mastering-rag… | tutorial | 1,465 | none | 0 / 12 / 1 | 2024-08-24 | SocialMediaPosting |
| 3 | reddit.com/r/Rag/… "What web scraper do you use…" | forum | not audited | | | | |
| 4 | firecrawl.dev/glossary/…/what-is-web-scraping-for-rag | glossary | 529 | TL;DR, what is, requirements, why quality matters | 0 / 0 / 0 | Jan 26, 2026 | none |
| 5 | zenrows.com/blog/crawl4ai | tutorial | 5,034 | Crawl4AI features, chunking strategies, limitations, managed API | 0 / 19 / 1 | none | (blocked by tool) |

## Gaps

- All explain scraping and chunking; none makes each chunk carry a verifiable source (URL, fetch time, hash of the exact text).
- None explains deduplicating on a hash of the delivered text rather than the raw body, which changes between fetches on many sites.
- None keeps failed pages in the result and shows filtering by status.
- Token counts are presented without saying how they were counted.

## Product Connection Contract

| Field | Answer |
|---|---|
| Search problem | Clean, citable chunks from web pages for RAG. |
| Product position | Octocrawl is the fetch-and-extract layer before your chunker and embedder. |
| Placement | First section (one page), then map + batch, then the script. |
| Reader value | Markdown with tables and code kept, plus `finalUrl`, `fetchedAt` and `outputSha256.markdown` per page for citations and dedupe. |
| Not a fit | Octocrawl does not chunk or embed; JavaScript-only pages need the browser lane (local or key); scanned PDFs have no text layer (no OCR). |
| Evidence and link | Runs below; links to /blog/find-all-pages-on-a-website/ and /docs/reference/#evidence-record. |

## Claims to verify

1. Hosted scrape of docs.python.org/3/library/json.html: status, characters, headings, tables, code blocks, contentTokens; GFM table excerpt; `outputSha256.markdown` equals SHA-256 of the delivered Markdown.
2. map + batch of six tutorial pages with octocrawl 0.3.2: success count, time, files in `--out`.
3. The published Python script, run as is with octocrawl-client 0.3.2: chunk count and a real chunk.
4. Same Markdown hash across hosted and local runs.
5. A failing URL in a batch comes back `failed` with a reason.

Existing runs 2026-10-09 18:17–18:18 UTC (`scratchpad/rag`). Fresh run kept in this folder.

## Visual plan

- Original diagram: page → Markdown + evidence → chunks with source fields.
- Screenshot: the `out/` folder listing and `results.csv` opened.
- Cover: high-speed train on a viaduct.
