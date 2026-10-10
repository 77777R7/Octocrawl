# Running Octocrawl

You can use Octocrawl in three ways: the hosted service, a server on your computer, or a server you host for others. This page covers the server on your computer: how to connect clients, its ports, tokens, rate limit, proxy, robots.txt rules and research mode.

## Connect an MCP client

For MCP use there are three ways, from least to most setup; the configs for Cursor, OpenCode and Codex, and a first task, are on [Connect MCP](https://octocrawl.dev/docs/connect-mcp/?utm_source=github&utm_medium=readme&utm_campaign=mcp).

**Hosted** (scrape and map; keyless within a daily allowance over HTTP, a key for more pages and the browser lane; see [docs/hosted-api.md](hosted-api.md)):

```bash
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp
curl -sS -X POST https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' -d '{"url":"https://example.com"}'
```

**On your computer** (everything: scrape, map, crawl, batch, the Amazon.sg product tool and the Monitor tools; no limit; nothing from this checkout is needed):

```bash
npx octocrawl serve                                  # keep it running: the API on 127.0.0.1:8787
claude mcp add octocrawl -- npx -y @octocrawl/mcp    # the published stdio server, a client of that API
```

**Self-hosted for others**: `npx octocrawl serve --hosted --token <token>` listens on all interfaces behind a bearer token, with private addresses, robots overrides, saved logins, handoff and non-HTTPS webhooks refused; point `@octocrawl/mcp` at it with `--base-url` and `--token` (or `W2L_API_URL` and `W2L_API_TOKEN`).

## Ports

The ports the local services listen on, all on 127.0.0.1:

| Port | Service | Started by | Changed with |
| --- | --- | --- | --- |
| 8787 | The REST API, and the API the stdio MCP server (`octocrawl-mcp`) and the Python client call by default (the TypeScript SDK takes a `baseUrl`) | `octocrawl serve`, `npm run api` | `--port`, `W2L_API_PORT`; those clients `W2L_API_URL` |
| 8791 | The local MCP service (API, Monitor scheduler, delivery worker and MCP endpoint at `/mcp`) | `npm run local:mcp`, or the LaunchAgent from `npm run local:mcp:install` | `W2L_LOCAL_MCP_PORT` |
| 8788 | The HTTPS webhook receiver of the first-use walkthrough | `npm run first-use:local` | fixed |
| 8798 | The public site's local preview | `npm run public:preview:local` | `W2L_PUBLIC_PREVIEW_PORT` |

## The managed local service

The checkout's managed local service is for the Monitor → HTTPS delivery flow: one background service runs the API,
Monitor scheduler, delivery worker and a Streamable HTTP MCP endpoint at `http://127.0.0.1:8791/mcp`. On macOS,
install it as a LaunchAgent and connect Codex to its loopback URL:

```bash
npm run local:mcp:install
codex mcp add w2l-local --url http://127.0.0.1:8791/mcp
npm run local:mcp:status
```

It restarts after a process crash and at login. No hosting or sign-in account is
needed for this local path. `npm run local:mcp:uninstall` removes the agent;
`codex mcp remove w2l-local` removes the client entry. On other systems, run
`npm run local:mcp` in one terminal. The state stays in `.w2l/api` by default.
See the [MCP first-use walkthrough](mcp-first-use.md) for the actual
Monitor and HTTPS delivery flow and secret setup. Keep this checkout while
the LaunchAgent points to it.

To receive signed events on the same Mac with a fixed HTTPS loopback URL,
run `npm run local:receiver:install`, then reinstall the MCP service with
`W2L_LOCAL_DELIVERY_LOOPBACK=1 npm run local:mcp:install`. The option only
permits loopback delivery and pins trust to the generated local certificate.
The receiver and its SQLite inbox run as a separate LaunchAgent; neither
service becomes reachable from another machine.

## The standalone REST API

The legacy standalone REST API remains available for SDK and Firecrawl-shim
clients:

```bash
npm run api
```

To connect a standalone stdio MCP process to that API, run:

```bash
npm run mcp
```

`npm run api` binds `127.0.0.1` and allows loopback/RFC1918 so fixture servers work. Hosted mode is explicit: `npm run api -- --hosted --token $W2L_API_TOKEN`. That binds `0.0.0.0`, requires `Authorization: Bearer`, denies private/metadata IPs, and limits a crawl to 100 pages: an omitted or `null` `maxPages` takes 100, and a larger one is refused with `invalid_request`. It obeys robots.txt for every URL and offers no way past it: `robotsOverride`, `robotsOverrides` and `ignoreRobotsTxt` are refused with `unsupported_parameter` (see below).

## Tokens

A server started with tokens, hosted or local, accepts any one of them: repeat `--token`, or set `W2L_API_TOKEN` and the comma-separated `W2L_API_TOKENS`. Tokens on the command line replace those in the environment. A `--token` without a value (the last argument, followed by another flag, or blank) stops the server at startup, and the error never repeats a token. Give each client its own token; restarting the server without a token revokes it. Tokens are compared as fixed-length SHA-256 digests in constant time, and a missing or unknown token gets HTTP 401 with `{ "error": "unauthorized", "code": "unauthorized" }`. The SDK sends its `token` option, or `W2L_API_TOKEN` from the environment when none is passed; `token: ''` sends none.

## Rate limit

An operator can cap how many requests that start work each caller may make: `W2L_RATE_LIMIT_PER_MINUTE=<n>` or `--rate-limit-per-minute <n>` (an integer from 1 to 100,000; unset or empty means no limit, anything else stops startup with `W2L_RATE_LIMIT_PER_MINUTE must be an integer between 1 and 100000`) counts `POST /v1/scrape`, `/v1/crawl`, `/v1/batches`, `/v1/map`, `/fc/v1/scrape`, `/fc/v1/crawl` and `/fc/v1/map` in a sliding 60-second window per bearer token (for the one local caller when the server takes no token); status reads are free. Over the limit the answer is HTTP 429 with a `Retry-After` header (whole seconds, at least 1) and `{ "error": "rate limit exceeded: <n> requests per minute", "code": "rate_limited", "retryAfterSeconds": <s>, "agentHints": ["wait <s> s before the next request"] }`; `/fc` answers `{ success: false, error, code: "rate_limited", agent_hints }` with the same header. `rate_limited` is not one of the request-error codes: the request was well formed, the caller's budget was spent. The SDK throws `W2LError` with `status` 429, `code` `rate_limited`, `retryAfterMs` read from the header (delta-seconds or an HTTP date) and `agentHints`, and retries nothing, as Firecrawl's SDKs do not; MCP tool calls fail with `rate limited: retry after <s> s (rate_limited)`. The window is in memory and per process, so a restart resets it, and it keys on the token's digest, not the client address, so rotated tokens have separate budgets. Nothing about outbound politeness changes: the per-origin gate and the `Retry-After` cooldowns toward sites stay as they are.

## Behind a proxy

Behind a proxy, local mode (`npm run api`, the local MCP service, `npm run scrape`/`crawl`) sends its outbound requests, including robots.txt and the local browser, through `HTTPS_PROXY` for https: URLs and `HTTP_PROXY` for http: URLs (lower-case names too), with curl's rules: `NO_PROXY` hosts and their subdomains, `host:port`, IP and CIDR entries go direct, `*` disables the proxy, and loopback is always direct. The proxy must be `http://` or `https://`, and both variables must name the same one. The proxy resolves the names it fetches, so for proxied requests Octocrawl trusts it for resolution and checks only the URL itself (scheme, credentials, IP literals, metadata names); direct requests are still resolved, validated and pinned. Results name the proxy's `host:port` in `evidence.envProxy` and an `egress_proxy` trace event, never its credentials. `W2L_PROXY=off` ignores the variables; hosted mode never uses them. Without the environment proxy, the local browser connects directly like the HTTP lane: it never falls back to the operating system's proxy settings, a route no result would record. The macOS LaunchAgent does not inherit your shell, so put these variables in `.w2l/local-mcp.env`. Octocrawl verifies certificates by default, through the proxy too (the proxy tunnels TLS end to end); `skipTlsVerification` turns it off for one local request, is recorded, and is refused in hosted mode (see the scrape options below).

## robots.txt

robots.txt is read for every URL Octocrawl fetches, and its verdict is recorded; what it decides depends on who chose the URL (decided 2026-10-05). robots.txt addresses crawlers that discover links, so on a local server a URL the request names (a scrape, a batch entry, the CLI's URL list, MCP `scrape` and `batch_scrape`, `/fc/v1/scrape`) is fetched whatever robots.txt says, as a browser visit would be: the result keeps the verdict (`robotsDecision.decision: "disallowed"`, `userOverride: true`, `overrideBasis: "user_named_url"`), a `robots_overridden` warning and the trace events below. The links a crawl or map discovers obey robots.txt, unless the crawl or map was started with `ignoreRobotsTxt` on a local server (`overrideBasis: "ignore_robots_txt"`; a crawl then also reads the sitemap files robots.txt disallows, and a map returns the URLs it disallows, each link's `robots` saying `disallowed` or `unreachable`). A Monitor's scheduled re-reads obey it too. A hosted server obeys robots.txt for every URL, since it fetches from the operator's addresses. A site owner can address Octocrawl itself: robots.txt `User-agent` lines are matched against the request's User-Agent with the product token `Octocrawl` added, in every mode, so a group for `Octocrawl` (or research mode's `w2l-research`) governs it whatever header was sent. Such a rule is the owner's targeted opt-out: a named URL and `ignoreRobotsTxt` do not set it aside, and only a `robotsOverride` with your recorded reason does, on a local server. Pacing is unchanged by any of this: a batch and a crawl space a host's pages by its `Crawl-delay`, whether robots.txt allows the page or not, and a 429 cools the host down for every request. A 4xx robots.txt means no restrictions. A robots.txt that cannot be fetched (a 5xx, a network error, or no answer within 5 seconds) is a complete disallow, as RFC 9309 §2.3.1.4 requires: where robots.txt is obeyed the page is not fetched, the result is `failed` with `policy_denied`, and the `robots_checked` and `robots_disallowed` trace events and the compliance record's robots decision (browser and provider lanes) carry `unreachable: "server_error"`, `"network_error"` or `"timeout"`, so it never reads like a rule the publisher wrote. Octocrawl asks for that robots.txt again after five minutes (`robotsUnreachableTtlMs` in the network policy). On a direct connection a name that does not resolve is still `dns_error`; through the environment proxy, which resolves names itself, its robots.txt request fails first, so the page is `policy_denied` with `unreachable: "network_error"`. Where a URL is fetched past it (a named URL, `ignoreRobotsTxt`, `robotsOverride`), the unreachable reason stays in the trace and the `robots_overridden` warning says the file could not be read. On a local server a scrape or batch entry may also carry your own recorded reason (`robotsOverride`, described in [Scrape options](scrape-options.md#overriding-robotstxt-for-one-url)); `ignoreRobotsTxt` on a scrape or batch is refused with HTTP 400 naming it.

