# Installing the Octocrawl MCP server

Instructions for an AI agent (such as Cline) that is adding Octocrawl to a user's MCP settings. Octocrawl reads web pages for agents: `scrape` returns a page as Markdown (or JSON, links, HTML), `map` lists a site's URLs, and every answer carries an Evidence Record (final URL, HTTP status, robots.txt decision, hashes of what was read).

There are two ways to install it. Use option 1 unless the user asks to run everything locally or needs `crawl`, `batch_scrape` or the Monitor tools.

## Option 1: hosted Octocrawl (recommended, nothing to install)

With the Cline CLI:

```bash
cline mcp install octocrawl --transport http https://mcp.octocrawl.dev/mcp --yes
```

Or add this server to the MCP settings file (in the Cline extension, `cline_mcp_settings.json`, opened from MCP Servers → Configure). Keep any servers already in the file.

```json
{
  "mcpServers": {
    "octocrawl": {
      "type": "streamableHttp",
      "url": "https://mcp.octocrawl.dev/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

- No account, no API key and no environment variables are needed.
- Tools: `scrape` and `map`, over HTTP. The allowance is 20 pages a day per address; it resets at 00:00 UTC, and the tool's answer says so when it is used up.
- If the user has an Octocrawl key (it starts with `oc_`), add it as a header, never in the URL: `"headers": { "Authorization": "Bearer oc_…" }`. A key raises the daily allowance and, when the key allows it, adds the browser lane and `scrape_product`.

## Option 2: run Octocrawl on the user's computer (every tool, no daily limit)

Requires Node.js 22.13 or later (`node --version`).

1. Start the Octocrawl API in a terminal and leave it running. It listens on `http://127.0.0.1:8787`, on this computer only:

   ```bash
   npx octocrawl serve
   ```

2. Add the stdio server. With the Cline CLI: `cline mcp install octocrawl --yes -- npx -y @octocrawl/mcp`. Or add it to the MCP settings file, keeping any servers already there:

   ```json
   {
     "mcpServers": {
       "octocrawl": {
         "command": "npx",
         "args": ["-y", "@octocrawl/mcp"],
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

- No API key is needed. `@octocrawl/mcp` calls the API at `http://127.0.0.1:8787`; if the API runs elsewhere, add `"--base-url", "http://host:port"` to `args`.
- Tools: `scrape`, `map`, `crawl`, `batch_scrape`, the Monitor tools and more. Pages are read over HTTP; for pages that only appear in a browser, the user runs `npx playwright install chromium` once.
- If the server shows no tools or a call fails to connect, check that `npx octocrawl serve` is still running.

## Check that it works

Call the `scrape` tool with:

```json
{ "url": "https://example.com", "formats": ["markdown"] }
```

The result should contain the page's Markdown (its one paragraph, "This domain is for use in documentation examples…"), its title "Example Domain", and an `evidenceRecord` with the final URL and HTTP status 200. A page that cannot be read comes back with a reason such as `blocked` or `timeout`, not an invented page.

## More

- Setup for other clients: https://octocrawl.dev/docs/connect-mcp/?utm_source=github&utm_medium=readme&utm_campaign=llms-install
- Limits and privacy for the hosted service: https://octocrawl.dev/docs/limits/?utm_source=github&utm_medium=readme&utm_campaign=llms-install and https://octocrawl.dev/docs/privacy/?utm_source=github&utm_medium=readme&utm_campaign=llms-install
- Source and licence (AGPL-3.0-only): https://github.com/77777R7/Octocrawl
