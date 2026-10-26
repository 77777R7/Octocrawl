# Hosted Octocrawl: the API and the remote MCP endpoint

Phase 1 of the roadmap's [PH · Hosted Octocrawl](../ROADMAP.md#ph--hosted-octocrawl): one Cloud Run service, `octocrawl-api`, serves `https://api.octocrawl.dev` (REST) and `https://mcp.octocrawl.dev/mcp` (MCP over Streamable HTTP) from the same process, `packages/mcp/src/hostedApiCli.ts`. It is the API's hosted mode (`packages/api/src/listen.ts`: private addresses, robots overrides, saved logins, handoff, local proxies and non-HTTPS webhooks refused) behind a gate that serves scrape and map to every caller and batch and crawl jobs to accounts ([Batch and crawl jobs](#batch-and-crawl-jobs)), counts every caller, and pins callers without a key to the HTTP lane (`packages/mcp/src/hostedApi.ts`).

| | Keyless | With a key | Signed in (`/mcp-oauth`) |
| --- | --- | --- | --- |
| How | No `Authorization` header | `Authorization: Bearer oc_…` | OAuth sign-in; the client sends `Authorization: Bearer oca_…` to `POST /mcp-oauth` |
| Identity | The address Cloudflare reports, hashed | The key's HMAC | The connection's own key record (`kind: "oauth"`), found from the token's HMAC |
| Pages a day | `W2L_KEYLESS_DAILY` (20) an address, and `W2L_KEYLESS_TOTAL_DAILY` (500) every keyless caller together | the key's `dailyLimit` | the account's credits, at most `W2L_ACCOUNT_DAILY` (500) starts an account, and `W2L_ACCOUNTS_DAILY` (3000) for every account together |
| Lane | HTTP only (`fastMode` pinned, and an `agentHints` line says so when a page needed the browser or the call sent `fastMode: false`; no screenshot) | HTTP, then the browser when the key's `browser` is true | HTTP, then the browser when the connection's record has `browser` and the account has credits for a browser page |
| Tools and routes | `scrape`, `map`; `POST /v1/scrape`, `POST /v1/map`, `GET /v1/scrapes/:id`, `GET /v1/maps/:id` | the same, plus `scrape_product` | MCP only: `scrape`, `map`, and `scrape_product` with the browser lane; REST `/v1/*` refuses `oca_` tokens |
| Starts a minute | 10 | 60 | 60 |

Keyless calls from Claude's published egress range (`160.79.104.0/21`, https://platform.claude.com/docs/en/api/ip-addresses; claude.ai, the desktop and mobile apps, the API's MCP connector) share one pool, `W2L_CLAUDE_DAILY` (200) pages a day at 60 starts a minute, under the quota id `<day>-keyless-claude`, since they come from Anthropic's servers and would otherwise split one address's allowance among every Claude user. Claude Code connects from the user's own machine and keeps the per-address allowance. The range is `CLAUDE_EGRESS` in `packages/mcp/src/hostedApi.ts`; check the published list when Anthropic announces a change. The pool is first come, first served: one caller of the API's MCP connector can spend it for everyone until 00:00 UTC, and the per-address limit (120 requests a minute, counted before the caller is known, and twice for an MCP tool call) still applies to each Anthropic address. A key, which the API's MCP connector can send, keeps its own allowance.

MCP directories read `GET /.well-known/mcp/server-card.json` ([Smithery's server card](https://smithery.ai/docs/build/publish)): the server's name and version, `authentication.required: false`, and the tools `/mcp` lists to a caller without a key, built from the same definitions. `tools/list` names only what the caller can use (`scrape_product` only for a key with the browser lane), and every hosted tool carries a `title` and `readOnlyHint: true`, since hosted Octocrawl refuses page actions and logins. Their input schemas list only what hosted serves (`HOSTED_SCRAPE_KEYS` in `packages/mcp/src/hostedApi.ts`): no `actions`, `robotsOverride`, `lane`, `handoff`, `skipTlsVerification`, `access`, `mode: authed`, cache options or regular-expression checks, and without the browser lane no `screenshot` or `waitFor`. A hosted MCP scrape stops at 100 s (REST keeps 300 s), and hosted MCP results leave out the call's telemetry and internal ids (`usage`, `channelsTried`, `metadata.scrapeId` and the concurrency fields) and the campaign tags in `agentHints` links, unless `debug` is set; REST keeps them, and the Evidence Record stays whole; the same `scrape` on a server on your computer is not marked read-only, as its actions can click and type; `/.well-known/oauth-protected-resource/mcp-oauth` is the Protected Resource Metadata (RFC 9728) for `/mcp-oauth`, which names `https://octocrawl.dev` as its authorization server; any other `/.well-known` file is 404 `not_found`, so a client on `/mcp` finds no OAuth metadata and connects without signing in. `crawl` and `batch` without an account's key answer 403 `jobs_need_account`; an account's connection lists the twelve job tools (`HOSTED_JOB_TOOLS`, H2 M1–M5), with their start options cut to `HOSTED_BATCH_KEYS` and `HOSTED_CRAWL_KEYS` (no `webhook`, which is REST only; `maxCredits` is listed on the hosted start tools only, H2 M6) and waits of at most 90 s. Everything else (Monitors, logins, `/fc`) answers 403 `hosted_unavailable` with an `agentHints` entry that says to run Octocrawl on your computer. Callers without an account (keyless, and keys issued without one) share `W2L_SITE_DAILY` (1500) pages a day, under the quota id `<day>-site`, and keyless callers together get `W2L_KEYLESS_TOTAL_DAILY` (500) of it, under `<day>-keyless`. Accounts have a day apart from it, so a rush of keyless calls refuses no one who signed in: `W2L_ACCOUNTS_DAILY` (3000) pages for every account together, under `<day>-accounts`, and `W2L_ACCOUNT_DAILY` (500) for each, under `<day>-account-<uid>`. Over an allowance: 429 `quota_exhausted` with `Retry-After` until 00:00 UTC; a caller without an account is told first that signing in is free and gives the month's credits (`/mcp-oauth` for an MCP client, a key from `/signin/` for the API). The use that takes a shared pool (`site`, `keyless`, `keyless-claude`, `accounts`, and the worker's `jobs`) to 70% of its day logs one `hosted_quota_threshold` line; [Alerts](#alerts) mails it. Every request, of any kind, is limited to 120 a minute per address before any key lookup. Nothing is retained: `storeInCache` is pinned off, files are capped at 5 MiB, and scrape and map records and saved files are swept from the task root (Cloud Run's in-memory `/tmp`) after 10 minutes.

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
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.octocrawl.dev/v1/crawl -H 'content-type: application/json' -d '{"url":"https://example.com"}'   # 403 without an account's key
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.octocrawl.dev/v1/scrape -H 'authorization: Bearer nope' -H 'content-type: application/json' -d '{}'   # 401
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp && claude mcp list
```

To roll back, `gcloud run services update-traffic octocrawl-api --to-tags=<previous tag>=100`.

## Batch and crawl jobs

Hosted batch (1–1,000 URLs) and crawl (at most 500 pages) jobs (ROADMAP PH stage H1, [plan](launch/2026-10-19-h1-hosted-jobs-plan.md), [task list](h1-hosted-jobs-tasks.md)) run for accounts' keys only, a slice at a time: the API (`hostedJobRoutes.ts`) writes the job to Firestore (`hostedJobs`) and queues its first slice on Cloud Tasks; the worker service `octocrawl-jobs` (`hostedJobWorker.ts`, on the same image) runs each slice and writes its pages to GCS. Both services turn jobs on when all five variables are set (`hostedJobsCloud.ts`):

| Variable | Value |
| --- | --- |
| `W2L_FIRESTORE_PROJECT_ID` | the project |
| `W2L_JOBS_BUCKET` | `octocrawl-jobs-${W2L_PROJECT_ID}` |
| `W2L_JOBS_QUEUE` | `asia-southeast1/octocrawl-jobs` |
| `W2L_JOBS_WORKER_URL` | `https://octocrawl-jobs-c7fpmz73tq-as.a.run.app` |
| `W2L_JOBS_TASKS_ACCOUNT` | `octocrawl-jobs-tasks@${W2L_PROJECT_ID}.iam.gserviceaccount.com` |

The global switch is the Firestore document `hostedConfig/jobs`, field `enabled`; absent means on, and both services read it at most every 30 s.

The same document's `allowedUids`, an array of account uids, makes jobs invite only (H2 R2). It held Howard's account alone from 2026-10-21 and was removed on 2026-10-22, so every account may start jobs now; the rest of this paragraph describes the switch for when it is set again. When the field is absent, every account may start jobs. When it exists, only the listed accounts may; an empty array lets no one. It is read together with `enabled`; a failed read keeps the last value, and with nothing read yet lets no one in.
- **Starts.** A start from another account answers 403 `jobs_invite_only`, on REST and through MCP, which calls the same gate.
- **MCP tool lists.** An MCP connection lists the job tools only to an allowed account. Another account gets a hint that jobs are open to invited accounts for now.
- **Reads and cancels.** These stay open on REST, so an account taken off the list can still read and cancel its jobs there. Over MCP the tools are gone for it.
- **Jobs already queued.** A job an account queued before it left the list still runs when its turn comes.
- **Replays.** A start replayed by its idempotency key is refused like a new one.

```sh
# Invite only, for the accounts named (each is users/{uid}); remove the field to open jobs to every account.
T=$(gcloud auth print-access-token); curl -s -X PATCH -H "authorization: Bearer $T" -H "x-goog-user-project: $W2L_PROJECT_ID" -H 'content-type: application/json' \
  "https://firestore.googleapis.com/v1/projects/$W2L_PROJECT_ID/databases/(default)/documents/hostedConfig/jobs?updateMask.fieldPaths=allowedUids" \
  -d '{"fields":{"allowedUids":{"arrayValue":{"values":[{"stringValue":"<uid>"}]}}}}'
``` Off, a start answers 503 `jobs_paused` and a running job's slice stops at its next page and waits five minutes.

The resources, made once on 2026-10-20:

```sh
gcloud services enable cloudtasks.googleapis.com iamcredentials.googleapis.com --project="$W2L_PROJECT_ID"
gcloud iam service-accounts create octocrawl-jobs-tasks --project="$W2L_PROJECT_ID"
# The runtime account (w2l-preview) queues tasks, delivers them as octocrawl-jobs-tasks, and signs export links as itself.
gcloud projects add-iam-policy-binding "$W2L_PROJECT_ID" --member="serviceAccount:${W2L_RUNTIME_SA}" --role=roles/cloudtasks.enqueuer
gcloud iam service-accounts add-iam-policy-binding "octocrawl-jobs-tasks@${W2L_PROJECT_ID}.iam.gserviceaccount.com" --member="serviceAccount:${W2L_RUNTIME_SA}" --role=roles/iam.serviceAccountUser --project="$W2L_PROJECT_ID"
gcloud iam service-accounts add-iam-policy-binding "$W2L_RUNTIME_SA" --member="serviceAccount:${W2L_RUNTIME_SA}" --role=roles/iam.serviceAccountTokenCreator --project="$W2L_PROJECT_ID"
# Files: private, deleted 30 days after they were written as a backstop (the worker deletes a job's files when it expires).
gcloud storage buckets create "gs://octocrawl-jobs-${W2L_PROJECT_ID}" --location=asia-southeast1 --uniform-bucket-level-access --public-access-prevention --project="$W2L_PROJECT_ID"
gcloud storage buckets update "gs://octocrawl-jobs-${W2L_PROJECT_ID}" --lifecycle-file=lifecycle.json --project="$W2L_PROJECT_ID"   # {"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}
gcloud storage buckets add-iam-policy-binding "gs://octocrawl-jobs-${W2L_PROJECT_ID}" --member="serviceAccount:${W2L_RUNTIME_SA}" --role=roles/storage.objectAdmin --project="$W2L_PROJECT_ID"
# Retries without a limit, backing off from 10 s to 10 min: a held lease answers 503 until it expires (16 min), and a job
# with no delivery left would stay running. A slice that fails every time is retried every 10 min (hosted_job_delivery_failed).
gcloud tasks queues create octocrawl-jobs --location=asia-southeast1 --max-concurrent-dispatches=3 --max-dispatches-per-second=1 --max-attempts=-1 --min-backoff=10s --max-backoff=600s --max-doublings=5 --project="$W2L_PROJECT_ID"
for spec in hostedJobs:deleteAt hostedJobIdempotency:expireAt creditSettles:expireAt; do gcloud firestore fields ttls update "${spec#*:}" --collection-group="${spec%%:*}" --enable-ttl --async --project="$W2L_PROJECT_ID"; done
```

The worker is deployed from the hosted API's image, not public, one slice an instance; the queue's account may invoke it:

```sh
gcloud run deploy octocrawl-jobs --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --service-account="$W2L_RUNTIME_SA" --no-allow-unauthenticated --ingress=all \
  --cpu=1 --memory=4Gi --concurrency=1 --min-instances=0 --max-instances=3 --timeout=900s \
  --command=node --args=packages/mcp/dist/hostedJobsCli.js --revision-suffix="$W2L_REVISION_SUFFIX" --env-vars-file=jobs-env.yaml \
  --update-env-vars=NODE_OPTIONS=--max-old-space-size=3072
gcloud run services add-iam-policy-binding octocrawl-jobs --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --member="serviceAccount:octocrawl-jobs-tasks@${W2L_PROJECT_ID}.iam.gserviceaccount.com" --role=roles/run.invoker
```

4 GiB and a 3 GB JavaScript heap since 2026-10-20 (`octocrawl-jobs-w2-mem4g`): at 2 GiB a 30-page crawl of docs.python.org/3/ ran the heap out of memory (`FATAL ERROR: Ineffective mark-compacts near heap limit`, about 1 GB) on every delivery, until the change.

The API takes the same variables with `--update-env-vars` on its next release. Verified on 2026-10-20 (worker `octocrawl-jobs-w1-5141c6d`, API `octocrawl-api-jobs-5141c6d`, tag `h28jobs`, rollback `h27shares`), with a key issued for the purpose and revoked after: a 6-URL batch and a 5-page crawl through the real queue, worker and bucket each completed in one slice in about 11 s, paged back, exported by a signed link, were charged 6 and 4 credits once each (`creditSettles`), and had their expiry queued 7 days on. A request to the worker without a token is 403 from Cloud Run, and with another account's token 401 from the worker. The switch was left off.

`GET /v1/jobs?limit=&before=` lists an account's jobs, newest first, with the fields of a job's status (H2 P1, for the dashboard and MCP). `limit` is 1–50 (default 20); `before` is the `nextBefore` of the previous page, a job id, and `hasMore` says whether another page follows. A call without an account's key is 403. The list is the last 200 jobs the account started, kept in its slots document (`hostedJobWorkspaces/{workspaceId}.slots.recent`), so it needs no Firestore index; a job leaves it when its record is deleted (7 days of results and 30 more of record after it finishes). Jobs started before the list existed are not in it.

### Job webhooks

A start may name a webhook for the job's end (H2 W1–W4): `"webhook": "https://…"` or `"webhook": { "url": "https://…", "events": ["completed", "failed", "cancelled"], "metadata": { … } }`.

- **What it accepts.** The url must be https to a public address. `events` may be any of the three end events, and all three is the default. `headers` and `secretEnv`, which a local server takes, are refused: a hosted job signs with a secret of its own instead.
- **The secret.** The start's answer carries `webhook.secret`, `whsec_` and 43 characters. A start replayed by its idempotency key carries the same secret again, so a client that lost the first answer can still verify deliveries. Status and the list show the webhook's `url`, `events` and `delivery`, never the secret. Keep it the way you keep a key.
- **When it is sent.** When the job ends, the worker queues one Cloud Tasks delivery, `{jobId}-webhook`, to `/internal/jobs/:id/webhook`. That delivery posts the event once.
- **The body.** It is a local job's terminal event (`w2l.job-event/v1`): `eventId` `{jobId}:{status}`, `sequence` (the pages read plus one), `jobId`, `jobKind`, `event`, `at` (when the job finished), `metadata`, `report` (the job's status as `GET /v1/batches/:id` or `/v1/crawl/:id` shows it), and `error` on a failure. Hosted sends no `started` or `page` events.
- **Headers.** `x-w2l-event-id`, `x-w2l-event-version` (the sequence), `x-w2l-delivery-id`, `x-w2l-timestamp` (milliseconds since the epoch), and `x-w2l-signature`. The signature is `sha256=` followed by the hex HMAC-SHA256, under the secret, of `{x-w2l-timestamp}.{raw body}`.
- **Retries.**
  - A 2xx is delivered.
  - A 408, 425, 429, 5xx or no answer within 30 s is retried on the queue's backoff (10 s doubling to 10 min), up to 8 attempts, about 20 minutes. After the eighth it is recorded as failed.
  - Any other answer, or an address the egress policy refuses, is failed at once.
  - Each outcome is recorded on the job as `webhook.delivery`, `{ state, attempts, httpStatus, error, at }`, and logged as `hosted_job_webhook`.
- **Over MCP.** The MCP tools do not offer a webhook, and a call that passes one anyway is refused, because the secret would land in the agent's transcript.
- **A job never queued.** A job whose first slice could not be queued fails with `not_queued`, and how its end is handled depends on when that happened.
  - **At its own start:** the start answered 503, so nothing is posted, and `webhook.delivery` says why. A start replayed by its idempotency key gets this job and its secret back.
  - **After it waited in the queue:** it is finished at once by a delivery of its own (`{jobId}-finish`), which posts its end. If the queue refuses that delivery too, `webhook.delivery` says it was not sent.
  - A "not sent" record never replaces a delivery under way or done.
- **Cancel.** A job cancelled while no slice holds its lease is finished at once by `{jobId}-finish`, so that a slice waiting in the queue with a delay (until the next UTC day, for example) does not hold back its export and webhook. A slice that holds the lease finishes the job when it commits, with its pages counted. If the finish delivery is refused, the waiting slice still finishes the job later.

To verify a delivery, check the signature over the raw body before parsing it, compare in constant time, and reject an old timestamp:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyOctocrawl(rawBody, headers, secret, toleranceMs = 5 * 60_000) {
  const timestamp = headers['x-w2l-timestamp']
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`)
  const given = Buffer.from(String(headers['x-w2l-signature'] ?? ''))
  return given.length === expected.length && timingSafeEqual(given, expected) && Math.abs(Date.now() - Number(timestamp)) <= toleranceMs
}
```

```python
import hashlib, hmac, time

def verify_octocrawl(raw_body: bytes, headers, secret: str, tolerance_ms: int = 300_000) -> bool:
    timestamp = headers.get("x-w2l-timestamp", "")
    expected = "sha256=" + hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    fresh = timestamp.isdigit() and abs(time.time() * 1000 - int(timestamp)) <= tolerance_ms
    return fresh and hmac.compare_digest(expected, headers.get("x-w2l-signature", ""))
```

Deliveries can repeat (Cloud Tasks delivers at least once), so a receiver keys on `x-w2l-event-id`.

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
  | The json model fallback, on a page whose json called the model ([below](#the-json-model-fallback)) | +2 |
  | Anything else: blocked by a check, a challenge or robots.txt, nothing read, an invalid request, a server error | 0 |

- **How it is charged.** A call reserves the most it could cost before it runs: 5 when the key may use the browser lane, else 1. When it ends, it gives back what its result did not cost.
- **Running short.** An account with at least 1 credit but fewer than 5 reads over HTTP alone for that call. With none left it is refused: `429 quota_exhausted`, with `Retry-After` counting down to the 1st.
- **What the response says.** A scrape or map the gate answered says `X-Credits-Used` and `X-Credits-Remaining`. An error raised inside (an invalid request, a server error) costs nothing but carries neither header. An MCP tool call spends the same way, through the same gate.
- **Firestore.**
  - `credits/{uid}` holds `month`, `grant` and `purchased`. An account's first balance is written only while `users/{uid}` exists (the same commit checks it): a deleted account (public-preview auth.ts) cannot start a new one through a key the API still has cached, and such a call is `401 unauthorized`. A key issued by hand with `--uid` needs that account to have signed in once.
  - A reservation updates that document and the accounts' daily counters (`hostedQuotas/{day}-accounts` and `hostedQuotas/{day}-account-{uid}`) in one commit with update-time preconditions, so two instances cannot overspend.
  - The refund and the day's usage (`creditUsage/{uid}-{day}`: `http`, `browser`, `not_found`, `map`, `unread`, `model`, `credits`; `model` counts the pages whose json called the model, beside their own kind) are server-side increments. The usage documents expire after 90 days (the TTL policy above).
  - The same commit writes the call's request line, `requestLog/{uid}/requests/{id}`: endpoint, key HMAC, the URL asked for and the final URL, lane, status, HTTP status, reason, robots.txt decision, the Evidence Record's `rawSha256`, a map's link count, the format names a scrape asked for (`formats`, empty when it named none, absent on a map), how long the call took (`ms`), what it was counted as and its credits, with `modelCredits` (the model's part of them) when the scrape asked for the json model fallback. Never the page's content. The id is `9999999999999 − epoch ms` and a random tail, so Firestore's default order lists the newest first without an index. Lines expire 30 days on (`expireAt`, the TTL policy above), and the dashboard reads them through `GET /api/account/activity` (packages/public-preview/src/account.ts).
- **Logs.** Every key's start that passed its allowance or reserved its credits logs `hosted_usage` with the first 16 characters of the key's HMAC (never the key; `playground:` and the uid's first characters for the dashboard's Playground, below), its plan, the account id for an account's key, the endpoint and the UTC day: the per-key, per-day count for keys issued by hand as well (ROADMAP PH item 2). Every call that reserved credits logs `hosted_credits` with the account id, what it was counted as, and what it reserved and spent. A reservation or settle that fails logs `hosted_credits_reserve_failed` or `hosted_credits_settle_failed`. A commit that timed out may still have applied, so check `credits/{uid}` and `creditUsage` before giving anything back by hand. Every keyless start logs `hosted_keyless_usage` with the first 16 characters of the address's HMAC (the daily counter's; `null` and `pool: "claude"` for Claude's connectors), the endpoint and the UTC day, and every MCP `initialize` logs `hosted_mcp_initialize` with the endpoint, the caller's kind (`keyless`, `key`, `oauth`) and the `clientInfo` name and version the client gave, as printable text of at most 64 characters. `scripts/hosted/funnel.mjs` counts active keyless addresses and connections by client from these lines, and sign-ups by `users/{uid}.firstSource`, which the site writes from its `w2l_src` cookie on an account's first sign-in (packages/public-preview/src/site.ts).
- **Edge.** A call that runs across 00:00 UTC on the 1st gives its refund to the new month's grant, at most 4 credits over it.
- **The dashboard's Playground.** `/dashboard/scrape/` and `/dashboard/map/` on octocrawl.dev run a scrape or a map for the signed-in account without a key. The site's server (`POST /api/account/run`, packages/public-preview/src/account.ts) calls `/v1/scrape` or `/v1/map` with `X-W2L-Site-Account: {uid}.{expires ms}.{HMAC}`, signed with `W2L_QUOTA_HASH_KEY` and good for two minutes. The gate checks it without a store (`verifySiteAccount`), so it is not counted per address, and treats the call as the account's: same price, same reservation, same `X-Credits-*` headers, same request line, under the key id `playground:{uid}`. A header that does not verify is `401 unauthorized`. A run does not count against the account's five keys. Its scrape takes a browser-lane lease of its own, `browser-playground:{uid}`, so a second run started before the first ends is `429 browser_busy`.

Keys for an account are made on octocrawl.dev's dashboard (`/dashboard/keys/`) after sign-in (docs/public-preview.md, Sign-in). One can also be issued by hand, for a test account:

```sh
node scripts/hosted/issue-key.mjs issue --label 'test account' --uid test-account-1 --browser
```

## The json model fallback

`modelFallback: true` on a json format calls a model for the required fields a page's own data left empty ([JSON extraction](json-extraction.md)). On hosted Octocrawl it runs on Octocrawl's Anthropic account, for accounts only. Decided by Howard on 2026-10-24 (ROADMAP P5); `packages/mcp/src/hostedModel.ts` holds the rules.

- **The model.** Claude Haiku 5.5 (`claude-haiku-5-5`) through the native provider (`W2L_EXTRACT_PROVIDER=anthropic`), at the code's default effort (`low`, `CLAUDE_DEFAULT_EFFORT` in `packages/api/src/structured.ts`; no `W2L_EXTRACT_EFFORT`).
- **The price.** 2 credits more for each page on which the model was called, as `json.modelUsage.attempts` shows it: one call or two (a repair) cost the same. Nothing more when `modelFallback` is off, the json was complete without the model, or a refusal below kept the model from being called. A scrape reserves the 2 with the page, before it runs, and gives them back when no call was made. An account without the 2 on top of the page's own price reads the page without the model; a job's slice does the same. A keyless caller and a key issued by hand have no credits, so their pages never call the model.
- **The daily cap.** Every hosted call together may spend `dailyCapUsd` (default $5) a UTC day on the model. Before a page's first call its gate reserves the most the page's calls can cost: both attempts, one input token per byte sent (the page's Markdown, the schema, the prompt and the values already read, plus 8 KiB for the system prompt, the format's framing and a repair, whose text a gated page cuts to 1,000 characters; this assumes a token covers at least one byte of UTF-8) and 16,000 output tokens each, at Claude Haiku 5.5's published prices. For a 30 KB page that is about $0.024 against a measured $0.0011 a call (19 calls cost $0.0208 in `research/accuracy/runs/2026-10-24-f2-live-v2-453b2105.md`): it is held only while the call runs. The reservation is a commit to `hostedModelSpend/{day}` (`microUsd`, micro-USD) with an update-time precondition, so two instances cannot pass the cap together. After the call it is replaced by what the calls cost (`modelUsage.externalCostUsd`), or given back when none was made. A cost that is not known (a call that failed after it was sent) keeps the whole reservation. The day's document expires 90 days on (`expireAt`).
- **The switch.** The Firestore document `hostedConfig/model`: `enabled` (boolean) and `dailyCapUsd` (number, optional; 0 admits nothing). Both services read it at most every 30 s. While the document is absent, or `enabled` is anything but `true`, the fallback is off, so a deploy alone turns nothing on. A failed read keeps what was read last; with nothing read yet it is off.
- **A refusal.** A switch that is off, a cap that is reached, a caller without credits for it, or a budget that could not be read calls no model and charges nothing more. The json stays as deterministic extraction read it, `incomplete`, with a `model_unavailable` issue that says which.
- **What the response says.** A scrape that asked for the fallback carries `X-Credits-Model` (2 or 0), within `X-Credits-Used`. Its json's `modelUsage` gives the model, the calls, the tokens and their price in USD. A job's `credits.used` counts the 2 with each page's own price, and its start's `estimatedCredits` counts 2 more a page.
- **Logs.** `hosted_model_call` gives the day, the calls, the tokens, the cost and the reservation; `hosted_model_cap_reached` the day's spend and the cap; `hosted_model_budget_failed` and `hosted_model_settle_failed` a store error (a failed settle keeps the reservation, so the day counts more than was spent, never less). `hosted_credits` adds `model`, the credits the model's part cost. No line carries the page, the prompt, the schema, the model's answer or the key.
- **Local and self-hosted Octocrawl** do not change: the model is called whenever `W2L_EXTRACT_*` configure one, with no gate, no cap and no credits.

### Turning it on

Steps for Howard to approve; nothing here has been run. Howard makes the Anthropic API key in the Anthropic Console on Octocrawl's organization, with its payment method bound, and keeps it in a git-ignored file with owner-only permissions (for example `.w2l/hosted/anthropic-api-key`, no trailing newline).

```sh
# 1. The secret, readable by the runtime account both services run as.
gcloud secrets create w2l-anthropic-api-key --replication-policy=automatic --data-file=.w2l/hosted/anthropic-api-key --project="$W2L_PROJECT_ID"
gcloud secrets add-iam-policy-binding w2l-anthropic-api-key --member="serviceAccount:${W2L_RUNTIME_SA}" --role='roles/secretmanager.secretAccessor' --project="$W2L_PROJECT_ID"

# 2. The day's spend expires 90 days on.
gcloud firestore fields ttls update expireAt --collection-group=hostedModelSpend --enable-ttl --async --project="$W2L_PROJECT_ID"

# 3. The switch, written off first: the deploy below then enables nothing.
T=$(gcloud auth print-access-token); curl -s -X PATCH -H "authorization: Bearer $T" -H "x-goog-user-project: $W2L_PROJECT_ID" -H 'content-type: application/json' \
  "https://firestore.googleapis.com/v1/projects/$W2L_PROJECT_ID/databases/(default)/documents/hostedConfig/model" \
  -d '{"fields":{"enabled":{"booleanValue":false},"dailyCapUsd":{"doubleValue":5}}}'

# 4. A release of both services from a commit that has this code, as any release (Deploy above; Batch and crawl jobs for
#    octocrawl-jobs), with the model's variables and the key added to what each has:
gcloud run deploy octocrawl-api --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --revision-suffix="$W2L_REVISION_SUFFIX" --no-traffic \
  --update-env-vars="W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA},W2L_EXTRACT_PROVIDER=anthropic,W2L_EXTRACT_MODEL=claude-haiku-5-5" \
  --update-secrets='W2L_EXTRACT_API_KEY=w2l-anthropic-api-key:latest'
gcloud run deploy octocrawl-jobs --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --revision-suffix="$W2L_REVISION_SUFFIX" --no-traffic \
  --update-env-vars="W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA},W2L_EXTRACT_PROVIDER=anthropic,W2L_EXTRACT_MODEL=claude-haiku-5-5" \
  --update-secrets='W2L_EXTRACT_API_KEY=w2l-anthropic-api-key:latest'
#    Then update-traffic for each to its new revision under a new tag, keep the previous tags as the rollback, and check
#    that each startup line names "extractModel":"claude-haiku-5-5" and that a scrape with modelFallback answers
#    model_unavailable "switched off" with X-Credits-Model: 0.

# 5. On: one test page with an account's key, then the switch.
curl -s -X PATCH -H "authorization: Bearer $T" -H "x-goog-user-project: $W2L_PROJECT_ID" -H 'content-type: application/json' \
  "https://firestore.googleapis.com/v1/projects/$W2L_PROJECT_ID/databases/(default)/documents/hostedConfig/model?updateMask.fieldPaths=enabled" \
  -d '{"fields":{"enabled":{"booleanValue":true}}}'
```

`W2L_EXTRACT_BASE_URL` stays unset, so the SDK calls `https://api.anthropic.com`. The services pass no proxy to the SDK: Cloud Run reaches Anthropic directly.

To turn it off, write `enabled: false` (or delete the document): within 30 s no new call is admitted, and a call already admitted finishes. To change the cap, write `dailyCapUsd`. To take the model away altogether, a release with `--remove-env-vars=W2L_EXTRACT_PROVIDER,W2L_EXTRACT_MODEL --remove-secrets=W2L_EXTRACT_API_KEY` on both services; rolling back to the previous tags does the same, since those revisions have no key. Read a day's spend from `hostedModelSpend/{day}.microUsd`, and the bill from the Anthropic Console.

## Read the service

Every request is in Cloud Run's request log. The two-week cost record the roadmap asks for is read from Cloud Billing (the service's own SKU lines) against the request counts:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="octocrawl-api" AND httpRequest.requestUrl:"/v1/scrape"' --project="$W2L_PROJECT_ID" --freshness=7d --format='value(httpRequest.status)' | sort | uniq -c
```

Write the result to `research/hosted/` with the date, the pages per lane, the billed amount and the cost per 1,000 pages; the allowances and `--max-instances` are adjusted from that record, not before.

### Alerts

The API and the job worker log `{"event":"hosted_quota_threshold","pool":…,"day":…,"count":…,"limit":…}` once a pool a day, from the use that takes a shared pool to 70% of its limit. A log-based alert mails it, and a billing budget mails spend. Set them up once, in this order:

```sh
# 1. An email channel; the command prints the channel's name (projects/…/notificationChannels/…).
gcloud beta monitoring channels create --display-name="Octocrawl ops" --type=email --channel-labels=email_address=<operator address> --project="$W2L_PROJECT_ID"

# 2. The pool alert: any hosted_quota_threshold line from either service, at most one mail an hour.
cat > quota-alert.json <<'EOF'
{"displayName": "Octocrawl: a shared pool reached 70% of its day", "combiner": "OR",
 "conditions": [{"displayName": "hosted_quota_threshold", "conditionMatchedLog": {
   "filter": "resource.type=\"cloud_run_revision\" AND jsonPayload.event=\"hosted_quota_threshold\"",
   "labelExtractors": {"pool": "EXTRACT(jsonPayload.pool)"}}}],
 "alertStrategy": {"notificationRateLimit": {"period": "3600s"}, "autoClose": "86400s"},
 "notificationChannels": ["<the channel name from step 1>"]}
EOF
gcloud alpha monitoring policies create --policy-from-file=quota-alert.json --project="$W2L_PROJECT_ID"

# 3. A monthly budget in US dollars, mailed to the billing account's admins at 50%, 90% and 100%.
gcloud billing budgets create --billing-account=<billing account id> --display-name="Octocrawl monthly" --budget-amount=<amount>USD \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 --filter-projects="projects/${W2L_PROJECT_ID}" --billing-project="$W2L_PROJECT_ID"
```

A pool's limit is its environment variable on the service (`W2L_SITE_DAILY`, `W2L_KEYLESS_TOTAL_DAILY`, `W2L_CLAUDE_DAILY`, `W2L_ACCOUNTS_DAILY` on `octocrawl-api`; `W2L_JOBS_DAILY` on `octocrawl-jobs`); raising one is a new revision with `--update-env-vars`, moved to as any deploy is.
