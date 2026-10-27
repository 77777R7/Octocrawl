# CapSolver confirmation run before #719 merges: T045, C008 and C011 on the windows' exit setup, 2026-10-26

Follows `2026-10-26-capsolver-socks5-region-cookie-a25f023d.md`. Howard approved one confirmation run before #719 merges (relayed by the coordinating session): T045, C008 and C011 once each, on one exit setup, the one the two measurement windows will use. At most 3 paid solves, no retries.

## Setup

- Source: #719's head `a25f023d`, clean, `npx tsc --build` exit 0 at 05:49 UTC. run-set's build check said `upToDate: true` in each record.
- Machine: AC power, lid open (`pmset -g batt`, AppleClamshellState No) at 05:49 UTC. No run-set or pa-weekly process was running before each task.
- The API ran from source on port 8862 (`node --import tsx packages/api/src/cli.ts`), once per task, with the same environment each time. It was stopped after each task. Ports 8791, 8799 and 8812–8814 were not touched.
  - One API run per task because the grant's run budget ($0.003) holds one solve.
- Grant: `~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`, SHA-256 `996d980678a7a16376499570295b42b6781547c91212a5eef502dcab68e5c162`: egress `proxy`, `maxSolvesPerCall` 1, $0.003 a run and a request.
- Exit, the same for all three tasks, chosen before the first:
  - Sticky sid 763780, chosen at 05:50:03 UTC.
  - `W2L_SOLVER_PROXY` shape `http://<user>-us-763780:<pass>@p.webshare.io:1080`.
  - `W2L_SOLVER_PROXY_ADDRESS` 107.173.193.134, a us-east-1 gateway.
  - `W2L_SOLVER_PROXY_SCHEME=socks5`: CapSolver was given `socks5://<user>-us-763780:<pass>@p.webshare.io:1080`.
  - The startup line said: "every rung leaves through the solver exit p.webshare.io:1080, dialled at 107.173.193.134 and given to capsolver as socks5 from its first request".
  - Every rung left through the forwarder (`egress_proxy` source `pool`).
- Exit IP, checked with the same login through 107.173.193.134:1080, direct, at 05:50:06 UTC: 150.221.90.49, over both HTTP and SOCKS5. The exit CapSolver saw was not observed.
- CapSolver's API went through Clash (`HTTPS_PROXY=http://127.0.0.1:7890`).
- Command per task: `W2L_API_URL=http://127.0.0.1:8862 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm webshare-useast-socks5-confirm+solver --set all --only <task> --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`. Each exited 0.
- Run directories were copied next to this record:
  - `runs/2026-10-26T05-50-58-053Z` (T045);
  - `runs/2026-10-26T05-52-46-437Z` (C008);
  - `runs/2026-10-26T05-55-18-955Z` (C011).
- A scan of them and of the three API logs for the CapSolver key, the Webshare password and the Webshare user name found none.

## Free check before the runs: Webshare refuses www.google.com

