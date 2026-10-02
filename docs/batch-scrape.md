# Persistent URL-array scraping

`POST /v1/batches` accepts 1–1000 distinct HTTP(S) URLs and returns a durable `taskId` immediately. URLs that collapse to the same crawl canonical URL are rejected. A batch visits only the supplied URLs; it does not follow links. Omitting `formats` selects Markdown. Add `links` (or `includeLinks: true`) to get each item's absolute outbound links, as scrape returns them. Each item whose page was extracted carries that page's `metadata` (its `<title>`, description, language and the rest), as scrape does. JSON formats use the same deterministic-first Schema extraction as single-page scrape. `formats` may also ask for `html` and `rawHtml`, which each item then carries as a scrape does (`null` for a file and for an item that is not `success` or `partial`), and for `screenshot`: every URL of the batch then runs on the browser rung, and each item carries its capture inline (`null` when none could be taken), so viewport captures are the lighter choice ([README](../README.md)). `onlyMainContent`, `includeTags`, `excludeTags`, `waitFor`, `timeout` and `maxFileBytes` apply to every URL as they do to one scrape ([README](../README.md)), and a URL that answers with a file (PDF, CSV, XLSX, ZIP, JSON, text) is saved and described as on scrape, with its own `file` block; `timeout` is each item's own deadline, JSON extraction and its model fallback included, and an item it cuts short is `partial` or `failed`/`timeout` with `usage.deadlineExceeded: true` while the batch goes on. `robotsOverrides` records, for single URLs of the batch, a decision to fetch that URL although its host's robots.txt disallows it: a list of `{ url, reason, recordedBy? }` in which each `url` is one of `urls`, named once. Only that item is fetched past its rule; it carries a `robots_overridden` warning, its trace the rule and the reason, also when it ends `failed`/`timeout` because its deadline passes while the request is out, and the list is stored with the task, so a resumed batch keeps it ([README](../README.md)). The local HTTP and browser rungs apply an override; the provider lane takes none, and an item that set a rule aside does not go on to a vendor rung. An item whose HTTP page looks like a shell for data its scripts fill in is offered to the browser rung as a thin page is, and carries a `client_rendered_suspected` warning when that HTTP page stays its answer ([README](../README.md)). A hosted server (`--hosted`) refuses `robotsOverrides` with HTTP 400 `unsupported_parameter`. An unsupported format or an unknown request field is rejected with HTTP 400 naming it.

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/batches \
  -H 'content-type: application/json' \
  -d '{"urls":["https://example.com/a","https://example.com/b"],"formats":["markdown"]}'
```

## Request options

| Option | Values | What it does |
| --- | --- | --- |
| `urls` | 1 to 1000 strings | The URLs to fetch, each an http(s) URL, distinct after canonicalization. An entry that is not a URL is refused by its index (`urls[2] must be http(s)`, `urls[2] is required`) unless `ignoreInvalidURLs` is on; an entry that is not a string is `urls[2] must be a string` either way. |
| `mode` | `standard` (default), `research`, `authed` | The identity every URL is fetched under, as on scrape. |
| `formats`, `includeLinks` | as on scrape | What each item carries; `links` or `includeLinks: true` adds the outbound links. |
| `robotsOverrides` | `[{ url, reason, recordedBy? }]` | Recorded decisions to fetch single URLs of the batch past their robots.txt rule (above). Refused on a hosted server. |
| `maxConcurrency` | integer 1 to 4 | The most pages of this batch in flight at once, across all its hosts. It only lowers the service's worker count (4 locally, 2 on the hosted MCP host) and never raises the per-host ceiling or shortens the minimum interval; per host the effective number is the lower of the two. Stored with the task, so a batch resumed after a restart runs under the same cap; `GET /v1/batches/:id` reports the cap in force as `maxConcurrency`. Omitted takes the worker count. |
| `ignoreInvalidURLs` | boolean, default false | Start with the entries of `urls` that are http(s) URLs and report the rest as `invalidURLs` (on the 202, possibly empty, and on `GET /v1/batches/:id`, present exactly when the option was on) instead of refusing the request. `requested` counts the valid URLs; the 1 to 1000 cap counts the submitted entries; a duplicate is refused as before, since it is not an invalid URL, and a `robotsOverrides` entry must name a URL that stayed. `urls must contain at least one valid URL` when none does. |
| `idempotencyKey` | 1 to 200 characters, no control characters | A client-chosen key for this submission; also the `x-idempotency-key` or `Idempotency-Key` header, which Firecrawl's clients send (a body key beside a header must be the same key, else HTTP 400). The same key with the same body again answers the first submission's 202 with `replayed: true` and starts nothing; the same key with another body is HTTP 409 `conflict`. Keys live 24 hours ([below](#idempotent-submission)). |
| `appendToId` | the `taskId` of an existing batch | Add `urls` to that batch instead of starting a new job. The body may then carry only `urls`, `ignoreInvalidURLs`, `idempotencyKey`, `robotsOverrides` (for the new URLs) and the labels: a `mode`, `formats`, `includeLinks`, `maxConcurrency` or page option is HTTP 400 `appendToId keeps the job's options; <key> cannot be changed` ([below](#appending-urls)). |
| page options | `onlyMainContent`, `waitFor`, `timeout`, `maxFileBytes`, `includeTags`, `excludeTags`, `headers`, `mobile`, `skipTlsVerification`, `fastMode`, `blockAds`, `removeBase64Images` | Applied to every URL as on one scrape ([README](../README.md)). |
| `origin`, `integration` | labels | Stored on the task's record and nowhere else ([README](../README.md)). |

