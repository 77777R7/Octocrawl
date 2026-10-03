# Real-site run 2026-10-03: map options, /fc map and MCP map tool (M3 batch B)

Command: `node research/parity/run-sites.mjs --only MP07,MP08,MP09,MP10,MP11,MP12,MP13,MP14,MP15,MP16,MP17,MP18 --record research/parity/runs/2026-10-03-m3-map-options.md`
Source commit: `8da3e737d5bd4eb3ad575b61c53e57a3cd345feb`
Run: 2026-10-02T19:47:58.032Z → 2026-10-02T19:48:36.359Z against http://127.0.0.1:8837
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 12 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 10/12; checks passing: 90/98.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| MP07 | https://www.sitemaps.org/ | 10/10 | — |
| MP08 | https://www.sitemaps.org/ | 8/8 | — |
| MP09 | https://www.gov.uk/ | 11/11 | — |
| MP10 | https://www.sitemaps.org/ | 6/6 | — |
| MP11 | https://docs.stripe.com/ | 10/10 | — |
| MP12 | https://books.toscrape.com/ | 6/6 | — |
| MP13 | https://python.org/ | 4/8 | field status (map-search.map-include-subdomains); countWhere (map-search.map-include-subdomains); countWhere (map-search.map-include-subdomains); field refused.hostDenied (map-search.map-include-subdomains) |
| MP14 | https://python.org/ | 2/6 | field status (map-search.map-include-subdomains); countWhere (map-search.map-include-subdomains); field refused.hostDenied (map-search.map-include-subdomains); field sources.sitemap.files.0.kind (map-search.map-include-subdomains) |
| MP15 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 7/7 | — |
| MP16 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 8/8 | — |
| MP17 | https://developer.mozilla.org/en-US/docs/Web/HTTP | 11/11 | — |
| MP18 | https://docs.python.org/3/ | 7/7 | — |

Recorded values:

- MP07 countWhere: 84 of 84
- MP08 countWhere: 4 of 4
- MP08 field compare.links: 87
- MP09 field refused.robots: 0
- MP10 countWhere: 84 of 84
- MP11 countWhere: 22 of 22
- MP11 field compare.links: 4928
- MP11 field refused.searchFiltered: 4906
- MP12 field refused.searchFiltered: 72
- MP13 countWhere: 1 of 1
- MP13 countWhere: 0 of 1
- MP13 field hostCount: 1
- MP13 field refused.hostDenied: 0
- MP14 countWhere: 1 of 1
- MP14 field refused.hostDenied: 0
- MP18 countWhere: 24 of 24

Failed checks with the observed value:

- MP13 [map-search.map-include-subdomains] field `status`: partial
- MP13 [map-search.map-include-subdomains] countWhere: 1 of 1
- MP13 [map-search.map-include-subdomains] countWhere `^https://(?!(www\.)?python\.org/)[a-z0-9.-]+\.python\.org/`: 0 of 1
- MP13 [map-search.map-include-subdomains] field `refused.hostDenied`: 0
- MP14 [map-search.map-include-subdomains] field `status`: partial
- MP14 [map-search.map-include-subdomains] countWhere: 1 of 1
- MP14 [map-search.map-include-subdomains] field `refused.hostDenied`: 0
- MP14 [map-search.map-include-subdomains] field `sources.sitemap.files.0.kind`: unreadable

## How it was run

- API: `W2L_API_PORT=8837 W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts` (local mode) at the source commit above, after `npx tsc --build`. MCP: the local MCP service from the same checkout, `W2L_LOCAL_MCP_PORT=8839 W2L_TASK_ROOT=.w2l/mcp-map node --import tsx packages/mcp/src/localHostCli.ts`; it runs its own in-process engine (it is not a client of the 8837 API), with the same proxy. Then `W2L_API_URL=http://127.0.0.1:8837 W2L_MCP_MAP_URL=http://127.0.0.1:8839/mcp node research/parity/run-sites.mjs --only MP07,MP08,MP09,MP10,MP11,MP12,MP13,MP14,MP15,MP16,MP17,MP18 --record …`. The runner wrote the record into the scratchpad and it was copied here with the `--record` path and this heading changed; the header's run times are UTC (03:47 to 03:48 on 2026-10-03 local time, UTC+8).
- Network: proxied. Both services printed `outbound https: and http: requests use the environment proxy 127.0.0.1:7890` at startup; every sitemap file record of the responses says `proxyUsed: true`. A map response carries no `evidence.envProxy`, which is why the runner's network line counts 0 of 12.
- Raw responses: `.w2l/parity/2026-10-02T19-47-57-992Z/` (git-ignored). MP13 and MP14 were run a second time with the same command restricted to them (`.w2l/parity/2026-10-02T19-49-40-178Z/`): the same result, 4/8 and 2/6.

## What the responses showed

