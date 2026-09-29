# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --only T06 --record research/parity/runs/2026-09-30-markdown-tables-t06.md`
Source commit: `c10a9a08314a94a0ccbf38bf74317744a8ae3c6d`
Run: 2026-09-29T18:20:31.231Z → 2026-09-29T18:20:51.041Z against http://127.0.0.1:8940
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 9/9.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| T06 | https://httpbin.org/delay/10 | 9/9 | — |

Recorded values:

- T06 field foreign.elapsedMs: 13587
- T06 field own.answeredAfterCancelMs: 7
- T06 field probe.elapsedMs: 2178

## Notes

- This is the one case of the set that [2026-09-30-markdown-tables.md](2026-09-30-markdown-tables.md) skipped (`W2L_LOCAL_MCP_URL` unset there). It was run on the same commit right after that run, as its own record; that run's result is unchanged.
- Local MCP service, started from this worktree on `c10a9a0` with Node v26.8.1 after `npx tsc --build`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` inherited (`127.0.0.1:7890`) and `W2L_CONTACT` unset: `W2L_LOCAL_MCP_PORT=8941 W2L_TASK_ROOT=.w2l/local-mcp node packages/mcp/dist/localHostCli.js`. It took port 8941 after the hosted-mode API of the full run was stopped there. T06 drives this service, not the API the header names (the full run's local-mode API, still running on 8940).
- Runner: `W2L_API_URL=http://127.0.0.1:8940 W2L_LOCAL_MCP_URL=http://127.0.0.1:8941/mcp node research/parity/run-sites.mjs --only T06 --record research/parity/runs/2026-09-30-markdown-tables-t06.md`.
- The run started at 2026-09-29T18:20Z, 2026-09-30 02:20 local time (UTC+8).
- The two MCP clients got distinct session ids; the other client's cancellation left the call to answer `success` after 13,587 ms; the calling client's own cancellation was answered `Request cancelled` 7 ms after it; the probe, sent after two calls were dropped by closing their requests, answered `success` in 2,178 ms. No request failed on the network. The header's proxy count is 0 by construction: for this case the runner keeps only each MCP call's timing and its status, failure reason or JSON-RPC error.
