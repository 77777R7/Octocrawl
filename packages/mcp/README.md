# @octocrawl/mcp

Octocrawl as an MCP server over stdio, for Claude Desktop, Claude Code, Cursor, Codex and other MCP clients: scrape, map, crawl and batch tools whose results carry an Evidence Record. It is a client of a running Octocrawl API: start one with `npx octocrawl serve`, then point the client at it.

```json
{ "mcpServers": { "octocrawl": { "command": "npx", "args": ["-y", "@octocrawl/mcp", "--base-url", "http://127.0.0.1:8787"] } } }
```

`--base-url` (or `W2L_API_URL`, default `http://127.0.0.1:8787`) names the API; `--token` (or `W2L_API_TOKEN`) authenticates to a hosted one.

Licence: AGPL-3.0-only. Source and documentation: https://github.com/77777R7/Octocrawl
