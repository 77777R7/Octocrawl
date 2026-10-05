"""The Octocrawl API over HTTP: scrape, map, batch and crawl, each page with its Evidence Record."""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Optional, Sequence

import httpx

from ._version import __version__
from .frame import evidence_rows, to_pandas

DEFAULT_BASE_URL = "http://127.0.0.1:8787"
#: What the client records as the `origin` of every request, for W2L's own records; nothing goes to the target.
ORIGIN = f"py-sdk@{__version__}"
#: The most URLs one batch takes (the API's limit).
MAX_BATCH_URLS = 1000
TERMINAL = ("completed", "failed", "cancelled")

# Option names whose acronym the plain snake_case → camelCase rule would spell wrong.
_ACRONYMS = {
    "regex_on_full_url": "regexOnFullURL",
    "ignore_invalid_urls": "ignoreInvalidURLs",
    "deduplicate_similar_urls": "deduplicateSimilarURLs",
}


def api_name(key: str) -> str:
    """`max_age` → `maxAge`; a name already in camelCase is kept as it is."""
    if key in _ACRONYMS:
        return _ACRONYMS[key]
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), key)


def _options(options: Mapping[str, Any]) -> dict[str, Any]:
    return {api_name(key): value for key, value in options.items() if value is not None}


class W2LError(Exception):
    """An answer of the API that is not a result: a refused request (400), an unknown id (404), a rate limit (429), ..."""

    def __init__(self, status: int, message: str, code: Optional[str] = None, details: Any = None, agent_hints: Optional[list[str]] = None):
        super().__init__(f"{status} {code or 'error'}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        self.agent_hints = agent_hints or []


@dataclass
class JobResult:
    """A finished batch or crawl: its final report and every page it recorded, failed ones included."""

    task_id: str
    report: dict[str, Any]
    items: list[dict[str, Any]] = field(default_factory=list)

    def rows(self, include_markdown: bool = True) -> list[dict[str, Any]]:
        """One row per page with the evidence columns (see `EVIDENCE_COLUMNS`)."""
        return evidence_rows(self.items, include_markdown=include_markdown)

    def to_pandas(self, include_markdown: bool = True):
        """A pandas DataFrame with one row per page and the evidence columns; needs `pip install 'octocrawl-client[pandas]'`."""
        return to_pandas(self.rows(include_markdown=include_markdown))


class W2L:
    """A client of one Octocrawl API: a local `octocrawl serve` (default `W2L_API_URL`, else http://127.0.0.1:8787) or a hosted one with a token."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        *,
        timeout: float = 330.0,
        poll_interval: float = 1.0,
        transport: Optional[httpx.BaseTransport] = None,
    ):
        self.base_url = (base_url or os.environ.get("W2L_API_URL") or DEFAULT_BASE_URL).rstrip("/")
        token = token if token is not None else os.environ.get("W2L_API_TOKEN") or None
        headers = {"user-agent": ORIGIN}
        if token:
            headers["authorization"] = f"Bearer {token}"
        # A scrape is answered at its deadline (up to 300 s), so reads wait a little longer than that.
        self._http = httpx.Client(base_url=self.base_url, headers=headers, timeout=timeout, transport=transport)
        self.poll_interval = poll_interval

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "W2L":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _call(self, method: str, path: str, *, retries: int = 0, **kwargs: Any) -> Any:
        """One API call; with `retries`, a network error, a 5xx or a 429 is tried again (a poll or a page read, never a start)."""
        for attempt in range(retries + 1):
            try:
                response = self._http.request(method, path, **kwargs)
            except httpx.TransportError:
                if attempt == retries:
                    raise
                time.sleep(min(2 ** attempt, 10))
                continue
            if (response.status_code >= 500 or response.status_code == 429) and attempt < retries:
                time.sleep(min(float(response.headers.get("retry-after", 2 ** attempt)), 30))
                continue
            break
        if response.status_code >= 400:
            try:
                body = response.json()
            except ValueError:
                body = {"error": response.text}
            raise W2LError(response.status_code, str(body.get("error", "")), body.get("code"), body.get("details"), body.get("agentHints"))
        return response.json()

    def scrape(self, url: str, **options: Any) -> dict[str, Any]:
        """One page: the scrape response with its `evidenceRecord` (compact unless `debug=True`)."""
        return self._call("POST", "/v1/scrape", json={"debug": False, **_options(options), "url": url, "origin": ORIGIN})

    def map(self, url: str, **options: Any) -> dict[str, Any]:
        """A site's URLs from its sitemaps and start page, without fetching each page."""
        return self._call("POST", "/v1/map", json={**_options(options), "url": url, "origin": ORIGIN})

    def batch(self, urls: Iterable[str], *, wait_timeout: Optional[float] = None, **options: Any) -> JobResult:
        """Scrape up to 1,000 URLs as one batch, wait until it ends, and return its report and every item."""
        urls = list(urls)
        if not urls:
            raise ValueError("batch takes at least one URL")
        if len(urls) > MAX_BATCH_URLS:
            raise ValueError(f"a batch takes at most {MAX_BATCH_URLS} URLs; split the list and call batch for each part")
        accepted = self._call("POST", "/v1/batches", json={**_options(options), "urls": urls, "origin": ORIGIN})
        task_id = accepted["taskId"]
        report = self._wait(f"/v1/batches/{task_id}", wait_timeout)
        return JobResult(task_id, report, self._items(f"/v1/batches/{task_id}/items"))

    def crawl(self, url: str, *, wait_timeout: Optional[float] = None, **options: Any) -> JobResult:
        """Crawl from `url`, wait until the crawl ends, and return its report and every page of its latest attempt."""
        accepted = self._call("POST", "/v1/crawl", json={**_options(options), "url": url, "origin": ORIGIN})
        task_id = accepted["taskId"]
        report = self._wait(f"/v1/crawl/{task_id}", wait_timeout)
        return JobResult(task_id, report, self._items(f"/v1/crawl/{task_id}/pages") + self._items(f"/v1/crawl/{task_id}/errors"))

    def _wait(self, path: str, wait_timeout: Optional[float]) -> dict[str, Any]:
        deadline = None if wait_timeout is None else time.monotonic() + wait_timeout
        while True:
            report = self._call("GET", path, retries=5)
            if report.get("status") in TERMINAL:
                return report
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError(f"{path} is still {report.get('status')} after {wait_timeout} s; it keeps running on the server")
            time.sleep(self.poll_interval)

    def _items(self, path: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        cursor: Optional[str] = None
        while True:
            params: dict[str, Any] = {"limit": 50}
            if cursor is not None:
                params["cursor"] = cursor
            page = self._call("GET", path, params=params, retries=5)
            items.extend(page.get("items", []))
            cursor = page.get("nextCursor")
            if not page.get("hasMore"):
                return items
            if cursor is None:
                raise W2LError(200, f"{path} says it has more items but gives no cursor; {len(items)} items read so far")


def _default() -> W2L:
    return W2L()


def scrape(url: str, **options: Any) -> dict[str, Any]:
    """`W2L().scrape(...)` on the API named by `W2L_API_URL` (default http://127.0.0.1:8787)."""
    with _default() as client:
        return client.scrape(url, **options)


def map(url: str, **options: Any) -> dict[str, Any]:  # noqa: A001 - the API's own name
    """`W2L().map(...)` on the API named by `W2L_API_URL`."""
    with _default() as client:
        return client.map(url, **options)


def batch(urls: Sequence[str], **options: Any) -> JobResult:
    """`W2L().batch(...)`: `octocrawl_client.batch(urls).to_pandas()` gives one row per page with its evidence."""
    with _default() as client:
        return client.batch(urls, **options)


def crawl(url: str, **options: Any) -> JobResult:
    """`W2L().crawl(...)` on the API named by `W2L_API_URL`."""
    with _default() as client:
        return client.crawl(url, **options)
