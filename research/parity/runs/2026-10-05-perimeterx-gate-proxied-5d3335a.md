# PerimeterX press-and-hold gate: real-site check, 2026-10-05

Source commit: `5d3335a` (branch `claude/gate-perimeterx`). The local API (`npm run api`, port 8787, `W2L_SOURCE_COMMIT=5d3335a`) ran **proxied**: `HTTPS_PROXY=http://127.0.0.1:7890`. Not run direct.

## The report being fixed

Earlier on 2026-10-05 (source `29e77ed`, no runtime change from `a48c9c4`, proxied), `POST /v1/scrape` for https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960 answered `success` on lane `browser_local`, with 525 characters of Markdown: Walmart's PerimeterX challenge ("Robot or human?", "Activate and hold the button to confirm that you’re human. Thank You!"). `5d3335a` classifies that page `blocked` / `captcha`.

## Re-run on `5d3335a`

`POST /v1/scrape` `{ "url": "https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960", "debug": true }`

| Lane | HTTP | final URL | status | blockReason | extract |
| --- | --- | --- | --- | --- | --- |
| http | 200 | the browse URL (no redirect) | failed, `empty_unverified` | null | warning `client_rendered_suspected` (`script_shell`) |
| browser_local | 200 | the browse URL (no redirect) | failed, `empty_unverified` (the answer) | null | pageType article, confidence 0, escalate true |

**The live page served something else this time.** The API was not challenged: it got Walmart's real browse page, and the extractor found no main content in it. The answer's 4324 characters of Markdown are site chrome (skip link, logo, "Pickup or delivery?", account links), kept as evidence on the failed result. There was no gate to classify, so this run does not exercise the fix. It does show the fix does not block Walmart's ordinary page.

## The challenge page, fetched directly the same day

These requests went through the same proxy with `curl` and a Chrome user agent, outside the API. The bytes stayed in a scratch directory, not the repository. Each page was classified with `classifyGate` at `5d3335a`, both without and with `contentful: true`, and both modes gave the same verdict.

| Page | HTTP | verdict | signals |
| --- | --- | --- | --- |
| the browse URL above → 307 to `/blocked?url=…&uuid=…&vid=&g=b` | 200 | captcha | px_captcha_script, px_app_id, px_captcha_container |
| https://www.walmart.com/ (ordinary page; sets `window._pxAppId`, loads `/px/<appId>/init.js`) | 200 | null | none |
| https://www.zillow.com/ (stock PerimeterX block template) | 403 | captcha | px_captcha_script, px_app_id |
| https://www.fiverr.com/ ("It needs a human touch") | 403 | captcha | px_captcha_script, px_app_id, px_captcha_container |
| https://www.wayfair.com/ (stock template) | 429 | rate_limit | status_429 (the status decides first) |

The same captures classified with `origin/main`'s gate (`a48c9c4`), without `contentful`: Walmart's `/blocked` page `null`, the bug; Walmart's home page `null`; Zillow `bot_detected_generic` (weak_access_to_page_denied, status_403), now `captcha`; Fiverr already `captcha` (widget_recaptcha); Wayfair `rate_limit`.

A follow-up commit on the same branch narrows the script match to a captcha script URL, so a page that only names the captcha hosts (a CSP or preconnect) is not blocked. The five captures above give the same verdicts and signals under it. The API run was not repeated.

Not checked here: a run where the API itself receives the challenge (the case observed earlier in the day), a direct (unproxied) run, and the `g=a` "Check the box" variant of Walmart's page.
