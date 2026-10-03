# Real-site run 2026-10-03: MP13 and MP14 with the Content-Encoding and sitemap Host fixes together

This run combines the two fixes whose records ran them apart: [2026-10-03-http-content-encoding.md](2026-10-03-http-content-encoding.md) (PR #105) and [2026-10-03-sitemap-proxy-host.md](2026-10-03-sitemap-proxy-host.md) (PR #107).

Source commit: `a1a78cfc1cd302d36f309ad4ae4ffed68c180268`, with a clean working tree. It is a local, unpushed merge, made by `git switch -c tmp/mp13-mp14-both-fixes origin/main`, then `git merge origin/fix/http-lane-content-encoding`, then `git merge origin/fix/sitemap-proxy-host-header`. Its parents are:

- origin/main: `5dc6f97f3d4bd9171f72217eecd0000b9e21e1f2`
- PR #105 head: `0cc7882`
- PR #107 head: `711df27`

Both merges were clean. The branch was deleted after the run, so the commit can be recreated with those three commands. On it, `npx tsc --build` was clean and `npm test` passed 146 files / 1818 tests (Node v26.8.1).

Network: proxied. The shell set `HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:7890` and `NO_PROXY=localhost,127.0.0.1,::1,.local`. Each sitemap file record has `proxyUsed: true`. Map responses carry no `evidence.envProxy`, so the runner's line reads "0 of 2".

API: `W2L_API_PORT=8853 W2L_SOURCE_COMMIT=a1a78cf… npm run api`, Node v26.8.1.

Command: `W2L_API_URL=http://127.0.0.1:8853 node research/parity/run-sites.mjs --only MP13,MP14 --record <scratchpad>/run.md`, run 2026-10-03T05:13:09Z → 05:13:25Z. Raw responses are in `.w2l/parity/2026-10-03T05-13-09-315Z/` (git-ignored).

## Result

Cases fully passing: 1/2. Checks passing: 13/14.

| Case | 8da3e73 (M3 batch B) | #105 alone (8c1aa0e) | #107 alone (2b1e972) | Both (a1a78cf) |
| --- | --- | --- | --- | --- |
| MP13 python.org, `includeSubdomains: true` | 4/8 | 6/8 | 4/8 | **7/8** |
| MP14 python.org, default | 2/6 | 4/6 | 3/6 | **6/6** |

**MP13** (map `2ec9ec55-4007-4458-a4e6-1600cb887925`):
- `completed`, `stoppedBy` null, no warnings, 14,156 ms.
- 86 links, 22 of them on `*.python.org` hosts other than www and the apex.
- hostCount 13, hostDenied 40.

**MP14** (map `b2d02f5b-95c0-4450-bec9-7482eafd27f9`):
- `completed`, no warnings, 2,068 ms.
- 63 links, all on www.python.org or python.org.
- hostDenied 64.

**In both:**
- The start page is `{ finalUrl: https://www.python.org/, httpStatus: 200, status: success, lane: http, linksFound: 128 }`.
- The sitemap file is `https://www.python.org/sitemap.xml`: 404, `absent`, no error, `proxyUsed: true`.

## The one failed check

MP13 `itemUrls ^https://([a-z0-9-]+\.)*python\.org/` fails: 1 of 86 links is outside the pattern, `http://docs.python.org/3/tutorial/introduction.html`.

The start page links this URL in both its `http://` and `https://` forms. The map collapses them into the first one it saw: `refused.samples.collapsed` has `{ url: "https://docs.python.org/3/tutorial/introduction.html", into: "http://docs.python.org/3/tutorial/introduction.html" }`. This is how the map collapses scheme variants. Neither fix touches it, and it was the same on 8c1aa0e.
