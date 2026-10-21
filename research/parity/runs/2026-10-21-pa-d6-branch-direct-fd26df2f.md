# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only M14,M15 --record research/parity/runs/2026-10-21-pa-d6-branch-direct-fd26df2f.md`
Source commit: `fd26df2f2892b4d1764ab3e64ec97515878ea352`
Run: 2026-10-20T18:09:36.446Z → 2026-10-20T18:09:58.476Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 2 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 2/2; checks passing: 21/21.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M14 | https://www.rfc-editor.org/rfc/rfc9110.html | 13/13 | — |
| M15 | https://www.w3.org/TR/WCAG22/ | 8/8 | — |

## Engine (added when the record was written)

The API on port 8787 (`npm run api`) ran this checkout at the source commit above, extractor `extract-tf/32`. The run's UTC date is 2026-10-20; the file is named by the local date (UTC+8), 2026-10-21.

Direct: the API and the runner ran with `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY` unset. The same cases on `main` `db80379b`, the same day and network: [2026-10-21-pa-d6-main-direct-db80379b.md](2026-10-21-pa-d6-main-direct-db80379b.md) (0/2 cases, 3/21 checks).
