"""The harness's playwright_scraper (headless Chromium, networkidle, 30 s, raw HTML), with one change: the browser goes
through BENCH_PROXY when set, so every arm shares one network path.
"""
from __future__ import annotations

import os
from datetime import datetime

from .base import Scraper, ScrapeResult


class PlaywrightProxied(Scraper):
    def check_environment(self) -> bool:
        return True

    async def scrape(self, url: str, run_id: str) -> ScrapeResult:
        try:
            from playwright.async_api import async_playwright

            proxy = os.getenv("BENCH_PROXY")
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, **({"proxy": {"server": proxy}} if proxy else {}))
                page = await browser.new_page()
                response = await page.goto(url, wait_until="networkidle", timeout=30000)
                status_code = response.status if response else None
                html = await page.content()
                await browser.close()
            return ScrapeResult(run_id=run_id, scraper="playwright_proxied", url=url, status_code=status_code or 200,
                                error=None if status_code and status_code < 400 else f"HTTP error: {status_code}",
                                content_size=len(html.encode("utf-8")) if html else 0, format="html",
                                created_at=datetime.now().isoformat(), content=html or None)
        except Exception as e:
            return ScrapeResult(run_id=run_id, scraper="playwright_proxied", url=url, status_code=500, error=f"{type(e).__name__}: {e}",
                                content_size=0, format="html", created_at=datetime.now().isoformat(), content=None)
