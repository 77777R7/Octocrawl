# Moving a Firecrawl workflow to Octocrawl: check the v1 boundary first

Local review draft — 16 October 2026. Not registered as a blog route or included in sitemap/llms output. Source review and local parser fixtures support this draft; current Firecrawl SDK end-to-end migration and matched service performance are not tested.

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

The following is source-verified at Octocrawl commit `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`, in `packages/contracts/src/firecrawl.ts` and `packages/api/src/app.ts`. Its snapshot names 18 September 2026 and v1. Local parser fixtures were rerun on 16 October; they do not prove arbitrary SDK compatibility.

| Scope | Status | Migration action |
| --- | --- | --- |
| v1 scrape and map; crawl start/status | Selected paths supported | Keep `/fc/v1` in a raw request; inspect the resulting envelope |
| Markdown, links, HTML/raw HTML and selected other formats/options | Supported subset | Check every option against parser refusals; do not assume unknown keys are ignored |
| Search, interact, agent, monitor and extract endpoints | Outside shim | Retain original service or write a separate native integration |
| JSON format through `/fc` | Refused | Use native Octocrawl JSON extraction and review its schema/source limits |
| Local browser actions | Partial, local route/configuration dependent | Test actual steps and returned artifact shapes; hosted service refuses actions |
| Current Firecrawl v2 client | Not established | Inspect actual outgoing paths; do not advertise a drop-in replacement |
| Hosted Octocrawl `/fc` | Unavailable | The public hosted gate refuses `/fc`; run the bridge yourself |

## A narrow migration check

With the Octocrawl repository’s dependencies/build installed, start a local API in a separate terminal:

```bash
npx octocrawl serve
```

Then inspect a raw request before changing an SDK:

```bash
curl http://127.0.0.1:8787/fc/v1/scrape \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/","formats":["markdown"]}'
```

The path above is verified in source; this public-URL request was not executed as a migration benchmark in this draft. Inspect HTTP status, `success`, `data.markdown` and `data.metadata.error`. A page failure may be HTTP 200 with `success:false`. Unsupported parameters/formats are explicit HTTP 400 refusals. Test one successful page, one failure and one unsupported option from your own workload before migrating it.

For source reproducibility in this checkout:

```bash
npx vitest run packages/contracts/test/firecrawl.test.ts
```

The 24 passing parser/contract cases are a local fixture check. They do not run Firecrawl’s current service, measure quality on public targets or prove parity. A future measured comparison needs identical URLs, declared expected content, versions, region, cache/retry policy and timing boundaries, with every failed/partial item retained.

## Who should try which path?

Try native Octocrawl locally if keeping scrape records on your infrastructure and inspecting provenance matters, and you can validate its output on your actual targets. Try the limited bridge only when your existing calls fit its selected v1 surface. Keep or evaluate Firecrawl when you need its documented v2 API families or a managed workflow that has not been reproduced in Octocrawl. Use the [free converter](https://octocrawl.dev/tools/url-to-markdown/) to inspect a single eligible public page before building an integration; it is HTTP-only and has its own limits.
