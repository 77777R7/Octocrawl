# MCP connections by OAuth from real clients, 2026-10-16

ROADMAP PH item 6 is accepted when it has been "connected and recorded in `research/hosted/` from ChatGPT developer mode, a claude.ai custom connector, Claude Code and Cursor, each with its client version and the flow it used". This record covers **Claude Code** only. ChatGPT, claude.ai and Cursor are not run yet; Howard connects those himself, and they are added here when he has.

## How it was run

- **Targets**: `https://mcp.octocrawl.dev/mcp-oauth`, served by `octocrawl-api` revision `octocrawl-api-oauthrs-9c97175` (tag `h17oauthrs`, from main `9c971756`), and the authorization server on `https://octocrawl.dev`, served by `w2l-public-preview` revision `w2l-public-preview-oauth-adee17f2` (tag `r90oauth`, from main `adee17f2`).
- **Machine**: Howard's Mac. The shell was proxied (`HTTPS_PROXY=http://127.0.0.1:7890`) for the CLI commands. The sign-in ran in Howard's Chrome; whether Chrome went through the proxy was not checked.
- **Account**: Howard's own Octocrawl account. He signed in and chose Authorize himself; Claude did not enter any credential.
- **Configuration**: `claude mcp add --transport http octocrawl-oauth https://mcp.octocrawl.dev/mcp-oauth`, which the CLI put in local scope for the session's worktree, then `claude mcp login octocrawl-oauth` in an interactive terminal.
- **Time**: 12:58–13:10Z.
- **Server side**: Cloud Logging for both services, and Firestore read with Howard's `gcloud` credentials.

## Claude Code

Version: Claude Code 2.1.301 (user agent `claude-code/2.1.301 (claude-desktop, agent-sdk/0.3.295)`; the OAuth requests came from `Bun/1.4.3`).

