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

- [x] **A1** `GET /.well-known/oauth-authorization-server` 的内容：
  - `issuer` 为 `https://octocrawl.dev`；
  - authorization、token、registration、revocation 四个端点，都在 `/oauth/*` 下；
  - `response_types_supported:["code"]`、`grant_types_supported:["authorization_code","refresh_token"]`、`code_challenge_methods_supported:["S256"]`、`token_endpoint_auth_methods_supported:["none"]`、`scopes_supported:["mcp"]`（不列 `offline_access`）；
  - `client_id_metadata_document_supported:true`、`authorization_response_iss_parameter_supported:true`；
  - 开 CORS，`cache-control: no-store`。
- [x] **A2** client 识别。client_id 是 https URL 时按 CIMD 处理：
  - 防 SSRF：只允许 https 和公网 IP，限 5 KB、3 秒，结果缓存 24 小时；
  - 文件里的 `client_id` 必须等于这个 URL；
  - 已知的两个：ChatGPT `https://chatgpt.com/oauth/client.json`，Claude Code `https://claude.ai/oauth/claude-code-client-metadata`。

  否则查 `oauthClients/{id}`（DCR 注册的）。
- [x] **A3** `POST /oauth/register`（DCR，RFC 7591）：只接受公共客户端；`redirect_uris` 只能是 https 或 loopback；记录 `client_name` 和 `application_type`；按 IP 限速；90 天没用就过期。
- [x] **A4** `GET /oauth/authorize` 的校验顺序：client，然后 redirect_uri（完全匹配；loopback 不比端口），然后 `response_type=code`、S256 的 `code_challenge`、`resource` 等于 `https://mcp.octocrawl.dev/mcp-oauth`、scope 为 `mcp` 或空。redirect_uri 通过之前出的错只显示错误页，不跳转。没有 session 时 303 到 `/signin/?next=…`。
- [x] **A5** 授权页（HTML 由服务端渲染）：
  - 内容：客户端名称（转义），以及经过校验的回调域名（“It will send you back to chatgpt.com”）；当前登录的邮箱，加“Not you?”；三条权限：MCP 工具（只读）、花你的 credits（显示本月余额）、一直连接直到断开或 90 天未用；连接记录说明，文案见 ROADMAP 上方的决定，不说“给应用一个 API key”；Cancel 和 Authorize 两个按钮。
  - localhost 回调要额外加本机警告。
  - 样式沿用站点风格。CSP 不允许内联 style，不在页面里放 `style=""`。头部要 `frame-ancestors 'none'`、`X-Frame-Options: DENY`、`no-store`。
- [x] **A6** `POST /oauth/authorize`：CSRF 句柄绑定 session 和请求参数哈希，只能用一次，10 分钟过期。
  - 用户点授权：建 `oauthGrants/{grantId}`；建专属 key 记录（`hostedApiKeys` 加 `kind:'oauth'`、`grantId`，label 如 `ChatGPT (chatgpt.com)`，没有明文）；生成 code（60 秒、一次性）；然后 302 到 `redirect_uri?code&state&iss=https://octocrawl.dev`。
  - 用户点取消：跳到 `error=access_denied`。
  - 一个账户超过 10 个连接时显示错误页，不签发 code。
  - **注意**：auth 页现在的 CSP 带 `form-action 'self'`（`auth.ts:542`），Chrome 会把它用到表单提交之后的重定向上，所以跳到 chatgpt.com 会被拦。授权页要么不设 form-action，要么先 303 到本站的一个 GET 页面，再由那个页面跳出去。选一种做法，并写测试证明它可行。
- [x] **A7** `POST /oauth/token`（form-encoded）：
  - `authorization_code` grant：校验 code、`code_verifier`、`redirect_uri`、`client_id`、`resource`；code 被重复使用时，撤销整个连接。
  - `refresh_token` grant：轮换。已经换掉的 refresh 又被拿来用时，撤销整个连接。
  - 返回 `{access_token, token_type:"Bearer", expires_in:3600, refresh_token, scope:"mcp"}`。
  - 出错时返回 `invalid_grant` 或 `invalid_request`。开 CORS，`no-store`。
