# MCP OAuth 连接任务清单

依据：[ROADMAP.md](../ROADMAP.md) PH item 6 及其上方 2026-10-16 的决定、[AGENTS.md](../AGENTS.md)。核实基于 `main` 的 `0c27a7bf`，日期 2026-10-16。

起因：ChatGPT 不能发送 API key；claude.ai 的 static headers 还是 beta，只开放给少数组织。这两个客户端的用户现在只能用免 key 额度，花不了账户的 credits。按 MCP authorization 规范做 OAuth 之后，所有实现了这套规范的客户端都能用（Claude Code、Cursor、VS Code 也在内）。

做完一项勾一项，发现新的补上。看进度读这个文件，不翻滚动记录。

## 已定的决定（Howard，2026-10-16）

1. **授权服务自己写**，放在 octocrawl.dev（`packages/public-preview`），和登录放在一起；记录存 Firestore，只存 HMAC。不用 Cloudflare `workers-oauth-provider`，也不用 MCP SDK 的 express auth router：前者把 token 放在 KV，后者没有 CIMD 和 `iss`（SDK 1.30.0）。
2. **OAuth 连接不算进每个账户 5 个 key 的上限**（`account.ts:31` `MAX_ACTIVE_KEYS`），另外单独限 10 个连接。
3. **连接一直有效**，直到被断开，或连续 90 天没有使用。refresh token 每用一次换一个新的，有效期随使用顺延。
4. **入口用 `https://mcp.octocrawl.dev/mcp-oauth`**。`/mcp` 不动：免 key 和 `Bearer oc_` 照旧，`/.well-known/*` 照旧返回 404。原因是 Claude 只在收到 401 时才开始登录。

## 现状（代码里查到的）

- 认证入口是 `packages/mcp/src/hostedApi.ts` 的 `identify()`（约 365–384 行）。它只认 `Bearer oc_` 的 HMAC，查的是 `hostedApiKeys/{hmac}`，查询结果缓存 1 分钟；不带 key 时按 IP 走免 key 额度。返回的 Caller 形如 `{kind:'key', id, uid, browser, plan:'account'}`，下游的扣费、请求日志、浏览器通道租约都按 `caller.id` 计。
- `/mcp` 是无状态的 Streamable HTTP（约 582、625 行）。`/.well-known/*` 统一返回 404（约 386–389 行）。
- 登录在 `packages/public-preview/src/auth.ts`：Firebase REST，session 存为 `sessions/{hmac}`，已经支持 `next` 参数（`safeNext`，约 475 行）。账户相关的路由在 `account.ts`，接线在 `server.ts:52,477-484`。
- key 的创建和撤销在 `account.ts`（约 381–396、435–438 行）：`oc_` 加 32 字节随机数，只显示一次，HMAC 用 `W2L_QUOTA_HASH_KEY`。撤销就是 `enabled:false`。
- dashboard 前端是 `apps/public-web/public/docs-assets/dashboard.js`，测试在 `apps/public-web/test/dashboard.test.ts`。
- 两个 Worker（`cloudflare/hosted-api-proxy`、`cloudflare/public-preview-proxy`）都只做转发，不用改。
- `packages/mcp/src/host.ts` 是一份没部署过的 WorkOS 资源服务器，只能参考，不要接上线。

## 总原则

- **流程**：每组一个分支、一个 PR，从当前 `origin/main` 拉，在 `.claude/worktrees/` 下开 worktree；分支落后 `main` 不超过一组。commit 要 `-s`，用 conventional 格式。
- **规范以 MCP 2026-07-28 版为准**：https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization 及其子页面。客户端行为看各家文档：ChatGPT https://developers.openai.com/apps-sdk/build/auth ；Claude https://claude.com/docs/connectors/building/authentication 。
- **只做窄的那部分**：grant 只有 `authorization_code` 和 `refresh_token`；只支持公共客户端（`token_endpoint_auth_methods_supported: ["none"]`）；PKCE 只接受 S256；没有 implicit，没有 client_credentials。
- **所有秘密值都只存 HMAC**：code、access token、refresh token 都是。前缀约定：access `oca_`、refresh `ocr_`。
- **部署要 Howard 点头**。PR ④ 的真实客户端验收需要先部署 preview，部署前先问。
- **证据诚实**：真实客户端连过才能写“支持”。没连过的写 unknown，并写明查过什么。

