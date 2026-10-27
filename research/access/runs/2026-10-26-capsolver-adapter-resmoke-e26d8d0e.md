# CapSolver adapter re-smoke after the proxy-format and form fixes, 2026-10-26

This is a live re-smoke of the adapter fixes on branch `claude/capsolver-proxy-url` (worktree vigilant-poincare-a52edb). The fixes are:
- the proxy is sent as `scheme://user:pass@host:port`;
- a createTask that CapSolver refuses counts against the page's solves;
- four hint words are added;
- a reCAPTCHA widget's own POST form is posted when its callback leaves the page gated.

It follows `2026-10-26-capsolver-webshare-format-and-c011-fef3d8f8.md`. The cap was at most 3 paid solves across T045, C008 and C011.

## Run

- Source commit `e26d8d0e` (clean), with `npx tsc --build` exit 0 at that commit.
- The API ran from source on port 8862 (`W2L_API_PORT=8862 W2L_ACCESS_GRANT=<grant> node --import tsx packages/api/src/cli.ts`) and was stopped after each run. Ports 8791, 8799 and 8812–8814 were not touched.
- Timing: after the weekly PA rerun (no run-set or pa-weekly process at 04:00:29 UTC) and after captcha-proxyless's C011 test (04:02 UTC). No run-set process was running when either run started.
- Machine: AC power, lid open (`pmset -g batt`, AppleClamshellState No) at 04:29 UTC.
- CapSolver's API went through Clash (`HTTPS_PROXY=http://127.0.0.1:7890`) in both runs.

### Run A: T045 and C008, solver exit `proxy`

- Grant `~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`, SHA-256 `996d980678a7a16376499570295b42b6781547c91212a5eef502dcab68e5c162`:
  - capabilities installed_chrome and third_party_captcha_solver;
  - `solver.egress: "proxy"`;
  - `perSolveUsd` 0.003, `maxSolvesPerCall` 1;
  - budget $0.003 a run and a request.
- Exit: a Webshare sticky session, with `W2L_SOLVER_PROXY` of shape `http://<user>-us-<sid>:<pass>@23.81.44.13:80` (sid 815932).
  - This Mac's resolver forges `p.webshare.io`: at 03:06 UTC it returned 2a03:2880:…:face:b00c… and 128.242.240.20. The browser's forwarder therefore needs a gateway IP.
  - Every rung left through the forwarder (`egress_proxy` source `pool`, 127.0.0.1:57241).
- Exit IP, checked with the same login against api.ipify.org, direct: 97.243.183.239 both before the run (04:29:53) and after it (04:31:45).
- Command: `W2L_API_URL=http://127.0.0.1:8862 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm webshare+solver --set all --only T045,C008 --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`. It ran 04:29:54 → 04:31:25 UTC, exit 0.
- Run directory: `runs/2026-10-26T04-29-54-935Z`, copied next to this record.

### Run B: C011, solver exit `none`

- Grant `~/Code/w2l/.w2l/access/capsolver-grant-c011-2026-10-26.json`, SHA-256 `6b177621a4b59c283a2f6467653022fe42d8dc6b94a1832b7ef955e171e6e71a`, the same as in the earlier C011 test.
- `W2L_SOLVER_PROXY` was unset. Every rung went through Clash (`egress_proxy` source `environment`, 127.0.0.1:7890).
- Command: the same as run A, with `--arm proxyless+solver --only C011 --grant ~/Code/w2l/.w2l/access/capsolver-grant-c011-2026-10-26.json`. It ran 04:33:18 → 04:35:08 UTC, exit 0.
- Run directory: `runs/2026-10-26T04-33-18-250Z`.

## Free check before the runs (03:06 UTC)

- One sticky session id went through three gateway IPs, direct from this Mac: 23.81.44.13, 23.81.44.182 and 23.106.231.9. Each gave the same exit IP (65.31.126.220), and 23.81.44.13 gave it again afterwards.
- So from this one client, the session id pins the exit whatever gateway it enters by.
- Webshare's docs say "The same session ID will route to the same exit IP" (apidocs.webshare.io/proxy-connection) and nothing about gateways.
- Not shown: whether CapSolver, entering from its own servers, gets the same exit.

## CapSolver balance

| When (UTC) | Balance |
| --- | --- |
| 04:29:53 (before run A) | $9.9968 |
| 04:31:45 (after run A) | $9.9968 |
| 04:33:17 (before run B) | $9.9968 |
| 04:35:08 (after run B) | $9.9960 |

- Billed: $0.0008, one ReCaptchaV2 task at the published $0.80 per 1,000.
- Ledger charge: $0.003, the tariff.
- Paid solves: 1, against the cap of 3.
- Total CapSolver spend in this round: $0.0040.

## Result

### T045 idealista (DataDome)

- CapSolver called: no.
  - http: `bot_detected_generic` (403).
  - browser_local: `navigate_failed`. page.goto timed out after 20 s through the exit, so no challenge was read.
  - installed_chrome: not reached.
- Solution, injection, judged again: none.
- Outcome: failed, `timeout`.
- Seconds added: 0.

### C008 scrapingcourse (Cloudflare challenge)

- CapSolver called: yes, on browser_local, trigger gate. createTask was refused: `ERROR_PROXY_CONNECT_REFUSED`, hint `proxy+connect_failed`. No task was created, $0.
- Solution: no. Injected: no. Judged again: no.
- Outcome: `solver_failed`.
  - installed_chrome (Chrome 156): `unsupported`, `browser_version_unsupported`.
  - The answer: blocked `cloudflare_challenge` (403).
- Seconds added: 1.4.

### C011 Google reCAPTCHA demo

- CapSolver called: yes, on browser_local, trigger gate. installed_chrome then stopped at `limit_reached` (max_solves_per_call).
- Solution: yes, a token (`vendorUserAgent: other`).
- Injected: yes. The callback ran, then the widget's POST form was posted (redirect chain demo → demo).
- Judged again:
  - The gate passed (`blockReasonAfter: null`, outcome `cleared`).
  - The region wait's task-contract check `markdownMatches "Verification Success"` **passed** on the live page.
- Outcome:
  - The rung's result was `failed`, `empty_unverified`. The page's text was 31 characters, extract confidence 0 and markdown empty, so the ladder went on.
  - installed_chrome reloaded the demo and got the captcha again.
  - The answer: blocked `captcha`, verified 0 of 1.
- Seconds added: 93.7.

## Reading

**C011.**
- This is the first page that CapSolver's answer cleared for Octocrawl. After the token and the posted form, the live page passed both the gate and the task's contract check.
- The answer did not carry it. browser_local read the 31-character success page as empty (`empty_unverified`), and the ladder moved on to a rung that loaded the page afresh.
- That is a defect in extraction, or in how the ladder handles a solved page, not in the solver adapter. It is not fixed here.

**C008.**
- Through the gateway IP, the URL form (`http://<login>@23.81.44.13:80`) was refused the same way as the colon form.
- In the 2026-10-26 probe, the only accepted shape was the URL form with the hostname `p.webshare.io`.
- So CapSolver needs both the URL form and the hostname; the IP is not enough. That rests on one observation of each.
- The adapter fix in this branch is necessary but not sufficient on this Mac, where the forwarder cannot use the hostname.

**T045.** The DataDome path was not exercised: the page did not load through the exit within 20 s. It was not retried.

**Gate (a solve clears a page).** The solve cleared C011's page on the live page, as the contract check shows, but Octocrawl's answer was blocked. Whether that meets the gate is Howard's decision.
