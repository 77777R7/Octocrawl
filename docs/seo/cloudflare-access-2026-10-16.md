# SEO-01 Cloudflare read-only follow-up — 16 October 2026

> Historical read-only observations below remain unchanged. The later dashboard inspection, dry-run and separately authorized production application are recorded in the section “15:25:32 Asia/Shanghai: authorized BIC exception applied”, followed by real-client acceptance. Earlier “signed out”, “unread” and “not applied” statements describe the earlier stage.

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

## 15:25:32 Asia/Shanghai: authorized BIC exception applied

On 16 October, the user signed into the existing Cloudflare dashboard and separately authorized applying the exact reviewed exception after validation. The dashboard can read the inspected zone settings; the existing Wrangler OAuth security-configuration endpoints remain denied. No new token, expanded account permission, plan upgrade, website deployment or crawler User-Agent spoof was used.

The relevant zone configuration was inspected before the change: Free plan, no custom rules (0/5), no custom phase entrypoint (GET404/code10003 immediately before the production write), no configuration phase entrypoint, no Page Rules, BIC `on`, Bot Fight Mode off. Cloudflare's default managed protection remains active; a missing zone managed-rule entrypoint is not absence of default WAF protection. These observations do not constitute an exhaustive export of account-wide policy or every vendor-managed rule definition.

The exact approved expression above, `action:skip`, `products:["bic"]`, `logging.enabled:true`, and `enabled:true` passed the dashboard's server-side `PUT .../rulesets/phases/http_request_firewall_custom/entrypoint?dry_run=true`, HTTP200, `success:true`, `result:null`. The API-preview control runs validation without deployment. Intermediate incomplete Skip/no-product validation failed400/code20115 and remains in the evidence; selecting BIC and explicitly enabling logs produced the exact passing payload. The earlier separate dry-run at15:19:50 is also retained. No production write occurred during those dry-runs.

After the user's explicit application authorization, Deploy and its production confirmation were used once. The actual production PUT returned200 and a subsequent GET returned the persisted active rule:

| Field | Observed value |
| --- | --- |
| Applied at | `2026-10-16T07:25:32.378873Z` / 15:25:32 Asia/Shanghai |
| Ruleset | `1d4beb2b55e5423db6b756069d64f2d3`, version1, `http_request_firewall_custom` |
| Rule | `82f36f42e92a4ab0aa74e34608de6411`, version1, enabled/Active |
| Matching scope | Exactly the reviewed hostname, verified AI Assistant identity/category, GET/HEAD and nine exact public paths; no expansion |
| Action | `skip`, `action_parameters.products:["bic"]`; no phase/ruleset/all-rules skip |
| Logging | Persisted GET explicitly returns `logging:{"enabled":true}` |
| Other settings | Fresh GET still BIC `on`; Bot Management response unchanged from the before snapshot |

The dashboard's production serializer omitted `logging` when true; this was not assumed from the request. The persisted GET explicitly confirmed it is true. Every approved rule field was compared against the persisted response. The custom rule list shows1/5, order1, Active. The immediate pre-write404 and post-writeGET200 are saved with the write response and sanitized request metadata; no authentication headers or credentials are included.

Rollback is to use **Disable** in this rule's own menu (the menu was observed, not executed). Disable only `82f36f42e92a4ab0aa74e34608de6411`; do not disable global BIC or another protection. The pre-change state had no custom phase entrypoint. Leaving this one rule disabled restores the pre-change active-rule behavior while retaining an audit record; deleting the whole ruleset is unnecessary. No rollback was needed or performed.

### Remaining acceptance and failed probes