## PR ① 资源服务（`packages/mcp`）

- [x] **R1** 加 `POST /mcp-oauth`，工具与 `/mcp` 相同。缺 token、token 无效或过期时返回 401，带 `WWW-Authenticate: Bearer resource_metadata="https://mcp.octocrawl.dev/.well-known/oauth-protected-resource/mcp-oauth", scope="mcp"`。不接受免 key 调用，也不接受 `oc_` key。
- [x] **R2** 加 `GET /.well-known/oauth-protected-resource/mcp-oauth`，返回 `{resource:"https://mcp.octocrawl.dev/mcp-oauth", authorization_servers:["https://octocrawl.dev"], scopes_supported:["mcp"], bearer_methods_supported:["header"]}`。其余 `/.well-known/*` 仍然 404。
- [x] **R3** 在 `identify()` 里识别 `oca_`：查 `oauthTokens/{hmac}`，检查 `expiresAt`，检查 `resource` 等于 `/mcp-oauth`；再读专属 key 记录，看 `enabled`；返回和账户 key 一样的 Caller。沿用 1 分钟缓存。REST `/v1/*` 拒绝 `oca_`。
- [x] **R4** 考虑是否给工具加 ChatGPT 的 `securitySchemes`（`[{type:'oauth2', scopes:['mcp']}]`）。只返回 401 够不够，还没核实，见“未核实”第 1 条。
  - 做了：`/mcp-oauth` 列出的每个工具都带顶层 `securitySchemes`，并在 `_meta.securitySchemes` 镜像一份；`/mcp` 的工具不带。依据见“未核实”第 1 条。
- PR ① 定下的读取约定（PR ② 写入时要照这个来）：
  - access token 的文档 id：`HMAC-SHA256(W2L_QUOTA_HASH_KEY, "oca:" + token)` 的 hex（`accessTokenDigest`）。账户 key 用的是 `"key:"` 前缀，两者不会撞。
  - `oauthTokens/{digest}` 的字段：`keyId`（string，连接专属 key 记录在 `hostedApiKeys` 里的文档 id，只能是 `[A-Za-z0-9_-]{1,128}`）、`resource`（string，必须等于 `https://mcp.octocrawl.dev/mcp-oauth`）、`expiresAt`（timestamp）。缺任何一个字段都当作没有这个 token。
  - 连接专属 key 记录：`hostedApiKeys/{keyId}`，除了账户 key 已有的字段，还要 `kind:"oauth"` 和 `uid`；没有 `kind:"oauth"` 或没有 `uid` 的记录不能被 access token 使用。
  - 带了无效 token 的 401 在 R1 的头后面多加 `, error="invalid_token"`（RFC 6750 §3.1）；没带 token 时不加。
- 验收：`hostedApi.test.ts` 用伪造的 token 存储覆盖这些情况：401 头的格式、PRM 的内容、受众不对时拒绝、过期返回 401、key 停用后失效、`/mcp` 和 `/.well-known/mcp/server-card.json` 的行为不变。`npm run typecheck` 和 `npm test` 通过。

## PR ② 授权服务（`packages/public-preview`，新文件 `oauth.ts`）

- [ ] **A1** `GET /.well-known/oauth-authorization-server` 的内容：
  - `issuer` 为 `https://octocrawl.dev`；
  - authorization、token、registration、revocation 四个端点，都在 `/oauth/*` 下；
  - `response_types_supported:["code"]`、`grant_types_supported:["authorization_code","refresh_token"]`、`code_challenge_methods_supported:["S256"]`、`token_endpoint_auth_methods_supported:["none"]`、`scopes_supported:["mcp"]`（不列 `offline_access`）；
  - `client_id_metadata_document_supported:true`、`authorization_response_iss_parameter_supported:true`；
  - 开 CORS，`cache-control: no-store`。
- [ ] **A2** client 识别。client_id 是 https URL 时按 CIMD 处理：
  - 防 SSRF：只允许 https 和公网 IP，限 5 KB、3 秒，结果缓存 24 小时；
  - 文件里的 `client_id` 必须等于这个 URL；
  - 已知的两个：ChatGPT `https://chatgpt.com/oauth/client.json`，Claude Code `https://claude.ai/oauth/claude-code-client-metadata`。

  否则查 `oauthClients/{id}`（DCR 注册的）。
