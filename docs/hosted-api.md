# Hosted Octocrawl: the API and the remote MCP endpoint

Phase 1 of the roadmap's [PH · Hosted Octocrawl](../ROADMAP.md#ph--hosted-octocrawl): one Cloud Run service, `octocrawl-api`, serves `https://api.octocrawl.dev` (REST) and `https://mcp.octocrawl.dev/mcp` (MCP over Streamable HTTP) from the same process, `packages/mcp/src/hostedApiCli.ts`. It is the API's hosted mode (`packages/api/src/listen.ts`: private addresses, robots overrides, saved logins, handoff, local proxies and non-HTTPS webhooks refused) behind a gate that serves scrape and map only, counts every caller, and pins callers without a key to the HTTP lane (`packages/mcp/src/hostedApi.ts`).

| | Keyless | With a key | Signed in (`/mcp-oauth`) |
| --- | --- | --- | --- |
| How | No `Authorization` header | `Authorization: Bearer oc_…` | OAuth sign-in; the client sends `Authorization: Bearer oca_…` to `POST /mcp-oauth` |
| Identity | The address Cloudflare reports, hashed | The key's HMAC | The connection's own key record (`kind: "oauth"`), found from the token's HMAC |
| Pages a day | `W2L_KEYLESS_DAILY` (20) | the key's `dailyLimit` | the account's credits |
| Lane | HTTP only (`fastMode` pinned, and an `agentHints` line says so when a page needed the browser or the call sent `fastMode: false`; no screenshot) | HTTP, then the browser when the key's `browser` is true | HTTP, then the browser when the connection's record has `browser` and the account has credits for a browser page |
| Tools and routes | `scrape`, `map`; `POST /v1/scrape`, `POST /v1/map`, `GET /v1/scrapes/:id`, `GET /v1/maps/:id` | the same, plus `scrape_product` | MCP only: `scrape`, `map`, and `scrape_product` with the browser lane; REST `/v1/*` refuses `oca_` tokens |
| Starts a minute | 10 | 60 | 60 |

Keyless calls from Claude's published egress range (`160.79.104.0/21`, https://platform.claude.com/docs/en/api/ip-addresses; claude.ai, the desktop and mobile apps, the API's MCP connector) share one pool, `W2L_CLAUDE_DAILY` (200) pages a day at 60 starts a minute, under the quota id `<day>-keyless-claude`, since they come from Anthropic's servers and would otherwise split one address's allowance among every Claude user. Claude Code connects from the user's own machine and keeps the per-address allowance. The range is `CLAUDE_EGRESS` in `packages/mcp/src/hostedApi.ts`; check the published list when Anthropic announces a change. The pool is first come, first served: one caller of the API's MCP connector can spend it for everyone until 00:00 UTC, and the per-address limit (120 requests a minute, counted before the caller is known, and twice for an MCP tool call) still applies to each Anthropic address. A key, which the API's MCP connector can send, keeps its own allowance.

