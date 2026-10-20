# Access task set run: all, 2026-10-20

- Command: `node research/access/run-set.mjs --set all --only T001,T047 --access "enhanced" --save-responses --record research/access/runs/2026-10-20-pa-b-steel-doc-capture-c8087c03.md`
- Source commit: `c8087c03`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8803; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-20T03:54:28.512Z → 2026-10-20T03:55:47.798Z
- Tasks: 2 (set `all`, only T001, T047); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 2, attempted 2, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 2 | 0 | 0 | 54827 | 54827 | unknown | unknown |

- Paid provider calls (cold): 2; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0020 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 2, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 2 (time left at its start: median 299997 ms, least 299997 ms); browser_local on 2 (time left at its start: median 298935 ms, least 298935 ms); provider on 2 (time left at its start: median 296814 ms, least 296814 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 24453 | steel: blocked/captcha (answer) | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 54827 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 2 of 2 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Document capture on the Steel rung (PA B acceptance, docs/pa-enhancement-tasks.md B)

- API started from this checkout at `c8087c03` (branch `claude/pa-b-doc-capture`): `W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/steel-grant.json W2L_VENDORS=steel node --import tsx packages/api/src/cli.ts --port 8803`, with the proxy variables above (Clash), stopped after the run.
- Grant checked before the run: capabilities `compatible_transport`, `vendor_remote_browser`, `vendor_stealth`; `vendor_residential_proxy` not listed, so Steel's proxies were off. Tariff $0.10 per browser hour, per-ms billing, `perRunUsd` 1.
- Cost: $0.0020 charged by the spend ledger for 2 Steel calls (the grant's tariff estimate, not Steel's bill).
- Read from each saved response's per-attempt trace (`capture` events), `.w2l/access/runs/2026-10-20T03-54-28-512Z/responses/` (git-ignored):

| Task | Rung | Capture | documentGeneration | responseMatch | Result httpStatus | Content type |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | http | http_body | (not set on HTTP) | (not set on HTTP) | 403 | text/html |
| T001 | browser_local | browser_dom | 1 | matched | 403 | text/html; charset=UTF-8 |
| T001 | provider (steel) | browser_dom | 1 | matched | 403 | text/html |
| T047 | http | http_body | (not set on HTTP) | (not set on HTTP) | 403 | text/html; charset=UTF-8 |
| T047 | browser_local | browser_dom | 1 | matched | 403 | text/html; charset=UTF-8 |
| T047 | provider (steel) | browser_dom | 2 | matched | 403 | text/html; charset=UTF-8 |

- Each Steel capture has a `responseMatch` value, and the result's `httpStatus` is the status of the document read. On T047 the Cloudflare check loaded a second document under Steel (generation 2), which also answered 403. Before this change the rung would have reported the first `goto` response, which here was also 403, so this run shows no change in the verdict. It shows only that the remote rung follows the document on screen.
- The provider rung's `usage.bytesWire` is null on both (G1, provider part).
- Neither task was verified (T001 blocked `captcha`, T047 blocked `cloudflare_challenge`), as in the P0.4 weekly Steel arm.
