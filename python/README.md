# w2l (Python)

Python client for the W2L API: web pages as Markdown, tables and JSON, each page with its **Evidence Record** (final URL, fetch time, HTTP status, robots.txt decision, hashes of what was read and delivered), into pandas.

```bash
pip install 'w2l[pandas]'
npx @w2l/cli serve        # a local W2L API on http://127.0.0.1:8787
```

```python
import w2l

result = w2l.batch(
    ["https://books.toscrape.com/", "https://quotes.toscrape.com/"],
    formats=["markdown", "tables"],
)
df = result.to_pandas()          # one row per page
df[["url", "status", "fetched_at", "http_status", "raw_sha256"]]
result.report["succeeded"], result.report["failed"]
```

`to_pandas()` has one row per page, failed pages included, with these columns: `url`, `status`, `reason`, `final_url`, `fetched_at`, `http_status`, `lane`, `robots_decision`, `raw_sha256`, `markdown_sha256`, `extractor`, `source_commit`, `cache_state`, `cached_at` and `markdown`. A value W2L did not observe is missing (`None`, or `<NA>` for `http_status`), never 0. `result.items` keeps each page as the API answered it, its tables (`formats=["tables"]`) and full `evidenceRecord` included.

Options take the API's names in snake_case or camelCase: `max_age=3_600_000`, `only_main_content=False`, `include_tags=["main"]`, `parsers=[{"type": "pdf", "maxPages": 5}]`. `W2L(base_url=..., token=...)` names another API (default `W2L_API_URL`, else http://127.0.0.1:8787; `W2L_API_TOKEN`). A batch takes up to 1,000 URLs; `w2l.scrape`, `w2l.map` and `w2l.crawl` work the same way.

Licence: MIT. Source and the API reference: https://github.com/77777R7/w2l
