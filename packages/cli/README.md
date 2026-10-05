# @octocrawl/cli

Octocrawl on the command line: scrape, crawl, batch and map web pages into Markdown, tables and JSON, with an **Evidence Record** on every page (final URL, fetch time, HTTP status, robots.txt decision, hashes of what was read and delivered). It runs the Octocrawl engine in its own process; nothing is sent to an Octocrawl server. The same CLI is published as `octocrawl`, so `npx octocrawl` works too.

```bash
npx octocrawl scrape https://books.toscrape.com/ --markdown
npx octocrawl scrape https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) --formats markdown,tables --out gdp/
npx octocrawl batch --urls-file urls.txt --formats markdown,tables --out results/
npx octocrawl map https://www.sitemaps.org/ --limit 50
npx octocrawl serve --port 8787
```

Every option of the REST API is a flag under its kebab-case name (`maxAge` is `--max-age`, `onlyMainContent: false` is `--no-only-main-content`); `octocrawl <command> --help` lists them. `--out <dir>` writes `results.jsonl`, `results.csv` (one row of evidence per page, failed pages included), each page's Markdown and each table as CSV. The task root (tasks, saved files, the page cache) is `--task-root`, else `W2L_TASK_ROOT`, else `.w2l/cli`.

- Node.js 22.13 or later. The browser lane uses Playwright's Chromium: run `npx playwright install chromium` once; without it, pages are read over HTTP only.
- `better-sqlite3` builds or downloads its native binding when installed. If your npm holds install scripts back, allow it (`npm install-scripts approve better-sqlite3`, or `allowScripts` in your package.json).
- robots.txt is obeyed. By default pages are requested with the user agent and client hints of the Chrome the browser lane runs; `--mode research` names itself as a research crawler instead, with your contact from `W2L_CONTACT`. There is no stealth mode.
- Paid browser services (Browserbase, Steel) are used only when you name them in `W2L_VENDORS` (for example `W2L_VENDORS=browserbase`) and their key is set; a key alone does nothing.
- `octocrawl serve` listens on 127.0.0.1. On any other address it needs a token (`--token` or `W2L_API_TOKEN`), since other machines could otherwise use it to reach your localhost and network.

Licence: AGPL-3.0-only. Source, documentation and the API reference: https://github.com/77777R7/Octocrawl