The hosted MCP host's `batch_scrape` keeps its reviewed shape (Amazon.sg `/dp` URLs, the fixed JSON schema): `maxConcurrency`, `ignoreInvalidURLs`, `robotsOverrides`, `idempotencyKey` and `appendToId` are refused there with `unsupported remote tool option`, and nothing about TLS, robots.txt or the egress checks changes with these options anywhere.

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/batches \
  -H 'content-type: application/json' \
  -d '{"urls":["https://example.com/a","not a url"],"ignoreInvalidURLs":true,"maxConcurrency":1}'
# 202 {"taskId":"…","invalidURLs":["not a url"]}
```

## Reading the result

Use the returned ID with `GET /v1/batches/:id` for `requested`, `completed`, `remaining`, `maxConcurrency` (the cap in force), `invalidURLs` (when `ignoreInvalidURLs` was on) and task status. `GET /v1/batches/:id/items?limit=50&cursor=...` returns all per-URL outcomes, including failures, in stable pages (default 10, maximum 50). Items omit attempt audits and trace content by default; pass `debug=true` to include the routing audit and trace. Persisted attempt audits omit repeated Markdown, links, `html` and `rawHtml` bodies; the selected top-level result remains available. `GET /v1/batches/:id/events` streams `progress`, `paused`, and terminal `complete` SSE events; reconnecting after a restart receives the current state. `POST /v1/batches/:id/cancel` cancels unfinished work. A completed batch can contain failed URLs, so inspect each item's `status` and `failureReason`, or read the errors report.

### The errors report

`GET /v1/batches/:id/errors?cursor=&limit=` (SDK `getBatchErrors(id, { cursor?, limit? })`, MCP `get_batch_errors`) lists the items that did not succeed: status `failed`, `blocked`, `cancelled` or `budget_exceeded`, across every attempt of the batch, so a batch interrupted and resumed keeps the failures its first attempt recorded (where `GET /v1/crawl/:id/errors` on the same id reads the latest attempt alone). Errors carry no page bodies, so a page holds up to 1000 of them (`limit` 1 to 1000, default 1000; a batch has at most 1000 URLs). The answer is `{ errors, robotsBlocked, nextCursor, hasMore }`:

- `errors[]`: `{ id, timestamp, url, status, code, error, httpStatus }`, Firecrawl's names with W2L's status vocabulary beside them. `id` and `timestamp` are the item's step id and `createdAt` on `/items`; `status` is the item's; `code` is its `failureReason`, `blockReason` or `budgetExceeded`, whichever the status carries, else the status itself (`http_error`, `policy_denied`, `bot_detected_generic`, …); `httpStatus` is the final response's status or `null` when no response answered; `error` is a sentence for a reader: the item's first warning when it has one, else `<status>: <code>` with ` (HTTP <n>)` when the status is known and, for a robots.txt refusal, ` — robots.txt rule <pattern>` from the `robots_disallowed` trace event (or ` — robots.txt unreachable (<reason>)` when the file could not be read).
- `robotsBlocked`: every URL of the batch, all attempts, not paginated, whose stored result is `policy_denied` with a `robots_disallowed` trace event and no `robots_overridden` event. It is a projection of the lanes' own records, the same events the item's trace and Evidence Record carry; nothing is inferred. A governance or SSRF refusal is `policy_denied` too, but not robots.txt: it stays in `errors` and out of this list, and an item fetched under a recorded override is in neither.

A crawl's id answers 404 here, as a batch's does on the crawl routes.

### Appending URLs

`POST /v1/batches` with `appendToId: "<taskId>"` (SDK `appendToBatch(id, urls, { ignoreInvalidURLs?, idempotencyKey?, robotsOverrides? })`, MCP `batch_scrape` with `appendToId`) adds `urls` to that batch instead of starting a new job, as Firecrawl's `appendToId` does. The URLs are checked as a new batch's are (1 to 1000 entries, http(s), distinct, `ignoreInvalidURLs` honoured, a `robotsOverrides` entry naming one of them) and go to the end of the job's stored list, in order; `GET /v1/batches/:id` then reports the longer list as `requested`, and `remaining` grows by the same count. The 202 is `{ taskId, requested, appended, invalidURLs? }`: the job's id, its URLs now, the URLs this request added, and the entries skipped when `ignoreInvalidURLs` was on (`requested` and `appended` are W2L's additions; Firecrawl returns the id alone). The job keeps its `mode`, `formats`, `includeLinks`, `maxConcurrency` and page options: an append that names one is refused by name (`appendToId keeps the job's options; formats cannot be changed`). Refused as well: a total over 1000 (`batch would exceed 1000 URLs`), a URL already in the batch after canonicalization (`appended url is already in the batch: <url>`), an id that is not a batch (404), and a cancelled or failed batch (HTTP 409 `{ error: "batch is cancelled", code: "conflict" }`). A running batch picks the new URLs up itself (its run re-reads the task every 100 ms and seeds what was added), so they are fetched in the same attempt; a batch that has completed runs again for them in a new attempt (its status returns to `pending`, then `running`), and URLs that arrive just as a run is finishing are fetched by a relaunch of the same kind. Each item's `attemptId` (on `/items?debug=true`, in the step record) says which. A URL on a new host is fetched like the others, under its own robots.txt read, SSRF check and identity. An append creates no job: to a pending, running or paused batch it adds no run either, so an active-batch limit (the hosted MCP host runs one batch at a time) does not count it; an append that makes a completed batch run again makes it active again, and under such a limit is refused as a new batch is, HTTP 400 `active batch limit reached`, while another batch is active — the batch is left as it was and nothing is recorded for the request's `idempotencyKey`, so the same request goes through once the limit allows. Appending is per API process, like the batch itself: the orchestrator that runs the task must be in the process that takes the append, or the task must be at rest.

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/batches \
  -H 'content-type: application/json' \
  -d '{"appendToId":"<id>","urls":["https://example.com/c","https://example.com/d"]}'
