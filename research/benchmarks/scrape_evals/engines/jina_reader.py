"""scrape-evals engine for Jina Reader (https://r.jina.ai/<url>) on its free keyless tier only: no API key is ever sent.

The keyless tier is rate limited (20 requests a minute when this was written); JINA_RPM paces the calls, and a 429 waits
and retries a few times. A row that still fails stays an error row in the denominator.
"""
from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime

import requests

from .base import Scraper, ScrapeResult

_lock = asyncio.Lock()
_last = [0.0]


class JinaReader(Scraper):
    def check_environment(self) -> bool:
        return True

    async def _pace(self) -> None:
        gap = 60.0 / float(os.getenv("JINA_RPM", "18"))
        async with _lock:
            wait = _last[0] + gap - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            _last[0] = time.monotonic()

    def _get(self, url: str) -> requests.Response:
        return requests.get(f"https://r.jina.ai/{url}", headers={"Accept": "application/json"}, timeout=120)

    async def scrape(self, url: str, run_id: str) -> ScrapeResult:
        status, error, content = None, None, None
        for attempt in range(5):
            await self._pace()
            try:
                res = await asyncio.to_thread(self._get, url)
            except Exception as e:
                error = f"{type(e).__name__}: {e}"
                break
            if res.status_code == 429:
                error = "429 rate limited"
                await asyncio.sleep(30 * (attempt + 1))
                continue
            try:
                body = res.json()
            except ValueError:
                body = {}
            data = body.get("data") if isinstance(body.get("data"), dict) else {}
            content = data.get("content") or None
            # Reader's JSON carries the target's status in data.metadata or warning text; the call's own code otherwise.
            status = res.status_code
            error = None if res.status_code < 400 else f"HTTP {res.status_code}: {str(body.get('message') or body.get('readableMessage') or '')[:200]}"
            break
        return ScrapeResult(run_id=run_id, scraper="jina_reader", url=url, status_code=status, error=error,
                            content_size=len(content.encode("utf-8")) if content else 0, format="markdown",
                            created_at=datetime.now().isoformat(), content=content)