| Case | status / stoppedBy | links | start page | sitemap files | refused (non-zero) |
| --- | --- | --- | --- | --- | --- |
| MP07 sitemaps.org, only | completed / null | 84, all `via: ["sitemap"]` | not read (null) | 1 urlset, 84 entries | — |
| MP08 sitemaps.org, skip | completed / null | 4 (`/`, faq.php, protocol.php, terms.php) | 200, 5 links | none (null) | duplicate 1, hostDenied 1 |
| MP08 comparison, include | completed / null | 87, the 4 above in the same order | | | |
| MP09 www.gov.uk, only, limit 500 | completed / limit | 500, the first `https://www.gov.uk/` via sitemap | not read | index (35) + `sitemaps/sitemap_1.xml` (25,000), truncated `urls` | overLimit 24,492 |
| MP10 /fc sitemaps.org, sitemapOnly | `success: true`, an `id` | 84 strings | | | |
| MP11 docs.stripe.com, search webhooks | completed / null | 22 | 200, 56 links | 1 urlset, 4,924 entries | searchFiltered 4,906, duplicate 47, hostDenied 6 |
| MP11 comparison, no search | completed / null | 4,928, all 22 among them in the same order | | | |
| MP12 books.toscrape.com, search travel | completed / null | 1: `…/travel_2/index.html`, title `Travel` (anchor) | 200, 73 links | `/sitemap.xml` absent | searchFiltered 72, collapsed 1 |
| MP13 python.org, includeSubdomains | partial / null | 1 (the start URL) | 200 but `failed/empty_unverified`, 0 links | `/sitemap.xml` unreadable, `redirect_limit` | — |
| MP14 python.org, default | partial / null | 1 | the same | the same | — |
| MP15 scrapethissite forms, ignoreQueryParameters | completed / null | 1: `https://www.scrapethissite.com/pages/forms/` | 200, 12 links | absent | collapsed 6 (each `?page_num=N&per_page=100` into the start URL), subtreeDenied 5, hostDenied 1 |
| MP16 the same, default | completed / null | 7 (start URL + 6 page_num URLs) | 200, 12 links | absent | subtreeDenied 5, hostDenied 1 |
| MP16 comparison, crawlEntireDomain | completed / null | 10, robots refused 2 | | | |
| MP17 MCP map, MDN /en-US/docs/Web/HTTP, limit 100 | completed / limit | 100 unique, all under the start URL | | | counts.refused 15,219 |
| MP18 MCP map, docs.python.org/3/, limit 100 | completed / null | 24 | | | counts.refused 42 |

- MP09: no robots-disallowed URL was among the 500 entries read before the limit (`refused.robots` 0); the plan expected print and search URLs to be skipped and counted, which these first 500 did not test.
- MP11: the 22 links all came from the sitemap, without titles (the sitemap has no `<news:title>`); each has `webhooks` in its URL. `refused.searchFiltered` equals the comparison's 4,928 links minus the 22.
- MP17 and MP18: `tools/list` showed `map` with annotations `{ title: "Map a site", readOnlyHint: true, idempotentHint: true, openWorldHint: true }` and an `outputSchema`; each call's `structuredContent` validated against it (ajv) and equalled the parsed text. MP18's 24 links are what docs.python.org/3/ gives without an index: its sitemap lists 8 version roots. The audit's "100 URLs" for this row is not reached and is not counted as met.

## The two python.org failures (MP13, MP14)

Neither failure is in the map's scope rules; both are in what W2L received from www.python.org, and both block the includeSubdomains live check on this site.

- Start page: `https://python.org/` redirected to `https://www.python.org/`, which answered 200 with a gzip body although W2L sent no `Accept-Encoding` (curl through the same proxy saw the same unsolicited `content-encoding: gzip`). A `POST /v1/scrape` of `https://www.python.org/` with `fastMode` on the same API gave `failed/empty_unverified`, `bytesWire` 21,229 equal to `bytesDecompressed`, an empty `rawHtml` and `linkCount` 0: the http lane does not inflate a body whose encoding it did not ask for (no `content-encoding` handling in `packages/http-core` or the http subject, by a search of the source). The map therefore had no page links, and reported `start_page_unreadable` and `partial`, as its status rules require.
- Sitemap: `https://python.org/sitemap.xml` redirected to `https://www.python.org/sitemap.xml`, which answered W2L's sitemap reader with `301` to itself until the redirect limit. A probe with undici and W2L's identity headers (`user-agent`, `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`) through the proxy got the same self-redirect for `/sitemap.xml` and for `/`; curl with the same User-Agent alone got 404 for `/sitemap.xml`. Why the site redirects that request to itself is not established; the probe shows it is the response, not the map, that loops.

Supplementary includeSubdomains check (not a case of the set; run once each with curl against the same API after the cases, `POST /v1/map`): `{"url":"https://www.gov.uk/","sitemap":"skip","includeSubdomains":true}` gave 56 links, 54 on www.gov.uk and 2 on www.nationalarchives.gov.uk (a `*.gov.uk` host, its robots.txt read), with `hostDenied` 1 (`www.smartsurvey.co.uk`); the same without `includeSubdomains` gave 54 links on www.gov.uk and `hostDenied` 3 (the smartsurvey link and the two nationalarchives links). Both completed, no `robots_host_cap` warning. This shows the option admitting a subdomain of the apex on a real site; it is not the python.org expectation, which stays failed.

## Fetch count

- Page bodies: one per map that reads a page (MP08 twice: skip and its include comparison; MP11 twice; MP12; MP13 and MP14, each twice with the rerun; MP15; MP16 twice; MP17; MP18), plus one scrape of www.python.org for the diagnosis and the two supplementary www.gov.uk maps. MP07, MP09 and MP10 read none. No browser was started.
- Sitemap files: MP07 1, MP08 comparison 1, MP09 2, MP10 1, MP11 2 (search and comparison), MP12 1 (404), MP13/MP14 1 each per run (the redirect loop), MP15/MP16 1 each and 1 for the comparison (404); for MP17 and MP18 not recorded, since the compact MCP answer carries no sources (the MP04 record of batch A read MDN's index and its 10 children).
- robots.txt: through each service's shared cache, once per origin per process.

## Not covered by this run

- The hosted MCP host was not run; that it does not list `map` and refuses a call is fixture-tested (`packages/mcp/test/host.test.ts`, `hostedToolPolicy.test.ts`).
- The robots host cap (more than 20 hosts) is fixture-tested only (`packages/runtime/test/map.test.ts`).
