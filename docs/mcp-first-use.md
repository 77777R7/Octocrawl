# Monitor and Delivery through MCP

For the simpler two-flow walkthrough (public-document Monitor plus Amazon.sg
product JSON/batches), use [dual-flow first use](dual-flow-first-use.md).

This walkthrough uses the public Firecrawl Introduction page and an HTTPS
webhook receiver controlled by the operator. It does not create an Amazon
price alert. The Monitor, delivery, and receiver keep their state in SQLite;
the MCP connection can close after each request.

## Use locally now

From this checkout on Howard's Mac, install the single managed service and
register its loopback MCP URL:

```bash
npm ci
npm run local:mcp:install
codex mcp add w2l-local --url http://127.0.0.1:8791/mcp
npm run local:mcp:status
```

Open a **new** Codex task so it loads the MCP configuration, then ask it to
call `preview_monitor` with the `firecrawl-introduction` preset. The service
starts at login, restarts on a crash and keeps the SQLite task state under
`.w2l/api`. It listens only on `127.0.0.1`; REST is internal and there is no
public URL or sign-in on this local path. Keep this checkout in place
while the LaunchAgent points at it. On a non-macOS system, run
`npm run local:mcp` in one terminal instead.

If this Mac reaches the web through a proxy, add `HTTPS_PROXY=...`,
`HTTP_PROXY=...` and `NO_PROXY=...` lines to `.w2l/local-mcp.env` (the
LaunchAgent does not inherit your shell) and restart the service. Captures
then follow them as described in [Behind a proxy](local-setup.md#behind-a-proxy); `W2L_PROXY=off` ignores them.
The hosted process below never uses these variables.

For a signed HTTPS receiver on the **same Mac**, install the separate
LaunchAgent and explicitly allow the local delivery worker to reach its
verified loopback certificate:

```bash
npm run local:receiver:install
W2L_LOCAL_DELIVERY_LOOPBACK=1 npm run local:mcp:install
npm run local:receiver:status
npm run local:mcp:status
```

Installation generates a private signing secret and a local TLS certificate
under ignored `.w2l/` files if absent; it preserves existing values on
reinstall. The worker verifies the certificate through its explicit CA file
and only gains egress to `127.0.0.1`/`::1` in this opt-in mode. Register a
destination with URL `https://127.0.0.1:8788/webhook` and `secretEnv` set to
`W2L_WEBHOOK_SECRET_DEMO`. Never pass the secret value through MCP. The
receiver stores receipts and idempotent projections in
`.w2l/local-receiver/receiver.sqlite`. Both services restart at login; use
`npm run local:receiver:uninstall` and `npm run local:mcp:uninstall` to stop
them. This loopback address is not accessible to other computers. A remote
receiver or friend trial still needs a public HTTPS service later.
The [live same-Mac acceptance record](evidence/c2-local-https-delivery-2026-09-23.md)
shows the persisted event, 503 retry, idempotency and service recovery.

## Local first-use check

Install from a checkout and run the end-to-end check:

```bash
npm ci
npm run verify:c2-first-use-local
```

The check starts the local unified service and an independent receiver, gives the
receiver a temporary public HTTPS tunnel, and connects with an actual MCP
Streamable HTTP SDK client. It previews the source, creates a paused Monitor,
configures delivery, resumes it, checks the initial event, then uses actual
`SIGKILL` process crashes with a pending delivery and a queued Monitor run.
After each restart it reconnects, finishes the work, and checks the same
`eventId` at both ends.
This loopback check does not validate a hosted sign-in or a deployed Codex login.
`npm run verify:c2-first-use` remains the authenticated-host test seam.
Detailed, potentially sensitive
evidence stays under ignored `.w2l/c2-first-use-*/evidence.json`.
The dated [loopback acceptance note](evidence/c2-c3-loopback-local-2026-09-23.md)
records a clean-source run and the live macOS service check.

For a conversational client, use these MCP calls in order:

1. `preview_monitor({"preset":"firecrawl-introduction"})` to inspect
   identity, field evidence, quality, missing reasons, and a short sample.
2. `create_monitor({"preset":"firecrawl-introduction"})`. MCP defaults to
   **paused**. REST/SDK creation keeps its existing enabled default.
3. `create_delivery_destination` with `monitorId` set to
   `firecrawl-introduction`, the controlled HTTPS `/webhook` URL, and
   `secretEnv` set to an operator-configured environment variable name.
   Never provide a secret value to a tool.
4. `resume_monitor({"id":"firecrawl-introduction"})`, then
   `get_monitor` until `latestRun.state` is `completed`. Compare
   `latestEvent.id` with `list_deliveries` and the receiver's receipt.
5. For an extra run, call `run_monitor({"id":"firecrawl-introduction"})`.
   It returns a persisted `runId` immediately. Use `get_monitor_run` to
   inspect the result, even after disconnecting and reconnecting.
6. Use `pause_monitor` to stop future scheduling. `cancel_monitor_run`
   explicitly cancels one queued or active run. A failed delivery can be
   inspected with `get_delivery`; `retry_dead_letter` retries that delivery
   with the **same** `eventId`.

`list_monitors`, `list_delivery_destinations`, and paginated
`list_deliveries` expose state without loading full histories. Read tools
accept `debug: true` where the full audit is needed. A missing or invalid
sample should be resolved before enabling a recurring task.

## Hosted MCP (experimental)

`npm run hosted:mcp` runs the API, the Monitor scheduler, the delivery worker and an authenticated Streamable HTTP endpoint in one process. It is experimental and not deployed. Its setup is archived in [archive/hosted-mcp-pilot.md](archive/hosted-mcp-pilot.md).

## Mapping a site

The local service also offers `map` (not the hosted service, whose remote
tools take no arbitrary URL). It lists a site's URLs from the sitemaps the
site declares and the links on its start page, which it reads on the http
lane alone; it never reads a second page. Ask for, say,
`map` with `{ "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP", "limit": 100 }`.
The tool is annotated read-only and idempotent, and declares an output
schema, so the result comes as `structuredContent` beside the JSON text:
`{ id, status, stoppedBy, links: [{ url, title?, description? }], warning?, agentHints?, counts: { returned, refused } }`.
`status` is `completed`, `partial` (the deadline cut the map or a source
failed) or `failed` (nothing found); `stoppedBy` says whether `limit` or
`timeout` stopped it. A title is the start page's own, an anchor's text or a
sitemap's news title, never fetched. It takes `search` (every word in the
URL or the title; a filter, not a ranking), `sitemap` (`include`, `skip`,
`only`), `includeSubdomains`, `ignoreQueryParameters`, the crawl's path and
scope options, `limit`, `timeout`, `mode` and `integration`; `debug: true`
returns the full map with each link's evidence and the refusal counts. A
site whose sitemap lists only a few roots maps to little more than its start
page's links: use `crawl` to read further pages.

## Cancelling a call

Both HTTP services keep no MCP session: each POST is handled on its own. A
client stops a tool call in flight in either of two ways, and both stop the
API requests the call made (a `scrape` stops on the server; a `wait_batch`
stops waiting, and the batch goes on):

- It sends `notifications/cancelled` with the call's request id, as an MCP
  client does when its user stops a call or its own request timeout runs
  out. Request ids are chosen by each client and repeat across clients, so
  at initialize each client gets an `Mcp-Session-Id`, used only to tell its
  calls from another client's: a cancellation reaches only a call made with
  the same session id. On the hosted service it must also come with the same
  bearer token (a refreshed token counts as another one), and a client that
  sends no session id is matched by its token alone. On the local service a
  client that sends no session id cannot cancel by notification. A
  cancellation that arrives before the call has started is ignored, as MCP
  allows.
- It closes the call's HTTP request before the result. The service could not
  deliver that result later, so it stops the call.

After a `notifications/cancelled`, the call's own request is answered with
the JSON-RPC error `Request cancelled` (code 0), as the MCP Python SDK
answers a cancelled request; the client ignores it. Over stdio (`npm run mcp`) the MCP SDK
delivers `notifications/cancelled` to the call itself.
