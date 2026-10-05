"""Octocrawl: web pages as Markdown, tables and JSON, each with its Evidence Record.

    import octocrawl_client
    df = octocrawl_client.batch(["https://example.com/a", "https://example.com/b"], formats=["markdown", "tables"]).to_pandas()

The client talks to an Octocrawl API: `npx octocrawl serve` runs one locally (http://127.0.0.1:8787,
or set W2L_API_URL; W2L_API_TOKEN for a hosted one).
"""

from ._version import __version__
from .client import DEFAULT_BASE_URL, MAX_BATCH_URLS, ORIGIN, W2L, JobResult, W2LError, api_name, batch, crawl, map, scrape
from .frame import EVIDENCE_COLUMNS, evidence_row, evidence_rows

__all__ = [
    "__version__", "W2L", "W2LError", "JobResult", "batch", "crawl", "map", "scrape", "api_name",
    "EVIDENCE_COLUMNS", "evidence_row", "evidence_rows", "DEFAULT_BASE_URL", "MAX_BATCH_URLS", "ORIGIN",
]