- [x] **A8** `POST /oauth/revoke`（RFC 7009）。
- [x] **A9** Firestore 集合：`oauthClients`、`oauthCodes`、`oauthGrants`、`oauthTokens`、`oauthRefresh`，都设 TTL 字段。`auth.ts` 的删除账户流程里，也要删这个账户的 grant 和 token。
- [x] **A10** 在 `server.ts` 里给 `/oauth/*` 和 `/.well-known/oauth-authorization-server` 接线。
- PR ② 的做法（和上面的描述不一致或上面没写的，以这里为准）：
  - **A4 出错不自动跳转**：redirect_uri 校验通过之后，参数出错也只显示错误页，页面上给一个带 `error`、`state`、`iss` 的链接，要用户自己点才回到 app。原因是任何人都能用 DCR 注册回调，如果自动跳转，octocrawl.dev 就成了开放重定向器（RFC 9700 §4.11.2；审查时复现过）。只有用户在授权页上点了 Authorize 或 Cancel 之后才会 302。
  - **A4 登录后回到授权请求**：授权请求的 URL 超过了原来 `safeNext` 300 字符的上限，所以服务端和 `account.js` 都把上限放宽到 2000。email 登录原来完成后固定跳到 `/dashboard/`，现在 `POST /auth/email` 也收 `next`，存在签名 cookie `w2l_signin_next` 里（路径 `/auth/email`，1 小时），只在同一个浏览器里打开链接时有效。
  - **A5 布局**（2026-10-16 Howard 按参考图定的）：页面中间一张卡片。顶部是 Octocrawl 的章鱼标（`/assets/octopus-160.webp`）和客户端首字母方块，中间连一条线；客户端的 logo 不加载，因为 CSP 的 `img-src 'self'` 不允许外部图片。下面依次是一句 “X would like to connect to your Octocrawl account”、回调域名、“Your account will be used to:” 加三条带勾的权限、主按钮 Authorize、文字样式的 Decline，最后是登录邮箱、Sign out 和连接记录说明。样式在 `apps/public-web/public/docs-assets/oauth.css`。
  - **A6 选的做法**：授权页的 CSP 不设 `form-action`，保留 `frame-ancestors 'none'` 和 `X-Frame-Options: DENY`。2026-10-16 在本机 Chromium（应用内浏览器）里点了一次 Authorize，POST 之后的 302 跳到了 `http://localhost:53682/callback?code=…&state=…&iss=…`，没有被拦截。
  - **A6 连接计数**：grant 在第一次换到 token 的同一个 commit 里标记 `connected:true`，只有这样的 grant 才算 10 个连接里的一个。同意了但从没换过 code 的 grant 不占名额（审查时发现，客户端换取失败 10 次就会把账户锁 90 天）。几个 grant 几乎同时换 code 时，总数可能略超过 10。
  - **A6 连接 key 记录**：`hostedApiKeys/oauth_{grantId}`，字段是账户 key 的那些，再加 `kind:"oauth"`、`grantId`，label 如 `ChatGPT (chatgpt.com)`。`account.ts` 的 key 列表和 5 个上限都不算这类记录（这是 C2 的一半，提前在这里做了，否则 A6 一上线就会占用用户的 key 名额）。
  - **A7**：ChatGPT 的 CIMD 文档写的是 `token_endpoint_auth_method:"private_key_jwt"`，`token_endpoint_auth_methods_supported` 里有 `none`。这里只公布 `none`。如果客户端仍然附带 `client_assertion`，服务器不校验它，当作公共客户端处理。
  - **A9**：多了一个集合 `oauthNonces`（授权页 CSRF 句柄的一次性记录）。所有集合都有 `expireAt` 作为 TTL 字段；`oauthTokens` 另有 `expiresAt`，这是 hosted API 读的字段。删除账户时清掉 `oauthGrants`、`oauthCodes`、`oauthTokens`、`oauthRefresh` 和连接 key 记录。
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

