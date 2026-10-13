# Real-site run 2026-10-13

Command: `node research/parity/run-sites.mjs --only A19,A22,A23,T01,CA11,AC02 --record research/parity/runs/2026-10-13-six-cases-2-proxied-073fda9b.md`
Source commit: `073fda9b3509dedf707e7d7872af41cc9a77a53f`
Run: 2026-10-13T03:00:23.625Z → 2026-10-13T03:01:10.618Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 4 of 6 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 5/6; checks passing: 28/31.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| A19 | https://httpbin.org/status/404 | 4/4 | — |
| A22 | https://httpbin.org/delay/10 | 5/5 | — |
| A23 | https://httpbin.org/delay/10 | 4/4 | — |
| T01 | https://httpbin.org/delay/10 | 7/7 | — |
| CA11 | https://httpbin.org/headers | 7/7 | — |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 1/4 | field status (action-wait-duration); markdownIncludes "Hello World!" (action-wait-duration); traceEvent (action-wait-duration) |

Recorded values:

- A22 field elapsedMs: 3009
- A23 field elapsedMs: 11277
- T01 field summary.attempts.0.result.usage.wallMs: 10337.721416
- T01 field elapsedMs: 10345

Failed checks with the observed value:

- AC02 [action-wait-duration] field `status`: failed
- AC02 [action-wait-duration] markdownIncludes `Hello World!`: no markdown
- AC02 [action-wait-duration] traceEvent: 0 of 6 events match

## The six cases that failed in both arms on the evening of 2026-10-12

A19, A22, A23, T01, CA11 (httpbin.org) and AC02 (the-internet.herokuapp.com) passed at `49033bb0` on 2026-10-11 ([record](2026-10-11-pa11-health-all-proxied-49033bb0.md)). All six failed in both arms of the 207-case run before and after #458 on the evening of 2026-10-12 ([A](2026-10-13-health-all-proxied-cb75f80c.md), [B](2026-10-13-health-all-proxied-fb992cd2.md)). In those runs httpbin.org answered 503 within 1.1–1.5 s, where `delay/10` should hold the request for 10 s.

These reads tell the site from the code. The six ran twice on each of two commits, the 2026-10-11 code `49033bb0` and main `073fda9b`, on 2026-10-13 between 02:58 and 03:01Z. They were proxied, with the API on 8797 and no access grant ([49033bb0 run 1](2026-10-13-six-cases-1-proxied-49033bb0.md), [run 2](2026-10-13-six-cases-2-proxied-49033bb0.md), [073fda9b run 1](2026-10-13-six-cases-1-proxied-073fda9b.md), this run).

- **The five httpbin.org cases:** passed in all four runs, on both commits.
- **AC02:** passed once and failed once on each commit, the same way: `status: failed`, without the "Hello World!" the page shows after its wait.
- **Probes with curl, outside Octocrawl, before these runs:**
  - httpbin.org answered `status/404` with 404, `delay/3` with 200 after 4.3–4.6 s, and `headers` with 200, both proxied and direct.
  - Eight proxied requests to `the-internet.herokuapp.com/dynamic_loading/2` straight after the runs got 200 in under 1 s six times. The other two got no answer within 20 s.
- **Reading:**
  - The httpbin.org failures were the site's 503s on that evening. The same code passes when httpbin.org answers.
  - AC02 fails as often on the 2026-10-11 code as on main, and its page itself goes unanswered at times through this proxy. So it is the site's or the path's.
  - No change between `49033bb0` and `073fda9b` is set down to any of the six.
