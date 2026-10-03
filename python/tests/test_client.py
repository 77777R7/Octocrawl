import json

import httpx
import pytest

import w2l
from w2l import EVIDENCE_COLUMNS, W2L, W2LError, api_name

RECORD = {
    "schemaVersion": "w2l.evidence/1", "requestedUrl": "https://a.example/", "finalUrl": "https://a.example/", "fetchedAt": "2026-10-03T08:00:00.000Z",
    "httpStatus": 200, "status": "success", "reason": None, "lane": "http",
    "robotsDecision": {"decision": "allowed"}, "rawSha256": "a" * 64, "outputSha256": {"markdown": "b" * 64, "json": None},
    "extractor": {"name": "extract-tf", "version": "extract-tf/5", "commit": None},
}
ITEMS = [
    {"id": "1", "url": "https://a.example/", "status": "success", "markdown": "# A", "evidenceRecord": RECORD, "cacheState": "hit", "cachedAt": "2026-10-03T08:00:00.000Z"},
    {"id": "2", "url": "https://b.example/", "status": "failed", "failureReason": "dns_error", "markdown": None, "evidenceRecord": {**RECORD, "requestedUrl": "https://b.example/", "finalUrl": None, "fetchedAt": None, "httpStatus": None, "status": "failed", "reason": "dns_error", "robotsDecision": None, "rawSha256": None, "outputSha256": {"markdown": None, "json": None}}},
    {"id": "3", "url": "https://c.example/", "status": "pending", "markdown": None, "evidenceRecord": None},
]


def api(calls):
    """A fake W2L API: a batch that is running on the first poll and completed on the second, with its items on two pages."""
    polls = {"n": 0}

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, dict(request.url.params), json.loads(request.content) if request.content else None, request.headers.get("authorization")))
        if request.method == "POST" and request.url.path == "/v1/batches":
            return httpx.Response(202, json={"taskId": "t1"})
        if request.url.path == "/v1/batches/t1":
            polls["n"] += 1
            return httpx.Response(200, json={"taskId": "t1", "status": "running" if polls["n"] == 1 else "completed", "succeeded": 1, "failed": 1})
        if request.url.path == "/v1/batches/t1/items":
            first = request.url.params.get("cursor") is None
            return httpx.Response(200, json={"items": ITEMS[:2] if first else ITEMS[2:], "hasMore": first, "nextCursor": "c2" if first else None})
        if request.url.path == "/v1/scrape":
            body = json.loads(request.content)
            if body.get("maxAge") == -1:
                return httpx.Response(400, json={"error": "maxAge must be an integer number of milliseconds from 0 to 315360000000", "code": "invalid_request"})
            return httpx.Response(200, json={"status": "success", "markdown": "# A", "evidenceRecord": RECORD})
        return httpx.Response(404, json={"error": "not found", "code": "not_found"})

    return httpx.MockTransport(handle)


def test_batch_waits_pages_and_gives_evidence_rows():
    calls = []
    client = W2L("http://w2l.test", token="t0k", poll_interval=0, transport=api(calls))
    result = client.batch(["https://a.example/", "https://b.example/", "https://c.example/"], formats=["markdown", "tables"], max_age=3_600_000, ignore_invalid_urls=True)
    method, path, _, body, auth = calls[0]
    assert (method, path, auth) == ("POST", "/v1/batches", "Bearer t0k")
    assert body == {"formats": ["markdown", "tables"], "maxAge": 3_600_000, "ignoreInvalidURLs": True, "urls": ["https://a.example/", "https://b.example/", "https://c.example/"], "origin": w2l.ORIGIN}
    assert [c[1] for c in calls].count("/v1/batches/t1") == 2
    assert [c[2] for c in calls if c[1] == "/v1/batches/t1/items"] == [{"limit": "50"}, {"limit": "50", "cursor": "c2"}]
    assert result.task_id == "t1" and result.report["status"] == "completed" and len(result.items) == 3

    rows = result.rows()
    assert list(rows[0]) == list(EVIDENCE_COLUMNS)
    assert rows[0] == {
        "url": "https://a.example/", "status": "success", "reason": None, "final_url": "https://a.example/", "fetched_at": "2026-10-03T08:00:00.000Z",
        "http_status": 200, "lane": "http", "robots_decision": "allowed", "raw_sha256": "a" * 64, "markdown_sha256": "b" * 64,
        "extractor": "extract-tf/5", "source_commit": None, "cache_state": "hit", "cached_at": "2026-10-03T08:00:00.000Z", "markdown": "# A",
    }
    # Unknown stays None: no fetch time, no status, no hash for a page that was not read; no record at all for one without a result.
    assert rows[1]["reason"] == "dns_error" and rows[1]["http_status"] is None and rows[1]["fetched_at"] is None
    assert rows[2]["status"] == "pending" and rows[2]["final_url"] is None and rows[2]["lane"] is None


def test_to_pandas_keeps_unknown_missing():
    pd = pytest.importorskip("pandas")
    client = W2L("http://w2l.test", poll_interval=0, transport=api([]))
    frame = client.batch(["https://a.example/", "https://b.example/", "https://c.example/"]).to_pandas(include_markdown=False)
    assert list(frame.columns) == [c for c in EVIDENCE_COLUMNS if c != "markdown"]
    assert frame["http_status"].tolist()[0] == 200
    assert pd.isna(frame["http_status"].tolist()[1]) and pd.isna(frame["http_status"].tolist()[2])
    assert str(frame["http_status"].dtype) == "Int64"


def test_errors_carry_the_api_code_and_options_are_named_as_the_api_names_them():
    client = W2L("http://w2l.test", transport=api([]))
    with pytest.raises(W2LError) as error:
        client.scrape("https://a.example/", max_age=-1)
    assert error.value.status == 400 and error.value.code == "invalid_request" and "maxAge must be" in error.value.message
    assert client.scrape("https://a.example/")["evidenceRecord"]["status"] == "success"
    assert api_name("only_main_content") == "onlyMainContent"
    assert api_name("regex_on_full_url") == "regexOnFullURL"
    assert api_name("deduplicate_similar_urls") == "deduplicateSimilarURLs"
    assert api_name("maxAge") == "maxAge"
    with pytest.raises(ValueError):
        client.batch(["https://a.example/"] * 1001)
    with pytest.raises(ValueError):
        client.batch([])


def test_the_base_url_and_token_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("W2L_API_URL", "http://env.test:9000/")
    monkeypatch.setenv("W2L_API_TOKEN", "envtok")
    calls = []
    client = W2L(transport=api(calls))
    assert client.base_url == "http://env.test:9000"
    client.scrape("https://a.example/")
    assert calls[0][4] == "Bearer envtok"
