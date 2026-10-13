# Outside claims in the 2026-10-13 rewrite, read 2026-10-13

Read from each vendor's own page (raw HTML checked, not a fetch summary).

| Claim in the article | Source | Quoted |
| --- | --- | --- |
| Screaming Frog free crawls up to 500 URLs | https://www.screamingfrog.co.uk/seo-spider/ | "The free version is restricted to crawling up to 500 URLs in a single crawl." |
| Screaming Frog free doesn't render JavaScript | same page | "advanced features such as JavaScript rendering, custom extraction, and API integrations are also restricted"; the comparison table marks JavaScript Rendering as a cross for free |
| `site:` is not exhaustive | https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site | "The list of URLs returned is not always exhaustive." |
| Pages report: up to 1,000 example URLs | https://support.google.com/webmasters/answer/7440203 | "the list of example URLs in the report is limited to 1,000 items" |
| Wayback CDX `url=domain/*`, `collapse=urlkey` | https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server | "If url is ends in '/*' … the query is equivalent to url=archive.org/&matchType=prefix"; collapse=urlkey example |
| Common Crawl index `url=domain/*`, `output=json` | https://commoncrawl.org/blog/announcing-the-common-crawl-index | wildcard `url=wikipedia.org/*`; "Adding the output=json option to the query will ensure the full line is json." |