| Step | What the client did | What the servers recorded |
| --- | --- | --- |
| Add | `claude mcp add …` → `! Needs authentication` | 12:58:18 `POST /mcp-oauth` 400, then 401; `GET` PRM 200 |
| Discovery | read the authorization server metadata | 12:58:19–12:58:42 `GET /.well-known/oauth-authorization-server` 200, five times |
| Flow | **Client ID Metadata Document**: `client_id=https://claude.ai/oauth/claude-code-client-metadata`; callback `http://localhost:58686/callback`; `code_challenge_method=S256`; `scope=mcp`; `resource=https://mcp.octocrawl.dev/mcp-oauth`. No registration request. | 12:58:43 `GET /oauth/authorize` 200, the consent page |
| Consent | Howard chose Authorize | 12:59:44 `POST /oauth/authorize` 302; `w2l_oauth` `consent` `allowed` |
| Token | code exchanged | 12:59:45 `POST /oauth/token` 200; `w2l_oauth` `token` `code` |
| Connected | `claude mcp login` printed `Authenticated with "octocrawl-oauth"`; `claude mcp get` showed `✔ Connected` | 13:00:01 initialize 200, `tools/list` 200 |
| Scrape | `claude -p` allowed only `mcp__octocrawl-oauth__scrape`, on `https://example.com` with `formats: ["markdown"]`. It answered `status=success`, `httpStatus=200`, `finalUrl=https://example.com`. | 13:08:17 `POST /mcp-oauth` 200; `hosted_usage` under key `oauth_bt0n19zYqZ…` (the connection's own key record); `hosted_credits` kind `http`, 1 credit used |
| Disconnect | Howard clicked Disconnect under MCP connections on `/dashboard/keys/` | 13:09:26 `POST /api/account/connections/<grant>/revoke` 204. Firestore: the grant `revoked: true` and the key record `enabled: false`, both at 13:09:26.73Z; no refresh token left for the grant |
| After | `claude mcp get` showed `! Needs authentication` | 13:09:48, 22 s after the disconnect: `POST /mcp-oauth` **401**. The client then read the PRM and tried its refresh token: `POST /oauth/token` 400 |

Result: Claude Code connects through a metadata document, calls a tool on the account's credits under the connection's own key, and stops working after a disconnect, within the minute the hosted API's cache allows.

## Claude Code in the Claude desktop app (second run)

After the disconnect above, Howard signed in again from this Claude desktop session's `/mcp`, at 13:31–13:34Z. The same revisions served it as above: `octocrawl-api` `h17oauthrs` and `w2l-public-preview` `r90oauth`, with no deploy between the runs. Whether the desktop app's traffic went through the proxy was not checked. The client is the desktop app's own Claude Code: user agent `claude-code/2.1.295 (claude-desktop, agent-sdk/0.3.299)`, with the OAuth requests from `Bun/1.4.3`. It is a different build from the 2.1.301 CLI above.

| Time (Z) | What happened |
| --- | --- |
| 13:31:32–13:31:37 | Four reads of the authorization server metadata, 200. |
| 13:31:34 | `POST /oauth/register` **400**. The server did not log why at the time; the PR that adds this section makes it log the refused field and the kind of problem. The client then went on without registering. |
| 13:31:38 | `GET /oauth/authorize` with `client_id=https://claude.ai/oauth/claude-code-client-metadata` and `redirect_uri=http://localhost:62070/callback` (CIMD), `scope=mcp`, `resource` set. |
| 13:31:44–45 | Consent `allowed`; code exchanged, `POST /oauth/token` 200. |
| 13:31:49–50 | `POST /mcp-oauth` initialize 200, `tools/list` 200. |
| 13:34:05 | This session called `mcp__octocrawl-oauth__scrape` on `https://example.com` with `formats: ["markdown"]`: `status` `success`, `httpStatus` 200, `finalUrl` `https://example.com`, lane `http`. The hosted API logged `hosted_usage` under the new connection's key `oauth_O-_rAa61Oa…` and charged 1 credit (`http`). |

Not repeated for this run: the disconnect check (done above with the CLI). Cost: 1 more credit, for the one HTTP page.

Why the registration attempt came first, and why it was refused, is not known. The Claude Code binary's OAuth provider registers with `{client_name: "Claude Code (<server>)", redirect_uris: [<its redirect URI>], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none"}`. It withholds its CIMD `client_id` ("registering via DCR") when its redirect URI "is not the document's loopback /callback". Every field but the redirect URI is one the server accepts. So the refusal was most likely `redirect_uris`, for example a redirect URI not yet set. Otherwise the request failed the content-type or JSON check before any field was read. Both are inferences from the binary's strings and the server's code, not something observed.

## Notes

- **First `claude -p` runs failed for an unrelated reason.** The CLI's own Anthropic sign-in had expired ("OAuth session expired and could not be refreshed"). The same error came with `--strict-mcp-config` and no MCP server at all. It went away after Howard ran `claude auth login`; the scrape above ran after that. Octocrawl's `/oauth/token` saw no refresh request in that time. The 2026-10-13 record hit the same expired sign-in.
- **A 400 before each connection.** Every connection opened with one `POST /mcp-oauth` answered 400, then succeeded. `/mcp` shows the same pattern for Claude Code 2.1.295 and 2.1.299 (Cloud Logging, 2026-10-14 and 2026-10-16). The response body is not logged, so the cause was not checked. One likely cause is the handler's protocol-version check (`SUPPORTED_PROTOCOL_VERSIONS`) refusing a newer version that the client tries first. That would be the MCP 2026-07-28 point in the task list's "not verified", and item 6 does not change it.
- **`GET /mcp-oauth` 405.** Claude Code asks for a server-sent event stream and gets 405, as on `/mcp` (every request is answered on its own POST).
- **Warning in the CLI.** Before the sign-in, `claude mcp login` printed "SEP-2352: stored OAuth credential has no 'issuer' stamp (pre-upgrade storage or provider not round-tripping the value)". It came while reading storage before any credential for this server existed, and the sign-in went on to succeed. Not investigated further. Whether it appears again with a stored credential is not known.
- **Cost:** 1 credit from Howard's account, for the one HTTP page.

## Not run yet

| Client | Status |
| --- | --- |
| ChatGPT (custom MCP server / developer mode) | not run |
| claude.ai custom connector | not run; also the test of whether Cloudflare's browser integrity check or security level challenges Claude's egress `160.79.104.0/21` (task list D3) |
| Cursor | not run |

## claude.ai custom connector and ChatGPT custom MCP server (added later the same day)

Run 16:03–16:16Z, with Howard working each client's UI himself. Claude guided the steps and read Cloud Logging. Services: `octocrawl-api` `h17oauthrs`; `w2l-public-preview` `r92connect` (main `9db14102`). Whether Howard's browser traffic went through the proxy was not checked; the clients' own server-side requests come from Anthropic's and OpenAI's servers.

### claude.ai

Added under Settings › Connectors › Add custom connector, URL `https://mcp.octocrawl.dev/mcp-oauth`, OAuth client fields left empty. The claude.ai web app's version is not shown in its UI and was not recorded.

| Time (Z) | What happened |
| --- | --- |
| 16:03:39–16:03:57 | Authorization server metadata read by `python-httpx/0.28.1`, 200 (Claude's servers). |
| 16:03:58 | `GET /oauth/authorize` with `client_id=https://claude.ai/oauth/mcp-oauth-client-metadata`: **CIMD**, Claude's published identity. No registration request. |
| 16:04:01–02 | Consent `allowed`; `POST /oauth/token` 200 from `python-httpx/0.28.1` (0.16 s). |
| 16:04:03–08 | `POST /mcp-oauth` from `Claude-User`: initialize 200 after one 400, `tools/list` 200. The connector showed three tools: Map a site, Scrape a page, Amazon.sg product JSON. |
| 16:05:50 | Scrape of `https://example.com`, `formats: ["markdown"]`, asked in a claude.ai chat. Claude answered `status` `success`, `httpStatus` 200, `finalUrl` `https://example.com`. The hosted API logged `hosted_usage` under key `oauth_nZBLMEkdH2…` and charged 1 credit (`http`). |
| 16:08:20 | Disconnect on `/dashboard/keys/`: `POST /api/account/connections/<grant>/revoke` 204. |
| 16:09:21 | Next call (asked again in the chat): `POST /mcp-oauth` from `Claude-User` **401**. 16:09:22 `POST /oauth/token` 400 from `python-httpx/0.28.1` (its refresh token was deleted). claude.ai showed "Reconnect a connector to keep using it". |

Cloudflare: every request from Claude's servers above reached the services, so the browser integrity check and the `medium` security level did not challenge them on this run. That settles the D3 point for this run; it says nothing about other IPs in the range or other days.

### ChatGPT

Added at chatgpt.com/plugins › + › Add custom MCP server, URL `https://mcp.octocrawl.dev/mcp-oauth`, authentication OAuth. ChatGPT's toast read "Primary is now connected"; the plugin appears under Personal › Created by you. The ChatGPT web app's version is not shown in its UI and was not recorded.

| Time (Z) | What happened |
| --- | --- |
| 16:11:03–05 | `POST /mcp-oauth` 401 from `Python/3.14 aiohttp/3.14.4`, then `GET /.well-known/oauth-protected-resource/mcp-oauth` 200: ChatGPT used the path-suffixed metadata URL from the challenge; no request for the root `/.well-known/oauth-protected-resource` reached the service. It read `/.well-known/oauth-authorization-server` 200 and also tried `/.well-known/openid-configuration`, 404, without effect. |
| 16:11:28 | `GET /oauth/authorize` with `client_id=https://chatgpt.com/oauth/client.json` and `redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect`: **CIMD**. No registration request. |
| 16:11:29–33 | Consent `allowed`; `POST /oauth/token` 200 from `openai-connectors-oauth/1.0` (0.15 s). The server advertises only `none`; whether ChatGPT also sent a `client_assertion` is not logged. |
| 16:11:35–36 | `POST /mcp-oauth` from `openai-mcp/1.0.0`: initialize 200 after one 400, `tools/list` 200; `GET` 405. |
| 16:12:49 | Scrape of `https://example.com`, `formats: ["markdown"]`, asked in a ChatGPT chat with the plugin selected: `status` `success`, `httpStatus` 200, `finalUrl` `https://example.com`. `hosted_usage` under key `oauth_lsYm1uIHVt…`, 1 credit (`http`). |
| 16:13:58 | Disconnect on `/dashboard/keys/`: revoke 204. |
| 16:15:44 | Next call: `POST /mcp-oauth` from `openai-mcp/1.0.0` **401**. 16:15:46 `POST /oauth/token` 400 from `openai-connectors-oauth/1.0`. ChatGPT showed "Your Octocrawl connection has expired. Reconnect it before ChatGPT can use it for this request." |

### Status after these runs

| Client | Flow | Scrape | Disconnect → 401 |
| --- | --- | --- | --- |
| Claude Code CLI 2.1.301 | CIMD | yes | yes, 22 s |
| Claude Code in the Claude desktop app 2.1.295 | CIMD, after one refused registration | yes | not repeated |
| claude.ai | CIMD (`claude.ai/oauth/mcp-oauth-client-metadata`) | yes | yes, the first call 61 s after |
| ChatGPT | CIMD (`chatgpt.com/oauth/client.json`) | yes | yes, the first call 106 s after |
| Cursor | not run | | |

The table above under "Not run yet" is as it stood before these runs. Cost of these runs: 2 credits from Howard's account.
