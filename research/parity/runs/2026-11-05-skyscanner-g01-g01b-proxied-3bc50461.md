# Real-site run 2026-11-04

Command: `node research/parity/run-sites.mjs --only G01,G01b --record research/parity/runs/2026-11-05-skyscanner-g01-g01b-proxied-3bc50461.md`
Source commit: `3bc504619937fc7f840a5b40de7919febff75f98`
Run: 2026-11-04T18:24:48.284Z → 2026-11-04T18:24:54.677Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 2 of 2 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 2/2; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| G01 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 2/2 | — |
| G01b | https://www.skyscanner.com.hk/routes/hkg/tyoa/hong-kong-to-tokyo.html | 2/2 | — |

Notes, written with this record: the run was proxied through the local proxy 127.0.0.1:7890, against an API started with `npm run api` (which runs `npx tsc --build` first) on port 8787 from this commit. Both cases passed on the blocked branch: each route was sent to its host's `/sttc/px/captcha-v2/index.html`, read on `browser_local` and answered `blocked`/`captcha`, no Markdown, readiness `not_served`, with the signals `skyscanner_challenge_url`, `heading_person_or_robot`, `px_captcha_container` and `px_challenge_loader`. G01b's success branch did not run, so its route patterns are unverified.
