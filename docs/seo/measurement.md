# Search and useful-use measurement — 2026-10-16

Source: authenticated GSC exports and Cloud Logging; observed 16 Oct Asia/Shanghai. Evidence directory: `.w2l/seo-20261016/`. This updates definitions around the existing `scripts/public-preview/weekly-report.mjs`; it does not replace that report or install analytics.

## Search baseline and quality

[GSC Web report](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aoctocrawl.dev&start_date=20260916&end_date=20261013&compare_start_date=20260819&compare_end_date=20260915): current 16 Sep–13 Oct inclusive, previous 19 Aug–15 Sep inclusive, each 28 calendar days. UI last update: 5.5 hours ago. Export `Filters.csv` says Web (text-based). All countries/devices; no query filter. Dates retain GSC’s calendar labels; they are not relabelled as Beijing days.

- Current UI: 0 clicks, 1.69k impressions, 0% CTR, average position 69.8. Countries and Devices exports each sum to **1,689 impressions**. Previous report displays zeros, including position 0: this does **not** establish full historical coverage or a real position of zero. The unfiltered chart only showed 30 Sep–13 Oct. Two complete comparable observed 28-day windows are not available; no growth percentage is calculated.
- 75 unique visible queries, 25 unique page rows, 34 countries, 3 devices; no duplicate dimension keys. Visible query impressions sum to 1,635; query detail is not exhaustive. Brand rule: case-insensitive `octo[ -]?crawl|octocrawl\.dev|\bw2l\b`. No visible query matches; this establishes an empty visible brand subset, not absence of all branded searches.
- Page impressions sum to 1,762; retain page aggregation separately from the property aggregate. Do not force totals to reconcile across grains. Historical HTTP URLs and moved docs routes appear; do not reinterpret their history as today’s canonical path without a mapping.
- Desktop 1,094, mobile 525, tablet 70 impressions. Top country counts: US 286, Ukraine 265, Belarus 220. These describe the report’s search exposure, not verified customer locations or demand.

| Page group (observed URL path) | Page impressions | Clicks | Interpretation |
| --- | ---: | ---: | --- |
| Home/product, including historical HTTP home | 18 | 0 | Small count; no funnel inference |
| Tools | unknown | unknown | No tool rows in export; absence is not measured zero |
| Docs, including historical moved guides | 81 | 0 | MCP 17, reference 13; setup intent is relevant |
| Blog | 1,652 | 0 | Find-all-pages article 1,632; prioritize clear discovery boundaries and its existing tool link |
| Changelog | 11 | 0 | Project/navigation intent |

Raw export: `gsc/` (original ZIP and unmodified CSVs), profile `gsc-profile.json`, grouped counts `measurement-summary.json`. The original export includes current and comparison columns. No low-denominator uplift or causation claim is made.

## Existing first-party collection

`src/analytics.ts` and `public/docs-assets/docs.js` → same-origin `POST /api/events` → `parseWebEvent` in `packages/public-preview/src/site.ts` → `server.ts` structured log `w2l_web_event`. Client DNT/GPC suppresses sending; server DNT/`Sec-GPC` suppresses logging. Beacon accepted means no fetch fallback; rejected beacon falls back once. There is no delivery ID or global deduplication across repeated clicks/reloads.

Existing names: `page_view`, `example_click`, `view_change`, `result_copy`, `result_download`, `get_code_open`, `get_code_copy`, `link_click`, `docs_code_copy`, `mcp_client_select`, `example_tab`, `selfhost_tab`, `waitlist_open`, `waitlist_submit`, `markdown_mode`. No new event name or receiver field is added this round.

Existing props allowlist: `path/ref/utm_source/utm_medium/utm_campaign/from/view/tab/target/href/client/trigger/mode`. Referrer is a host; links omit query strings; extracted result links are excluded. Existing UTM strings are short but free text: never place secrets in campaign tags. Receiver rejects unknown fields and long/control-character values. No new cookie, fingerprint, external service or target URL/body is introduced. Daily `vid` is an HMAC pseudonym rotated each UTC day; quota cookie already existed. Declared log retention is 30 days; authenticated inspection of Cloud Logging `_Default` confirmed `retentionDays: 30` (`log-retention.json`). Account/Firestore TTL policies were not independently audited.

Existing outcome logs: `w2l_preview` (status, HTTP, diagnostic code, target host, milliseconds, daily visitor, automated/internal flags); `w2l_map` (status, links count, stoppedBy and similar fields). They are server outcomes, not proof that a result rendered or satisfied a task. Neither currently provides a full target-verification funnel. Weekly-report source currently summarizes previews, not maps; map outcomes were separately inspected in this audit.

