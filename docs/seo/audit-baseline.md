# Octocrawl SEO baseline — 2026-10-16

Observed from 02:40 Asia/Shanghai on 16 October 2026; individual evidence files retain exact timestamps. Source baseline: `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`. This record describes production observations and local checks separately. Raw responses, exports and screenshots are in this checkout’s ignored `.w2l/seo-20261016/`.

## Code, service and production identity

`apps/public-web/src/page.ts`, `src/tools/*` and `src/product/*` → Vite prerender (`vite.config.ts`) → `apps/public-web/dist`. `scripts/build-docs.mjs` registers 11 docs and 6 articles, writes static HTML/Markdown copies, redirects, robots and sitemap. `packages/public-preview/src/server.ts` serves those files and first-party APIs. `site.ts` replaces `__W2L_ORIGIN__` at request time. Cloudflare’s `cloudflare/public-preview-proxy/worker.js` forwards the public domain to Cloud Run. Build/deploy entry: `Dockerfile.public-preview`, `cloudbuild.public-preview.yaml`, `docs/public-preview.md`.

Read-only Cloud Run inspection located the actual project `octopus-w2l-20260924-7r7`, region `asia-southeast1`: revision `w2l-public-preview-verify-bc47bf0e`, tag `r87verify`, receives 100% of service traffic. Its `W2L_SOURCE_COMMIT` is the full baseline SHA above and `W2L_PUBLIC_ORIGIN=https://octocrawl.dev`. Image digest is retained in `production-revision.json`. The similarly named `octocrawl-199d2` project is not this runtime; its disabled API was not enabled. No configuration or traffic was changed.

## Crawl and indexing evidence

| Check | Observation | Evidence / limit |
| --- | --- | --- |
| Production sitemap | 25 unique canonical content URLs; all 25 return 200 in browser fetch; no HTML noindex or X-Robots-Tag found on them | `live-discovery.json`, `live-url-audit.json`; HTTP inspection, not all-page rendering |
| Rendered priority pages | Home, 3 tools, `/scrape/`, MCP, RAG and Claude Code article: H1, canonical, visible body and parsed JSON-LD present | `live-rendered.tool.json`; eight actual navigations |
| Ordinary client | Python urllib: home, robots, sitemap and MCP each return 403, body `error code: 1010` | `http-client.json`; one request per URL; no UA impersonation or bypass |
| Browser client | Home and priority pages load; robots/sitemap fetch 200 | Same browser context, normal identity; says nothing about every crawler |
| GSC property | Authenticated `sc-domain:octocrawl.dev`: 24 indexed, 9 not indexed; last update displayed 12 Oct 2026 | [Page indexing](https://search.google.com/search-console/index?resource_id=sc-domain%3Aoctocrawl.dev); report lags live state |
| GSC exclusions | noindex 3; redirect 3; forbidden 403 1; crawled currently not indexed 2 | Not every exclusion is a defect; drilldown of 403 shows only `https://api.octocrawl.dev/`, last crawled 8 Oct |
| Submitted sitemap | Submitted 10 Oct, last read 14 Oct, Success, discovered pages 25 | [Sitemaps](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aoctocrawl.dev); no submission performed here |
| Link Extractor URL inspection | URL is on Google; Page is indexed; Googlebot smartphone; crawl/fetch/index allowed; declared and selected canonical are inspected URL | [Saved inspection](https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aoctocrawl.dev&id=gqRSbrnFod1PKHbAo7tRaw). Last crawl displayed `15 Oct 2026, 19:04:35`; UI timezone not independently established. This is Google’s stored result; TEST LIVE URL / REQUEST INDEXING were not used |
| Cloudflare verified-bot events | Unread | No authenticated Cloudflare security-event/log surface was available; request difference root cause and verified-crawler impact remain unknown. No rule change justified |
| Core Web Vitals | GSC overview shows no mobile/desktop data | No field performance conclusion or ranking benefit claimed |

The 403 client difference is real; a sitewide Google indexing block is not established. The inspected tool has a successful stored Google crawl. Do not use an API-host 403 or a Python 1010 to propose a broad allow rule. A future rule proposal requires the exact Cloudflare rule, path, action, timestamp and verified bot identity, then a narrow match and rollback.

Production reading may trigger the existing page-view sender. After the initial read, inspection used DNT/internal marking; no production extraction, synthetic event POST, account write or sitemap/indexing submission was performed. Baseline measurement ends 13 Oct, before this audit.

## Local URL classes and technical outcome

| Class | Policy / result |
| --- | --- |
| Home, `/scrape/`, tools hub + 3 tools, 11 docs, blog + 6 articles, changelog | 25 planned index URLs. Built pages have unique title/description, one H1, self canonical and parseable schema where present |
| 3 blog categories | `noindex, follow`; excluded from sitemap; blog index lists the articles |
| Sign-in/email and 8 dashboard pages | `noindex`; excluded from sitemap; authentication remains the access boundary |
| 404 | HTTP 404 and noindex; excluded |
| API, auth callbacks and health | API is disallowed in robots; dynamic auth paths are not missing static files; no access policy changed |
| Historical docs guide routes | Existing permanent redirects lead to registered blog articles; not new canonical content |
| Markdown copies / llms files | Reader resources, not HTML article duplicates to add to sitemap; server supplies canonical Link headers for Markdown copies |
| Query variants | Existing canonical paths retained; source server already normalizes directory/index.html forms; no new parameter landing pages |

Local `built-audit.json`: 39 HTML files; 25 sitemap URLs; zero duplicate titles/descriptions among planned index pages; zero missing internal files/anchors after accounting for dynamic `/auth/*` routes. No broken technical template or sitemap inclusion defect was reproduced. Existing lastmod dates are only advanced on pages with substantive changed content. No SSR, FAQ-schema, llms or robots rebuild was needed.

## Confirmed content / measurement gaps addressed

- Link tool title/hero implied all pages, though `map.ts` caps free discovery at 500 URLs and 50 sitemap files and only reads the start page’s links. Updated title, description, schema copy, hero and hub card to match that scope.
- Home FAQ still said the capability hint URL entered hosting request logs; `main.ts` already uses POST with the URL in the body, and Privacy describes that behavior. Corrected the FAQ and its generated Schema together, retaining the actual logging limits.
- Shared tool block/login/JavaScript explanations now acknowledge unrecognized or incomplete results instead of promising universal detection.
- Markdown “models read best” and unconditional token-saving copy lacked task-specific evidence. Replaced with format properties and tokenizer guidance.
- Markdown/text lacked a shared inspectable output example. Added the same synthetic HTML input and actual local converter outputs, labelled as a format check (not a live extraction).
- RAG’s example automatically ingested partial results and did not consider current readiness/contract verdicts. Added conservative skips and clear handling of unknown/unverified results, preserving historical run dates and counts.
- Copy events fired before clipboard success; map export actions and product code copying were missing from the existing event path. Navigation filtering also now excludes extracted map-result links. Scoped corrections are described in `measurement.md`.

## Gaps

Cloudflare verified-bot logs, complete prior-period history, target correctness in historical event logs, stable cross-day attribution and platform-by-platform AI answer sampling remain unavailable or unmeasured. See `measurement.md` and `ai-visibility.md`. No growth, conversion or stable recommendation conclusion follows from these observations.
