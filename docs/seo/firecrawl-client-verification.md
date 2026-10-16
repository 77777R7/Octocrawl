# SEO-06 actual client check — 16 October 2026

## Decision

The migration draft now has enough evidence for **content review as a pinned v1 migration check**. It is not a drop-in v2 replacement guide. Do not publish it with a broader compatibility title or claim. Route registration, publication and any external action remain unperformed. Firecrawl hosted quality, price and speed comparisons are still untested; they are unnecessary for this narrowly scoped article and cannot be inferred from these results.

## What ran

- Official npm package: `@mendable/firecrawl-js@4.42.0`, pinned to the repository's frozen comparison version, not claimed latest. Installed outside the repository with install scripts disabled; no manifest/lockfile changes here.
- Real source API from commit `23517407f5c75aa0135db28a9eb42ee498adad23`, parent main `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`; Node v26.8.1. No extraction-engine changes in this follow-up. Follow-up harness SHA-256 is saved in its JSON report.
- Local API `http://127.0.0.1:18877`; SDK base URL ends in `/fc`. A loopback relay forwards the actual requests/responses without rewriting paths or mocking the SDK/engine. Authorization header is neither needed by this loopback API nor stored in evidence. The SDK dummy key is `local-test-only`.
- Public target: `https://example.com/`, plus intentionally missing `/seo-migration-missing-20261016`. Existing operator HTTP proxy `127.0.0.1:7890`; loopback direct. Successful page body and failed target 404 observed; no repeated benchmark or load test. The example domain itself asks not to rely on it for ongoing testing, so the repeatable acceptance procedure uses a local synthetic site.
- Separate controlled HTTP target, built by the committed harness: real SDK -> real HTTP API -> synthetic local pages. Exact expected heading, body, child link, excluded marker and 404 checks. Ten cases passed, retaining expected negative cases. This is runtime integration evidence, with fixture content explicitly distinguished from public-site extraction.
- `npm run api` initially failed because the earlier `npm ci --ignore-scripts` left better-sqlite3's native binding absent. `npm rebuild better-sqlite3` completed; API then started normally. No source workaround or external service was used.

## Results

| Case | API/wire | SDK / acceptance |
| --- | --- | --- |
| default v2 scrape | `/fc/v2/scrape` 404 | expected incompatibility, throws |
| `.v1.scrapeUrl` | `/fc/v1/scrape` 200 success | flattened output; expected heading/body/absolute link present |
| filtering/formats | markdown/html/rawHtml/links; includeTags/excludeTags/onlyMainContent/fastMode/timeout | excluded marker absent in clean output, retained in raw HTML; exact child link retained |
| target 404 | HTTP 200 success:false, target status404/error http_error | SDK masks it as “No response received”, statusCode0; do not classify as transport failure from exception alone |
| JSON format | 400 unsupported_format | named refusal, throws |
| unknown scrape parameter | 400 unsupported_parameter | named refusal, throws |
| map ignoreSitemap/search/limit/timeout | `/fc/v1/map` 200 | exactly expected child URL in controlled search |
| map useIndex | 400 unsupported_parameter | refused, throws |
| crawl start / default status | POST and GET `/fc/v1/crawl`; limit1 | one completed page, content marker present |
| crawl skip | server400, unsupported_parameter | SDK statusCode500; wire and SDK statuses differ |
| crawl expiry | wire expiresAt:null | SDK Date becomes 1970-01-01; not a real expiry |

`PASS` here means the assertion matches the stated behavior, including refusals. It does not mean v2, JSON, skip or every SDK feature works. The bridge omits native evidenceRecord/verification/readiness; success alone is not task validation. Full-site discovery, multi-page pagination, screenshots/actions, PDF, timeouts under load and current unpinned clients remain untested.

## Reproduce

In a separate terminal in this checkout, start only the local API:

```bash
W2L_API_PORT=18877 W2L_TASK_ROOT=.w2l/seo-20261016/followup/api npm run api
```

Install the official pinned client outside the repository and run the maintained harness:

```bash
npm install --prefix /tmp/octocrawl-seo-client-20261016 --ignore-scripts --no-audit --no-fund @mendable/firecrawl-js@4.42.0
node scripts/seo/verify-firecrawl-client.mjs \
  --sdk /tmp/octocrawl-seo-client-20261016/node_modules/@mendable/firecrawl-js/dist/index.js \
  --api http://127.0.0.1:18877 \
  --out .w2l/seo-20261016/followup/client/fixture-run.json
npx vitest run packages/contracts/test/firecrawl.test.ts
```

Expected: ten harness cases PASS and 24 existing parser cases PASS. The harness refuses non-loopback API hosts and a different SDK name/version; keeps every result/error in JSON and fails if a case is absent or an assertion differs. It creates and closes its own synthetic target and relay; stop the separately started API after review.

Raw ignored evidence: `.w2l/seo-20261016/followup/client/run.json` (initial public calls), `fixture-run.json` (repeatable synthetic targets). SDK source inspection at `dist/index.js` confirmed `/v1/scrape` construction, success flattening, error rewrapping and null-to-Date conversion. [Official Node SDK documentation](https://docs.firecrawl.dev/sdks/node) was read as current context, not as proof that the frozen package is current or that every documented method works here.