- [x] **C1** `GET /api/account/connections`：返回应用名、回调域名、授权时间、最近使用时间、本月 credits。`POST /api/account/connections/{grantId}/revoke` 依次：标记 grant 已撤销，key 设 `enabled:false`，删掉 refresh。与 `/api/account/keys` 的 sameOrigin 检查一致。
- [x] **C2** dashboard 新增 **MCP connections** 区块，每行一个 Disconnect 按钮（`dashboard.js`）。“Keys” 区块的 5 个上限不计 OAuth 连接。
- 验收：`account.test.ts` 和 `dashboard.test.ts` 各加对应用例；撤销后带缓存的情况下，1 分钟内 `/mcp-oauth` 返回 401（用可注入的时钟测）。
- PR ③ 的做法（和上面不一致或上面没写的，以这里为准）：
  - **本月 credits 和最近使用不由接口返回**。接口返回每个连接的 `keyId`，dashboard 用和 API keys 表同一套统计（`tallyKeys` / `lastUsed` / `monthUse`），按请求记录里的 key id 算。请求记录覆盖不到整月时，同样标 “at least” 并说明原因，这样两张表的口径一致，也不会把未知写成 0。
  - 列表只列现在算数的连接：已换过 code、没断开、90 天内用过。`GET /api/account` 也带上同一份 `connections`，dashboard 只需一次请求。
  - 断开时依次：grant 标记 `revoked`、key 设 `enabled:false`、删掉这个 grant 的所有 refresh token（Firestore 里按 `grantId` 查）。access token 不删：key 停用后，开始一次调用时会立即被拒；只读缓存的请求（如列出工具）最多一分钟后被拒。hosted API 的两个 Firestore 存储和 `createHostedApi` 都加了可注入的时钟，测试里验证了这两种情况。
  - Activity 页的 key 筛选和每行的 title 用 “ChatGPT (chatgpt.com)” 这样的名字显示连接的调用。

## PR ④ 文档、Registry 和真实客户端验收

- [x] **D1** `apps/public-web/content/connect-mcp.md` 加 ChatGPT（developer mode 的 connector）和 claude.ai（custom connector）两个小节，URL 用 `/mcp-oauth`。Claude Code、Cursor 小节补一行 OAuth 的用法，原来的 key 用法保留。
- [x] **D2** `server.json` 加第二个 remote `https://mcp.octocrawl.dev/mcp-oauth`。发版走 tag 加 Release workflow，那一步要 Howard 批准。
- PR ④（D1、D2）的做法：
  - D1：新小节放在 “Add a key for more” 之后，ChatGPT、claude.ai、Claude Code、Cursor 各一节，步骤按各家官方文档写（2026-10-16 核对：developers.openai.com/apps-sdk/deploy/connect-chatgpt、support.claude.com 的 custom connectors 文章、code.claude.com/docs/en/mcp、cursor.com/docs/mcp），每节附原文档链接。没有客户端连过，所以页面不写“支持”或 “Verified”，只写“按各家文档、连过一个就标出来”。原来的 key 用法都保留。Cursor 官方文档没写登录在哪里触发，页面只写“在 Cursor 的 MCP 设置提示时登录”。ChatGPT 帮助中心那篇 developer mode 文章抓取时返回 403，所以按开发者文档现行的 `chatgpt.com/plugins` → **+** → **Add custom MCP server** 写。
  - 2026-10-16 Howard 决定：文档页和 dashboard 都不再放 ChatGPT、claude.ai 的手动接入步骤（接入页只列编码 agent，Connect 页见 #542，文档页和 API keys 页的说明另开 PR）。调研过的同类产品里，只有 Firecrawl 和 Exa 提到这两个客户端，而且都是通过各自在 ChatGPT 插件目录和 claude.ai connector 目录的上架条目来接入。ROADMAP item 6 的 D4 验收里仍包含这两个客户端。
  - D2：`server.json` 的 `remotes` 加了 `/mcp-oauth`，用 Registry 的 2025-12-11 schema 校验通过。要等下次发版才会推到 Registry。
  - **上线顺序**：这页文档会随下一次 public-preview 部署上线，而 `/mcp-oauth` 由 hosted API（另一个 Cloud Run 服务）提供。两个服务要一起部署，或者先部署 hosted API，否则文档里的地址会返回 404。
- [ ] **D3** 部署前检查（部署要先问 Howard）：
  - `public-preview-proxy` Worker 不缓存 `/oauth/*` 和 `/.well-known/oauth-*`（2026-10 有过它缓存 run.app 子请求 4 小时的记录，需要核实）；
  - octocrawl.dev 的 Cloudflare bot 防护不挡 Claude 的出口 `160.79.104.0/21`；
  - public-preview 冷启动能否在 Claude 的 10 秒超时内响应（查 min-instances）；
  - 给 `oauthClients`、`oauthGrants`、`oauthCodes`、`oauthTokens`、`oauthRefresh`、`oauthNonces` 在 Firestore 上配 `expireAt` 的 TTL 策略（PR ② 只写了字段，没有配策略）。