- At 05:50:10 and 05:50:22 UTC, through 107.173.193.134 with sid 763780, Webshare answered CONNECT for www.idealista.com, www.scrapingcourse.com, geo.captcha-delivery.com and www.gstatic.com with 200, and **reset the connection for www.google.com** (ECONNRESET), twice.
- The same happened with sid 514315.
- A SOCKS5 request for `https://www.google.com/recaptcha/api2/demo` through 107.173.193.134:1080 failed too (curl exit 35, no HTTP status).
- C011 (Google's demo) was run anyway, on the same setup, as asked.

## CapSolver balance

| When (UTC) | Balance | Step |
| --- | --- | --- |
| 05:50:56 | $9.9886 | before T045 |
| 05:51:43 | $9.9861 | after T045 (no change at 05:52:23) |
| 05:52:45 | $9.9861 | before C008 |
| 05:54:25 | $9.9861 | just after C008 (not yet billed) |
| 05:55:06 | $9.9849 | after C008, billed |
| 05:55:17 | $9.9849 | before C011 |
| 05:58:21 | $9.9849 | after C011 (no change at 05:59:02) |

- Billed: $0.0025 (T045, DatadomeSliderTask) + $0.0012 (C008, AntiCloudflareTask) = $0.0037.
- Paid solves: 2, against the cap of 3.
- The ledger charged the $0.003 tariff for each.
- Total CapSolver spend this round: $0.0151.

## Results

### T045 idealista (DataDome): 05:50:57 → 05:51:40 UTC

- CapSolver called: yes, on browser_local, trigger gate (`datadome_captcha`). The socks5 exit was accepted.
- Solution: yes, a cookie.
- Injected: yes. The cookie was set, in place of DataDome's own `datadome` cookie on the parent domain if the browser held one (a25f023d), and the page was reloaded.
- Judged again: still `captcha` (403), outcome `still_gated`. The second solve stopped at `limit_reached`.
- installed_chrome: `navigate_failed`, page.goto timed out after 20 s through the exit.
- The answer: failed `timeout`, verification `failed` (`page_not_read`), readiness `not_served`.
- Wall 41.9 s. Seconds the solve step added: 5.9. Balance delta −$0.0025.

### C008 scrapingcourse (Cloudflare's challenge): 05:52:46 → 05:54:22 UTC

- CapSolver called: yes, on browser_local, trigger gate (`cloudflare_challenge`).
  - **AntiCloudflareTask over socks5 was accepted.** This was the first time it was tried.
- Solution: yes, cookies (`vendorUserAgent: same`).
- Injected: yes, the cookies were set and the page reloaded.
- Judged again: **cleared** (`blockReasonAfter: null`).
  - The region wait's contract check `markdownMatches` passed.
  - The page was extracted as content: confidence 1, 62 visible characters.
- The answer: **`success`, verification `passed`**, readiness `ready`, delivered by browser_local. run-set: verified 1 of 1, falseSuccess 0, `verifiedFromPaidCall` 1.
- Wall 96.0 s. The http rung took 73.0 s to be blocked (`cloudflare_challenge`, 403).
- Seconds the solve step added: 17.2. Balance delta −$0.0012.
- **What is not isolated:** that the solve alone cleared the page. Chromium had the challenge page open during the 17.2 s solve, and Chromium's own pass is not ruled out. The earlier record says why that is less likely.

### C011 Google's reCAPTCHA v2 demo: 05:55:18 → 05:58:18 UTC

- CapSolver called: no. No paid call was recorded, and the balance did not change.
- Solution: none. Injected: no. Judged again: no.
- The answer: none.
  - run-set's request to the API was aborted after its 180 s client timeout (`TimeoutError: The operation was aborted due to timeout`). The API's own ladder budget is 300 s, so no response was saved.
  - The API process was stopped after the task, and no trace was kept.
  - run-set recorded it as not verified.
- Wall 179.9 s (the client timeout). Seconds added: 0. Balance delta $0.
- Cause, most likely: Webshare resets connections to www.google.com, as the free check before the run showed. Not confirmed from the run itself, which left no trace. The task was not retried.

## Per task

| | CapSolver called (rung) | Solution / injected | Re-judged | Final answer, verification | Seconds added | Balance delta |
| --- | --- | --- | --- | --- | --- | --- |
| T045 | yes, browser_local | cookie / yes | still `captcha` | failed `timeout`, failed | 5.9 | −$0.0025 |
| C008 | yes, browser_local | cookies / yes | cleared | **success, passed** | 17.2 | −$0.0012 |
| C011 | no | — / — | — | none (client timeout at 180 s) | 0 | $0 |

## Gate

- **One task ended verified after a solve: C008.**
- That is the second time C008 has cleared after a solve on a us-east-1 gateway at `a25f023d`. The first, at 05:27 UTC, used the http scheme. This one used socks5.
- T045 did not end verified: the DataDome cookie was injected and the page stayed gated, as at 05:21 before the cookie fix.
- C011 did not end verified: the page was not reached through this exit.

## For the windows' setup (not changed here)

- **Webshare does not carry www.google.com.** So C011, and any Google-hosted task, cannot be read through this exit. Under this setup that is an access failure, not a solver result.
- **DataDome (T045).** CapSolver accepts the exit over socks5 and returns a cookie. The page stays gated after injection. No cause was found in this run, and no code fix is known.
- **run-set's 180 s per-task client timeout is shorter than the API's 300 s ladder budget.** A slow task is recorded with no response or trace (C011 here; C008's http rung alone took 73 s).
