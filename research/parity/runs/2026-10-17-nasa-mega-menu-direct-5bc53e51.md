# NASA blog post under a closed mega-menu, and a hosted robots.txt refusal's record (2026-10-17)

Re-runs of the two findings in `research/hosted/2026-10-17-scrape-page-demos-e1e128d4.md` ("Harder pages").

- Source commit: `5bc53e51` (branch `claude/scrape-false-empty-refusal-evidence`, on `f7cddc87`). Evidence Records name `extract-tf/29`, commit null (no `W2L_SOURCE_COMMIT` set locally).
- Servers: local API, `npm run api` (port 8787); a local hosted-mode server, `W2L_API_PORT=8793 W2L_API_TOKEN=<throwaway> node --import tsx packages/api/src/cli.ts --hosted --host 127.0.0.1`. Both started with `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` unset.
- Egress: **direct** (Evidence Record `access.egress.source: "direct"` on the NASA rows; the Google row sent no page request).

Command, once per request body:

```bash
curl -s -X POST localhost:8787/v1/scrape -H 'content-type: application/json' --data @<name>.request.json
```

## NASA: false `empty_unverified`

URL: https://www.nasa.gov/blogs/missions/2026/10/07/nasa-releases-artemis-ii-lunar-science-data-images/

Before (hosted `e1e128d4`, 09:34:48 UTC, from the demo record): browser_local, failed `empty_unverified`, readiness `not_extracted`; over HTTP (`fastMode`) also `empty_unverified`. Cause, read from the page's HTML (280,778 bytes): its closed mega-menu, `<div id="global-navigation" hidden>`, holds four teaser headings and about 60 column headings, which out-scored the `<article>` in `<main>`. The extractor picked the menu, left the hidden pick alone and escalated it as hidden. On the same saved HTML, extract-tf at `f7cddc87` gives `escalate: true`; at `5bc53e51`, `escalate: false` with the article as the main region.

After (local, `5bc53e51`):

| Request body | Lane (channelsTried) | fetchedAt (UTC) | Status | robots.txt | rawSha256 | Markdown SHA-256 | Readiness |
|---|---|---|---|---|---|---|---|
| `{"url":…,"formats":["markdown"],"fastMode":true}` | http (`http`) | 2026-10-17T09:58:43.954Z | success, HTTP 200 | allowed (`44d72c5a…5ccb05`) | `a49bbbd5…5aeec4c` | `d358fab3…845c23c3d` | ready |
| `{"url":…,"formats":["markdown"],"waitFor":1500}` | browser_local (`browser_local`) | 2026-10-17T09:58:48.863Z | success, HTTP 200 | allowed | `5ec35bf4…f226fdb37` | `d358fab3…845c23c3d` | ready |
| `{"url":…,"formats":["markdown"]}` | http (`http`) | 2026-10-17T09:58:49.228Z | success, HTTP 200 | allowed | `a49bbbd5…5aeec4c` | `d358fab3…845c23c3d` | ready |

All three: 6,492 characters of Markdown opening with `# NASA Releases Artemis II Lunar Science Data, Images`, the "More than 800 gigabytes…" paragraph present, none of the menu's teasers ("Skywatching") in it. The HTTP and browser lanes give the same Markdown hash.

## Google: robots.txt refusal's Evidence Record

URL: https://www.google.com/search?q=octocrawl, body `{"url":…,"formats":["markdown"]}`.

The demo record says this refusal came back with `evidenceRecord: null`. **Not reproduced.**

- The demo's own saved response (`.w2l/scrape-demo/2026-10-17/google.response.json`, hosted `e1e128d4`) has an `evidenceRecord`: `status: failed`, `reason: policy_denied`, `fetchedAt: null`, `httpStatus: null`, `rawSha256: null`, `outputSha256` both null, `robotsDecision: { decision: disallowed, robotsUrl: https://www.google.com/robots.txt, robotsSha256: 1aba570a1b32deb66941e0c29d4f37be71ee58aa1a624aa20754b3639538cf2c, userOverride: false }`, `readiness: not_served`. The field that is null in that response is `compliance` (the browser lane's signed compliance record, which a refusal before any request does not have).
- Hosted again, keyless REST to `https://api.octocrawl.dev/v1/scrape` (request through the shell's proxy; the hosted server checks robots.txt itself), response `date` 2026-10-17 09:46:10 GMT: the same record, extractor `extract-tf/28`, commit `e1e128d4`.
- Local hosted-mode server (`5bc53e51`, port 8793, direct): failed `policy_denied`, lane http, the same record with `robotsSha256` `1aba570a…9538cf2c` and `extract-tf/29`; agentHints name rule `/search`.

No code path stores a page without a result: a refusal, a DNS failure, a timeout, a lockdown cache miss and a fetch that threw each get a result and so an Evidence Record (`packages/runtime/src/orchestrator.ts`, `scrapeErrorResult`; `packages/api/test/evidenceRecord.test.ts` pins the hosted refusal and blocked pages).