- D3 只读检查结果（2026-10-16，main `adee17f2`；只读，没有改任何配置）：
  - **Worker 缓存：没问题。** 两个 Worker（`cloudflare/public-preview-proxy`、`cloudflare/hosted-api-proxy`）都只是用 `fetch()` 原样转发，没有用缓存 API。Cloudflare 默认只按扩展名缓存静态文件，OAuth 的路径都没有扩展名，响应也都带 `no-store`。线上实测：`octocrawl.dev/.well-known/oauth-authorization-server`、`/oauth/authorize` 和 `mcp.octocrawl.dev` 的 PRM 各请求两次，都是 `cf-cache-status: DYNAMIC`；对照组 `/docs-assets/docs.css` 是 `MISS`（`max-age=14400`，会进缓存）。所以新加的 `/docs-assets/oauth.css` 和以前的静态文件一样，部署后要 `purge_everything`。
  - **Claude 网段的 bot 防护：配置上没有会拦它的东西，但没能从它的网段实测（未核实）。** `cf bot-management get`：Bot Fight Mode、JS 检测、AI bot 防护都关着。自定义防火墙规则只有一条，是给 AI Assistant 类已验证 bot 在几个公开页面上跳过 BIC 的例外，没有拦截规则。BIC 开着，安全级别 medium。从本机出口用不带 User-Agent、`curl`、`python-httpx`、`node`、`Claude-User` 分别请求两个主机，都没有被挑战。medium 安全级别按 IP 信誉判断，要等 D4 由 claude.ai 实际连一次才能确认。如果想事先排除风险，可以给 `160.79.104.0/21` 在 `/oauth/*`、`/.well-known/oauth-*` 和 `mcp.octocrawl.dev` 上加一条跳过规则，这要 Howard 决定。
  - **冷启动：在 10 秒以内，但余量没算准。** 两个服务都没设 `minScale`（空闲时缩到 0），开了 startup CPU boost，`maxScale` 是 3（hosted API）和 2（public-preview）。public-preview 当天每 30 到 60 分钟就起一次新实例。从 Cloud Logging 看了 6 次冷启动，触发新实例的那一个请求耗时 3.76 到 4.70 秒，之后的请求都是几毫秒；其中 3.76 秒那次就落在 `/.well-known/oauth-authorization-server` 上。冷实例上的 `/oauth/token` 还要再加几次串行的 Firestore 往返，这部分没测，估计仍在 Claude 的 10 秒以内。要留更多余量，可以给 public-preview 设 `min-instances=1`，但会多花钱，这要 Howard 决定。
  - **Firestore TTL：6 个集合都还没有。** `gcloud firestore fields ttls list` 列出的 7 个策略都在别的集合上（`creditCarry`、`creditUsage`、`hostedLeases`、`hostedQuotas`、`publicPreviewQuotas`、`requests`、`sessions`）。部署前要为 `oauthClients`、`oauthGrants`、`oauthCodes`、`oauthTokens`、`oauthRefresh`、`oauthNonces` 各执行一次 `gcloud firestore fields ttls update expireAt --collection-group=<集合> --enable-ttl --project=octopus-w2l-20260924-7r7`。**2026-10-16 已按 Howard 的同意执行**（带 `--async`），6 个策略都已提交，状态见下面的“下次从这里继续”。
  - **另外发现：资源服务已经上线了。** hosted API 现在跑的是 `octocrawl-api-oauthrs-9c97175`（tag `h17oauthrs`），2026-10-16 09:26 UTC 从 main 的 `9c971756`（#535）部署，是别的窗口做的，不是这个窗口。所以 `mcp.octocrawl.dev/mcp-oauth` 已经会回 401 并给出 PRM，但 octocrawl.dev 上的授权服务还没部署（public-preview 是 `r89identity`），OAuth 客户端现在会在发现授权服务那一步失败。文档也还没上线，不会有人被引导过去。等 public-preview 带着 #537、#538、#539 部署，两边就对齐了。
- [ ] **D4** 部署之后用真实客户端各连一次：ChatGPT developer mode、claude.ai custom connector、Claude Code（`/mcp` 登录）、Cursor；能做的话加上 VS Code、Codex。每个都要做两件事：一次 `scrape`，然后去 dashboard 断开，确认之后返回 401。记录写到 `research/hosted/<YYYY-MM-DD>-mcp-oauth-clients-<commit>.md`，写明客户端版本、走的是 CIMD 还是 DCR、代理还是直连、命令、commit。
- 验收：ROADMAP PH item 6 的状态行引用这份记录。

## 未核实（做到时先查）

