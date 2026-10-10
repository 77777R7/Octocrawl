"""Pages as rows with their evidence, for pandas or anything that takes a list of dicts."""

from __future__ import annotations

from typing import Any, Iterable, Optional

#: The columns of `rows()` and `to_pandas()`, in order. A value W2L did not observe is None, never 0 or a guess.
EVIDENCE_COLUMNS = (
    "url",              # the URL the batch or crawl was given (or discovered)
    "status",           # success, partial, empty_verified, blocked, failed, cancelled, budget_exceeded, duplicate
    "reason",           # the failure, block or budget reason; None for other statuses
    "final_url",        # the URL that answered, after redirects
    "fetched_at",       # UTC ISO time the answer was received
    "http_status",
    "lane",             # http, browser_local, provider, ...
    "robots_decision",  # allowed, disallowed, no_robots; None when none was made
    "raw_sha256",       # SHA-256 of the page as read
    "markdown_sha256",  # SHA-256 of the delivered Markdown
    "extractor",        # the extractor version, e.g. extract-tf/5 or pdf-text/1
    "source_commit",    # the W2L commit that ran, when the server declares it
    "cache_state",      # hit or miss when the request asked the cache; None otherwise
    "cached_at",        # on a hit, when the reused result was fetched
    "verification",     # passed, failed or not_requested against the request's task contract; None from a server that does not verify
    "markdown",
)


def _get(value: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def evidence_row(item: dict[str, Any], include_markdown: bool = True) -> dict[str, Any]:
    """One batch item or crawl page as a row of EVIDENCE_COLUMNS, read from its `evidenceRecord`."""
    record: Optional[dict[str, Any]] = item.get("evidenceRecord")
    row = {
        "url": item.get("url"),
        "status": item.get("status"),
        "reason": _get(record, "reason") if record is not None else (item.get("failureReason") or item.get("blockReason") or item.get("budgetExceeded")),
        "final_url": _get(record, "finalUrl"),
        "fetched_at": _get(record, "fetchedAt"),
        "http_status": _get(record, "httpStatus"),
        "lane": _get(record, "lane") if record is not None else item.get("lane"),
        "robots_decision": _get(record, "robotsDecision", "decision"),
        "raw_sha256": _get(record, "rawSha256"),
        "markdown_sha256": _get(record, "outputSha256", "markdown"),
        "extractor": _get(record, "extractor", "version"),
        "source_commit": _get(record, "extractor", "commit"),
        "cache_state": item.get("cacheState"),
        "cached_at": item.get("cachedAt"),
        "verification": _get(item, "verification", "status") or _get(record, "verification", "status"),
        "markdown": item.get("markdown"),
    }
    if not include_markdown:
        row.pop("markdown")
    return row


def evidence_rows(items: Iterable[dict[str, Any]], include_markdown: bool = True) -> list[dict[str, Any]]:
    return [evidence_row(item, include_markdown=include_markdown) for item in items]


def to_pandas(rows: list[dict[str, Any]]):
    try:
        import pandas as pd
    except ImportError as error:  # pragma: no cover - depends on the environment
        raise ImportError("to_pandas needs pandas: pip install 'octocrawl-client[pandas]'") from error
    columns = [column for column in EVIDENCE_COLUMNS if not rows or column in rows[0]]
    frame = pd.DataFrame(rows, columns=columns)
    # Unknown stays missing: an HTTP status W2L did not observe is <NA>, not 0.
    frame["http_status"] = frame["http_status"].astype("Int64")
    return frame
