# CapSolver after #718: the C011 fix, DataDome over SOCKS5, the gateway's region and the duplicate cookie; T045 and C008, 2026-10-26

Follows `2026-10-26-capsolver-hostname-exit-9423448c.md`. The coordinating session asked for three follow-ups after PR #718 (squash-merged as `906af728`): C011's solved page read as empty, DataDome's refused exit (T045), and Cloudflare's cookie that did not clear (C008). The cap was 3 paid CapSolver solves for the whole task; 3 were spent.

## Source and setup

- Branch `claude/capsolver-solved-page` from `origin/main` `906af728`, worktree determined-sammet-b2ef84. Commits:
  - `24621e08`: C011 fix (a page with no main content whose whole page holds the task contract);
  - `72070144`: `W2L_SOLVER_PROXY_SCHEME=socks5`, and docs on the gateway's region;
  - `a25f023d`: a solved cookie replaces the site's own cookie of that name on a parent domain.
- Each run was made at its commit, clean, after `npx tsc --build` exit 0; run-set's build check said `upToDate: true`.
- This worktree had no `node_modules` of its own until `npm ci` at 05:10 UTC; before that, `tsc` resolved `@w2l/*` to the main checkout. Every run below came after it. Vitest resolves `@w2l/*` to this worktree's sources by alias, so the earlier test runs were valid.
- The API ran from source on port 8862 (`node --import tsx packages/api/src/cli.ts`, `W2L_API_PORT=8862`, `W2L_ACCESS_GRANT=<grant>`) and was stopped after each run. Ports 8791, 8799 and 8812–8814 were not touched.
- Machine: AC power, lid open (`pmset -g batt`, AppleClamshellState No) at 05:13 and 05:26 UTC. No run-set or pa-weekly process was running at either check.
- CapSolver's API went through Clash (`HTTPS_PROXY=http://127.0.0.1:7890`). Every rung of every run left through the solver forwarder (`egress_proxy` source `pool`).
- Grant: `~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`, SHA-256 `996d980678a7a16376499570295b42b6781547c91212a5eef502dcab68e5c162` (egress `proxy`, `maxSolvesPerCall` 1, $0.003 a run and a request).
- Exit: one Webshare sticky session, sid 514315, chosen at 05:11 UTC before any probe or run, used for every live step. Proxy strings are given by shape only.
- Run directories were copied next to this record: `runs/2026-10-26T05-16-59-933Z` (T045 A), `runs/2026-10-26T05-21-32-884Z` (T045 B), `runs/2026-10-26T05-26-58-893Z` (C008). A scan of them and of the API logs for the CapSolver key, the Webshare password and the Webshare user name found none.

## CapSolver balance

| When (UTC) | Balance | Step |
| --- | --- | --- |
| 05:02:13 | $9.9948 | start of the task |
| 05:14:49 | $9.9948 | before the DataDome probe |
| 05:15:20 | $9.9923 | after the probe (accepted and solved) |
| 05:16:32 | $9.9923 | before T045 run A |
| 05:17:45 | $9.9923 | after T045 run A (createTask refused, no task) |
| 05:20:53 | $9.9923 | before T045 run B |
| 05:21:52 | $9.9898 | after T045 run B |
| 05:26:14 | $9.9898 | before C008 |
| 05:27:21 | $9.9898 | just after C008 (not yet billed) |
| 05:27:59 | $9.9886 | after C008, billed |

- Billed: $0.0025 (probe, DatadomeSliderTask) + $0.0025 (T045 B, DatadomeSliderTask) + $0.0012 (C008, AntiCloudflareTask) = $0.0062.
- Paid solves: 3, against the cap of 3.
- The ledger charged the $0.003 tariff for each of the two ladder solves.
- The refused createTask (T045 A) created no task and the balance did not change, as CapSolver says.
- Total CapSolver spend this round: $0.0052 before this task, $0.0114 after.

## 1. C011: a solved page discarded as empty (code; no live run)

**Cause.**
- `packages/bench/src/subjects/browserLocal.ts`, the `extracted.escalate` branch (lines 1458–1476 at `906af728`), returns `failed`/`empty_unverified` for any page with no main content when `onlyMainContent` is the default, whatever the request's contract says.
- `packages/bench/src/routing/ladder.ts:213` (`strongerRungMayAnswer`) sends `empty_unverified` from a browser rung on to the next rung.
- On C011 (record e26d8d0e), the region wait's contract check passed on the live page and the page was then lost this way.

**Fix (`24621e08`).** Such a page now answers `success` with its whole-page Markdown only when all of these hold (`wholePageChosen`, `packages/bench/src/subjects/candidateExtraction.ts`):
- the request has a contract with a Markdown check;
- readiness says `not_extracted` with `region_ready`, so the live page held the contract;
- the whole page's Markdown holds the contract, with every check judged and passed.

