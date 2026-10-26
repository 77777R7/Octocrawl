# Real-site run 2026-10-24

Command: `node research/parity/run-sites.mjs --only G02,G03 --record research/parity/runs/2026-10-24-outreach-g02-g03-baseline-main-f0d321dd-proxied.md`
Source commit: `c5b461c248fad30bf10d0a0637151c09cc10eb40` (working tree had uncommitted changes)
Run: 2026-10-24T06:27:50.779Z → 2026-10-24T06:27:59.241Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 2 of 2 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 1/2; checks passing: 4/10.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| G02 | https://developer.android.com/guide/components/activities/intro-activities | 2/8 | field status (2); field evidenceRecord.robotsDecision.decision (2); field evidenceRecord.robotsDecision.unreachable (2); field evidence.finalUrl (2); markdownMatches (FS); markdownMatches (FS) |
| G03 | https://help.autodesk.com/view/fusion360/ENU/?guid=ASM-ASSEMBLIES | 2/2 | — |

Failed checks with the observed value:

- G02 [2] field `status`: failed
- G02 [2] field `evidenceRecord.robotsDecision.decision`: disallowed
- G02 [2] field `evidenceRecord.robotsDecision.unreachable`: string
- G02 [2] field `evidence.finalUrl`: https://developer.android.com/oauth2callback?state=%7B%22csrf_token%22%3A+%22f8f27d697d2e6f7742172d0d9d3e482fb430ad6a5ce5a057d9fec559d47a2b80%22%2C+%22return_url%22%3A+%22https%3A%2F%2Fdeveloper.android.com%2Fguide%2Fcomponents%2Factivities%2Fintro-activities%22%7D&error_subtype=access_denied&error=interaction_required
- G02 [FS] markdownMatches `^# Introduction to activities`: no markdown
- G02 [FS] markdownMatches `crucial component of an Android app`: no markdown

Notes, written with this record: a baseline of the engine before the fix. The branch's commit c5b461c2 was checked out with `packages/` and `docs/` restored to main's f0d321dd (`git checkout f0d321dd -- packages docs`), which is the "uncommitted changes" above: the engine is main's (EXTRACTOR_VERSION extract-tf/43 in the response), the cases are the branch's G02 and G03. The API was started with `npm run api` (which runs `npx tsc --build` first) on port 8787, proxied through 127.0.0.1:7890. G02 failed as on hosted: robots.txt `disallowed` with `unreachable: network_error`, and the page itself `failed`/`redirect_loop` at devsite's `oauth2callback` hop (a local server fetches a URL the request names whatever robots.txt says, so the page was requested here; a hosted server stops at robots.txt with `policy_denied`). G03 passed on its success branch: the article had loaded when the browser read the page, so this run does not reproduce the hosted false success, which depends on when the read lands; that case is covered by the fixtures in `packages/extract-tf/test/extract.test.ts` and `packages/bench/test/browserLocal.test.ts` (`/help-shell`). Hosted reproductions on 2026-10-24 (extractor commit f7708b3c, through the account's MCP connection): G02's URL `failed`/`policy_denied` with robots.txt `network_error` at 05:50 UTC, and https://source.android.com/docs/setup the same; G03's URL answered `success` with the full article at 05:59 UTC, so the false success seen in the outreach pre-check was not seen again.
