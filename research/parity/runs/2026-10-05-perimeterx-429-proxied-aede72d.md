# PerimeterX challenge served with 429: real-site check, 2026-10-05

Source commit: `aede72d` (branch `claude/gate-px-429`, built on `claude/gate-perimeterx` at `09d947b` with `origin/main` at `932170a` merged in). Every request below went **proxied** through `HTTPS_PROXY=http://127.0.0.1:7890`. Nothing was run direct.

## The report being fixed

Earlier on 2026-10-05, `GET https://www.wayfair.com/` answered HTTP 429 with PerimeterX's stock block template. `classifyGate` checked the status first and returned `rate_limit` (`status_429`). The ladder treats `rate_limited` as terminal, and the API offers no handoff for it. So a press-and-hold challenge that a person can pass was reported as "slow down".

## The 429 shape still holds

Each page was fetched with `curl -s -m 25 -A '<Chrome 129 UA>' -H 'Accept: text/html' -D <headers> -o <body> <url>`. The bytes stayed in a scratch directory, not the repository.

Every Wayfair-family storefront answered 429 with the same template:
- `<title>Access to this page has been denied</title>`
- `<meta name="description" content="px-captcha">`
- `window._pxAppId = 'PX3Vk96I6i'` with `_pxUuid` and `_pxVid`
- `pxCaptchaSrc = '/3Vk96I6i/captcha/captcha.js?a=c&u=…'`, with a fallback to `https://captcha.px-cloud.net/PX3Vk96I6i/captcha.js?…`

None of them sent `Retry-After`. Wayfair's own response came through Cloudflare (`server: cloudflare`) and set a `_pxhd` cookie.

Each capture was classified with the gate at `09d947b` ("old", #218 without this change) and at `aede72d` ("new"). The new gate gave the same verdict with and without `contentful: true`.

| Page | HTTP | old | new |
| --- | --- | --- | --- |
| https://www.wayfair.com/ | 429 | rate_limit (status_429) | captcha (px_captcha_script, px_app_id, status_429) |
| https://www.wayfair.com/furniture/sb0/sofas-c413892.html | 429 | rate_limit | captcha (same signals) |
| https://www.wayfair.ca/ | 429 | rate_limit | captcha (same signals) |
| https://www.wayfair.co.uk/ | 429 | rate_limit | captcha (same signals) |
| https://www.allmodern.com/ | 429 | rate_limit | captcha (same signals) |
| https://www.birchlane.com/ | 429 | rate_limit | captcha (same signals) |
| https://www.jossandmain.com/ | 429 | rate_limit | captcha (same signals) |
| https://www.perigold.com/ | 429 | rate_limit | captcha (same signals) |
| https://www.zillow.com/ | 403 | captcha (px_captcha_script, px_app_id) | unchanged |
| https://www.priceline.com/ | 403 | captcha (px_captcha_script, px_app_id) | unchanged |
| https://www.fiverr.com/ | 403 | captcha (+ px_captcha_container) | unchanged |
| https://www.walmart.com/ (ordinary page with the sensor) | 200 | null | null |

Also probed that day, none of them PerimeterX: stockx.com, ssense.com and goat.com (403, Cloudflare); homedepot.com (403, "Access Denied"); crunchbase.com (200). No PerimeterX site other than the Wayfair family answered 429.

## API run on `aede72d`

The API was started with `W2L_SOURCE_COMMIT=aede72d npm run api` (port 8787). Its startup log said outbound requests use the environment proxy `127.0.0.1:7890`.

Request: `POST /v1/scrape` `{ "url": "<url>", "debug": true }`

| URL | HTTP | status | blockReason | channelsTried | escalations | handoff |
| --- | --- | --- | --- | --- | --- | --- |
| https://www.wayfair.com/ | 429 | blocked | captcha | http | http → browser_local_authed (`blocked:captcha`) | `captcha_required`, rationale offers `handoff: true` |
| https://www.allmodern.com/ | 429 | blocked | captcha | http | same | same |

The `gate_detected` trace event carried `signals: ["px_captcha_script","px_app_id","status_429"]`. The `host_cooldown_set` event still fired (status 429, `cooldownMs: 250`, because no Retry-After was sent). The agent hints were the gate hint, which offers handoff, and `wait until <retryAt> before asking <host> again`.

Not run: the API on the pre-change commit. The "old" column comes only from classifying the captures. Also not run: a direct (unproxied) run, a handoff (`handoff: true`) through to the page, and a 429 PerimeterX page that sends `Retry-After` (the unit test covers that shape). Wayfair is not listed in `research/parity/sites.md`.