The page also gets an `extraction_candidates` event (`selected: "document"`, `replaced: true`), so the API's page cache does not keep it.

Pages that stay failed, as before:
- no contract;
- a contract that fails;
- no Markdown check;
- a check the Markdown cannot judge (`json.*`);
- a region that did not hold;
- `includeTags`;
- `onlyMainContent: false`, which already returned the whole page;
- a paginated list;
- a capture cut short by its deadline.

**Tests.**
- `browserLocal.test.ts`: a local fixture of the solved demo's page, 31 characters.
- `candidateExtraction.test.ts`: every condition above.
- `captchaSolver.integration.test.ts`: a mock reCAPTCHA form whose POST answers with that page, through a mock CapSolver.
- The fixture test and the integration test both failed before the fix. Each was run with the fix reverted and gave `failed`/`empty_unverified`. Both pass with it.

**Live.** C011 was not run again: no paid solve was left for it.

## 2. DataDome (T045, idealista)

### Documentation (read by a scout subagent with WebFetch, which summarises; quotes may not be verbatim)

- CapSolver DataDome guide (docs.capsolver.com/en/guide/captcha/datadome/):
  - The proxy is required: "This task type require your own proxies." No scheme, port or residential rule is stated.
  - Its troubleshooting advises a sticky proxy over a rotating one.
  - `captchaUrl` must be `t=fe`; `t=bv` "means that your ip is directly banned".
  - `userAgent` "needs to be the same as the userAgent you use to request the website", from its fixed list: Windows Chrome 140–155, Windows Firefox 150–157, Mac Chrome 150–155.
  - The solution is one Set-Cookie line, `datadome=…; Max-Age=…; Domain=; Path=/; Secure; SameSite=Lax`.
  - `ERROR_PROXY_CONNECT_REFUSED` is not documented there or in the API error list.
- CapSolver proxy guide (…/guide/api-how-to-use-proxy/): SOCKS4, SOCKS5, HTTP and HTTPS are accepted, including `socks5://user:pwd@ip:port`. No per-task table of proxy types is given.
- Webshare: "All connection types support HTTP and SOCKS5 Proxy Protocols on the same port." (help.webshare.io, connection types). Ports 80, 1080, 3128 and 9999–19999 (apidocs.webshare.io/proxy-connection).

### Free checks (direct from this Mac, sid 514315)

- Through the us-east-1 gateway, Webshare answered 200 to CONNECT for geo.captcha-delivery.com, www.idealista.com, api-js.datadome.co and www.scrapingcourse.com. Webshare does not refuse these hosts.
- At the same minute, the ap-northeast-1 gateway answered 502 for every host on this sid; its exit there had gone.
- HTTP and SOCKS5, on ports 80 and 1080 of the us-east-1 gateway, all left from the same exit, 107.212.79.67.
- idealista's DataDome sets its own cookie as `datadome; Domain=.idealista.com; Path=/` (Set-Cookie attributes read, value not).

### Probe: DatadomeSliderTask createTask, 05:14:57 UTC (scratch script, no browser)

- `captchaUrl`: fetched fresh through the us-east-1 gateway 107.173.193.134 (exit 107.212.79.67). The site answered 403 with a `dd` object, `rt: c`, `t: fe`.
- `userAgent`: Mac Chrome/151, the browser_local UA. Not exact-matched against CapSolver's list strings.
- Order planned: (1) `socks5://<user>-us-<sid>:<pass>@p.webshare.io:1080`; (2) `http://…@p.webshare.io:3128`; (3) `p.webshare.io:80:<user>-us-<sid>:<pass>`; (4) `http://…@<us-east-1 gateway IP>:80`.
- Form 1 was **accepted**: a task was created, `ready` in 4.8 s.
  - Solution keys: `cookie` (name `datadome`; attributes max-age, domain (empty), path, secure, samesite).
  - No `userAgent` came back.
  - Billed $0.0025.
- Forms 2–4 were not sent.

### T045 run A: commit `24621e08`, 05:16:59 → 05:17:36 UTC

- `W2L_SOLVER_PROXY` shape: `http://<user>-us-514315:<pass>@p.webshare.io:80`, `W2L_SOLVER_PROXY_ADDRESS` 107.173.193.134 (us-east-1).
- Command: `W2L_API_URL=http://127.0.0.1:8862 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm webshare-useast+solver --set all --only T045 --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`, exit 0.
- CapSolver was called on browser_local (trigger gate, `datadome_captcha`). createTask was **refused**: `ERROR_PROXY_CONNECT_REFUSED`, hint `proxy+connect_failed`. No task, $0.
- installed_chrome went through its challenge wait (19.1 s, still gated). Its solve was `unsupported` (`no_challenge_parameters`, `bot_detected_generic`).
- The answer: blocked `bot_detected_generic` (403). Wall 36.6 s. Seconds the solve step added: 2.0.
- **Reading.**
  - The same sid, through the same CapSolver servers, two minutes apart: `socks5://…@p.webshare.io:1080` was accepted, `http://…@p.webshare.io:80` was refused.
  - The scheme and the port changed together, so which of them matters is not separated.
  - The 04:45 refusal (sid 193297) was of the same http-port-80 form.

