# Connect Octocrawl MCP

Connect your AI agent to Octocrawl at `https://mcp.octocrawl.dev/mcp`. Hosted MCP supports `scrape` for page content and `map` for site URLs. An account key enables browser-backed scraping and the Amazon.sg `scrape_product` tool, subject to service limits. Without a key, hosted access reads over HTTP within a daily allowance.

For crawl, batch and Monitor workflows, start the local API with `npx octocrawl serve` and connect it through the `@octocrawl/mcp` package. Scheduled monitoring also requires local workers. Successful scrape results include an Evidence Record describing the capture; inspect any separate verification result before relying on extracted fields.

Octocrawl's official website is [octocrawl.dev](https://octocrawl.dev/), and its official source repository is [github.com/77777R7/Octocrawl](https://github.com/77777R7/Octocrawl). See the [introduction](/docs/#official-project-and-connections) for REST, SDK and MCP entry points.

To see what `map` finds before connecting a client, try the [free online Link Extractor](/tools/link-extractor/). The guide to [finding all pages on a website](/blog/find-all-pages-on-a-website/) explains which URLs a sitemap, crawler or web archive can find and how to check the list.

{{MCP_CLIENT_PICKER:remote}}

## Add a key for more

A key spends your account's credits instead of the keyless daily allowance and opens the browser lane (pages that only appear in a browser, and `scrape_product` for Amazon.sg). [Sign in](/signin/) to make one: an account gets 1,000 credits a month, a page read over HTTP costs 1 and a page read in a browser 5. The key goes in an `Authorization: Bearer` header, never in the URL:

```bash
# Claude Code
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer oc_…"
# Codex: the token is read from an environment variable
export OCTOCRAWL_API_KEY=oc_…
codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp --bearer-token-env-var OCTOCRAWL_API_KEY
```

```json
{ "mcpServers": { "octocrawl": { "url": "https://mcp.octocrawl.dev/mcp", "headers": { "Authorization": "Bearer oc_…" } } } }
```

Cursor takes that block in `.cursor/mcp.json` (`"Bearer ${env:OCTOCRAWL_API_KEY}"` reads it from the environment); OpenCode takes the same `headers` object inside its `remote` entry. Over REST, `curl -H 'authorization: Bearer oc_…' https://api.octocrawl.dev/v1/scrape`.

