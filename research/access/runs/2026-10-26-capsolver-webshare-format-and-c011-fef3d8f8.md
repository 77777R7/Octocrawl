# CapSolver: the Webshare proxy format, and C011 proxyless, 2026-10-26

Two steps approved by Howard on 2026-10-26, relayed by the coordinating session. Step 1: why CapSolver refused Octocrawl's Webshare exit (API only). Step 2: one proxyless reCAPTCHA v2 solve on C011, Google's demo with its production site key. Follows `2026-10-25-capsolver-proxyless-4a3be9a0.md`, where the 2captcha demos' site keys were refused.

Totals: CapSolver balance $9.9988 → $9.9968 ($0.0020 billed: $0.0012 in step 1, $0.0008 in step 2). Two tasks were created in total, one per step.

## Step 1: why CapSolver refused Octocrawl's Webshare exit (API only, 2026-10-26 02:28–02:33 UTC)

Source commit `fef3d8f8` (origin/main; `npx tsc --build` exit 0). No browser, no injection: scratch scripts calling CapSolver's API through Clash (`HTTPS_PROXY=http://127.0.0.1:7890`). The Webshare login is the K3 one (`RESIDENTIAL_PROXY` in `.w2l/access/competitors.env`, shape `http://<user>-us-rotate:<pass>@p.webshare.io`). Formats are named by shape only; a numeric sticky session id (`-us-<sid>`) replaced `-rotate` in every probe. Approved by the coordinating session on Howard's $20 CAPTCHA budget: at most 4 AntiCloudflareTask probes, stop at the first accepted, let that one task finish, no retries.

### Free checks
- Webshare from this Mac, direct (proxy variables unset), the sticky login against `https://api.ipify.org`: HTTP 200 on gateway IPs 23.81.44.13 and 23.81.44.182, ports 80 and 1080; SOCKS5 on port 80 also 200. Without a login: refused (curl exit 56). So the login works from an address that is not allowlisted, and this Mac is not let in by IP authorization.
- `p.webshare.io` (Google DoH through Clash) is a CNAME to `geoproxy.socks5.webshare.io`, then `ap-northeast-1.proxy.socks5.webshare.io` (23.106.231.9, 23.81.44.182, 199.254.199.189, …): a geo-DNS name. The smoke test's 23.81.44.13 was one regional gateway's address.
- CapSolver checks a task's own fields before its proxy, so a probe cannot be refused whatever the proxy does. With an unreachable proxy (192.0.2.1:80): `ReCaptchaV2Task` answered "the sitekey is not supported"; `AntiCloudflareTask` without `websiteURL` answered "websiteURL is required". Neither created a task, and the balance did not change (9.9988 at 02:28:44 and at 02:30:36).

### Documentation (read by a scout subagent 2026-10-26, not tested by it)
- CapSolver, https://docs.capsolver.com/en/guide/api-how-to-use-proxy/: a `proxy` string such as `198.199.100.10:4780:user:pwd` (http when no scheme), `socks5:ip:port:user:pwd`, `http://user:pwd@ip:port`, `socks5://user:pwd@ip:port`, or separate `proxyType/proxyAddress/proxyPort/proxyLogin/proxyPassword` fields. IP-authorized proxies must allowlist CapSolver's 9 listed IPs (47.253.x, 47.252.x, 47.89.x).
- CapSolver AntiCloudflareTask (…/guide/captcha/cloudflare_challenge/): use a static or sticky proxy, not a rotating one; it shows `ip:port:user:pass`.
- CapSolver's error list (…/guide/api-error/) does not list ERROR_PROXY_CONNECT_REFUSED.
- Webshare, https://apidocs.webshare.io/proxy-connection: backbone connections use `p.webshare.io`; username form `{username}-{country}-…-{session_id}` for sticky, `-rotate` for a new IP per request; ports 80, 1080, 3128, 9999–19999 with username/password. IP authorization "can be used alongside traditional proxy credentials" (help.webshare.io).

### Probes: AntiCloudflareTask, websiteURL `https://www.scrapingcourse.com/cloudflare-challenge` (C008), userAgent Mac Chrome/151

