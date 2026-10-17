# @octocrawl/mcp

Octocrawl as an MCP server over stdio, for Claude Desktop, Claude Code, Cursor, Codex and other MCP clients: scrape, map, crawl and batch tools whose results carry an Evidence Record. It is a client of a running Octocrawl API: start one with `npx octocrawl serve`, then point the client at it.

```json
{ "mcpServers": { "octocrawl": { "command": "npx", "args": ["-y", "@octocrawl/mcp", "--base-url", "http://127.0.0.1:8787"] } } }
```

`--base-url` (or `W2L_API_URL`, default `http://127.0.0.1:8787`) names the API; `--token` (or `W2L_API_TOKEN`) authenticates to a hosted one.

### Fewer tools, or read-only

A client that takes only so many tools, or loads every definition up front, can list some groups alone. `--toolsets` (or `W2L_MCP_TOOLSETS`) takes a comma-separated list of `core` (scrape, get_scrape, map), `crawl`, `batch`, `products`, `logins`, `monitor` and `delivery`, or `all`, the default. An unknown name stops the server and names the valid ones. A call to a tool left out says which flag lists it.

`--read-only` (or `W2L_MCP_READ_ONLY=1`; a value other than yes or no stops the server) lists the tools that only read, plus a `scrape` without the options that act as the person (`actions`, `lane`, `handoff`, `mode` authed, `access` my-browser), marked read-only so a client can run it without asking. A call that sends one of those options anyway is refused before any request.

Claude Code:

```bash
claude mcp add octocrawl -- npx -y @octocrawl/mcp --toolsets=core,crawl,batch
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.octocrawl]
command = "npx"
args = ["-y", "@octocrawl/mcp", "--read-only"]
```

Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "octocrawl": { "command": "npx", "args": ["-y", "@octocrawl/mcp", "--toolsets=core,crawl"] } } }
```

VS Code (`.vscode/mcp.json`):

```json
{ "servers": { "octocrawl": { "type": "stdio", "command": "npx", "args": ["-y", "@octocrawl/mcp", "--toolsets=core,batch"] } } }
```

To try Octocrawl without installing anything, connect the client to hosted Octocrawl instead: `https://mcp.octocrawl.dev/mcp` (Streamable HTTP), no account and 20 pages a day per address, with `scrape` and `map`. Setup for each client: https://octocrawl.dev/docs/connect-mcp/?utm_source=npm&utm_medium=readme&utm_campaign=mcp

Licence: AGPL-3.0-only. Website and docs: https://octocrawl.dev/?utm_source=npm&utm_medium=readme&utm_campaign=mcp. Source: https://github.com/77777R7/Octocrawl
