# Connect Octocrawl MCP

Hosted Octocrawl is one URL, no account: `https://mcp.octocrawl.dev/mcp`. It reads public pages (`scrape`) and lists a site's URLs (`map`) over HTTP, 20 pages a day per address; a key gives more pages a day and the browser lane. The same packages run everything on your own computer, free and without limit: crawl, batch and Monitor too. Every answer carries an Evidence Record either way.

{{MCP_CLIENT_PICKER:remote}}

## Add a key for more

A key raises the daily allowance and opens the browser lane (pages that only appear in a browser, and `scrape_product` for Amazon.sg). Keys are issued by hand for now: [ask for one](/?from=connect-mcp#waitlist) with what you would use it for. The key goes in an `Authorization: Bearer` header, never in the URL:

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

## Send your first task

```text
Use Octocrawl's scrape tool on https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview with formats ["markdown"]. Show the final URL, the HTTP status and the robots.txt decision from its evidenceRecord, then the first heading of the Markdown.
```

The answer carries the page's Markdown and an Evidence Record: final URL, fetch time, HTTP status, the robots.txt decision and hashes of what was read. A page that could not be read comes back as a result with a reason (`blocked`, `incomplete`, `timeout`), not as an invented page. Over the daily allowance the tool answers with the time until it resets (00:00 UTC) and how to get a key. For a walk-through of a real task in Claude Code, from finding the page with `map` to citing its Evidence Record, see [Claude Code web scraping](/blog/claude-code-web-scraping/).

## What hosted Octocrawl does not do

- `crawl`, `batch_scrape` and the Monitor tools: on your computer (below), where they run without limit. The hosted answer names this.
- Proxies, CAPTCHA solving and stealth: not offered on the hosted service. A page that blocks a plain request comes back as `blocked` with the reason; the [access grant](https://github.com/77777R7/Octocrawl#enhanced-access-an-access-grant) for those routes works on your own server.
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
