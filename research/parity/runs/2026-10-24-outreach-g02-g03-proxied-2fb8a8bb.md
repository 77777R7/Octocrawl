# Real-site run 2026-10-24

Command: `node research/parity/run-sites.mjs --only G02,G03 --record research/parity/runs/2026-10-24-outreach-g02-g03-proxied-2fb8a8bb.md`
Source commit: `2fb8a8bb5276679f21b3172dc481dd4f6e779808`
Run: 2026-10-24T06:46:41.247Z → 2026-10-24T06:46:50.714Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 2 of 2 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 2/2; checks passing: 10/10.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| G02 | https://developer.android.com/guide/components/activities/intro-activities | 8/8 | — |
| G03 | https://help.autodesk.com/view/fusion360/ENU/?guid=ASM-ASSEMBLIES | 2/2 | — |

Notes, written with this record: the fixed engine (EXTRACTOR_VERSION extract-tf/44), against an API started with `npm run api` (which runs `npx tsc --build` first) on port 8787 from this commit, proxied through 127.0.0.1:7890. G02 read robots.txt (`allowed`, sha256 03dd3a3e…) and the article over HTTP alone (`fastMode`, 16,021 characters headed "Introduction to activities"), through devsite's four-hop sign-in round trip; the trace counts the cookies sent back on the later hops (`redirect_cookies`: 3 requests with cookies, 9 kept), never their values. G03 passed on its success branch: the browser lane saw the help viewer's empty role="main" under its rendered banner, waited 1,348 ms for it to fill (`loading_wait`, cleared) and read the article (7,982 characters). The run was not repeated direct: developer.android.com is not reachable without the proxy from this Mac, and the hosted network path is not exercised by a local run; whether hosted reads both pages is known only after a deploy.
