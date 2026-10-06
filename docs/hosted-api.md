# Hosted Octocrawl: the API and the remote MCP endpoint

Phase 1 of the roadmap's [PH · Hosted Octocrawl](../ROADMAP.md#ph--hosted-octocrawl): one Cloud Run service, `octocrawl-api`, serves `https://api.octocrawl.dev` (REST) and `https://mcp.octocrawl.dev/mcp` (MCP over Streamable HTTP) from the same process, `packages/mcp/src/hostedApiCli.ts`. It is the API's hosted mode (`packages/api/src/listen.ts`: private addresses, robots overrides, saved logins, handoff, local proxies and non-HTTPS webhooks refused) behind a gate that serves scrape and map only, counts every caller, and pins callers without a key to the HTTP lane (`packages/mcp/src/hostedApi.ts`).

| | Keyless | With a key |
| --- | --- | --- |
| How | No `Authorization` header | `Authorization: Bearer oc_…` |
| Identity | The address Cloudflare reports, hashed | The key's HMAC |
| Pages a day | `W2L_KEYLESS_DAILY` (20) | the key's `dailyLimit` |
| Lane | HTTP only (`fastMode` pinned; no screenshot) | HTTP, then the browser when the key's `browser` is true |
| Tools and routes | `scrape`, `map`; `POST /v1/scrape`, `POST /v1/map`, `GET /v1/scrapes/:id`, `GET /v1/maps/:id` | the same, plus `scrape_product` |
| Starts a minute | 10 | 60 |

Everything else (`crawl`, `batch`, Monitors, logins, `/fc`) answers 403 `hosted_unavailable` with an `agentHints` entry that says to run Octocrawl on your computer. The whole service serves `W2L_SITE_DAILY` (1500) pages a day. Over an allowance: 429 `quota_exhausted` with `Retry-After` until 00:00 UTC. Every request, of any kind, is limited to 120 a minute per address before any key lookup. Nothing is retained: `storeInCache` is pinned off, files are capped at 5 MiB, and scrape and map records and saved files are swept from the task root (Cloud Run's in-memory `/tmp`) after 10 minutes.

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

`--concurrency=2` and `--max-instances=3` bound the spend: at most six pages are read at once, and a browser-lane page holds one slot for its whole run. Raise them only from the recorded cost per page (below).

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

Keys are issued by hand from the waitlist in phase 1 (`scripts/public-preview/waitlist.mjs` lists it). A key is printed once; only its HMAC under `w2l-quota-hash-key` is stored, as the id of a document in Firestore's `hostedApiKeys` collection with `enabled`, `plan`, `dailyLimit`, `browser` and `label`. The service caches a lookup for a minute, so a revoked key stops within that.

```sh
export W2L_PROJECT_ID='octopus-w2l-20260924-7r7'
node scripts/hosted/issue-key.mjs issue --label 'ada@example.org' --daily 1000 --browser
node scripts/hosted/issue-key.mjs list
node scripts/hosted/issue-key.mjs revoke <digest>
```

## Read the service

Every request is in Cloud Run's request log. The two-week cost record the roadmap asks for is read from Cloud Billing (the service's own SKU lines) against the request counts:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="octocrawl-api" AND httpRequest.requestUrl:"/v1/scrape"' --project="$W2L_PROJECT_ID" --freshness=7d --format='value(httpRequest.status)' | sort | uniq -c
```

Write the result to `research/hosted/` with the date, the pages per lane, the billed amount and the cost per 1,000 pages; the allowances and `--max-instances` are adjusted from that record, not before.
