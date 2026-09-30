# M2 week 1: live checks for html, rawHtml, includeTags, excludeTags and the noscript rule (2026-09-30)

Checks run from the local machine through the REST API (`W2L_TASK_ROOT=.w2l/api node packages/api/dist/cli.js`, 127.0.0.1:8787), each request with `debug: true`, against builds of the source committed as `3bfc3b7` (on top of `a183866`). A, C and D ran at 07:00 UTC on the working tree before the last change to how `includeTags` copies its selection (`selectionBody`), a code path none of the three uses; B ran at 07:01 UTC after it. The shell's `HTTPS_PROXY` (127.0.0.1:7890) was in effect on every request (`proxy_used`). Raw responses are in `.w2l/parity-m2-2026-09-30/` (git-ignored), the earlier attempts on stale builds under `stale-build/`.

| Check | Feature ids | URL and options | Result |
| --- | --- | --- | --- |
| A | `scrape-formats.exclude-tags` | Wikipedia GDP (nominal) (test set #13), `excludeTags: ['.mw-editsection', '.wbc-editpage', '#p-lang-btn', '.navbox', '.mw-jump-link']` | **pass**: `success`, http lane, 54,191 chars, 243 table rows; no `[Edit links]` and no `[edit]` in the markdown (the re-run of the same page without the option, [live-batch-1-rerun-2026-09-30.md](live-batch-1-rerun-2026-09-30.md), kept `[Edit links]`) |
| B | `scrape-formats.include-tags`, `scrape-formats.html` | webscraper.io/test-sites/tables (test set #10), `includeTags: ['table']`, formats markdown and html | **pass**: http lane only, 319 chars of markdown that are the 10 table rows and nothing else; `html` is a body holding the 2 tables and no navigation; `confidence` 1, no warning |
| C | `scrape-formats.html`, `scrape-formats.raw-html` | books.toscrape.com product page (test set #2), formats markdown, html and rawHtml | **pass**: markdown 1,586 chars; `html` 4,253 chars, the cleaned article with the Product Information table and no breadcrumb; `rawHtml` 9,275 chars beginning with the page's DOCTYPE, scripts included, and hashing to the result's `rawBodySha256`; a request without formats carries neither field |
| D | the noscript rule of `a183866` | GOV.UK subnational consumption report (test set #8) | **pass**: `channelsTried: ['http']`, no `client_rendered_suspected` warning and no `quality_client_rendered` event; 73,691 chars, 122 table rows, the same content the re-run got after fetching the page twice |

The audit's suggested includeTags test (news.ycombinator.com with `.titleline`) was not run: live checks stay on the frozen test set and the sandboxes.

## Notes from the stale builds

- The first pass of B escalated to the browser lane: the page reduced to its tables was 300 characters of text beside the site's scripts and tripped the `script_shell` rule. The selection is now copied out and the page itself keeps its render signals and main region (`3bfc3b7`); the pass above is on that build.
- The first pass of D used a wrong URL and got GOV.UK's error page (`failed` / `http_error`, 213 chars); the pass above is the test set's URL.

## Fetch count

Wikipedia 1; GOV.UK 2 (one wrong URL answered with an error page); webscraper.io 3 and books.toscrape.com 4 (sandboxes, repeated across builds). One robots.txt read per host.
