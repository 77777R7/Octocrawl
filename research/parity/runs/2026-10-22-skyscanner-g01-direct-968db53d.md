# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only G01 --record research/parity/runs/2026-10-22-skyscanner-g01-direct-968db53d.md`
Source commit: `968db53d4320ea99521de174f6c8358e6db37a61`
Run: 2026-10-21T18:15:01.444Z → 2026-10-21T18:15:05.852Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 2/2.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| G01 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 2/2 | — |

Notes, written with this record: the run was direct (the API and the runner started with HTTPS_PROXY/HTTP_PROXY unset), against an API started with `npm run api` (which runs `npx tsc --build` first) on port 8793 from this commit. G01 passed on its success branch: Skyscanner served the route page itself (HTTP 200, final URL the route, lanes http then browser_local, readiness ready, 21,776 characters of Markdown headed "Cheap Flights from London (LOND) to Paris (PARI)"). The dedicated challenge at `/sttc/px/captcha-v2/index.html` was not served on this exit, so this run does not exercise the blocked/captcha branch; that branch is covered only by the synthetic fixtures in `packages/http-core/test/skyscannerGate.test.ts` and `packages/mcp/test/skyscannerDelivery.integration.test.ts`. The header's date is UTC; the local date was 2026-10-22.