Clients can also [sign in instead of sending a key](#sign-in-instead-of-a-key).

## Sign in instead of a key

`https://mcp.octocrawl.dev/mcp-oauth` is the same server for clients that sign in with OAuth instead of sending a key. The client opens an Octocrawl page where you sign in and choose Authorize. Its calls then spend your account's credits, as a key's do, and show under the client's name in [Activity](/dashboard/activity/). Each connection is listed under MCP connections on [API keys](/dashboard/keys/), where you can disconnect it; it also ends after 90 days unused. An account holds up to ten connections, besides its five keys.

Use one URL per client: `/mcp` for keyless use or a key, `/mcp-oauth` for sign-in. The setups below were checked on 2026-10-16 and 2026-10-17: each client signed in, ran a scrape on the account's credits, and was refused after the connection was disconnected ([record](https://github.com/77777R7/Octocrawl/blob/main/research/hosted/2026-10-16-mcp-oauth-clients-adee17f2.md)). Another client that follows the MCP authorization spec should sign in the same way, but has not been checked here.

### Claude Code

```bash
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp-oauth
```

Then run `/mcp` in Claude Code, select octocrawl and sign in in the browser it opens (`claude mcp login octocrawl` does the same from a terminal). The Octocrawl plugin sets up the same server: `/plugin install octocrawl --marketplace 77777R7/Octocrawl`, then sign in from `/mcp` the same way. **Clear authentication** in `/mcp` signs it out. The key setup above keeps working on `/mcp`. ([Claude Code's guide](https://code.claude.com/docs/en/mcp))

Checked with Claude Code 2.1.301 on 2026-10-16.

### Cursor

```json
{ "mcpServers": { "octocrawl": { "url": "https://mcp.octocrawl.dev/mcp-oauth" } } }
```

Merge this into `.cursor/mcp.json` (or `~/.cursor/mcp.json` for every project) with no `headers`, and sign in when Cursor asks for it. The key setup above keeps working on `/mcp`. ([Cursor's guide](https://cursor.com/docs/mcp))

Checked with Cursor 3.25.6 on 2026-10-16.

### Codex

```bash
codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp-oauth
```

Codex sees that the server signs in with OAuth and opens a browser to sign in as part of `add`. `codex mcp login octocrawl` signs in again later. `codex mcp logout octocrawl` removes the sign-in from that machine; Disconnect on API keys ends the connection itself. The key setup above keeps working on `/mcp`. ([Codex's guide](https://learn.chatgpt.com/docs/extend/mcp))

Checked with Codex CLI 0.162.1 on 2026-10-17.

### OpenCode

```json
{ "mcp": { "octocrawl": { "type": "remote", "url": "https://mcp.octocrawl.dev/mcp-oauth", "enabled": true } } }
```

Merge this into the `mcp` object of `opencode.json` with no `headers`, then run `opencode mcp auth octocrawl` and sign in in the browser it opens. `opencode mcp list` shows whether it is connected. `opencode mcp logout octocrawl` removes the sign-in from that machine; Disconnect on API keys ends the connection itself. The key setup above keeps working on `/mcp`. ([OpenCode's guide](https://opencode.ai/docs/mcp-servers))

Checked with OpenCode 1.18.26 on 2026-10-17.

## Send your first task

```text
Use Octocrawl's scrape tool on https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview with formats ["markdown"]. Show the final URL, the HTTP status and the robots.txt decision from its evidenceRecord, then the first heading of the Markdown.
```

The answer carries the page's Markdown and an Evidence Record: final URL, fetch time, HTTP status, the robots.txt decision and hashes of what was read. A page that could not be read comes back as a result with a reason (`blocked`, `incomplete`, `timeout`), not as an invented page. Over the daily allowance the tool answers with the time until it resets (00:00 UTC) and how to get a key. For a walk-through of a real task in Claude Code, from finding the page with `map` to citing its Evidence Record, see [Claude Code web scraping](/blog/claude-code-web-scraping/).

### Check the first result before continuing

A connected server and a listed tool establish the connection. To assess the task, inspect the actual tool result:

- Compare the returned Markdown with the heading or content you asked for. HTTP 200 and nonempty text can also describe a navigation shell or an error page.
- Keep the fetch `status` separate from `verification.status`. `not_requested` means no task contract was checked. `passed` means the configured checks passed; it does not establish independent field accuracy.
- Inspect `readiness` when present. `not_loaded`, `not_extracted` and `not_served` need different next steps. A missing readiness field is unknown.
- Keep incomplete results and failures visible. Do not convert missing content to a zero value or retry paid access automatically.

The tool descriptions keep each option to a line or two. Every option's full behaviour, with examples, is in the [scrape options reference](https://github.com/77777R7/Octocrawl/blob/main/docs/scrape-options.md), and crawl and batch in [Batch, crawl and map](https://github.com/77777R7/Octocrawl/blob/main/docs/batch-crawl-map.md).

If the client lists no tools, check the selected server's connection error. If the tool returns a quota or access refusal, follow that reason. Changing the MCP client does not establish that the target content can be read. See [result states](/docs/limits/) and the [Evidence Record reference](/docs/reference/#evidence-record).

## What hosted Octocrawl does not do

- `crawl`, `batch_scrape` and the Monitor tools: on your computer (below), where they run without limit. The hosted answer names this.
- Proxies, CAPTCHA solving and stealth: not offered on the hosted service. A page that blocks a plain request comes back as `blocked` with the reason; the [access grant](https://github.com/77777R7/Octocrawl/blob/main/docs/access.md#enhanced-access-an-access-grant) for those routes works on your own server.
- Private network addresses, robots.txt overrides and saved logins: refused in hosted mode; robots.txt is obeyed for every URL.

The allowances and what is recorded are on [Limits](/docs/limits/#hosted-api-and-mcp) and [Privacy](/docs/privacy/#hosted-api-and-mcp).

## Run it on your computer

With Node.js 22.13 or later, start the API in any terminal and keep it running:

```bash
npx octocrawl serve
```

It listens on `http://127.0.0.1:8787`, on this computer only, with every tool: scrape, map, crawl, batch, saved logins, handoff to your own Chrome, the Amazon.sg product tools and the Monitor and delivery tools, and no daily limit. Pages are read over HTTP; for pages that only appear in a browser, run `npx playwright install chromium` once and the browser lane is used too.

{{MCP_CLIENT_PICKER:local}}

If the client reports no tools, check that `npx octocrawl serve` is still running; if a call fails to connect, the API is not on `127.0.0.1:8787` (pass `--base-url` to the server command). The [repository](https://github.com/77777R7/Octocrawl) also has a managed local service for macOS (`npm run first-use:local`) that adds the Monitor scheduler and the delivery worker behind `http://127.0.0.1:8791/mcp`; the Monitor guides use it. Then continue with [Monitor → HTTPS Webhook](/docs/guides/monitor-webhook/) or [Amazon.sg product JSON](/docs/guides/amazon-product/).

## Self-host for others

`npx octocrawl serve --hosted --token <token>` serves other machines behind a bearer token, with private addresses, robots overrides, saved logins, handoff and non-HTTPS webhooks refused, as the hosted service does. Point `npx -y @octocrawl/mcp --base-url https://your.host --token <token>` at it, or any client's remote URL at your own `/mcp` once you put one in front of it; the [advanced reference](/docs/reference/#self-hosted-operation) has the details.