- [ ] **A3** `POST /oauth/register`（DCR，RFC 7591）：只接受公共客户端；`redirect_uris` 只能是 https 或 loopback；记录 `client_name` 和 `application_type`；按 IP 限速；90 天没用就过期。
- [ ] **A4** `GET /oauth/authorize` 的校验顺序：client，然后 redirect_uri（完全匹配；loopback 不比端口），然后 `response_type=code`、S256 的 `code_challenge`、`resource` 等于 `https://mcp.octocrawl.dev/mcp-oauth`、scope 为 `mcp` 或空。redirect_uri 通过之前出的错只显示错误页，不跳转。没有 session 时 303 到 `/signin/?next=…`。
- [ ] **A5** 授权页（HTML 由服务端渲染）：
  - 内容：客户端名称（转义），以及经过校验的回调域名（“It will send you back to chatgpt.com”）；当前登录的邮箱，加“Not you?”；三条权限：MCP 工具（只读）、花你的 credits（显示本月余额）、一直连接直到断开或 90 天未用；连接记录说明，文案见 ROADMAP 上方的决定，不说“给应用一个 API key”；Cancel 和 Authorize 两个按钮。
  - localhost 回调要额外加本机警告。
  - 样式沿用站点风格。CSP 不允许内联 style，不在页面里放 `style=""`。头部要 `frame-ancestors 'none'`、`X-Frame-Options: DENY`、`no-store`。
- [ ] **A6** `POST /oauth/authorize`：CSRF 句柄绑定 session 和请求参数哈希，只能用一次，10 分钟过期。
  - 用户点授权：建 `oauthGrants/{grantId}`；建专属 key 记录（`hostedApiKeys` 加 `kind:'oauth'`、`grantId`，label 如 `ChatGPT (chatgpt.com)`，没有明文）；生成 code（60 秒、一次性）；然后 302 到 `redirect_uri?code&state&iss=https://octocrawl.dev`。
  - 用户点取消：跳到 `error=access_denied`。
  - 一个账户超过 10 个连接时显示错误页，不签发 code。
  - **注意**：auth 页现在的 CSP 带 `form-action 'self'`（`auth.ts:542`），Chrome 会把它用到表单提交之后的重定向上，所以跳到 chatgpt.com 会被拦。授权页要么不设 form-action，要么先 303 到本站的一个 GET 页面，再由那个页面跳出去。选一种做法，并写测试证明它可行。
- [ ] **A7** `POST /oauth/token`（form-encoded）：
  - `authorization_code` grant：校验 code、`code_verifier`、`redirect_uri`、`client_id`、`resource`；code 被重复使用时，撤销整个连接。
  - `refresh_token` grant：轮换。已经换掉的 refresh 又被拿来用时，撤销整个连接。
  - 返回 `{access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope:"mcp"}`。
  - 出错时返回 `invalid_grant` 或 `invalid_request`。开 CORS，`no-store`。
- [ ] **A8** `POST /oauth/revoke`（RFC 7009）。
- [ ] **A9** Firestore 集合：`oauthClients`、`oauthCodes`、`oauthGrants`、`oauthTokens`、`oauthRefresh`，都设 TTL 字段。`auth.ts` 的删除账户流程里，也要删这个账户的 grant 和 token。
- [ ] **A10** 在 `server.ts` 里给 `/oauth/*` 和 `/.well-known/oauth-authorization-server` 接线。
- 验收：`oauth.test.ts` 的规模和 `auth.test.ts` 相当，覆盖：
  - PKCE 错误时拒绝；
  - redirect 完全匹配，loopback 换端口仍能通过；
  - CIMD 的 `client_id` 不一致时拒绝、私网地址时拒绝；
  - DCR 拒绝非 https 的回调；
  - code 重放、refresh 重放都会撤销连接；
  - CSRF 句柄失效时拒绝；
  - 第 11 个连接被拒；
  - 授权页的转义；
  - 带 `iss` 的跳转。

  `npm run typecheck` 和 `npm test` 通过。

## PR ③ 连接列表和撤销

