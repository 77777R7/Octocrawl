# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --only A08,A09,A22,A23,A24,T01,T02,T03,T06 --record research/parity/runs/2026-09-29-timeout-mcp.md`
Source commit: `bd7bd2565ee9eeebc0b9c6cff5c8602ab3964b1e`
Run: 2026-09-29T15:46:33.198Z → 2026-09-29T15:47:41.876Z against http://127.0.0.1:8920
SDK: the built @w2l/sdk; W2L_API_TOKEN not set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 5 of 9 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 9/9; checks passing: 45/45.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| A08 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| A09 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| A22 | https://httpbin.org/delay/10 | 5/5 | — |
| A23 | https://httpbin.org/delay/10 | 4/4 | — |
| A24 | https://httpbin.org/delay/10 | 3/3 | — |
| T01 | https://httpbin.org/delay/10 | 7/7 | — |
| T02 | https://books.toscrape.com/ | 7/7 | — |
| T03 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving | 6/6 | — |
| T06 | https://httpbin.org/delay/10 | 9/9 | — |

Recorded values:

- A22 field elapsedMs: 3005
- A23 field elapsedMs: 10356
- T01 field summary.attempts.0.result.usage.wallMs: 10344.030791999998
- T01 field elapsedMs: 10349
- T02 field waitMs: 12099
- T06 field foreign.elapsedMs: 12892
- T06 field own.answeredAfterCancelMs: 7
- T06 field probe.elapsedMs: 3016

## Notes

- Services, started from the worktree on `bd7bd25` with Node v26.8.1 and the environment proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY`, 127.0.0.1:7890) inherited:
  - API: `W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8920`.
  - Local MCP service, for T06 only: `W2L_LOCAL_MCP_PORT=8921 W2L_TASK_ROOT=.w2l/local-mcp node packages/mcp/dist/localHostCli.js`, after `npx tsc --build`. T06 drives this service, not the API the header names.
  - Runner: `W2L_API_URL=http://127.0.0.1:8920 W2L_LOCAL_MCP_URL=http://127.0.0.1:8921/mcp node research/parity/run-sites.mjs --only A08,A09,A22,A23,A24,T01,T02,T03,T06 --record research/parity/runs/2026-09-29-timeout-mcp.md`.
  - `W2L_CONTACT` was not set; A36 was not run.
- `bd7bd25` is `f2774c6` plus T06 (`eafde3b`), MCP cancellation over Streamable HTTP (`7465935`), the batch and crawl model fallback deadline (`e237cd0`), the SDK's wait for a scrape's answer (`e970c63`) and their docs (`bd7bd25`).
- Every case passed; no check failed on the network in this run.
- T06 before the fix: `W2L_LOCAL_MCP_URL=http://127.0.0.1:8921/mcp node research/parity/run-sites.mjs --only T06` on `eafde3b`, against the local MCP service built from it (the fixes stashed, the working tree clean; task root `.w2l/local-mcp-prefix`), passed 5 of 9 checks. The service gave no session id (`sessions.distinct` false). The calling client's own cancellation did not stop its scrape, which answered `success` 9,090 ms after the cancellation. The probe waited 9,669 ms behind the two dropped scrapes. The other client's cancellation left its call to answer `success` after 14,757 ms, as it should.
- T06 on `bd7bd25`: the two clients got distinct session ids; the other client's cancellation left its call to answer `success` after 12,892 ms; the calling client's own cancellation was answered `Request cancelled` (code 0) 7 ms after it, 2,007 ms into the call, while the page answers after about 10 s; the probe answered `success` in 3,016 ms.
- T06 covers the local service over a real slow site, the disconnect included, which it infers from the probe: the service lets two requests at a time reach one host. The hosted service's bearer-token scoping is covered by the in-process tests over real HTTP in `packages/mcp/test/httpCancellation.test.ts`, not by a real-site case: the hosted service needs a WorkOS login and allows Amazon.sg only.
- The SDK's wait for a scrape's answer (`e970c63`) was checked outside the runner, on loopback, with scratch scripts: on `f2774c6`, `scrape(url, { timeout: 300000 })` against a server answering 301.5 s after the request threw `TypeError: fetch failed` (`HeadersTimeoutError`) after 300,953 ms, while the real API scraping a page that never answers, with the same timeout, answered after 300,014 ms and the SDK returned its `failed`/`timeout`. With the change, answers at 301.5 s arrived (after 301,374 ms with `timeout: 300000`, 301,370 ms with none) and one at 331.5 s threw after 330,793 ms, the timeout plus 30 s.
