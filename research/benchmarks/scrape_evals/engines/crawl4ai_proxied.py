"""The harness's crawl4ai_scraper (raw HTML, default configs), with two changes: the browser goes through BENCH_PROXY
when set, so every arm shares one network path, and Crawl4AI's own Markdown is kept beside the HTML
(OCTO_RAW_DIR/<sha1(url)>.md) so report.py can score Crawl4AI's Markdown as a second view of the same fetch.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime

from crawl4ai import AsyncWebCrawler
from crawl4ai.async_configs import BrowserConfig, CrawlerRunConfig

from .base import Scraper, ScrapeResult


class Crawl4AIProxied(Scraper):
    def check_environment(self) -> bool:
        return True

    async def scrape(self, url: str, run_id: str) -> ScrapeResult:
        try:
            proxy = os.getenv("BENCH_PROXY")
            browser_config = BrowserConfig(verbose=False, **({"proxy_config": {"server": proxy}} if proxy else {}))
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=CrawlerRunConfig(page_timeout=60000, verbose=False))
            raw = os.getenv("OCTO_RAW_DIR")
            if raw:
                os.makedirs(raw, exist_ok=True)
                md = result.markdown
                md = getattr(md, "raw_markdown", md) or ""
                with open(os.path.join(raw, hashlib.sha1(url.encode()).hexdigest() + ".md"), "w") as f:
                    f.write(md)
            return ScrapeResult(run_id=run_id, scraper="crawl4ai_proxied", url=url, status_code=result.status_code or 200,
                                error=None if result.success else result.error_message,
                                content_size=len(result.html.encode("utf-8")) if result.html else 0, format="html",
                                created_at=datetime.now().isoformat(), content=result.html)
        except Exception as e:
            return ScrapeResult(run_id=run_id, scraper="crawl4ai_proxied", url=url, status_code=500, error=f"{type(e).__name__}: {e}",
                                format="html", content=None, content_size=0, created_at=datetime.now().isoformat())