- The post-application GraphQL query covered `07:25:32.378873Z` to `07:27:33.326706+00:00` UTC, limit1000, using the same supported fields as the prior query. HTTP200, no GraphQL errors, zero events returned. This short, fresh Security Events window does not establish zero visits, zero matches or successful verified-bot access. Ingestion freshness and coverage remain bounded.
- Nine reference-fetch attempts against the nine paths all stopped before website retrieval: the tool resolved the domain to non-public `198.18.3.67` and refused it. Its private-IP protection was not overridden. These are tool/environment failures, not nine Cloudflare denials, not nine successful fetches and not evidence of any bot identity.
- A separate web-tool attempt for robots, MCP docs and changelog (same explicit `seo01_check=20261016T0727Z` marker) reported “not accessible via this tool”. No HTTP status, ray or verified identity was available, so its cause and any rule match remain unknown. The failed attempts were retained rather than retried for a success score.
- At15:32:02 Asia/Shanghai, an ordinary Python urllib GET of `/robots.txt`, using its default User-Agent, still returned403/1010, ray `a4b55e12ac89d3dd-KIX`. A second GraphQL window from application through15:34:05 returned exactly one event and matched that ray: source/rule `bic`, action `block`, edge403, `verifiedBotCategory:""`, sampleInterval1. This confirms the negative request's BIC refusal and empty category, not verified-assistant access. No event for the new skip rule was returned in this bounded window; no zero-traffic or universal safety claim follows.
- Still required: a new actual `AI Assistant`/verified match for this rule, its ray/time/path and the actual allowed response/body; check relevant excluded paths/protections with attributable evidence. Google/Bing impact remains unknown. Applying this rule does not prove Google entity correction, indexing or AI citation improvement.

The [application manifest](../../.w2l/seo-task-status-20261016/cloudflare/application/manifest.json) links hashes for before/after settings, exact dry-run, actual write, persisted readback, Active screenshot, rollback menu, event query and failed probes. Raw evidence stays local/ignored. Task status was updated to v1.3 and its original-path copy synchronized. These documents were local at application time; the user subsequently authorized committing these three records, opening a PR and merging after CI. This does not authorize another website deployment or security-rule change.

## 15:50–15:54: real AI-client partial acceptance

Codex invoked the installed **Firecrawl MCP** tool twice. Each request used `maxAge:0`, `proxy:"basic"`, HTML and Markdown formats, no custom User-Agent, no stealth/enhanced fallback, no TLS/robots override, and a distinct public query marker for attribution. These are client calls and delivered responses, not a vendor comparison or an independent external-user trial.

| Target path | Client interval, Asia/Shanghai | Delivered result | Body checks |
| --- | --- | --- | --- |
| `/docs/connect-mcp/` | 15:50:33–15:50:37 | Firecrawl `metadata.statusCode:200`; 17,375 Markdown characters, 34,329 HTML characters | H1 `Connect Octocrawl MCP`; official MCP endpoint and repository present; no challenge/error-page heading |
| `/docs/` | 15:53:22–15:53:26 | Firecrawl `metadata.statusCode:200`; 10,353 Markdown characters, 20,231 HTML characters | H1 `Introduction to Octocrawl`; official MCP endpoint and repository present; no challenge/error-page heading |

Each returned URL equals the requested marked URL. Complete responses, HTML/Markdown, scrape IDs, provider metadata and SHA-256 hashes are in the [acceptance manifest](../../.w2l/seo-task-status-20261016/cloudflare/acceptance/manifest.json). Firecrawl reported one credit used for each call. Requesting `maxAge:0` expresses live retrieval intent; it is not independent proof of the provider's internals or a Cloudflare ray. The provider did not return CF-RAY or Cloudflare verified identity. Do not infer `AI Assistant` merely because Codex called the tool.

Two readonly GraphQL windows covered15:50:03–15:51:47 and15:50:03–15:54:31, limit1000, with `clientRequestQuery` and HTTP method fields that had been confirmed in the schema. Both returned HTTP200, no GraphQL errors, zero Security Events. The markers and the new rule ID were therefore not correlated to any event in those windows. This is not evidence of zero successful requests or of a successful skip. **SEO-01 remains in_progress:** real client content retrieval has passed for these two pages; Cloudflare verified AI Assistant identity, new-rule hit and response correlation have not.

