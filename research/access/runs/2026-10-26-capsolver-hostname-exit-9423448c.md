# CapSolver through the hostname exit (W2L_SOLVER_PROXY_ADDRESS), T045 and C008, 2026-10-26

Follows `2026-10-26-capsolver-adapter-resmoke-e26d8d0e.md`. There, CapSolver refused C008's exit in URL form with the gateway IP as host, and accepted only the hostname `p.webshare.io`. This run tests the follow-up fix in PR #718: the forwarder dials a pinned gateway IP (`W2L_SOLVER_PROXY_ADDRESS`), and CapSolver is given the hostname. The coordinating session approved it on 2026-10-26: T045 and C008 once each, the PR's paid solves at most 3 in total (2 left), no retries.

## Run

- Source commit `9423448c` (branch `claude/capsolver-proxy-url`, clean), `npx tsc --build` exit 0 at that commit. The API ran from source on port 8862, as before, and was stopped afterwards. Ports 8791, 8799 and 8812–8814 were not touched.
- No run-set or pa-weekly process was running, the weekly rerun had ended at 04:00 UTC, and the machine was on AC power with the lid open (`pmset -g batt`, AppleClamshellState No) at 04:44 UTC.
- Grant: `~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`, SHA-256 `996d980678a7a16376499570295b42b6781547c91212a5eef502dcab68e5c162`: egress `proxy`, `maxSolvesPerCall` 1, $0.003 a request.
- Exit, chosen before the run:
  - `W2L_SOLVER_PROXY` had the shape `http://<user>-us-<sid>:<pass>@p.webshare.io:80`, with sticky sid 193297.
  - `W2L_SOLVER_PROXY_ADDRESS` was `23.81.44.13`, the gateway IP the forwarder dialled.
  - The startup line said: "every rung leaves through the solver exit p.webshare.io:80, dialled at 23.81.44.13 from its first request".
  - Every rung left through the forwarder (`egress_proxy` source `pool`, 127.0.0.1:59619).
- Exit IP, checked with the same login through 23.81.44.13 against api.ipify.org, direct: 24.161.244.24 both before the run (04:45:08) and after it (04:47:06). The exit CapSolver saw from its own servers was not observed.
- CapSolver's API went through Clash (`HTTPS_PROXY=http://127.0.0.1:7890`).
- Command: `W2L_API_URL=http://127.0.0.1:8862 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm webshare-host+solver --set all --only T045,C008 --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-smoke.json`. It ran 04:45:09 → 04:46:47 UTC, exit 0.
- Run directory: `runs/2026-10-26T04-45-09-298Z`, copied next to this record. A scan for the Webshare password and the CapSolver key in it found neither.

## CapSolver balance

| When (UTC) | Balance |
| --- | --- |
| 04:45:08 (before) | $9.9960 |
| 04:47:06 (after) | $9.9948 |

- Billed: $0.0012, one AntiCloudflareTask at the published $1.20 per 1,000.
- Ledger charge: $0.003, the tariff.
- Paid solves for PR #718 in total: 2 (C011 at 04:33, C008 here), against the cap of 3.

## Result

### T045 idealista (DataDome)

- CapSolver called: yes, on browser_local, trigger gate (`datadome_captcha`).
  - createTask was refused: `ERROR_PROXY_CONNECT_REFUSED`, hint `proxy+connect_failed`.
  - No task was created, $0.
- Solution: no. Injected: no. Judged again: no.
- Outcome: `solver_failed`.
  - installed_chrome (Chrome 156): `unsupported`, `browser_version_unsupported`.
  - The answer: blocked `captcha` (403).
- Seconds added: 1.1.

### C008 scrapingcourse (Cloudflare challenge)

- CapSolver called: yes, on browser_local, trigger gate. Task accepted.
- Solution: yes, cookies (`vendorUserAgent: same`).
- Injected: yes, the cookies were set and the page reloaded.
- Judged again: still `cloudflare_challenge` (403).
- Outcome: `still_gated`.
  - The second attempt stopped at `limit_reached`.
  - installed_chrome: `browser_version_unsupported`.
  - The answer: blocked `cloudflare_challenge`.
- Seconds added: 12.1.

## Reading

**C008.**
- With the hostname, CapSolver took the same exit it had refused by IP, and returned cf_clearance for the browser's User-Agent.
- The cookie did not clear the page in Playwright's Chromium on the exit Octocrawl's browser used. The 2026-10-25 smoke test saw the same for installed_chrome.
- Why is not known. Candidates: CapSolver reaching a different exit through its own gateway, or Cloudflare binding the cookie to more than IP and User-Agent (for example the TLS fingerprint). Neither was checked.

**T045.**
- The page loaded this time, so the DataDome challenge was read. The same exit string that CapSolver accepted for AntiCloudflareTask was refused for DatadomeSliderTask, which may test the proxy differently. That is not known.
- On the earlier 20 s load timeout: the address fix did not change the browser's route. Both runs dialled 23.81.44.13 through the forwarder. What differed is the sticky session id, and so the residential exit (97.243.183.239 then; 24.161.244.24 now). The earlier timeout is therefore more likely that exit than anything the fix changed. That is not confirmed.

**Gate.**
- No page ended verified in a final answer after a solve.
- One page was cleared by a solve and then lost to a later defect: C011 at 04:33, read as `empty_unverified`. See the e26d8d0e record.
