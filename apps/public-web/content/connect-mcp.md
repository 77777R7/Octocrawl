# Connect Octocrawl MCP

Two steps on your own computer: start the Octocrawl API with `npx`, then add the MCP server to your client. Nothing is installed from a repository, nothing is sent to an Octocrawl server, and there is no daily limit. Hosted MCP is paused on the roadmap.

## Step 1: Start the Octocrawl API

With Node.js 22.13 or later, in any terminal:

```bash
npx octocrawl serve
```

Keep it running while you use MCP. It listens on `http://127.0.0.1:8787`, on this computer only. Pages are read over HTTP; for pages that only appear in a browser, run `npx playwright install chromium` once and the browser lane is used too.

{{MCP_CLIENT_PICKER}}

## Send your first task

```text
Use Octocrawl's scrape tool on https://docs.firecrawl.dev/introduction with formats ["markdown"]. Show the final URL, the HTTP status and the robots.txt decision from its evidenceRecord, then the first heading of the Markdown.
```

The answer carries the page's Markdown and an Evidence Record: final URL, fetch time, HTTP status, the robots.txt decision and hashes of what was read. A page that could not be read comes back as a result with a reason (`blocked`, `incomplete`, `timeout`), not as an invented page. If the client reports no tools, check that step 1 is still running; if the call fails to connect, the API is not on `127.0.0.1:8787` (pass `--base-url` to the server command).

The same server offers `map`, `crawl`, `batch_scrape`, `scrape_product` for an Amazon.sg product, and the Monitor tools; the [advanced reference](/docs/reference/) lists them. Then continue with [Monitor → HTTPS Webhook](/docs/guides/monitor-webhook/) or [Amazon.sg product JSON](/docs/guides/amazon-product/).

## From a repository checkout

The [repository](https://github.com/77777R7/w2l) also has a managed local service for macOS (`npm run first-use:local`, then `npm run local:mcp:status`) that runs the API, the Monitor scheduler and the delivery worker as one background service with a Streamable HTTP endpoint at `http://127.0.0.1:8791/mcp`. The first-use walkthrough and the Monitor guides use it; the `npx` path above is enough for scrape, map, crawl and batch.

## Hosted connection

**Paused.** There is no permanent HTTPS MCP URL, hosted login, or copyable remote command. The [roadmap](https://github.com/77777R7/w2l/blob/main/ROADMAP.md#paused) puts a hosted API and hosted MCP on hold until people need runs while their computer is off; until then, Octocrawl MCP runs on your own computer as described above.