# 202 {"taskId":"<id>","requested":4,"appended":2}
```

### Idempotent submission

`idempotencyKey` (1 to 200 characters; on REST also the `x-idempotency-key` or `Idempotency-Key` header, which Firecrawl's clients send, merged into the body before parsing) makes a submission safe to retry: a `POST /v1/batches` sent again with the same key and the same body, an append included, answers the first submission's 202 with `replayed: true` and starts nothing; so does a crawl start (`POST /v1/crawl`, `/fc/v1/crawl`). The same key with a different body, judged by a fingerprint of the parsed request (its fields with their keys sorted, the URLs in order, `appendToId` included), is HTTP 409 `{ error: "idempotency key was used for a different request", code: "conflict" }`; a body key that differs from the header is HTTP 400 `idempotencyKey does not match the x-idempotency-key header`. The record of a key is one row in `<task root>/idempotency.sqlite` (the key, the fingerprint, the task id, the 202 body and the time); a row lives 24 hours, or until its task directory is gone, and is then replaced by the next submission. The index belongs to the one API process that runs a task root, as the batch contract does: it is not a lock between processes. The SDK sends the key in the body; `batchScrapeChunked` derives `<key>:<chunk index>` per job.

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/batches -H 'content-type: application/json' -H 'x-idempotency-key: nightly-2026-10-02' \
  -d '{"urls":["https://example.com/a","https://example.com/b"]}'
# 202 {"taskId":"…"}; the same request again: 202 {"taskId":"…","replayed":true}
```

