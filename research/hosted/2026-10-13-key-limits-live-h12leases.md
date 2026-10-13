# #467's key limits on the live service, 2026-10-13

ROADMAP PH items 1 and 2 ask for a key to use the browser lane at concurrency 1, for a revoked key to stop within one request, and for usage to be counted per key and per day in Cloud Logging. #467 built those, and this record checks them on the live service.

## Set-up

- Service `octocrawl-api`, revision `octocrawl-api-leases-ebaabe3` (tag `h12leases`, main `ebaabe3a`, image digest `sha256:bbf348e4…`), with 100% of traffic from about 07:20Z. The rollback tag is `h11account`.
- The Firestore TTL policy on `hostedLeases.expireAt` is `ACTIVE`.
- Called through `https://api.octocrawl.dev` and `https://mcp.octocrawl.dev/mcp` with curl, proxied, from Howard's Mac.
- Two throwaway keys of Howard's account were used, `deploy-test` and `revoke-test`. Both were made in the dashboard and revoked there during the run. Neither key is recorded.
- Cost: 4 credits in all (a, c and d, and the map in part 3).

## 1. One browser-lane scrape at a time per key (07:22Z, `deploy-test`)

Three calls went out together, then one more after:

| Call | Body | Answer |
| --- | --- | --- |
| a | scrape `https://httpbin.org/delay/8` | 200 after 10.9 s, lane `http`, `X-Credits-Used: 1` |
| b | scrape `https://example.com`, sent 3 s after a | **429** `browser_busy`, `Retry-After: 10`: "this key already has a scrape running on the browser lane: one at a time per key" |
| c | scrape `https://example.com` with `fastMode: true`, sent after b | 200 while a still ran, lane `http`, 1 credit |
| d | scrape `https://example.com`, sent after a ended | 200, 1 credit: the lease had been released |

## 2. Usage per key and per day (07:22Z)

- Cloud Logging held three `hosted_usage` lines for the run, one each for a, c and d. The refused call b had none.
- Each line had the same fields: `key` `15280fac000c2360` (the first 16 characters of the key's HMAC), `plan` `account`, the account's `uid`, `endpoint` `scrape`, `day` `2026-10-13`.
- The key's own text appeared in none of the service's log entries for the period.

## 3. A revoked key stops at its next start (07:27Z, `revoke-test`)

The first key (`deploy-test`) was revoked about two minutes after its last use, so the old minute's cache would have expired anyway and its 401 showed nothing. The run was repeated with a second key, revoked within the minute:

| Time (Z) | Call | Answer | Instance |
| --- | --- | --- | --- |
| 07:27:08.9 | map (a start: reads the key and caches it) | 200, 1 credit | …332a68cb1d43 |
| 07:27:09.9 | MCP `tools/list` (from the cache) | 200 | …332a68cb1d43 |
| | the key is revoked in the dashboard | | |
| 07:27:38.2 | scrape (a start) | **401** `unauthorized` | …332a68cb1d43 |
| 07:27:38.8 | MCP `tools/list` | 401 | …332a68cb1d43 |

- The request log shows all four calls on one instance. That instance had cached the key as enabled 29 s before the scrape, inside the 60 s cache, and the scrape was still refused. So the start read the key fresh, as #467 intends; before #467 the scrape would have been served from the cache until the minute ran out.
- The last `tools/list` was refused as well. The fresh read had written the revoked record back to the cache.

## Reading

All three behaviours work on the live service. One limit remains: what starts no work (the MCP tool list, reading a result by id) still trusts the cache for up to a minute after a lookup that found the key enabled.