1. ChatGPT 是否要求工具声明 `securitySchemes`，还是 401 就够。**2026-10-16 查过，按文档做了（R4）。** 查的是 https://developers.openai.com/apps-sdk/build/auth 和 https://developers.openai.com/plugins/reference：文档建议每个工具都声明 `securitySchemes`（即使整个服务器用同一个策略），放在工具对象顶层，参考页另列 `_meta["securitySchemes"]` 作为只读 `_meta` 的客户端的镜像；401 的 `WWW-Authenticate` 用来让 ChatGPT 找到 metadata。文档没有说只返回 401、不声明 `securitySchemes` 行不行，这一点仍未核实，要等 D4 用真实的 ChatGPT 连一次才知道。
2. Cursor 和 VS Code 是否支持 CIMD，以及它们的回调地址。论坛和 issue 里说 VS Code 用 `https://vscode.dev/redirect` 加 `127.0.0.1:33418`，Cursor 桌面版用 `http://localhost:8787/callback`。不确定之前 DCR 必须保留。
3. Codex 和 Windsurf 的 OAuth 细节。
4. 真实客户端是否都发 `resource`，以及 scope 会不会带 `mcp` 以外的值（比如 `offline_access`）。按 A4，`/oauth/authorize` 要求 `resource` 必须等于 `/mcp-oauth`，scope 只能是 `mcp` 或空，不符合就拒绝。如果 D4 里有客户端因此失败，再决定要不要放宽。
5. ChatGPT 会不会按我们只公布 `none` 来选认证方式（它自己的文档写的是 `private_key_jwt`）。服务器不校验 `client_assertion`，所以理论上两种都能通过，要等 D4 实际连一次才能确认。
6. ChatGPT 的 auth 文档说服务器要在根路径 `/.well-known/oauth-protected-resource` 提供 metadata，我们只在带路径后缀的 `/.well-known/oauth-protected-resource/mcp-oauth` 提供，根路径照旧返回 404（决定 4）。ChatGPT 也会读 401 里的 `resource_metadata`，按 MCP 规范应该够了，要等 D4 确认。
7. claude.ai 对授权服务各端点的超时是 10 秒（发现、注册、换 token），刷新是 30 秒（claude.com/docs/connectors/building/authentication）。D3 的冷启动检查要按这个标准。
8. MCP 2026-07-28 版改成了无状态（没有 `initialize`，有 `server/discover`），`/mcp` 现有实现与它兼不兼容，不在本清单范围内，只记一笔。

## 待我决定（Blocked on Howard）

- PR ④ 的部署和发版。

## 下次从这里继续

PR ①（#534）、PR ②（#537）、PR ③（#538）已合并，都在 77777R7/Octocrawl。PR ④ 的 D1、D2 已合并（#539）。D3 的只读检查已做完，结果见 D3 下面。6 个 OAuth 集合的 `expireAt` TTL 已于 2026-10-16 开启，状态为 ACTIVE。Howard 决定暂不加 Claude 网段的 BIC 跳过规则，也暂不设 `min-instances`。

**已部署（2026-10-16）**：public-preview 从 main `adee17f2`（含 #537–#539）构建镜像，部署为 revision `w2l-public-preview-oauth-adee17f2`，tag `r90oauth`，100% 流量；回滚用 `r89identity`。之后做了 `purge_everything`，`favicon.ico` 和 `oauth.css` 都是 MISS。线上检查：授权服务 metadata 返回 200 和 `no-store`；`mcp.octocrawl.dev/mcp-oauth` 返回 401，`WWW-Authenticate` 带 PRM；未登录访问 `/oauth/authorize` 会 303 到 `/signin/?next=…`（这一步之前服务器已经成功读取并校验了 ChatGPT 线上的 CIMD 文档）；用假 code 请求 `/oauth/token` 返回 `invalid_grant`；文档小节和 dashboard 的连接区块都已上线。hosted API 仍是 `h17oauthrs`。

**D4 进行中**：Claude Code 已于 2026-10-16 连通。全程走的是 CIMD；通过连接跑了一次 scrape，用的是这个连接自己的 key，扣 1 个 credit；在 dashboard 断开 22 秒后，客户端收到 401。记录在 `research/hosted/2026-10-16-mcp-oauth-clients-adee17f2.md`。ChatGPT、claude.ai、Cursor 由 Howard 自己连，连完把结果补进同一份记录。四个都连过之后，ROADMAP PH item 6 的状态行引用这份记录，然后发版（`server.json` 进 Registry），发版要 Howard 批准。
