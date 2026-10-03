# Real-site run 2026-10-03: MP13 and MP14 with the map preferring the https variant

[2026-10-03-mp13-mp14-both-fixes.md](2026-10-03-mp13-mp14-both-fixes.md) left one failed check, MP13's `itemUrls ^https://…python.org/`. The start page links `http://docs.python.org/3/tutorial/introduction.html` and its https form, and the map returned the http one because it was seen first. This branch makes a returned http link take its https variant when the variant is offered too. This only happens on an origin whose robots.txt the map read anyway and which allows the https URL. It also requires that the https URL matches `search`.

Source commit: `bd5b948348544504ed7dbb48e6a79100601991cb`, with a clean working tree. It is a local, unpushed merge, deleted after the run:

1. `git switch -c tmp/mp13-three-fixes origin/main`, where origin/main was `a173348`.
2. `git merge origin/fix/http-lane-content-encoding` (PR #105, `0cc7882`).
3. `git merge origin/fix/sitemap-proxy-host-header` (PR #107, `4f86616`).
4. `git merge fix/map-prefer-https-variant` (this branch at `91a3b0d`).

All merges were clean. On it, `npx tsc --build` was clean and `npm test` passed 146 files / 1828 tests (Node v26.8.1).

On this branch alone (`91a3b0d`), `npx tsc --build` and `npm test` passed 145 files / 1815 tests on Node v26.8.1. They passed the same on Node v22.22.0 (`npm rebuild better-sqlite3` before and after).

Network: proxied. The shell set `HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:7890` and `NO_PROXY=localhost,127.0.0.1,::1,.local`. The sitemap file records have `proxyUsed: true`.

API: `W2L_API_PORT=8853 W2L_SOURCE_COMMIT=bd5b948… npm run api`, Node v26.8.1.

Command: `W2L_API_URL=http://127.0.0.1:8853 node research/parity/run-sites.mjs --only MP13,MP14 --record <scratchpad>/run.md`, run 2026-10-03T05:28:34Z → 05:28:50Z. Raw responses are in `.w2l/parity/2026-10-03T05-28-34-729Z/` (git-ignored).

## Result

Cases fully passing: 2/2. Checks passing: 14/14.

| Case | Both earlier fixes (a1a78cf) | With this branch (bd5b948) |
| --- | --- | --- |
| MP13 python.org, `includeSubdomains: true` | 7/8 | **8/8** |
| MP14 python.org, default | 6/6 | **6/6** |

**MP13** (map `6b9ed205-fb19-46ae-bce7-b1d71c0a55eb`):

- `completed`, no warnings, 13,745 ms.
- 86 links: 23 on `*.python.org` hosts other than www and the apex, and none on `http:`. hostCount 13, hostDenied 40.
- The tutorial link is `{ url: "https://docs.python.org/3/tutorial/introduction.html", via: ["link"], robots: "allowed" }`.
- `refused.collapsed` is 3. The sample `{ url: "http://docs.python.org/3/tutorial/introduction.html", into: "https://docs.python.org/3/tutorial/introduction.html" }` names the http URL as the one folded.

On a1a78cf, 22 links were counted on other `*.python.org` hosts. The 23rd is this tutorial link. As `http://docs.python.org/...` it did not match that check's `^https://` pattern, and now it does.

**MP14** (map `8d666574-ffeb-4c75-87e4-dff72e32e375`):

- `completed`, no warnings, 2,302 ms.
- 63 links, hostDenied 64.
- The tutorial link is off-host by default, so the change has nothing to switch here.

The results depend on #105 and #107 as well as this branch. On main alone, the start page fails on its gzip body and the sitemap loops behind the proxy (see those PRs' records).
