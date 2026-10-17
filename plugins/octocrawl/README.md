# Octocrawl for Claude Code

This plugin connects Claude Code to hosted Octocrawl, a web scraper for agents. Octocrawl reads a web page as Markdown and attaches an Evidence Record: the final URL, when it was fetched, the HTTP status, what robots.txt allowed and hashes of what was read. A blocked, empty or wrong page comes back with a status that says so, never as an invented page.

## Install

In Claude Code 2.1.275 or later:

```text
/plugin install octocrawl --marketplace 77777R7/Octocrawl
```

In an earlier version, add the marketplace first with `/plugin marketplace add 77777R7/Octocrawl`, then run `/plugin install octocrawl@octocrawl`.

## What it runs

The plugin adds one MCP server and nothing else: no commands, skills, hooks or local programs.

```json
{ "mcpServers": { "octocrawl": { "type": "http", "url": "https://mcp.octocrawl.dev/mcp-oauth" } } }
```

The first time it is used, run `/mcp` in Claude Code, choose the plugin's octocrawl server and sign in to your Octocrawl account in the browser it opens. Claude Code keeps the sign-in; no key is copied anywhere.

## What it sends and fetches

- Each tool call goes to `https://mcp.octocrawl.dev/mcp-oauth` with the address you asked about and the call's options. Octocrawl's servers then fetch that page; your computer does not.
- The tools are `scrape` (one page) and `map` (the addresses on a site), plus `scrape_product` when the connection has the browser lane. Hosted Octocrawl obeys robots.txt for every address and refuses private network addresses.
- Calls spend your account's credits: 1 per page read over HTTP, 5 per page read in a browser, 1 per map. Activity in your dashboard lists each call.
- What the service records, and for how long, is in the [privacy policy](https://octocrawl.dev/docs/privacy/).

## Disconnecting

The connection is listed under MCP connections on [API keys](https://octocrawl.dev/dashboard/keys/), where Disconnect ends it at once; it also ends after 90 days unused.

Crawls, batches, Monitors and saved logins run on your own computer instead, with `npx octocrawl serve` and the `@octocrawl/mcp` server; see [Connect an agent](https://octocrawl.dev/docs/connect-mcp/).

## License

AGPL-3.0-only, like the rest of [Octocrawl](https://github.com/77777R7/Octocrawl).
