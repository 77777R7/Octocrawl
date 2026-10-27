# CapSolver smoke test, 2026-10-25

The first live solves of Octocrawl's third-party CAPTCHA solver (#714, CapSolver, ADR 0005 `third_party_captcha_solver`), before the two measurement windows on the frozen CAPTCHA and DataDome task set. At most 3 solves on 3 tasks: one DataDome, one Cloudflare challenge, one Turnstile demo.

## Run

- Source commit `dac40424` (origin/main, clean; `tsc --build --dry` up to date). API from source on port 8851, stopped afterwards.
- Command: `W2L_API_URL=http://127.0.0.1:8851 W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm smoke+solver --set all --only T045,C008,C009 --save-responses --raw-html --access '"enhanced"' --grant <smoke grant>`. Run directory `.w2l/access/runs/2026-10-25T17-39-20-672Z` (git-ignored). 17:39:20 → 17:42:29 UTC.
- Grant (git-ignored, 0600): SHA-256 `996d980678a7a16376499570295b42b6781547c91212a5eef502dcab68e5c162`; capabilities installed_chrome, third_party_captcha_solver; `solver: {vendor: "capsolver", egress: "proxy"}`; tariff `perSolveUsd` 0.003, `maxSolvesPerCall` 1; $0.003 a request and a run. Attestation: Howard, 2026-10-25, in chat, relayed by the coordinating session.
- Tariff basis: CapSolver's published prices, read 2026-10-25 at https://docs.capsolver.com/en/pricing, in USD per 1,000: ReCaptchaV2 0.80, CloudflareTurnstile 1.20, CloudflareChallenge 1.20, DatadomeSlider 2.50. $0.003 a solve is an upper bound above the highest of them. (DataDome's slider price is published there, contrary to what was expected before the run.)
- Network: every rung through the solver exit, a loopback forwarder to a Webshare residential sticky session (US), the gateway addressed by IP (this Mac's resolver forges `p.webshare.io`). CapSolver's API was called through Clash (`HTTPS_PROXY` 127.0.0.1:7890). The exit address run-set recorded (`103.142.140.60`) is Clash's: its echo goes through the shell's proxy, not through the solver exit.

## Result

| Task | Challenge | Rung | CapSolver | Answer injected | Page judged again |
| --- | --- | --- | --- | --- | --- |
| T045 idealista.com (real) | DataDome captcha (`t=fe`) | browser_local | `ERROR_CAPTCHA_SOLVE_FAILED` after 5.7 s | no | still `captcha` (403); installed_chrome then stopped at the per-page limit of 1 |
| C008 scrapingcourse.com (vendor demo) | Cloudflare challenge | browser_local | `ERROR_PROXY_CONNECT_REFUSED` after 4.9 s, no task created | no | still `cloudflare_challenge` |
| C008 | | installed_chrome (Chrome/156) | answered with cookies after 26.5 s | yes, then reload | still `cloudflare_challenge` (403) |
| C009 2captcha.com Turnstile (vendor demo) | Turnstile widget | — | not attempted: the page is a 200 with no gate, and solving starts only on a gated page | — | `success` by the API; not verified by the task's predicates (false success) |

- Verified: 0 of 3. Pages a solve cleared: 0.
- Solves attempted: 3 (two created a CapSolver task, one was refused before). Solver answered: 1.
- CapSolver getBalance: $10 at 17:39:20, $9.9988 at 17:42:29 UTC: **$0.0012 billed**, the published price of one Cloudflare challenge. The failed DataDome task was not billed.
- Spend ledger: **$0.006**, two solves at the $0.003 tariff (the failed DataDome task counts as created, so the ledger charges it).

## What this shows

- The adapter's path works end to end: the challenge is read off the page, CapSolver is called with the shared exit, a cookie answer goes into the browser and the page is reloaded and judged again, and each solve is charged and listed on the record's paid calls.
- Nothing was cleared. Possible causes, none of them verified here:
  - The installed Chrome reports Chrome/156; CapSolver's DataDome guide lists Chrome up to 155. Whether CapSolver solved the Cloudflare cookie for that User-Agent is unknown.
  - browser_local (the bundled Chromium) used the one solve the page was allowed before installed_chrome got to it.
  - Turnstile and reCAPTCHA demo pages are never solved, because they show no gate.
- `paidCalls[].solves` is 1 for every charged solve, a failed one too. The harness now reads attempts, answers and clears from the `captcha_solve` events of every rung instead.
