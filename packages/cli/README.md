# @w2l/cli

W2L on the command line: scrape, crawl, batch and map web pages into Markdown, tables and JSON, with an **Evidence Record** on every page (final URL, fetch time, HTTP status, robots.txt decision, hashes of what was read and delivered). It runs the W2L engine in its own process; nothing is sent to a W2L server.

```bash
npx @w2l/cli scrape https://books.toscrape.com/ --markdown
npx @w2l/cli scrape https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) --formats markdown,tables --out gdp/
npx @w2l/cli batch --urls-file urls.txt --formats markdown,tables --out results/
npx @w2l/cli map https://www.sitemaps.org/ --limit 50
npx @w2l/cli serve --port 8787
```

Every option of the W2L REST API is a flag under its kebab-case name (`maxAge` is `--max-age`, `onlyMainContent: false` is `--no-only-main-content`); `w2l <command> --help` lists them. `--out <dir>` writes `results.jsonl`, `results.csv` (one row of evidence per page, failed pages included), each page's Markdown and each table as CSV. The task root (tasks, saved files, the page cache) is `--task-root`, else `W2L_TASK_ROOT`, else `.w2l/cli`.

- Node.js 22.13 or later. The browser lane uses Playwright's Chromium: run `npx playwright install chromium` once; without it, pages are read over HTTP only.
- `better-sqlite3` builds or downloads its native binding when installed. If your npm holds install scripts back, allow it (`npm install-scripts approve better-sqlite3`, or `allowScripts` in your package.json).
- robots.txt is obeyed, and every fetch declares W2L's identity; there is no stealth mode.

Licence: AGPL-3.0-only. Source, documentation and the API reference: https://github.com/77777R7/w2l
