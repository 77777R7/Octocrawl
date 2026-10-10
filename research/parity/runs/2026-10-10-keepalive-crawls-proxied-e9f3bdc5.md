# Real-site run 2026-10-10

Command: `node research/parity/run-sites.mjs --only A14,A15,A31 --record research/parity/runs/2026-10-10-keepalive-crawls-proxied-e9f3bdc5.md`
Source commit: `e9f3bdc51b5f10c2ff7b7ab307b681b3e7b26e96`
Run: 2026-10-10T03:16:09.996Z → 2026-10-10T03:17:21.788Z against http://127.0.0.1:8803
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 3 of 3 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 3/3; checks passing: 13/13.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| A14 | https://docs.python.org/3/ | 5/5 | — |
| A15 | https://www150.statcan.gc.ca/n1/en/type/data | 4/4 | — |
| A31 | https://docs.python.org/3/ | 4/4 | — |

Recorded values:

- A14 field progress.maxPagesFetchedWhileRunning: 29
- A15 fetchSpacing: 2 fetches, smallest gap 3772 ms, required 2000 ms; robots.txt HTTP 200, Crawl-delay 2000, seed allowed
- A15 crawlDelay: 2 fetches, 0 without a crawl_delay event, smallest recorded gap 3778 ms, robots.txt Crawl-delay 2000, 0 later pages not naming it