### T045 run B: commit `72070144`, 05:21:32 → 05:21:51 UTC

- `W2L_SOLVER_PROXY` shape: `http://<user>-us-514315:<pass>@p.webshare.io:1080`, address 107.173.193.134, `W2L_SOLVER_PROXY_SCHEME=socks5`.
  - The browser went over HTTP to 107.173.193.134:1080.
  - CapSolver was given `socks5://<user>-us-514315:<pass>@p.webshare.io:1080`, the probe's accepted form.
  - The startup line said "dialled at 107.173.193.134 and given to capsolver as socks5".
- Command: as run A, with `--arm webshare-useast-socks5+solver`; exit 0.
- CapSolver was called on browser_local (trigger gate). Task **accepted**.
- Solution: yes, a cookie. CapSolver named no User-Agent.
- Injected: yes, the cookie was set and the page reloaded.
- Judged again: still `captcha` (403), outcome `still_gated`. The second solve stopped at `limit_reached`.
- installed_chrome: `navigate_failed`, `net::ERR_EMPTY_RESPONSE` through the exit.
- The answer: failed `connection_error`. Verified 0 of 1. Wall 18.4 s. Seconds added: 5.6. Billed $0.0025.

### The duplicate cookie (found after run B, fixed in `a25f023d`, not run live on T045)

- The adapter set CapSolver's cookie, which has an empty `Domain=`, for www.idealista.com alone (`injectAnswer`, `packages/bench/src/vendors/captchaSolver.ts:385–397` at `906af728`).
- The browser already held DataDome's own `datadome` on `.idealista.com`. It then holds two cookies of that name, both with path `/`, and sends both, the older first (RFC 6265 §5.4).
- A server that reads the first gets the old, flagged cookie.
- The local test (`captchaSolver.integration.test.ts`, a site that sets `datadome` on `.shop.example` and reads the first one sent) reproduced run B's `still_gated` before the fix and clears after it.
- Whether idealista reads the first is not known. Whether this was run B's cause is not shown.
- T045 was not run again with the fix: the one paid solve left went to C008, which the task allowed once after a fix.

## 3. Cloudflare's challenge (C008, scrapingcourse)

### Documentation

- CapSolver AntiCloudflareTask guide (…/guide/captcha/cloudflare_challenge/):
  - The proxy is required, "static proxy or sticky proxy instead of rotating proxy", with a session of at least 3 minutes.
  - The User-Agent: "please keep it the same as the one you are using".
  - "You have to use the TLS request library to request the target website."
  - The solution is `cookies.cf_clearance`, `token` (the same value) and `userAgent`.
  - Nothing on `sec-ch-ua`, `accept-language`, JA3/JA4, the cookie's domain or path, its lifetime, or using it in a browser.
- Cloudflare (developers.cloudflare.com/cloudflare-challenges/concepts/clearance/, updated 2026-10-23): `cf_clearance` is "tied to the specific visitor and device it was issued to".
- Cloudflare: JavaScript Detections also issue a `cf_clearance` (…/challenge-types/javascript-detections/). A browser that ran a challenge page may hold one of its own.

### What the adapter sends and injects, against those

| Requirement | The adapter | Status |
| --- | --- | --- |
| Same proxy and IP | Sends the run's exit by hostname. The browser dials the forwarder's address. | Not the same before this task: see the region check below. |
| Same User-Agent | Sends the browser's own UA. | CapSolver returned the same UA (`vendorUserAgent: same`, 04:45 and 05:26). |
| `sec-ch-ua` and other headers | Playwright's Chromium sends its own. | Not compared; CapSolver states nothing. |
| TLS fingerprint | The browser's own (Chromium 151). | CapSolver asks for a "TLS request library". Not compared. |
| Cookie domain and path | `cf_clearance` comes with no domain. It was set for the page's host, path `/`. Since `a25f023d` it takes the place of a same-name cookie on a parent domain, if the browser holds one. | Whether C008's browser held its own `cf_clearance` was not recorded. |
| Other parts of the solution | Every entry of `cookies` is set. `token` (the same value) is not used. | — |

### The gateway's region (free checks, 05:11–05:13 UTC)