## Observed usage counts and limitations

Cloud Logging query: service `w2l-public-preview`, same UTC bounds `2026-09-16T00:00:00Z` to `<2026-10-14T00:00:00Z`, 1,055 structured rows, cap 200,000 not reached; first row 30 Sep, last 13 Oct. Existing `automated=true` and `internal=true` exclusions leave 455 page views / 316 visitor-days. Two known deployment-tag page views (`deploy-check-r22`, `utm_source=deploy-check`) remain in that report’s output; excluding them in this audit leaves **453 page views / 315 visitor-days**. Remaining automation misclassification is unknown; these are observations, not 315 proven people.

Observed page views after those exclusions: home/product 350, docs 83, tools 14, blog 5, other 1. Five page views carry `bing.com` referrer; 444 had no referrer/source before the extra two-test exclusion. No-referrer is not automatically organic or direct. Preview outcomes: success 22, blocked 2, quota_exceeded 2; map outer success 1. Existing export actions: result_copy 2 and result_download 2; neither historically proves target correctness or successful clipboard write.

Hosted request log query (same UTC bounds): 9,859 rows, first 6 Oct, last 13 Oct, cap not reached. MCP 6,226 requests; `/v1/scrape` 96 (63 HTTP 2xx); `/v1/map` 31 (22 HTTP 2xx). These include setup/protocol requests, automated calls and operator checks. **They are not successful task counts, new users or first API use.** No cross-site identity is joined. Source totals are in `hosted-summary.json`.

## Metric dictionary

| Metric | Definition / available evidence | Status |
| --- | --- | --- |
| Nonbrand search clicks | GSC visible query clicks excluding recorded variants; separately show property totals and query omissions | Available export; no complete comparable history |
| Search landing page view | `page_view` with known search referrer host; withheld referrer stays unknown | Partial observation; 5 Bing-labelled views in window |
| Request/outcome | Server `w2l_preview` or `w2l_map`, by status; invalid/quota/blocked separate | Existing, aggregate only |
| Delivered result | Matching output actually rendered and nonempty where the task requires it | Browser QA verifies fixtures; historical server status alone insufficient |
| Useful-use proxy | Clipboard write resolved or export initiated from available results, by page/view | Local correction verified; not proof of a user’s goal, saved file or accurate fields |
| Partial / failed / blocked | Keep each state and denominator; map outer success does not imply complete discovery | Must inspect native map status/stoppedBy; historic outer log insufficient |
| Task verification | `not_requested` unverified; passed scoped to checks; failed not complete | Not collected in current web-event logs; no inferred verified-use count |
| First API/MCP call | Actual account/service call, not copied config or HTTP request alone | Not measured across current site → account boundaries |
| Repeat use | Same lawful stable identity and explicit window | Cross-day anonymous retention unavailable; daily visitor-days are not retention |

## Local changes and validation

- Exclude `.map-row` extracted links from navigation clicks; the previous selector only covered other result views. This closes an actual path-leak gap without collecting a new field. The prior selector was replayed: it delivered two events instead of the one allowed navigation event; the corrected receiver test passes.
- Add current **page pathname** to existing events in both senders. No submitted URL/query/body is sent.
- Emit result/code copy only after `clipboard.writeText` resolves; failed clipboard writes do not count as successful copies. `docs_code_copy` is reused for product code copying.
- Link Extractor map: reuse result_copy with `view=map`, result_download with `view=map-text/map-csv`. Downloads count initiation, not completed disk writes. Filters may leave no URLs; review volume alongside the proxy.
- Website-to-Text shares the Markdown view internally: default output is plain text; `view=markdown` alone cannot identify the presentation mode. Use page path for the default tool and retain this limitation.

Seven sender/receiver integration cases verify beacon/fallback once, path-only payload, rejection of target-url fields and DNT/GPC on client and receiver. Browser QA additionally exercises real clipboard success/failure and downloads against a local receiver. Test traffic stays local; production logs were read only.

## Next collection

Use GSC’s same property, Web (text-based) report, complete dates and comparison, export CSV with query/page/country/device dimensions. Preserve Filters, exact date headers and source cutoff. Once enough history exists, compare two complete 28-day windows; keep queries missing through privacy limits unknown. The account currently also exposes a separate generative-AI Beta report; see `ai-visibility.md`. Reuse the weekly report for counts, retaining known-test exclusions and its map/attribution limitations. No recurring task was created.
