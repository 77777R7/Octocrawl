# SEO-01 Cloudflare read-only follow-up — 16 October 2026

## Observed result

The previous ordinary-client 403 difference now has a specific cause: all four saved `CF-RAY` identifiers match Security Events with `source:bic`, `ruleId:bic`, `action:block`, edge status403. BIC is Browser Integrity Check. This identifies those requests' blocking component; it does not establish that every 403 has the same cause.

An existing Wrangler OAuth session can read zone metadata and GraphQL Security Events. The browser dashboard is signed out; no new credential, permission or account change was made. `npx --yes wrangler whoami` reported Wrangler 4.151.0 and an existing logged-in OAuth session. Credentials were read only in process, never printed, copied into the checkout, or included in reports.

## Exact request correlation

Original requests occurred 15 October 2026 at 18:46:04 UTC / 16 October 02:46:04 Asia/Shanghai, Python urllib 3.14, `error code: 1010`. Original evidence: `.w2l/seo-20261016/http-client.json`.

| Public URL path | Saved ray identifier, colo omitted | Security Event |
| --- | --- | --- |
| `/` | `a4b0fc041a05fde2` | bic / block / 403 |
| `/robots.txt` | `a4b0fc05d9c7a12b` | bic / block / 403 |
| `/sitemap.xml` | `a4b0fc077e7f0884` | bic / block / 403 |
| `/docs/connect-mcp/` | `a4b0fc08f8e990ef` | bic / block / 403 |

These four events have an empty `verifiedBotCategory`. Do not call Python urllib a verified Googlebot/AI crawler. The earlier browser200 and GSC fetch/index observations remain valid separate observations.

## Verified-bot observations and coverage

A seven-day query covered **8 October 2026 19:51:43.223983 UTC to 15 October 2026 19:51:43.223983 UTC** (Asia/Shanghai: 9 October03:51:43 to 16 October03:51:43). `firewallEventsAdaptive`, limit1000, ordered datetime descending, returned77 events, all block; limit not reached. Every returned row's `sampleInterval` was1. A preceding 24-hour query returned36 events. These are overlapping windows; do not sum them. Security Events are not a census of all successful website requests or all bot visits.

Ten returned events have **`verifiedBotCategory:"AI Assistant"`**, `Python-urllib/3.12`, source/rule `bic`, edge403, between15 October12:44:52 and12:44:59 UTC. Paths: `/sitemap.xml`, `/robots.txt`, `/tools/`, `/scrape/`, `/blog/`, `/docs/`, `/docs/connect-mcp/`, `/tools/link-extractor/`, `/changelog/`, `/signin/`. Each has a distinct ray identifier. This is the Cloudflare category, not an identity inferred from the User-Agent. The available rows do not identify a specific vendor/model, a human search query or whether this was operator-generated traffic. It is evidence of access refusal, not acquisition demand or lost AI citations.

No returned row has a search-engine crawler category. This does **not** establish that Google/Bing were never blocked or that they can reach every URL. Successful ordinary requests are outside this dataset's meaning, time/retention coverage is bounded, and no Google/Bing-specific authenticated crawl trace was obtained here.

## Remaining access limits

- Zone rulesets GET:403, Cloudflare code10000 `Authentication error`. Full current expressions, ordering, exemptions and revisions are unread.
- Bot Management settings GET:403, code10000.
- GraphQL initially rejected an incorrect field `botScoreSrc`; this was a schema error, not an access finding. Schema discovery corrected it. A separate query including botScore was denied by field access (`authz`); removing that unneeded score allowed event retrieval, including verifiedBotCategory. No bot score was invented and no plan upgrade was requested.
- The raw GraphQL request, exact window, fields and responses are retained at `.w2l/seo-20261016/followup/cloudflare/readonly.json`. Earlier failed queries remain in the record. Rule configuration review is still blocked; Security Event review and ray correlation are complete for the stated window.

## Minimal proposal for review, not applied

The observed verified AI Assistant blocks now justify considering a narrow BIC exception for public content. Before applying anything, obtain a read-only export of the active rules/configuration, verify product/field availability and rule ordering, and validate the expression in Cloudflare. This draft has not been validated against the zone's live ruleset.

Proposed matching expression, limited to the nine observed public content/discovery paths (excluding the observed sign-in path):

```text
http.host eq "octocrawl.dev"
and http.request.method in {"GET" "HEAD"}
and cf.client.bot
and cf.verified_bot_category eq "AI Assistant"
and http.request.uri.path in {
  "/robots.txt" "/sitemap.xml" "/tools/" "/scrape/" "/blog/"
  "/docs/" "/docs/connect-mcp/" "/tools/link-extractor/" "/changelog/"
}
```

Proposed action: **skip only Browser Integrity Check**, API action parameter `products:["bic"]`, with logging enabled. Do not select “all remaining rules”, managed WAF, rate limits or other products. Match uses Cloudflare's verified identity/category, not a self-declared UA. No hostname wildcard, API/MCP/auth/dashboard exception, training-crawler policy or global BIC change is proposed. This first scope intentionally covers only observed paths; broader public content requires separate review.

Rollback: record the new rule ID/revision when an authorized change is eventually made; disable/remove just that new rule and restore the captured original configuration if needed. Verification after a separately authorized change must use new verified-category events and actual allowed fetches for the same paths; ordinary UA spoofing does not verify the exception. Keep other blocks and successful-GSC observations separate. There is no deployed rule to roll back today.

Sources read16October: [BIC](https://developers.cloudflare.com/waf/tools/browser-integrity-check/), [error1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/), [verified category field](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/cf.verified_bot_category/), [skip options](https://developers.cloudflare.com/waf/custom-rules/skip/options/), [Security Events and sampling](https://developers.cloudflare.com/waf/analytics/security-events/), [GraphQL event query](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-firewall-events/). Official descriptions explain fields and mechanisms; the account observations above come from actual read-only API responses.
