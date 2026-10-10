# Brief: find-all-pages-on-a-website

- **Query**: `find all pages on a website` · en-US · desktop · checked 2026-10-10
- **Primary task**: get a complete, checkable list of a site's page URLs without reading every page.
- **Adjacent questions**: where do the URLs come from (sitemap vs links)? why is my list shorter than the site? how to narrow it to one section or keyword? what about robots.txt? how to list pages of a site with no sitemap?
- **content_boundary**: the map call (hosted, MCP, CLI, SDK), a real answer explained, the options that narrow it, path scope, why a list is short or empty.
- **must_not_cover**: crawling and reading every page (one line → local crawl); SEO site audits.
- **Canonical check**: replaces `/docs/guides/map-site/` → **update + move**, 301.

## Demand

Autocomplete: find all pages on a website · … online · see all pages on a website · get all pages on a website · find all available pages on website. Related: "get all urls from a website", "list all urls on a site", "extract sitemap urls". Volume/KD unknown.

## Top 5 (Google, 2026-10-10)

| # | URL | Type | Words | H2s (abridged) | Tables / code / images | Date | JSON-LD |
|---|---|---|---|---|---|---|---|
| 1 | stackoverflow.com/questions/857653 "Get a list of URLs from a site [closed]" | Q&A | 2,291 | 8 answers | 0 / 2 / 2 | asked 2009 | (blocked by tool) |
| 2 | simplescraper.io/extracturls | tool page | 556 | how it works, what to do with URLs, FAQ | 0 / 0 / 2 | none | none |
| 3 | reddit.com/r/cybersecurity/… | forum | not audited | | | | |
| 4 | natiad.com/tools/website-page-counter | tool page | 925 | why use, how to find all pages, use cases, FAQ | 0 / 0 / 0 | none | (blocked by tool) |
| 5 | scrappey.com/tools/url-finder | tool page | 1,307 | why, methods, integration, FAQ | 0 / 2 / 0 | none | Organization, WebSite, BreadcrumbList, FAQPage |

## Gaps

- Tool pages return a list but never say where each URL came from or what was left out and why.
- Nobody explains path scope (starting at /docs gives only /docs) or why a site without a sitemap gives a short list.
- No result shows a real answer with counts.

## Product Connection Contract

| Field | Answer |
|---|---|
| Search problem | A full, explained URL list of a site. |
| Product position | Octocrawl `map`, hosted or local. |
| Placement | First section, with the real run. |
| Reader value | Each URL says where it was found (`via`, `sitemapFile`, `lastmod`); left-out URLs are counted by reason. |
| Not a fit | A site with no sitemap and few links needs a crawl (local); pages only built by JavaScript need a browser scrape; SEO crawl audits (status codes per page) need a crawler. |
| Evidence and link | Runs below; links to /blog/scrape-list-of-urls/ and /blog/web-scraping-for-rag/. |

## Claims to verify

1. Hosted map of modelcontextprotocol.io with `search: "transports"`: URLs, time, refusal counts.
2. `/docs` start vs root start: counts and `subtreeDenied`.
3. MCP `map` compact answer.
4. CLI `npx octocrawl map … --limit 3` (0.3.2).

Existing runs 2026-10-09 12:06–12:15 UTC. Fresh run kept in this folder.

## Visual plan

- Original diagram: start page links + sitemap → scope/robots filters → list and refusal counts.
- Screenshot: terminal with the CLI map output.
- Cover: Golden Gate bridge (mapping a city).