## Research mode and your contact

Research mode (`mode: "research"`, `--mode research` on the command line) declares Octocrawl as a bot in its User-Agent. Set `W2L_CONTACT` to say who runs it, as a name and email address or a URL, for example `W2L_CONTACT="Jane Doe jane@example.org"`: printable ASCII, at most 200 characters, no parentheses or backslashes. The research User-Agent then ends `; contact: Jane Doe jane@example.org)`. To sec.gov and its subdomains it takes the format SEC's fair-access policy prescribes, `<Company or name> <email>`, instead: `W2L Research Jane Doe jane@example.org` (so give an email address). Their robots.txt is requested with it too, a robots.txt group for `w2l-research` still applies there, and the Evidence Record's `identity.contact` reads the contact from either format. Results keep the User-Agent that was sent (the `identity_sent` trace event on the HTTP lane, the compliance record's `sentHeaders` in the browser lane). Standard mode sends a browser User-Agent and declares no contact. SEC.gov answers 403 to automated clients that declare no contact; on the HTTP lane such a 403 from an SEC host carries a `declared_contact_hint` trace event saying to use `mode: "research"` with `W2L_CONTACT` set. `npm run api`, the local MCP service (in `.w2l/local-mcp.env`) and `npm run scrape`/`crawl` read the variable.

## The unified local MCP and the legacy stdio adapter

The unified local MCP covers scrape, map, Crawl, persistent URL-array batches, and
Monitor/Delivery without separate worker terminals. A unified service also
implements authenticated Streamable HTTP for the reviewed public-document
Monitor and anonymous Amazon.sg product JSON/batch flows (experimental; its setup is
archived in [docs/archive/hosted-mcp-pilot.md](archive/hosted-mcp-pilot.md)); hosting is paused on the roadmap
([ROADMAP.md](../ROADMAP.md#paused)). For both flows on one Mac, run
`npm run first-use:local` after `npm ci`; see the
[two-flow first-use guide](dual-flow-first-use.md),
[MCP first-use walkthrough](mcp-first-use.md) and
[C2/C3 status](roadmap/section-c-delivery.md). Advanced clients may
still launch the legacy stdio adapter from this repository:

```json
{
  "mcpServers": {
    "w2l": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": { "W2L_API_URL": "http://127.0.0.1:8787" }
    }
  }
}
```