- [ ] **C1** `GET /api/account/connections`：返回应用名、回调域名、授权时间、最近使用时间、本月 credits。`POST /api/account/connections/{grantId}/revoke` 依次：标记 grant 已撤销，key 设 `enabled:false`，删掉 refresh。与 `/api/account/keys` 的 sameOrigin 检查一致。
- [ ] **C2** dashboard 新增 **MCP connections** 区块，每行一个 Disconnect 按钮（`dashboard.js`）。“Keys” 区块的 5 个上限不计 OAuth 连接。
- 验收：`account.test.ts` 和 `dashboard.test.ts` 各加对应用例；撤销后带缓存的情况下，1 分钟内 `/mcp-oauth` 返回 401（用可注入的时钟测）。

## PR ④ 文档、Registry 和真实客户端验收

- [ ] **D1** `apps/public-web/content/connect-mcp.md` 加 ChatGPT（developer mode 的 connector）和 claude.ai（custom connector）两个小节，URL 用 `/mcp-oauth`。Claude Code、Cursor 小节补一行 OAuth 的用法，原来的 key 用法保留。
- [ ] **D2** `server.json` 加第二个 remote `https://mcp.octocrawl.dev/mcp-oauth`。发版走 tag 加 Release workflow，那一步要 Howard 批准。
- [ ] **D3** 部署前检查（部署要先问 Howard）：
  - `public-preview-proxy` Worker 不缓存 `/oauth/*` 和 `/.well-known/oauth-*`（2026-10 有过它缓存 run.app 子请求 4 小时的记录，需要核实）；
  - octocrawl.dev 的 Cloudflare bot 防护不挡 Claude 的出口 `160.79.104.0/21`；
  - public-preview 冷启动能否在 Claude 的 10 秒超时内响应（查 min-instances）。
- [ ] **D4** 部署之后用真实客户端各连一次：ChatGPT developer mode、claude.ai custom connector、Claude Code（`/mcp` 登录）、Cursor；能做的话加上 VS Code、Codex。每个都要做两件事：一次 `scrape`，然后去 dashboard 断开，确认之后返回 401。记录写到 `research/hosted/<YYYY-MM-DD>-mcp-oauth-clients-<commit>.md`，写明客户端版本、走的是 CIMD 还是 DCR、代理还是直连、命令、commit。
- 验收：ROADMAP PH item 6 的状态行引用这份记录。

## 未核实（做到时先查）

1. ChatGPT 是否要求工具声明 `securitySchemes`，还是 401 就够。**2026-10-16 查过，按文档做了（R4）。** 查的是 https://developers.openai.com/apps-sdk/build/auth 和 https://developers.openai.com/plugins/reference：文档建议每个工具都声明 `securitySchemes`（即使整个服务器用同一个策略），放在工具对象顶层，参考页另列 `_meta["securitySchemes"]` 作为只读 `_meta` 的客户端的镜像；401 的 `WWW-Authenticate` 用来让 ChatGPT 找到 metadata。文档没有说只返回 401、不声明 `securitySchemes` 行不行，这一点仍未核实，要等 D4 用真实的 ChatGPT 连一次才知道。
2. Cursor 和 VS Code 是否支持 CIMD，以及它们的回调地址。论坛和 issue 里说 VS Code 用 `https://vscode.dev/redirect` 加 `127.0.0.1:33418`，Cursor 桌面版用 `http://localhost:8787/callback`。不确定之前 DCR 必须保留。
3. Codex 和 Windsurf 的 OAuth 细节。
4. MCP 2026-07-28 版改成了无状态（没有 `initialize`，有 `server/discover`），`/mcp` 现有实现与它兼不兼容，不在本清单范围内，只记一笔。

## 待我决定（Blocked on Howard）

- PR ④ 的部署和发版。

## 下次从这里继续

PR ① 的 R1–R4 已在分支 `claude/mcp-oauth-resource-server` 上做完（PR 合并前以 PR 页为准）。PR ① 合并后，等 Howard 说再从新分支开始 PR ② 的 A1；写入 `oauthTokens` 和连接 key 记录时照上面“PR ① 定下的读取约定”。另外 A6 建连接 key 记录之前要先处理：`account.ts` 创建 key 时按 `byUid('hostedApiKeys')` 数 5 个上限（约 389 行），连接记录也会被数进去，与决定 2 不符。