The OpenAI web tool's two exact URL attempts reported inaccessible, with no HTTP status or ray. A single separate Google AI Mode access-only prompt asked for the exact MCP URL's heading and first sentence; it reached Google's unusual-traffic/reCAPTCHA page before an answer. No CAPTCHA was solved, answer regenerated or alternate Google query substituted. Authentication/model were not observed before the challenge. This extra access probe is outside the frozen12-question baseline; that baseline, its answers, counts, settings and independent-date retest schedule remain unchanged. No entity-correction conclusion was drawn.


## 16:04:59–16:06: Claude native retrieval and exact request correlation

The user manually signed into Claude in a separate in-app-browser tab. The existing native Claude application's unrelated active task/draft was left untouched. The web UI showed model `Fable 5.1 High`; this is the displayed label, not an independently verified backend model identifier. One new access-only prompt requested the exact MCP page URL below through native web retrieval, excluding connected MCP tools. The visible `Read octocrawl.dev` tool completed and cited that exact URL; it returned H1 **Connect Octocrawl MCP**, first sentence **Connect your AI agent to Octocrawl at https://mcp.octocrawl.dev/mcp.**, and the same official hosted MCP endpoint. This is an operator-run real AI-client access check, not an independent user trial or a repeat of the Google12.

The query ending `08:05:54.875663Z` first returned the robots event alone. The later query ending `08:06:52.882018Z` returned both events below (HTTP200, no GraphQL errors). This preserves the earlier zero/partial windows and shows why those windows were not treated as a traffic census.

| Cloudflare field | MCP page request | Robots preflight during the same native fetch |
| --- | --- | --- |
| Time UTC / Asia/Shanghai | `2026-10-16T08:04:59Z` / 16:04:59 | Same second |
| Host, method | `octocrawl.dev`, GET | `octocrawl.dev`, GET |
| Path | `/docs/connect-mcp/` | `/robots.txt` |
| Query | `?seo01_claude_probe=20261016T0805Z`, exact prompt marker | Empty |
| Verified category | `AI Assistant` | `AI Assistant` |
| User-Agent | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +claude-user@anthropic.com)` | Same |
| Action, source | `skip`, `firewallCustom` | Same |
| Rule | `82f36f42e92a4ab0aa74e34608de6411` | Same |
| Ruleset | `1d4beb2b55e5423db6b756069d64f2d3` | Same |
| Edge response status | 200 | 200 |
| Ray | `a4b58e525a0c0737` | `a4b58e4f298c8432` |
| sampleInterval | 1 | 1 |

The **MCP page positive case passes**: exact hostname/path/query and a bounded client interval correlate native retrieval and correct delivered body to Cloudflare's verified category, new-rule hit, ray and edge200. The client did not expose HTTP status/response headers; the200 and ray are from the authenticated Cloudflare event, not invented client metadata. The category is also from Cloudflare, not inferred from the User-Agent. No UA spoof, rule widening or repeated answer generation was used.

A separate follow-up native read of `https://octocrawl.dev/robots.txt?seo01_claude_robots=20261016T0806Z` returned the expected complete `User-agent: *`, `Allow: /`, `Disallow: /api/`, sitemap body and `text/plain; charset=utf-8`. Claude explicitly reported that status/headers were not exposed. The query ending08:06:52 had not returned this second query marker; do not pair its body with the earlier empty-query robots event. The empty-query preflight does establish its own rule hit and edge200, without a separately exposed preflight body.

**SEO-01 remains in_progress.** The MCP-page real-client/rule/response correlation is complete, while the other exact allowed paths and excluded-path protections have not all been paired with new verified-client evidence; Google/Bing-specific access and indexing impact remain unknown. The earlier ordinary-client403 negative control remains separate. The Google12 baseline and independent-date retest schedule are unchanged, and rule application or this access success does not establish entity correction or citation improvement.

The acceptance manifest now links the native prompts, visible tool/answer text, screenshots, successful marked event and failed/earlier windows. This evidence is appended to the same three documentation files in [PR #532](https://github.com/77777R7/Octocrawl/pull/532); merge remains conditional on CI passing on the updated head. No further production rule or website change was made.