| # | Proxy shape | CapSolver answer | Time |
| --- | --- | --- | --- |
| 1 | `IP:80:user-us-sid:pass` (gateway 23.81.44.13, the smoke test's form) | refused, `ERROR_PROXY_CONNECT_REFUSED`, "custom proxy connect failed." No task. | 1.9 s |
| 2 | `p.webshare.io:80:user-us-sid:pass` | refused, `ERROR_PROXY_CONNECT_REFUSED`, "custom proxy connect failed." No task. | 1.8 s |
| 3 | `http://user-us-sid:pass@p.webshare.io:80` | accepted (task created). getTaskResult `ready` after 8.6 s: solution keys `cookies, token, type, userAgent`, cookie `cf_clearance`, userAgent the same as sent | 8.6 s |
| 4 | `socks5:p.webshare.io:1080:user-us-sid:pass` | not sent (stopped at the first accepted) | — |

Balance: $9.9988 at 02:32:02 (before), $9.9988 at 02:32:15 (just after), $9.9976 at 02:32:49. Billed $0.0012, the published CloudflareChallenge price ($1.20 per 1,000). One task in total.

### Reading
- The same host and port with the same login are refused in `host:port:user:pass` form and accepted in `http://user:pass@host:port` form. The login has no `:` or `@` and no characters other than letters, digits and `-`, so the colon form is not broken by parsing. Why CapSolver cannot connect with the colon form is not known: its docs present that form as http by default.
- Octocrawl's adapter sends the colon form: `capSolverProxy` in `packages/bench/src/vendors/capsolver.ts` (lines 96–100) returns `host:port:user:pass`. That is the cause of the smoke test's `ERROR_PROXY_CONNECT_REFUSED` on C008, and probably of the proxy part of T045's failure (DataDome takes the same `proxy` string). It needs an adapter fix, not made here (no code changes in this task).
- Not shown: whether this `cf_clearance` clears C008 in a browser on the same exit (no injection was allowed); whether the IP form with a scheme (`http://…@23.81.44.13:80`) also works; whether SOCKS5 works.

## Step 2: C011 proxyless (2026-10-26 04:01 UTC)

- Timing: run after the weekly PA rerun. A background check saw its processes, then waited until 04:00 UTC with none running. The rerun's last run directory was written 03:51 UTC.
- Machine: AC power, lid open (`pmset -g batt`, AppleClamshellState No) at 04:00:51 UTC.
- Source commit `fef3d8f8` (clean; `npx tsc --build` ok). API from source on port 8857 (`W2L_API_PORT=8857 W2L_ACCESS_GRANT=<grant> node --import tsx packages/api/src/cli.ts`; `W2L_SOLVER_PROXY` and `W2L_EGRESS_PROXIES` unset); stopped afterwards. 8791 was not touched.
- Grant `~/Code/w2l/.w2l/access/capsolver-grant-c011-2026-10-26.json` (git-ignored, 0600), SHA-256 `6b177621a4b59c283a2f6467653022fe42d8dc6b94a1832b7ef955e171e6e71a`:
  - capabilities installed_chrome, third_party_captcha_solver;
  - `solver: {vendor: "capsolver", egress: "none"}`;
  - `perSolveUsd` 0.003, `maxSolvesPerCall` 1;
  - budget $0.003 a run and a request, so at most 1 paid solve;
  - attestation: Howard, 2026-10-26, relayed by the coordinating session.
- Command: `W2L_API_URL=http://127.0.0.1:8857 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm proxyless+solver --set all --only C011 --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-c011-2026-10-26.json`. Ran 04:01:21 → 04:02:04 UTC.
- Run directory: `.w2l/access/runs/2026-10-26T04-01-21-139Z` (worktree wizardly-poitras-e148a8), copied to `captcha-hold/runs/` next to this record.
- Network: **proxied via Clash** (`HTTPS_PROXY=http://127.0.0.1:7890`) for every rung and for CapSolver's API. No Webshare: the startup line said "no solver exit", and the Evidence Record names egress `127.0.0.1:7890`, source `environment`.

Balance: $9.9976 at 04:01:07 (before), $9.9968 at 04:02:05 (after). Billed $0.0008, the published ReCaptchaV2 price ($0.80 per 1,000). The ledger charged the $0.003 tariff.

| Question | C011 |
| --- | --- |
| Was CapSolver called, on which rung | Yes, once, on browser_local. Trigger `gate`: http and browser_local both saw `captcha` (signals widget_recaptcha, widget_recaptcha_api, widget_sitekey). installed_chrome then stopped at `limit_reached` (max_solves_per_call). |
| Did a token come back | Yes. `ReCaptchaV2TaskProxyLess` was accepted with site key `6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-` (paid call `solves: 1`, harness `succeeded 1`). `vendorUserAgent: other`. |
| How it was submitted | The token went into the widget's `g-recaptcha-response` field. The widget names `data-callback="onSuccess"`, so injectAnswer called `window.onSuccess(token)` (`by_script`) and waited up to 5 s. The demo's form (`<form id="recaptcha-demo-form" method="POST">`) was **not submitted**: injectAnswer submits a form only when the widget has no callback. The demo's `onSuccess` only clears its error messages (read from the page with a plain GET through Clash, 2026-10-26). |
| Did the page re-verify | Judged again after the callback: still `captcha`. Same URL, the widget still there, no text extracted. The "Verification Success" contract did not match. |
| Outcome | `still_gated`; the task is blocked (captcha); verified 0 of 1. |
| Seconds added | 14.9 s (the `captcha_solve` event's `ms`, CapSolver's solve plus the callback wait). The task's wall time was 43.1 s. |

### Reading
- CapSolver solved a production reCAPTCHA v2 site key proxyless and returned a token. Whether that token passes Google's check is **not shown**: the form that would send it to the demo's server was never posted.
- Cause: the adapter's injection order in `injectAnswer` (`packages/bench/src/vendors/captchaSolver.ts`, about lines 403–414). A widget callback wins over the widget's POST form, and nothing submits the form when the callback does not navigate. On Google's demo the callback is cosmetic. That is an adapter fix, not made here (no code changes in this task).

## Fixes these two steps call for (not made)
1. `capSolverProxy` (capsolver.ts 96–100) should send the proxy as `http://user:pass@host:port`, the form CapSolver accepted, instead of `host:port:user:pass`, which it refused for the same Webshare login.
2. `injectAnswer` should still submit the widget's POST form after a callback that changes nothing, or prefer the form when there is one, so that a token like C011's reaches the site.
