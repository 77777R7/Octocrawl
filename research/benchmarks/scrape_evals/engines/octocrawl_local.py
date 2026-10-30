"""scrape-evals engine for a local Octocrawl API (POST /v1/scrape, Markdown).

OCTO_API names the API (default http://127.0.0.1:8787); OCTO_ACCESS, when set, is sent as the request's `access`
("enhanced" for the installed_chrome arm). OCTO_RAW_DIR, when set, keeps each full answer as <sha1(url)>.json so the
report can read Octocrawl's own status. Anything but status "success" is an error to the harness: a blocked or empty
page is counted as a failure, never as content.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from datetime import datetime

import requests

from .base import Scraper, ScrapeResult

CLIENT_TIMEOUT_S = 240


def to_result(url: str, run_id: str, answer: dict | None, http_error: str | None) -> ScrapeResult:
    """The harness row for one API answer (None when the call itself failed)."""
    if answer is None:
        return ScrapeResult(run_id=run_id, scraper="octocrawl_local", url=url, status_code=None, error=http_error or "no answer",
                            content_size=0, format="markdown", created_at=datetime.now().isoformat(), content=None)
    status = answer.get("status")
    markdown = answer.get("markdown") or None
    evidence = answer.get("evidence") or {}
    error = None if status == "success" else f"{status}: {answer.get('failureReason') or answer.get('blockReason') or 'unknown'}"
    return ScrapeResult(run_id=run_id, scraper="octocrawl_local", url=url, status_code=evidence.get("httpStatus"), error=error,
                        content_size=len(markdown.encode("utf-8")) if markdown else 0, format="markdown",
                        created_at=datetime.now().isoformat(), content=markdown)


class OctocrawlLocal(Scraper):
    def check_environment(self) -> bool:
        return True

    def _call(self, url: str) -> tuple[dict | None, str | None]:
        body: dict = {"url": url, "formats": ["markdown"]}
        if os.getenv("OCTO_ACCESS"):
            body["access"] = os.environ["OCTO_ACCESS"]
        api = os.getenv("OCTO_API", "http://127.0.0.1:8787")
        try:
            res = requests.post(f"{api}/v1/scrape", json=body, timeout=CLIENT_TIMEOUT_S, proxies={"http": None, "https": None})
            answer = res.json()
        except Exception as e:  # the call, not the page: kept as an error row
            return None, f"{type(e).__name__}: {e}"
        raw = os.getenv("OCTO_RAW_DIR")
        if raw:
            os.makedirs(raw, exist_ok=True)
            with open(os.path.join(raw, hashlib.sha1(url.encode()).hexdigest() + ".json"), "w") as f:
                json.dump({"url": url, "httpStatus": res.status_code, "answer": answer}, f)
        if res.status_code >= 400 and "status" not in answer:
            return None, f"api {res.status_code}: {json.dumps(answer)[:200]}"
        return answer, None

    async def scrape(self, url: str, run_id: str) -> ScrapeResult:
        answer, err = await asyncio.to_thread(self._call, url)
        return to_result(url, run_id, answer, err)
