# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --only A18,A19,M06,M07,M08,S03,L12,E01,E02,E03,S05,L03,M09,M10,M11 --record research/parity/runs/2026-09-29-response-status.md`
Source commit: `ddd810f0ab38259e1b3b2adec0f2d73a1f73f933`
Run: 2026-09-29T16:05:00.687Z → 2026-09-29T16:06:10.284Z against http://127.0.0.1:8910
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 12 of 15 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 15/15; checks passing: 98/98.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| S03 | https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 3/3 | — |
| S05 | https://quotes.toscrape.com/js/ | 3/3 | — |
| L03 | https://quotes.toscrape.com/js/ | 7/7 | — |
| L12 | https://www.bls.gov/news.release/empsit.t01.htm | 3/3 | — |
| E01 | https://books.toscrape.com/ | 10/10 | — |
| E02 | https://quotes.toscrape.com/js/ | 7/7 | — |
| E03 | https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 6/6 | — |
| A18 | http://github.com | 6/6 | — |
| A19 | https://httpbin.org/status/404 | 4/4 | — |
| M06 | http://www.github.com | 8/8 | — |
| M07 | http://github.com | 6/6 | — |
| M08 | http://github.com | 5/5 | — |
| M09 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48L2hlYWQ-PGJvZHk-PHA-VGhpcyBwYWdlIG1vdmVkLjwvcD48c2NyaXB0PmxvY2F0aW9uLnJlcGxhY2UoImh0dHBzOi8vYm9va3MudG9zY3JhcGUuY29tL2NhdGFsb2d1ZS9kb2VzLW5vdC1leGlzdC13MmwvaW5kZXguaHRtbCIpPC9zY3JpcHQ-PC9ib2R5PjwvaHRtbD4= | 12/12 | — |
| M10 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48bWV0YSBodHRwLWVxdWl2PSJyZWZyZXNoIiBjb250ZW50PSIwO3VybD1odHRwczovL2Jvb2tzLnRvc2NyYXBlLmNvbS9jYXRhbG9ndWUvZG9lcy1ub3QtZXhpc3QtdzJsL2luZGV4Lmh0bWwiPjwvaGVhZD48Ym9keT48cD5UaGlzIHBhZ2UgbW92ZWQuPC9wPjwvYm9keT48L2h0bWw- | 7/7 | — |
| M11 | https://spa-github-pages.rafgraph.dev/example | 11/11 | — |

Recorded values:

- E01 evidenceSchema: valid (http, success)
- E02 evidenceSchema: valid (browser_local, success)
- E03 evidenceSchema: valid (http, failed)

Notes:

- API: `W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8910`, started after `npx tsc --build`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment (127.0.0.1:7890). Runner: the command above with `W2L_API_URL=http://127.0.0.1:8910`. The source commit `ddd810f` adds only the M09–M11 cases to `b848852`, whose code the API ran (the fixes of `e167d7d` and `38d44ae`, the docs of `b848852`).
- Cases: those `core-status-2026-09-29-p1-wave5.md` names for `scrape-formats.metadata-response-status` (A18, A19, M06, M07, M08; P1 item 2: S03, L12; the Evidence Record: E01–E03), the browser-lane escalation cases S05 and L03, and the new M09–M11. A36 (SEC.gov) was not run. No check failed and no request failed on the network.
- M09–M11 fail on the code before the fix. Checked by hand, not with the runner, so not in the table: the same requests (`curl -X POST http://127.0.0.1:8911/v1/scrape` or `/fc/v1/scrape` with each case's body) against an API on port 8911 (`W2L_TASK_ROOT=.w2l/api-old`) built with `browserLocal.ts`, `browserSettle.ts` and `resilient.ts` checked out from `f2774c6` and the rest at `b848852`, on 2026-09-29 around 16:03Z:
  - M09: `failed`/`empty_unverified` with the 404 page's URL and Markdown but `httpStatus` 200 and `text/html; charset=utf-8`, httpbin's answer to the first page, and `redirectChainComplete: false`. It was not `success` only because the 404 page has no main block.
  - M10: `success: false`, `failed: connection_error`, `url` the httpbin page, `statusCode` null, no Markdown: the meta refresh cut off the wait for stability.
  - M11: `failed`/`http_error` with `httpStatus` 404, `finalUrl` https://spa-github-pages.rafgraph.dev/example and the app's Markdown ("This is an example page."): the first page's 404 next to the second page's content.
- M09 and M10 start from W2L's own HTML, which httpbin.org's `/base64` endpoint answers as `text/html`; the navigations, the servers and the 404 page are real. No public page was found whose own script or meta refresh leads to an error page and that can be expected to stay so. M11 is a site's own behaviour, from an error page to a success.
- M11's final URL is https://spa-github-pages.rafgraph.dev/?/example, not the /example the page shows at the end: the app set /example with `history.replaceState`, which requested nothing, and the Evidence Record defines `finalUrl` as the last URL W2L requested, reported with that request's response. The response's `same_document_navigation` trace event names /example, which the page's links resolve against.
- Tests on `ddd810f` (Node v26.8.1): `npx tsc --build` exited 0; `npx vitest run` passed 116 of 116 files, 1401 of 1401 tests, the two live-site tests (`packages/api/test/monitor.test.ts`, `packages/api/test/session.test.ts`) included.