MCP directories read `GET /.well-known/mcp/server-card.json` ([Smithery's server card](https://smithery.ai/docs/build/publish)): the server's name and version, `authentication.required: false`, and the tools `/mcp` lists to a caller without a key, built from the same definitions. `tools/list` names only what the caller can use (`scrape_product` only for a key with the browser lane), and every hosted tool carries a `title` and `readOnlyHint: true`, since hosted Octocrawl refuses page actions and logins. Their input schemas list only what hosted serves (`HOSTED_SCRAPE_KEYS` in `packages/mcp/src/hostedApi.ts`): no `actions`, `robotsOverride`, `lane`, `handoff`, `skipTlsVerification`, `access`, `mode: authed`, cache options or regular-expression checks, and without the browser lane no `screenshot` or `waitFor`. A hosted MCP scrape stops at 100 s (REST keeps 300 s), and hosted MCP results leave out the call's telemetry and internal ids (`usage`, `channelsTried`, `metadata.scrapeId` and the concurrency fields, a map's `id`) and the campaign tags in `agentHints` links, unless `debug` is set; REST keeps them, and the Evidence Record stays whole; the same `scrape` on a server on your computer is not marked read-only, as its actions can click and type; `/.well-known/oauth-protected-resource/mcp-oauth` is the Protected Resource Metadata (RFC 9728) for `/mcp-oauth`, which names `https://octocrawl.dev` as its authorization server; any other `/.well-known` file is 404 `not_found`, so a client on `/mcp` finds no OAuth metadata and connects without signing in. Everything else (`crawl`, `batch`, Monitors, logins, `/fc`) answers 403 `hosted_unavailable` with an `agentHints` entry that says to run Octocrawl on your computer. The whole service serves `W2L_SITE_DAILY` (1500) pages a day. Over an allowance: 429 `quota_exhausted` with `Retry-After` until 00:00 UTC. Every request, of any kind, is limited to 120 a minute per address before any key lookup. Nothing is retained: `storeInCache` is pinned off, files are capped at 5 MiB, and scrape and map records and saved files are swept from the task root (Cloud Run's in-memory `/tmp`) after 10 minutes.

## Connect

```sh
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp
codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp
curl -s -X POST https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' -d '{"url":"https://example.com","formats":["markdown"]}'
```

With a key, add `--header "Authorization: Bearer oc_…"` (Claude Code), or `"headers": { "Authorization": "Bearer oc_…" }` in a JSON config; the key is never put in the URL. The published packages work against it too: `npx -y @octocrawl/mcp --base-url https://api.octocrawl.dev --token oc_…`, the SDK's `baseUrl` and `token`, and the Python client's `W2L_API_URL` and `W2L_API_TOKEN`.

## Deploy

The runbook for the owner, in the public preview's project (`docs/public-preview.md` created the project, the Artifact Registry repository, the runtime service account `w2l-preview` with `roles/datastore.user`, and the secrets `w2l-quota-hash-key` and `w2l-proxy-secret`); this service reuses all of them. Pass `--project` on every `gcloud` call.

```sh
export W2L_PROJECT_ID='octopus-w2l-20260924-7r7'
export W2L_REGION='asia-southeast1'
export W2L_REPOSITORY='w2l-public-preview'
export W2L_RUNTIME_SA="w2l-preview@${W2L_PROJECT_ID}.iam.gserviceaccount.com"
```

Once per project: the TTL policy that deletes a day's counters two days on (`expireAt`, `packages/mcp/src/hostedApi.ts`), and a budget alert at $40 a month (the instance cap below is the real bound; an alert only tells).

```sh
gcloud firestore fields ttls update expireAt --collection-group=hostedQuotas --enable-ttl --project="$W2L_PROJECT_ID"
gcloud firestore fields ttls update expireAt --collection-group=creditUsage --enable-ttl --project="$W2L_PROJECT_ID"
gcloud firestore fields ttls update expireAt --collection-group=requests --enable-ttl --project="$W2L_PROJECT_ID"
gcloud firestore fields ttls update expireAt --collection-group=hostedLeases --enable-ttl --project="$W2L_PROJECT_ID"
```

Build the image from a clean commit and deploy it without traffic, then move all traffic to it under a new tag; keep the previous tag as the rollback (as the preview's releases):

```sh
test -z "$(git status --porcelain)" || { echo 'Commit and verify a clean source tree before deployment' >&2; exit 1; }
export W2L_SOURCE_SHA="$(git rev-parse HEAD)"
export W2L_IMAGE="${W2L_REGION}-docker.pkg.dev/${W2L_PROJECT_ID}/${W2L_REPOSITORY}/hosted-api:${W2L_SOURCE_SHA}"
gcloud builds submit . --config=cloudbuild.hosted-api.yaml --region="$W2L_REGION" --timeout=20m --substitutions="_IMAGE=${W2L_IMAGE}" --project="$W2L_PROJECT_ID"
```

The first deploy creates the service and sets every variable; gcloud refuses `--no-traffic` on a service that does not exist yet, so the first revision takes the traffic itself and is then tagged:

```sh
export W2L_REVISION_SUFFIX=phase1     # names the revision octocrawl-api-phase1
export W2L_TAG=h1phase1               # one tag per release; the previous tag stays as the rollback
gcloud run deploy octocrawl-api --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --service-account="$W2L_RUNTIME_SA" --allow-unauthenticated \
  --cpu=1 --memory=2Gi --concurrency=2 --min-instances=0 --max-instances=3 --timeout=120s \
  --revision-suffix="$W2L_REVISION_SUFFIX" \
  --set-env-vars="W2L_FIRESTORE_PROJECT_ID=${W2L_PROJECT_ID},W2L_PUBLIC_API_ORIGIN=https://api.octocrawl.dev,W2L_KEYLESS_DAILY=20,W2L_SITE_DAILY=1500,W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA}" \
  --update-secrets='W2L_QUOTA_HASH_KEY=w2l-quota-hash-key:latest,W2L_PROXY_SECRET=w2l-proxy-secret:latest'
gcloud run services update-traffic octocrawl-api --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --update-tags="${W2L_TAG}=octocrawl-api-${W2L_REVISION_SUFFIX}"
gcloud run services describe octocrawl-api --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --format='value(status.url)'
```

A later release deploys the new image without traffic, with `--update-env-vars=W2L_SOURCE_COMMIT=…` alone (`--set-env-vars` replaces them all), then moves all traffic to it under a new tag:

```sh
gcloud run deploy octocrawl-api --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --revision-suffix="$W2L_REVISION_SUFFIX" --no-traffic --update-env-vars="W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA}"
gcloud run services update-traffic octocrawl-api --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --to-revisions="octocrawl-api-${W2L_REVISION_SUFFIX}=100" --update-tags="${W2L_TAG}=octocrawl-api-${W2L_REVISION_SUFFIX}"
```

`--concurrency=2` and `--max-instances=3` bound the spend: at most six pages are read at once, and a browser-lane page holds one slot for its whole run. Raise them only from the recorded cost per page (below). A key also runs one scrape at a time that may use the browser lane (ROADMAP PH item 1): the gate takes a lease, `hostedLeases/browser-{key HMAC}`, in one commit with an update-time precondition, holds it for the call and deletes it after, so the bound holds across instances. A second such scrape with the same key is `429 browser_busy` with `Retry-After` (at most 10 s); one that sends `fastMode: true`, and every map, takes no lease. A lease an instance never released (a crash) is taken over once its `expireAt` passes, 130 s after it was taken.

The Worker in `cloudflare/hosted-api-proxy/` answers on `api.octocrawl.dev` and `mcp.octocrawl.dev` (Workers custom domains, no DNS record for Cloud Run) and forwards to the run.app address with the shared secret, so the service can believe `CF-Connecting-IP`. Set `ORIGIN_URL` in its `wrangler.toml` to the URL the describe command printed, then:

```sh
cd cloudflare/hosted-api-proxy
npx wrangler secret put PROXY_SECRET   # the value of w2l-proxy-secret
npx wrangler deploy
```

Verify from outside:

```sh
curl -s https://api.octocrawl.dev/health
curl -s -X POST https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' -d '{"url":"https://example.com"}' | head -c 300
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.octocrawl.dev/v1/crawl -H 'content-type: application/json' -d '{"url":"https://example.com"}'   # 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.octocrawl.dev/v1/scrape -H 'authorization: Bearer nope' -H 'content-type: application/json' -d '{}'   # 401
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp && claude mcp list
```

To roll back, `gcloud run services update-traffic octocrawl-api --to-tags=<previous tag>=100`.

## Keys

Keys are issued by hand from the waitlist in phase 1 (`scripts/public-preview/waitlist.mjs` lists it). A key is printed once; only its HMAC under `w2l-quota-hash-key` is stored, as the id of a document in Firestore's `hostedApiKeys` collection with `enabled`, `plan`, `dailyLimit`, `browser` and `label`. A start (`POST /v1/scrape`, `POST /v1/map`, and an MCP tool call, which goes through the same gate) reads the key's document fresh, so a key revoked by the script stops at its next start (ROADMAP PH item 2). What starts no work (the MCP tool list, reading a result by id) uses a lookup cached for a minute.

```sh
export W2L_PROJECT_ID='octopus-w2l-20260924-7r7'
node scripts/hosted/issue-key.mjs issue --label 'ada@example.org' --daily 1000 --browser
node scripts/hosted/issue-key.mjs list
node scripts/hosted/issue-key.mjs revoke <digest>
```

The script, like `scripts/public-preview/waitlist.mjs`, calls Firestore with Node's `fetch`, which ignores `HTTPS_PROXY`. On a machine that reaches Google only through a proxy, set `NODE_USE_ENV_PROXY=1` (Node 24 and later) so `fetch` uses it; `gcloud` honours the proxy variables on its own. Without it the call ends in `ConnectTimeoutError` against `firestore.googleapis.com` (seen 2026-10-06).

The key is printed once. Keep it somewhere ignored by git, such as `.w2l/hosted/`, with owner-only permissions, until it has been sent.

## Accounts and credits

A key that names an account (`uid` on its `hostedApiKeys` document) spends that account's credits instead of a daily limit. Decided 2026-10-11 (ROADMAP PH); `packages/mcp/src/hostedCredits.ts` holds the rules.

- **The grant.** Every account gets `W2L_MONTHLY_CREDITS` (1,000) credits each month. The grant resets at 00:00 UTC on the 1st and nothing rolls over. It is spent before bought credits.
- **What a call costs**, settled from its result:

  | Result | Credits |
  | --- | --- |
  | A page read over HTTP | 1 |
  | A page read on a browser lane | 5 |
  | A page that does not exist (HTTP 404 or 410) | 1 |
  | A `map` that returned URLs | 1 |
  | Anything else: blocked by a check, a challenge or robots.txt, nothing read, an invalid request, a server error | 0 |

- **How it is charged.** A call reserves the most it could cost before it runs: 5 when the key may use the browser lane, else 1. When it ends, it gives back what its result did not cost.
- **Running short.** An account with at least 1 credit but fewer than 5 reads over HTTP alone for that call. With none left it is refused: `429 quota_exhausted`, with `Retry-After` counting down to the 1st.
- **What the response says.** A scrape or map the gate answered says `X-Credits-Used` and `X-Credits-Remaining`. An error raised inside (an invalid request, a server error) costs nothing but carries neither header. An MCP tool call spends the same way, through the same gate.
- **Firestore.**
  - `credits/{uid}` holds `month`, `grant` and `purchased`. An account's first balance is written only while `users/{uid}` exists (the same commit checks it): a deleted account (public-preview auth.ts) cannot start a new one through a key the API still has cached, and such a call is `401 unauthorized`. A key issued by hand with `--uid` needs that account to have signed in once.
  - A reservation updates that document and the site's daily counter (`hostedQuotas/{day}-site`) in one commit with update-time preconditions, so two instances cannot overspend.
  - The refund and the day's usage (`creditUsage/{uid}-{day}`: `http`, `browser`, `not_found`, `map`, `unread`, `credits`) are server-side increments. The usage documents expire after 90 days (the TTL policy above).
  - The same commit writes the call's request line, `requestLog/{uid}/requests/{id}`: endpoint, key HMAC, the URL asked for and the final URL, lane, status, HTTP status, reason, robots.txt decision, the Evidence Record's `rawSha256`, a map's link count, the format names a scrape asked for (`formats`, empty when it named none, absent on a map), how long the call took (`ms`), what it was counted as and its credits. Never the page's content. The id is `9999999999999 − epoch ms` and a random tail, so Firestore's default order lists the newest first without an index. Lines expire 30 days on (`expireAt`, the TTL policy above), and the dashboard reads them through `GET /api/account/activity` (packages/public-preview/src/account.ts).
- **Logs.** Every key's start that passed its allowance or reserved its credits logs `hosted_usage` with the first 16 characters of the key's HMAC (never the key; `playground:` and the uid's first characters for the dashboard's Playground, below), its plan, the account id for an account's key, the endpoint and the UTC day: the per-key, per-day count for keys issued by hand as well (ROADMAP PH item 2). Every call that reserved credits logs `hosted_credits` with the account id, what it was counted as, and what it reserved and spent. A reservation or settle that fails logs `hosted_credits_reserve_failed` or `hosted_credits_settle_failed`. A commit that timed out may still have applied, so check `credits/{uid}` and `creditUsage` before giving anything back by hand.
- **Edge.** A call that runs across 00:00 UTC on the 1st gives its refund to the new month's grant, at most 4 credits over it.
- **The dashboard's Playground.** `/dashboard/scrape/` and `/dashboard/map/` on octocrawl.dev run a scrape or a map for the signed-in account without a key. The site's server (`POST /api/account/run`, packages/public-preview/src/account.ts) calls `/v1/scrape` or `/v1/map` with `X-W2L-Site-Account: {uid}.{expires ms}.{HMAC}`, signed with `W2L_QUOTA_HASH_KEY` and good for two minutes. The gate checks it without a store (`verifySiteAccount`), so it is not counted per address, and treats the call as the account's: same price, same reservation, same `X-Credits-*` headers, same request line, under the key id `playground:{uid}`. A header that does not verify is `401 unauthorized`. A run does not count against the account's five keys. Its scrape takes a browser-lane lease of its own, `browser-playground:{uid}`, so a second run started before the first ends is `429 browser_busy`.

Keys for an account are made on octocrawl.dev's dashboard (`/dashboard/keys/`) after sign-in (docs/public-preview.md, Sign-in). One can also be issued by hand, for a test account:

```sh
node scripts/hosted/issue-key.mjs issue --label 'test account' --uid test-account-1 --browser
```

## Read the service

Every request is in Cloud Run's request log. The two-week cost record the roadmap asks for is read from Cloud Billing (the service's own SKU lines) against the request counts:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="octocrawl-api" AND httpRequest.requestUrl:"/v1/scrape"' --project="$W2L_PROJECT_ID" --freshness=7d --format='value(httpRequest.status)' | sort | uniq -c
```

Write the result to `research/hosted/` with the date, the pages per lane, the billed amount and the cost per 1,000 pages; the allowances and `--max-instances` are adjusted from that record, not before.