### Lists longer than 1000 URLs

The server takes at most 1000 URLs per batch; the SDK splits longer lists. `chunkUrls(urls, chunkSize = 100)` (Firecrawl's JS helper of the same name, exported here) returns the chunks in order; `chunkSize` is an integer from 1 to 1000. `batchScrapeChunked(urls, options, { chunkSize = 100, itemLimit = 50, pollIntervalMs, timeoutMs, maxRetries, signal })` (the TypeScript form of the Python SDK's `process_large_batch`: `chunk_size`, `poll_interval` and `timeout` are `chunkSize`, `pollIntervalMs` and `timeoutMs`) runs one batch per chunk, strictly in sequence: each job is started with the batch options (`formats`, `maxConcurrency`, …; a caller's `idempotencyKey` becomes `<key>:<chunk index>` per job, so a retry of the whole call replays the jobs that went through), waited for as `waitBatch` with the wait options, and listed in pages of `itemLimit` before the next starts. It returns `{ jobs, items, invalidURLs }`: one `{ taskId, urls, report, invalidURLs? }` per job in submission order, every item of every job in the order the URLs were submitted, and every entry `ignoreInvalidURLs` skipped. A `WaitTimeoutError` or `W2LError` from any job ends the call, naming that job; the earlier jobs stay on the server as ordinary batches (one task directory each), and the later chunks were never sent. `appendToId` is not a chunking option (`batchScrapeChunked cannot append; use appendToBatch`). On the hosted host, where one batch is active at a time, the sequence fits as it is. There is no MCP tool for it (an MCP call is at most 1000 URLs by design) and no `/fc` route (it is a client-side helper).

```ts
const { jobs, items } = await w2l.batchScrapeChunked(urls, { formats: ['markdown'], idempotencyKey: 'nightly-2026-10-02' }, { chunkSize: 500, timeoutMs: 600_000 })
console.log(jobs.map((job) => [job.taskId, job.report.completed]), items.length)
```

```bash
curl -sS http://127.0.0.1:8787/v1/batches/<id>/errors?limit=100
# {"errors":[{"id":"…","timestamp":"2026-10-02T12:00:00.000Z","url":"https://httpbin.org/status/404","status":"failed","code":"http_error","error":"failed: http_error (HTTP 404)","httpStatus":404}],"robotsBlocked":["https://httpbin.org/deny"],"nextCursor":null,"hasMore":false}
```

```ts
const { taskId } = await w2l.batchScrape(urls, {
  formats: [{ type: 'json', schema: productSchema }],
})
const done = await w2l.waitBatch(taskId, { timeoutMs: 600_000 })
for await (const item of w2l.listBatchItems(taskId, { limit: 50 })) {
  console.log(item.url, item.status, item.json?.data)
}
```

`listBatchItems` and `listCrawlPages` follow the cursors to the end by default and take caps: `maxPages` (pages read after the first), `maxResults` (items in all; each page is then requested no larger than what is still wanted, so the cursor the listing stops at continues exactly after the last item returned) and `maxWaitMs` (no further page once that long has passed). The generator's return value says where it stopped (`nextCursor`, `stoppedBy`: `end`, `maxPages`, `maxResults` or `maxWait`); `collectBatchItems` returns the items with it, and `getBatchDocuments(id, options)` returns `{ report, items, nextCursor, stoppedBy }`, the status and the items in one answer. The server's page size stays at most 50 items per request (default 10). MCP `get_batch_items` takes `maxResults` (1 to 200) and then follows the cursors itself, answering `{ items, nextCursor, hasMore, stoppedBy }`.

`waitBatch` and `waitCrawl` poll every 500 ms (`pollIntervalMs` changes it) until the task completes, fails or is cancelled; a paused task is still waited on. `batchAndWait(urls, options, wait)` starts a batch, waits for it and returns `{ taskId, report, items }` with every item; `crawlAndWait(url, options, wait)` does the same for a crawl and returns its `pages` and `errors`. With `timeoutMs`, a wait throws `WaitTimeoutError` once that time is up, a status request in flight included; the error carries `taskId`, `timeoutMs` and `last`, the last status read (null when none answered in time), and the task keeps running. A status request that fails with a network error, HTTP 408, 429 or 5xx is retried after 1, 2, 4, 8, then 10 s, or after its `Retry-After` when that asks for 60 s or less, until `maxRetries` (default 5) retries in a row have failed; any other error ends the wait at once.

MCP exposes `batch_scrape`, `get_batch`, `get_batch_items`, `get_batch_errors`, `wait_batch`, and `cancel_batch`. `wait_batch` waits at most 30 seconds by default (configurable with `timeoutMs` up to 300 seconds) and returns the current state if the batch is still running; cancelling the `wait_batch` call stops the wait, over stdio and over the local and hosted HTTP services alike ([cancelling an MCP call](mcp-first-use.md#cancelling-a-call)), and the batch keeps running. For incremental work, page through items while the task runs. The task and item checkpoints are SQLite-backed; after a process restart, pending/running/paused batches resume missing URLs and keep prior results.

An [actual process-kill test](evidence/batch-crash-recovery.json) stopped the API with `SIGKILL` after URL 1 completed and URL 2 started. The restarted API finished 2/2 items; URL 1 was requested once and URL 2 twice. Repeat with `npm run verify:batch-crash`. Run one API process per task root; multi-process ownership/lease coordination is not part of this batch contract.

The process shares one origin scheduler across local HTTP, browser, and Monitor paths. It caps same-origin work to the operator's `perHostConcurrency` (hard maximum four), enforces `perHostMinDelayMs` between starts, and holds queued requests during Retry-After. Queued cancellation and deadlines release their place. The controlled 1→2→4 comparison and test setup are in [the evidence JSON](evidence/same-origin-concurrency-controlled.json); run `npm run baseline:concurrency` to repeat it. This experiment does not establish a safe or faster Amazon setting. Test the same URLs, fields, and observed delivery region separately before changing the hosted setting.

Set `W2L_PER_HOST_CONCURRENCY=1|2|3|4` and `W2L_PER_HOST_MIN_DELAY_MS` (1–60000, default 250) on the API process to tune the shared origin gate. These are operator settings, not batch-request parameters.

A local-mode API also follows the operator's `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` (curl semantics, loopback always direct) for every item, and each item's `evidence.envProxy` names the proxy it went through. `W2L_PROXY=off` ignores them; hosted mode never uses them. See the README's proxy paragraph.

The [real 10-URL Amazon comparison](evidence/amazon-batch-concurrency.json) used the same URLs, JSON Schema, and 250 ms interval. Both 1 and 2 completed 10/10 pages with complete JSON and correct ASINs. Client batch time was 44.5 seconds at 1 and 23.5 seconds at 2. This raw difference is **not** a fully controlled speed claim: four pages in each arm lacked an observed delivery region. The other six kept the same observed region, currency, and route. Real concurrency 4 was withheld; the local controlled 4-arm experiment remains separate evidence. The [earlier run](evidence/amazon-batch-concurrency-before-transport-pacing.json) is retained because the implementation subsequently added pacing at the actual transport start.

Public Monitor 304 caching is a different path. A response with `Set-Cookie`, `Cache-Control: no-cache`, and no ETag/Last-Modified is not saved as a reusable public representation by the current cache. The controlled cache test confirms two full 200 fetches with no validator; it does not claim a cache speedup for Amazon.
