# Moving a Firecrawl workflow to Octocrawl: check the v1 boundary first

Tested 16 October 2026 with official `@mendable/firecrawl-js@4.42.0` against a local Octocrawl API. This is a version-bounded migration check, not v2 drop-in compatibility or a hosted-service benchmark.

Octocrawl is an option when you want to run scrape, map and crawl workflows on your own machine and inspect page evidence. Start by listing the endpoints and formats your application actually calls. Its local Firecrawl shim covers selected **v1** shapes; changing the base URL of a current Firecrawl client is not enough to establish compatibility.

Firecrawl’s [current introduction](https://docs.firecrawl.dev/introduction) uses v2 API paths and documents a wider set of operations. Keep Firecrawl if your workflow depends on those APIs until you have a tested replacement. For a fresh Octocrawl integration, use its [native reference](https://octocrawl.dev/docs/reference/) and [MCP setup](https://octocrawl.dev/docs/connect-mcp/) rather than assuming a migration shim is a complete API.

## Choose a deployment before comparing features

| Decision | Firecrawl | Octocrawl |
| --- | --- | --- |
| Managed service | Official hosted API; current docs use v2 | Hosted native REST/MCP; scrape and map, with mode/key restrictions |
| Run it yourself | [Official self-hosting guide](https://docs.firecrawl.dev/contributing/self-host); check that deployment’s supported features | Local CLI/API/MCP; local crawl/batch/Monitor exist; capabilities depend on configuration |
| Compatibility bridge | Audit the version your application sends | Local `/fc/v1/scrape`, `/fc/v1/map`, `/fc/v1/crawl`, `/fc/v1/crawl/:id`; selected options only |
| Evidence / acceptance | Inspect the actual fields your workflow uses | Native `evidenceRecord` records source, fetch time and hashes; `/fc` keeps its response shape and does not carry that native record |
| Billing comparison | [Official pricing](https://www.firecrawl.dev/pricing), retrieved 16 Oct: credit units depend on endpoint/features; free tier listed as 1,000 credits/month | Hosted free account allowance is 1,000 credits/month; HTTP page 1 credit, browser page 5; local operation uses your infrastructure |

These credits are not equal units of work across providers. No cost or speed winner is claimed. Firecrawl’s pricing page contains differing Monitor credit statements, so no Monitor price is reproduced here. Octocrawl’s core repository is AGPL-3.0-only; individual client packages have their own licenses (for example the TypeScript SDK is MIT). Firecrawl’s repository carries [AGPL-3.0](https://github.com/firecrawl/firecrawl/blob/main/LICENSE); review the applicable package/service terms for your deployment.

## What the local bridge covers

The following is source-verified at Octocrawl commit `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`, in `packages/contracts/src/firecrawl.ts` and `packages/api/src/app.ts`. Its snapshot names 18 September 2026 and v1. Parser fixtures and actual client calls were run on 16 October. The client was pinned to 4.42.0, the repository’s frozen comparison version; it is not asserted to be the newest release.

| Scope | Status | Migration action |
| --- | --- | --- |
| v1 scrape and map; crawl start/status | Selected paths supported | Keep `/fc/v1` in a raw request; inspect the resulting envelope |
| Markdown, links, HTML/raw HTML and selected other formats/options | Supported subset | Check every option against parser refusals; do not assume unknown keys are ignored |
| Search, interact, agent, monitor and extract endpoints | Outside shim | Retain original service or write a separate native integration |
| JSON format through `/fc` | Refused | Use native Octocrawl JSON extraction and review its schema/source limits |
| Local browser actions | Partial, local route/configuration dependent | Test actual steps and returned artifact shapes; hosted service refuses actions |
| Default v2 method in the tested 4.42.0 client | Fails at `/fc/v2/scrape` (404) | Use an explicitly tested legacy v1 method or a native integration; changing the base URL alone fails |
| Hosted Octocrawl `/fc` | Unavailable | The public hosted gate refuses `/fc`; run the bridge yourself |

## What happened with an actual client

On 16 October 2026, we installed the official `@mendable/firecrawl-js@4.42.0` from npm outside the Octocrawl checkout. Its requests went through a loopback logging relay to the real local API at source commit `23517407f5c75aa0135db28a9eb42ee498adad23`. The relay recorded HTTP requests/responses without mocking the SDK or extraction engine. Public target fetches used the shell’s existing operator proxy; loopback traffic was direct. No Firecrawl hosted calls or paid credits were used.

| Call | Wire result | What the application sees |
| --- | --- | --- |
| `client.scrape(...)`, base URL ending in `/fc` | `POST /fc/v2/scrape`, 404 | v2 SDK error; no matching route |
| `client.v1.scrapeUrl(...)` | `POST /fc/v1/scrape`, 200, `success:true` | Flattened `markdown`, `html`, `links`, `metadata`; no `data` wrapper |
| v1 scrape of an intentionally missing page | API HTTP 200, `success:false`, target `metadata.statusCode:404`, `metadata.error:http_error` | SDK throws a misleading “No response received” error with `statusCode:0`; the wire did receive a response |
| v1 scrape with JSON format or an unknown parameter | HTTP 400 with a named refusal | SDK throws; JSON is not available through this bridge |
| v1 map with sitemap disabled, search and limit | `POST /fc/v1/map`, 200 | URL strings; the controlled `child` filter returned exactly the expected child URL |
| v1 map with `useIndex:true` | HTTP 400 `unsupported_parameter` | SDK throws; no implicit URL index |
| v1 crawl start and default status check, `limit:1` | `POST /fc/v1/crawl`, then `GET /fc/v1/crawl/:id` | One completed page; this does not test full-site completeness or multi-page pagination |
| v1 status check with explicit `skip:0` | HTTP 400, use `next` instead | SDK reports `statusCode:500`, masking the wire status |

The crawl wire response also had `expiresAt:null`; this SDK converted it to a JavaScript date at `1970-01-01T00:00:00.000Z`. Do not interpret that date as a real expiry. These are observed integration caveats, not claims about every Firecrawl client version.

The successful public example returned readable content, while the missing public path returned a genuine target 404 retained inside the failure response. Separate synthetic HTTP pages then checked exact heading/body/link markers: `formats: markdown/html/rawHtml/links`, `includeTags`, `excludeTags`, `onlyMainContent:false`, `fastMode` and `timeout` all reached the API. The Markdown kept the expected absolute child link, cleaned output removed the excluded marker, and raw HTML retained it. Ten controlled client acceptance cases passed, including expected refusals and error-shape mismatches. This validates the listed calls and markers; it does not measure arbitrary-site extraction quality, browser actions, PDF behavior, timeouts under load or service parity.

## Try an explicitly versioned v1 call

Start the source checkout used for this check with `npm run api` (default port 8787), after installing/building its dependencies. Install the pinned client in a separate example project. The base URL ends in `/fc`, because the SDK appends `/v1/scrape` itself:

```javascript
import Firecrawl from '@mendable/firecrawl-js'; // tested: 4.42.0

const client = new Firecrawl({
  apiKey: 'local-test-only', // dummy label for this loopback server, not a hosted key
  apiUrl: 'http://127.0.0.1:8787/fc',
});

try {
  const page = await client.v1.scrapeUrl('https://example.com/', {
    formats: ['markdown', 'links'],
    fastMode: true, // HTTP only; not a browser fallback
    timeout: 15000,
  });
  // The v1 SDK flattens data. Do not read page.data.markdown here.
  if (page.success !== true || !page.markdown?.trim()) {
    throw new Error('No usable page body');
  }
  console.log(page.markdown, page.metadata?.statusCode);
} catch (error) {
  // For this tested SDK, inspect the API response/log when diagnosing failures:
  // a thrown statusCode 0 can conceal HTTP 200 + success:false.
  console.error(error.message);
}
```

A nonempty page remains unverified against your task. The bridge does not carry the native `evidenceRecord`, `verification` and `readiness` objects; use the native API when your acceptance check needs those fields. This small example uses the public documentation example domain once; use your own permitted target for sustained tests.

The repository includes the [actual-client acceptance harness](https://github.com/77777R7/Octocrawl/blob/main/scripts/seo/verify-firecrawl-client.mjs) and [reproduction procedure](https://github.com/77777R7/Octocrawl/blob/main/docs/seo/firecrawl-client-verification.md). The harness uses synthetic local HTTP pages and the real SDK/API. Existing parser fixtures remain separately reproducible:

```bash
npx vitest run packages/contracts/test/firecrawl.test.ts
```

Those 24 parser cases and the ten actual-client fixture cases test different layers. Neither runs Firecrawl’s hosted service or establishes cost, speed or coverage superiority. A measured comparison needs identical URLs, declared expected content, versions, region, cache/retry policy and timing boundaries, with every failed/partial item retained.

## Who should try which path?

Try native Octocrawl locally if keeping scrape records on your infrastructure and inspecting provenance matters, and you can validate its output on your actual targets. Try the limited bridge only when your existing calls fit its selected v1 surface. Keep or evaluate Firecrawl when you need its documented v2 API families or a managed workflow that has not been reproduced in Octocrawl. Use the [free converter](https://octocrawl.dev/tools/url-to-markdown/) to inspect a single eligible public page before building an integration; it is HTTP-only and has its own limits.