- `p.webshare.io` is a geo-DNS name, checked with Google DoH through Clash and `edns_client_subnet`:
  - for CapSolver's listed subnets 47.253.53.0/24, 47.252.73.0/24 and 47.89.153.0/24, it resolves to `us-east-1.proxy.socks5.webshare.io` gateways;
  - for this Mac's (23.81.44.0/24), it resolves to `ap-northeast-1` ones.
  - What CapSolver's own resolver returns is not known.
- One sticky sid, direct from this Mac:
  - sid 514315: 75.191.168.175 through ap-northeast-1 gateway 23.81.44.13, twice; 107.212.79.67 through three us-east-1 gateways (107.173.193.134, 69.67.148.27, 216.227.176.202).
  - sid 890134: 98.147.209.174 through two us-east-1 gateways; 172.58.127.125 through ap-northeast-1 gateway 23.106.231.9. The first try at 23.81.44.13 timed out.
- So the session id pins the exit only within one region of gateways. This corrects the earlier reading, that the exit holds "whatever gateway it enters by" (record e26d8d0e). That reading came from three ap-northeast-1 gateways only.
- In every earlier run the browser dialled 23.81.44.13 (ap-northeast-1), while CapSolver, given the hostname, most likely reached a us-east-1 gateway, and so another exit. Not confirmed: CapSolver's exit was never observed.
- `docs/access.md` said the exit "is fixed by the session id in the login, not by the gateway". It now says it holds within one region, and that `W2L_SOLVER_PROXY_ADDRESS` should be a gateway of the region CapSolver reaches.

### C008 run: commit `a25f023d`, 05:26:58 → 05:27:20 UTC

- Exit: `W2L_SOLVER_PROXY` shape `http://<user>-us-514315:<pass>@p.webshare.io:80`, address 107.173.193.134 (us-east-1), no scheme option. This is the form CapSolver had accepted for Cloudflare.
- Command: as run A, with `--only C008`; exit 0.
- CapSolver was called on browser_local, trigger gate, `cloudflare_challenge`. Task accepted.
- Solution: yes, cookies (`vendorUserAgent: same`).
- Injected: yes, the cookies were set and the page reloaded.
- Judged again: **cleared** (`blockReasonAfter: null`).
  - The region wait's contract check `markdownMatches` passed.
  - The page was extracted as content: confidence 1, 62 visible characters.
- The answer: **`success`, verification `passed`**, delivered by browser_local. Run-set: verified 1 of 1, falseSuccess 0, `verifiedFromPaidCall` 1.
- Wall 21.9 s. Seconds the solve step added: 12.8. Billed $0.0012.
- **What is not isolated.**
  - Two things changed since 04:45, when the same flow stayed gated: the browser's exit (now a us-east-1 gateway) and the cookie replacement. Which one, or both, made the difference is not separated.
  - The browser had the challenge page open during the 12.8 s solve. Whether Chromium's own challenge run contributed is not known.
  - In the two earlier browser_local attempts on C008 (2026-10-25 smoke and 04:45 today), Chromium did not clear it on its own within a similar time. Both were on other exits.

## Per task

| | CapSolver called (rung) | Solution back / injected | Re-judged | Final answer | Seconds added | Balance delta |
| --- | --- | --- | --- | --- | --- | --- |
| DataDome probe (no browser) | yes (API only) | cookie / not injected (probe) | — | — | 4.8 (solve) | −$0.0025 |
| T045 A | yes, browser_local | refused createTask / no | no | blocked `bot_detected_generic` | 2.0 | $0 |
| T045 B | yes, browser_local | cookie / yes | still `captcha` | failed `connection_error` | 5.6 | −$0.0025 |
| C008 | yes, browser_local | cookie / yes | cleared | **success, verified** | 12.8 | −$0.0012 |
| C011 | not run | — | — | — | — | — |

## Gate

- One page ended verified in a final answer after a solve: C008 at 05:27 UTC. The solve's outcome was `cleared`, and the answer was `success` with its contract passed.
- That the solve alone cleared it is not isolated (see above).
- Whether this meets Howard's gate for the two-window measurement is Howard's decision.

## Not done, for Howard or a later session

- T045 with the cookie fix (`a25f023d`) and the socks5 exit: one DataDome solve, about $0.0025.
- C011 live with the C011 fix: one reCAPTCHA v2 solve, about $0.0008.
- C008 again, to separate the region from the cookie fix: for example once with the ap-northeast-1 gateway at `a25f023d`.
- Which of scheme and port CapSolver's DataDome task needs: `http://…@p.webshare.io:1080` was never sent.
- CapSolver's own exit for a hostname proxy was never observed. Only CapSolver can say which gateway its servers reach, and whether the DataDome and Cloudflare solvers run in the same region.
- Out of scope, listed only: the harness counts no attempt for a refused createTask (the measurement session's harness, on research/captcha-solver-measure).
