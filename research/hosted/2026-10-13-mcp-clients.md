# Hosted MCP from four clients, 2026-10-13

ROADMAP PH item 1 asks that hosted Octocrawl be "connected from Claude Code, Cursor, OpenCode and Codex with the one-line commands on the Connect MCP page, each recorded with its client version". The 2026-10-06 checks (#246) recorded no versions, and Codex was never run. This record covers all four.

## How it was run

- Target: `https://mcp.octocrawl.dev/mcp`, keyless. Live service `octocrawl-api` at revision `octocrawl-api-account-5aadb7c` (tag `h11account`), so #467 was not deployed yet.
- Machine: Howard's Mac, proxied (`HTTPS_PROXY=http://127.0.0.1:7890`). Each client's configuration went into a scratch directory, not the user's own configuration:
  - Claude Code: `--scope local`, keyed to the scratch directory and removed after.
  - Cursor and OpenCode: project files.
  - Codex: `CODEX_HOME` set to a scratch directory, and a `-c` override for the call.
- Commands: the ones on the Connect MCP page (`apps/public-web/scripts/build-docs.mjs`, `mcpClients.remote`), at main `cb5fa6d2`.
- Time: 06:13–06:19Z.

| Client | Version | Configuration | Check | Result |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.296 | `claude mcp add --scope local --transport http octocrawl https://mcp.octocrawl.dev/mcp` | `claude mcp list` | `octocrawl: https://mcp.octocrawl.dev/mcp (HTTP) - ✔ Connected` |
| Cursor CLI | `cursor-agent` 2026.08.25-3e8eec8 | `.cursor/mcp.json` with the page's block | `cursor-agent mcp enable octocrawl`, `mcp list`, `mcp list-tools octocrawl` | `octocrawl: ready`; tools `map`, `scrape` |
| OpenCode | 1.18.26 | `opencode.json` with the page's block | `opencode mcp list` | `✓ octocrawl connected` |
| Codex | `codex-cli` 0.162.1 (npm `@openai/codex`, installed for this check) | `codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp` | `codex mcp list`, then `codex exec` with the server and a scrape of `https://example.com/` | listed `enabled`, transport `streamable_http`; tools `map`, `scrape`; the scrape answered `success`, `finalUrl` `https://example.com/`, `httpStatus` 200 |

## Notes

- **Tools offered.** A keyless caller is offered `map` and `scrape` alone. `scrape_product` is listed only to a key with the browser lane, as designed. Cursor and Codex both listed exactly these two tools.
- **Claude Code.** Only the connection check ran. `claude -p` could not run, because the CLI's sign-in on this machine had expired ("OAuth session expired and could not be refreshed"). So its tool list and a tool call were not checked here. A project-scope `.mcp.json` was also tried first; it shows "Pending approval" until it is approved in an interactive session.
- **Codex.** The configuration and `codex mcp list` ran under a scratch `CODEX_HOME`. The call ran under the user's own Codex sign-in, with the server added by `-c 'mcp_servers.octocrawl.url="https://mcp.octocrawl.dev/mcp"'`; `~/.codex/config.toml` was not changed. `codex mcp list` reports `Auth: Unsupported`: the server has no OAuth, which it needs none of.
- **Codex install.** `~/.local/bin/codex` was a broken link left by the ChatGPT desktop app, pointing to `/Applications/ChatGPT.app/Contents/Resources/codex`, which no longer exists. The app now ships `codex-cli 0.162.0-alpha.17.2` under `Resources/codex-cli/bin/codex`. The broken link was removed and `@openai/codex@0.162.1` installed globally, as Howard chose.
- **Found on the way, not about connecting.** The hosted scrape of `https://example.com/` returned Markdown without the page's `<h1>Example Domain</h1>`, only its paragraph. Codex reported "no heading", and a direct `POST https://api.octocrawl.dev/v1/scrape` gave the same. Main-content extraction left the heading out. Not isolated.
- **Cost:** two keyless pages (Codex's scrape and the direct check), within the address's 20 a day.
