# Real-site run 2026-10-03: the sitemap reader's Host header behind the environment proxy

This follows up the `sitemap_unreadable` result in [2026-10-03-m3-map.md](2026-10-03-m3-map.md) and [2026-10-03-http-content-encoding.md](2026-10-03-http-content-encoding.md). In both, `https://python.org/sitemap.xml` ended `unreadable` / `redirect_limit` with `finalUrl: https://www.python.org/sitemap.xml` and status 301. Those records read this as python.org redirecting its sitemap to itself. It was W2L's request.

Source commit: `2b1e972d1c2193994de096faee6daf89c6bbb519`, with a clean working tree. It branches from origin/main `f01fab5` and does not contain the Content-Encoding fix of PR #105.

Network: proxied. The shell set `HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:7890` and `NO_PROXY=localhost,127.0.0.1,::1,.local`. Each sitemap file record has `proxyUsed: true`. Map responses carry no `evidence.envProxy`, so the runner's line reads "0 of 2".

## Diagnosis (before the fix, on origin/main's sitemap reader)

I watched the wire through undici's `undici:client:sendHeaders` diagnostics channel, at 2026-10-03T04:10Z, through the proxy:

| Request | `Host` sent | Answer |
| --- | --- | --- |
| `https://python.org/sitemap.xml` | `python.org` | 301 → `https://www.python.org/sitemap.xml` |
| `https://www.python.org/sitemap.xml`, 5 times | `python.org` | 301 → `https://www.python.org/sitemap.xml` |

- **Without the proxy** (W2L's plain `Agent`), the same read sent `host: www.python.org` on the second hop and got 404, so the file was `absent`.
- **curl, and bare undici `request()` with a fresh headers object,** through the same proxy and with W2L's identity headers, got 404 at `www.python.org/sitemap.xml`.

The cause is in undici 7.29.0. `ProxyAgent.dispatch` sets `headers.host` on the headers object the caller passed (`lib/dispatcher/proxy-agent.js`, lines 237-240; also lines 77-80 on the absolute-form path).

- A local check: two requests sharing one object through `ProxyAgent` both arrived as `Host: 127.0.0.1`, although the second went to `localhost`. With `Agent`, the object stayed unchanged.
- `sitemapSource.fetch` passed the same identity-headers object to every redirect hop of a file. So after the cross-host hop, every request still named `python.org`, and Fastly answered with the same redirect.
- The http lane builds a new headers object for each request and was not affected.

## Fixture test

The new case in `packages/bench/test/envProxy.test.ts` uses the test's recording forward proxy. It serves a host that answers by its `Host` header, as the CDN does: the apex redirects to `www`.

- **Before the fix:** 6 sitemap requests until `redirect_limit` (fails).
- **After:** 2 requests, each carrying its own host, and the file is a `urlset`.

`npx tsc --build` and `npm test` on 2b1e972:

- **Node v26.8.1:** 143 files, 1799 tests passed.
- **Node v22.22.0** (`npm rebuild better-sqlite3` before and after): 1798 passed, 1 failed in the full run. The failure was `packages/api/test/monitor.test.ts` "exposes run, baseline, unchanged state, and one initialized event" (`expected undefined to be 1`), which AGENTS.md lists as a test that calls live websites.
  - It failed once more when run alone.
  - It passed with `sitemapSource.ts` reverted to main.
  - It then passed twice in a row with the fix in place.

## Runner cases MP13 and MP14

Command: `W2L_API_URL=http://127.0.0.1:8853 node research/parity/run-sites.mjs --only MP13,MP14 --record <scratchpad>/run.md`, run 2026-10-03T04:38:35Z → 04:38:41Z. The API was started with `W2L_API_PORT=8853 W2L_SOURCE_COMMIT=2b1e972… npm run api` (Node v26.8.1). Raw responses are in `.w2l/parity/2026-10-03T04-38-35-578Z/` (git-ignored).

Cases fully passing: 0/2. Checks passing: 7/14.

- **MP13:** 4/8.
- **MP14:** 3/6. `sources.sitemap.files.0.kind` is now `absent` and passes. It was `unreadable` on 8da3e73 and on PR #105's commits.
- **Sitemap file in both:**
  - `url: https://python.org/sitemap.xml`
  - `finalUrl: https://www.python.org/sitemap.xml`
  - `status: 404`, `kind: absent`, `error: null`, `proxyUsed: true`
  - No `sitemap_unreadable` warning.
- **Start page in both:** `startPage` was 200 but `failed` / `empty_unverified` with 0 links, with the warnings `start_page_unreadable` and `start_page_client_rendered`. This is the undecoded gzip body that PR #105 fixes; this commit does not contain that fix. The remaining failed checks follow from it: `status`, the link counts and `refused.hostDenied`.

Nothing was run with both fixes together. So whether MP13 and MP14 pass once both are merged is not verified. MP13's `^https://` URL check would still see the map's `http://docs.python.org/...` variant (see the PR #105 record).
