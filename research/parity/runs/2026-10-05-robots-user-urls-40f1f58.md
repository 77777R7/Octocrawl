# robots.txt by who chose the URL: real-site check, 2026-10-05

Source commit: `40f1f58` (branch `claude/robots-user-urls`). The local API (`npm run api`, port 8787, `W2L_SOURCE_COMMIT=40f1f58`) ran **proxied**: `HTTPS_PROXY=http://127.0.0.1:7890`. Not run direct.

The requests below were sent from a scratch script outside the repository (deleted after the run); each is given as its request body.

## 1. Scrape: URLs the seed run of 2026-09-30 refused under robots.txt

`POST /v1/scrape` `{ url, debug: false }`

| URL | status | HTTP | robotsDecision | warning |
| --- | --- | --- | --- | --- |
| www.gstatic.com/…/google-2025-environmental-report.pdf | success | 200 | disallowed, userOverride true, overrideBasis user_named_url | robots.txt disallows this URL (rule /); fetched because the request named it |
| delivery-p112322-e1154416.adobeaemcloud.com/…/Equinix-Inc_2025_Data-Summary.pdf | success | 200 | disallowed, user_named_url | rule / |

## 2. Batch

`POST /v1/batches` `{ urls: [go2.digitalrealty.com/rs/087-YZJ-646/images/Report_Digital_Realty_2605_Impact_Report.pdf, aka.ms/SustainabilityFactsheet2025, www.scrapethissite.com/lessons/] }`

All three `success`, HTTP 200, `disallowed` with `overrideBasis: "user_named_url"` (rules `/rs/`, `/`, `/lessons/`). `GET /v1/batches/:id/errors` gave `robotsBlocked: []`.

## 3. Crawl: discovered links obey robots.txt unless `ignoreRobotsTxt`

`POST /v1/crawl` `{ url: "https://www.scrapethissite.com/", maxPages: 8, crawlEntireDomain: true, sitemap: "skip" }`, then the same with `ignoreRobotsTxt: true`.

| Request | pages / errors | /lessons/ | /faq/ |
| --- | --- | --- | --- |
| without | 5 / 3 | failed, policy_denied, not requested; userOverride false, overrideBasis null | the same |
| ignoreRobotsTxt | 7 / 1 | success, 200; disallowed, overrideBasis ignore_robots_txt, warning "started with ignoreRobotsTxt" | the same |

## 4. Map

`POST /v1/map` `{ url: "https://www.scrapethissite.com/" }`, then with `ignoreRobotsTxt: true`.

| Request | links | refused.robots | links with robots disallowed |
| --- | --- | --- | --- |
| without | 3 | 2 (/lessons/, /faq/) | none |
| ignoreRobotsTxt | 5 | 0 | /lessons/, /faq/ |

## Existing batches on the same commit, proxied

- L: 12 of 12 cases, 85 of 85 checks ([2026-10-05-L-robots-user-urls-40f1f58.md](2026-10-05-L-robots-user-urls-40f1f58.md)); L11's crawl read data.gov.uk's robots.txt (no Crawl-delay, seed allowed).
- map: 16 of 18 cases, 157 of 157 checks; MP17 and MP18 skipped, not run (they need `W2L_MCP_MAP_URL`) ([2026-10-05-map-robots-user-urls-40f1f58.md](2026-10-05-map-robots-user-urls-40f1f58.md)). The cases that count robots refusals pass unchanged.

Not checked here: the hosted refusals (`robotsOverride`, `robotsOverrides`, `ignoreRobotsTxt` on a `--hosted` server) and the unreachable-robots.txt path, which are covered by the unit tests only; a direct (unproxied) run.
