# T053 through a second local MCP host under a grant, 2026-10-20 (PA A acceptance)

The real-site check of docs/pa-enhancement-tasks.md A: the local MCP host, which before this change answered `access: "enhanced"` with 400 `unsupported_parameter` because it read no grant, run with `W2L_ACCESS_GRANT` and asked for T053. One request, one run; an acceptance of an existing route (installed_chrome), not a new paid route.

## Setup

- Source commit: `844ddfec` (branch `claude/pa-a-entry-config-684a3b`, on `main` `cea1d4cb`), built with `npx tsc --build`.
- Host: a second local MCP host on port 8797, task root of its own (empty), started with
  `HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 W2L_LOCAL_MCP_PORT=8797 W2L_TASK_ROOT=<scratch>/ic-root W2L_ACCESS_GRANT=$HOME/Code/w2l/.w2l/access/installed-chrome-grant.json node packages/mcp/dist/localHostCli.js`.
  The 8791 host was not touched; 8797 was stopped after the run.
- Grant: the one the 2026-10-14 installed_chrome acceptance and the 2026-10-20 ic16 baseline used: tier `enhanced`, capabilities `installed_chrome` only, no budget, accepted by Howard. No `W2L_VENDORS`, so no provider rung.
- Proxied: yes, through the operator's Clash (`127.0.0.1:7890`), as the host's startup line and the record's `access.egress` (`proxy 127.0.0.1:7890`, source `environment`) say. Not run direct.
- Request: MCP `scrape` (Streamable HTTP client, `@modelcontextprotocol/sdk`) at 2026-10-20T03:54:58Z with `{ url: "https://www.imf.org/en/Publications/WEO", access: "enhanced", debug: true, maxAge: 0, storeInCache: false, verify: { checks: [{ type: "markdownIncludes", text: "World Economic Outlook" }] } }`. The client script was a scratch file, not committed. T053's own predicate is `markdownMatches /World Economic Outlook/i`; the check sent is the same text as a plain include.

## Result

| Rung | Status | HTTP | Note |
| --- | --- | --- | --- |
| http | blocked, `bot_detected_generic` | 403 | verification `page_not_read` |
| browser_local | blocked, `bot_detected_generic` | 403 | verification `page_not_read` |
| installed_chrome | success | 200 | verification passed, rung started at 3.5 s, done at 8.7 s |

- Answer: `status: success`, verification `passed`, final URL `https://www.imf.org/en/publications/weo`, 12.2 s wall time at the client.
- Record: `access.route` `installed_chrome`, `executor` `chrome`, `executorVersion` `155.0.8059.85`, `completion` `unattended`, `externalCostUsd` 0. `channelsTried` `http → browser_local → installed_chrome`; no `ladder_channels_filtered` event.
- Cost: $0 (no paid call; installed_chrome launches the Mac's own Chrome). Egress bandwidth through Clash: not measured (unknown).
- Seen and not explained here: the answer's top-level `lane` is `browser_local` although the installed_chrome rung produced it (the ic16 baseline row for T053 shows the same), and `access.grant` is `null`. Both are as the engine reports them for this route on `main`; this change does not touch them.

## Reading

The local MCP host now runs the grant's route: the same grant that `octocrawl serve` and the `octocrawl` command read reaches the installed_chrome rung here, and on T053 that rung got the page the two free rungs were refused. One run, one window, proxied: it shows the route is reachable from the local host, not how often it succeeds.
