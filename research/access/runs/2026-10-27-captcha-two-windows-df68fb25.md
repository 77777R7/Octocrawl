# CapSolver CAPTCHA solver, two windows, 2026-10-26 and 2026-10-27

Octocrawl's CapSolver adapter (ADR 0005 `third_party_captcha_solver`; #714, fixed by #715, #718, #719), measured on the frozen CAPTCHA set `research/access/captcha-tasks.v1.json` (56 tasks, manifest SHA-256 `39942eeb…`: 48 real pages and 8 vendor demo pages, the demo pages reported apart).

- Runner: `df68fb25` in both windows (branch `research/captcha-solver-measure` = `main` `21276c51` plus the harness), with a clean work tree and `npx tsc --build` run before each window.
- Driver: `node research/access/captcha-window.mjs --window <n> --arms <arms> --ports 8861,… --solver-grants … --solver-env CAPSOLVER_API_KEY --solver-exits installed_chrome+solver-proxy=W2L_SOLVER_PROXY_IC[,combined+solver-proxy=W2L_SOLVER_PROXY_CB]`. Each window's record ([window 1](2026-10-26-captcha-w1-df68fb25.md), [window 2](2026-10-27-captcha-w2-df68fb25.md)) has the exact command, the grants (SHA-256), the exits, getBalance and the per-type tables. Tasks ran in three blocks of 19/19/18, with the arm order rotated per block, cold attempts only.
- Network: every arm went through the shell proxy (Clash, `HTTPS_PROXY`), except the solver-proxy arms. Their browser and CapSolver used a Webshare residential sticky session (`-us-<sid>`), with one sid per arm per window chosen at launch and fixed for the window, dialled at a us-east-1 gateway address and given to CapSolver as socks5.
- Grants: perSolveUsd $0.003 (the ledger's tariff, an estimate; CapSolver's own billing is read from getBalance), maxSolvesPerCall 2.
- Window 1: 2026-10-26T06:25:56Z → 09:40:30Z, six arms.
- Window 2: 2026-10-27T06:20:53Z → 07:54:25Z, four arms, starting about 5 minutes earlier in the UTC day than window 1. Howard asked for an earlier start; the 04:47 UTC attempt did not start because the Mac was on battery, and he then set 06:20 UTC. Window 2 kept the Mac awake with `caffeinate -i -w <driver pid>`.
- Arms: Howard dropped Steel on 2026-10-27, so window 2 ran without `combined` and `combined+solver-proxy`. Those two arms ran in one window only. They are reported below as single-window results and never averaged with anything.
- Every task stayed in every arm's denominator: for every arm in both windows, 56 were planned, 56 attempted and none was left not run. Every run-set exited 0.

## The four arms both windows ran

Verified counts are out of 48 real pages and 8 demo pages, with false successes in brackets. Solves are given as attempted / answered by CapSolver / followed by a page with no gate, over all 56 tasks. Exit failures are answers whose status is `failed` with reason `connection_error` or `timeout`, over 56.

| Arm | W1 real | W2 real | W1 demo | W2 demo | Real Cloudflare challenge (11) W1 / W2 | Real DataDome (12) W1 / W2 | Solves W1 | Solves W2 | Ledger CapSolver W1 / W2 | Exit failures W1 / W2 | Minutes W1 / W2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 10 (0) | 8 (0) | 0 (5) | 0 (5) | 2 / 1 | 3 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | $0 / $0 | 0 / 4 | 6.2 / 8.5 |
| installed_chrome | 34 (0) | 31 (0) | 1 (5) | 0 (5) | 11 / 11 | 9 / 8 | 0 / 0 / 0 | 0 / 0 / 0 | $0 / $0 | 0 / 1 | 13.7 / 16.8 |
| installed_chrome+solver-proxy (Webshare) | 18 (0) | 20 (0) | 1 (2) | 0 (5) | 7 / 7 | 2 / 2 | 9 / 6 / 3 | 8 / 7 / 2 | $0.021 / $0.024 | 24 / 23 | 41.4 / 51.7 |
| installed_chrome+solver-none (Clash) | 32 (1) | 29 (0) | 2 (5) | 2 (5) | 11 / 11 | 7 / 6 | 6 / 1 / 1 | 5 / 1 / 1 | $0.006 / $0.003 | 0 / 1 | 17.0 / 16.5 |

CapSolver's own billing (getBalance) covers every solver arm of a window together and states no per-task price:
- window 1: $0.0178 ($9.9849 → $9.9671, three solver arms);
- window 2: $0.0105 ($9.9671 → $9.9566, two solver arms).

Single-window results (window 1 only; Howard dropped Steel on 2026-10-27):

| Arm | Real | Demo | Real Cloudflare challenge | Real DataDome | Solves | Ledger CapSolver | Ledger Steel | Exit failures | Minutes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| combined | 33 (0) | 1 (5) | 11 | 9 | 0 / 0 / 0 | $0 | $0.050 | 4 (timeouts) | 50.7 |
| combined+solver-proxy (Webshare) | 23 (0) | 1 (5) | 9 | 4 | 9 / 6 / 5 | $0.021 | $0.0288 | 16 | 65.5 |

## Which solves cleared a page

| Task | Type | W1 | W2 |
| --- | --- | --- | --- |
| T001 | Cloudflare challenge (real) | cleared and verified on ic+solver-proxy and on combined+solver-proxy | cleared and verified (ic+solver-proxy) |
| T047 | Cloudflare challenge (real) | cleared and verified on both proxy arms | cleared and verified (ic+solver-proxy) |
| T071, T076 | Cloudflare challenge (real) | cleared and verified on combined+solver-proxy; on ic+solver-proxy, connection_error before any gate | ic+solver-proxy: connection_error, no solve |
| C008 | Cloudflare challenge (demo) | cleared and verified on both proxy arms | ic+solver-proxy: connection_error, no solve |
| C011 | reCAPTCHA v2 (demo) | cleared and verified (ic+solver-none) | cleared and verified (ic+solver-none) |
| T048 | Cloudflare block (real) | ic+solver-proxy: answered twice and still gated after each, but the answer was verified | answered twice, still gated, not verified |
| B001 | Cloudflare challenge (real) | no solve | ic+solver-proxy: answered twice, still gated, ended in connection_error |
| T045 | DataDome (real, t=fe) | answered once and still gated; one ERROR_INVALID_TASK_DATA (both proxy arms) | one answered, one not; ended in connection_error (ic+solver-proxy) |
| C009 | Turnstile (demo) | 2 attempts, none answered (ERROR_INVALID_TASK_DATA), every solver arm | ic+solver-none: 2 attempts, none answered |
| C010 | reCAPTCHA v2 (demo) | 2 attempts, none answered (ic+solver-none) | 2 attempts, none answered (ic+solver-none) |

Each window's record lists, per arm, the solves that were not attempted, as type:reason from the `captcha_solve` events. Most fall into four groups:
- DataDome pages that are not the t=fe slider (`datadome_challenge_unrecognised`);
- generic bot pages with no challenge parameters;
- hCaptcha, Kasada and PerimeterX, which have no adapter;
- on the egress-none arm, every Cloudflare challenge and DataDome page (`grant_chose_no_solver_exit`). Those task types need the solver to use the browser's exit.

A few were neither:
- `browser_version_unsupported`: one DataDome page on each solver-proxy arm in window 1, and one Cloudflare challenge in window 2;
- `max_solves_per_call`: one Cloudflare challenge on ic+solver-proxy in each window, once the page's two solves were used.

## Answers

1. **Which challenge types does solving clear?** Two:
   - The Cloudflare challenge interstitial (AntiCloudflareTask over the Webshare exit), on real pages:
     - window 1: 2 on ic+solver-proxy (T001, T047) and 4 on combined+solver-proxy (T001, T047, T071, T076);
     - window 2: 2 (T001, T047).

     It also cleared the demo C008 in window 1.
   - reCAPTCHA v2 on one demo page (C011) over egress none, in both windows.

   Nothing else cleared. That includes DataDome, the Cloudflare blocks (T048 and B001 were answered but stayed gated), and the Turnstile and second reCAPTCHA demos (never answered).

   **Net gain on real pages: none in either window.** Every real page a solve cleared (T001, T047, T071, T076) was also verified in the same window by plain installed_chrome over Clash, with no solve. The only page solving added over its base arm is the demo C011, in both windows.
2. **Is DataDome cleared, and on which exit?** No, on no exit in either window. T045 is the one DataDome page in the t=fe form that CapSolver supports. Over Webshare it was answered once per window; it stayed gated in window 1 and ended in a connection error in window 2. The egress-none arm cannot try DataDome by design, and the other DataDome pages were not in the supported form. Every verified real DataDome page in the four shared arms came without a solve. installed_chrome verified the most: 9 of 12 in window 1, 8 in window 2.
3. **Does egress proxy lose Cloudflare tasks that egress none keeps?** Yes, the same four tasks in both windows.
   - Real Cloudflare challenge: 11/11 on ic+solver-none and on installed_chrome in both windows, 7/11 on ic+solver-proxy in both.
   - The four lost tasks are T067 (timeout), T071, T076 and B001 (connection_error).

   All four ended on the Webshare exit, in `connection_error` or `timeout`. In three of them (T067, T071, T076) no solve was attempted, so solving played no part. B001 in window 2 is mixed: two solves were answered, the page stayed gated after both, and only then did the answer end in `connection_error`. Every row's `suspected.cause` is `unknown` (not isolated).

   The Webshare exit failed often overall. On the solver-proxy arm, 24 and 23 of 56 answers ended in `connection_error` or `timeout`, 19 and 20 of them on real pages. The arms on Clash had far fewer: 0–1 for installed_chrome and ic+solver-none, 0 and 4 for standard, and 4 timeouts for combined (window 1 only). combined+solver-proxy (window 1 only) lost 2 Cloudflare pages (T020 and T067, both timeouts).
4. **What is the cost per 1,000 verified?**

   Ledger estimates at the $0.003 tariff, CapSolver only, over every verified task (real and demo) of the arm:

   | Arm | W1 | W2 |
   | --- | --- | --- |
   | ic+solver-proxy | $1.11 ($0.021 / 19) | $1.20 ($0.024 / 20) |
   | ic+solver-none | $0.18 ($0.006 / 34) | $0.10 ($0.003 / 31) |
   | combined+solver-proxy, CapSolver alone | $0.88 | not run |
   | combined+solver-proxy, with Steel | $2.08 ($0.0498 / 24) | not run |

   CapSolver's own billing, per 1,000 verified over every solver arm of a window:
   - W1: $0.23 ($0.0178 / 77 verified, three arms);
   - W2: $0.21 ($0.0105 / 51, two arms).

   Per 1,000 tasks verified after a clear, which is what solving itself bought:
   - W1: $1.98 ($0.0178 / 9);
   - W2: $3.50 ($0.0105 / 3).

   The Webshare exit's own cost is unknown (its traffic was not measured) and is not in these figures.
5. **Seconds added by solving.** Median wall-time difference against the base arm on the same task, over tasks with a solve:

   | Arm vs base | Pages | W1 | W2 |
   | --- | --- | --- | --- |
   | ic+solver-proxy vs installed_chrome | real | +17.0 s (n 4) | +21.7 s (n 5) |
   | ic+solver-none vs installed_chrome | demo | +3.1 s (n 3) | +5.1 s (n 3) |
   | combined+solver-proxy vs combined | real | +18.7 s (n 5) | not run |

   Solve time per attempted solve, from the events:

   | Arm | W1 | W2 |
   | --- | --- | --- |
   | ic+solver-proxy | 8.4 s (75.6 s / 9) | 13.0 s (104.2 s / 8) |
   | ic+solver-none | 24.5 s (147 s / 6, including one 120 s transport timeout) | 7.9 s (39.4 s / 5) |

## Findings

- **Solving pays for nothing installed_chrome does not already get.** Over Clash, installed_chrome verifies every real Cloudflare challenge page with no solve.
  - The solver's Cloudflare clears need the browser on the solver's exit, Webshare. On that exit, 4 of the 11 Cloudflare pages and 19–20 real pages overall ended in `connection_error` or `timeout`.
  - The solver-proxy arm verified 18 and 20 real pages, against installed_chrome's 34 and 31.
  - The egress-none arm keeps the Clash exit and verified 32 and 29 real pages, 2 fewer than installed_chrome in both windows. The tasks differed between windows. In window 1 it lost C001 and C003. In window 2 it lost T046, T070 and C001 and gained T048. The cause is unknown (not isolated). This arm gained one demo page (C011).
- **Webshare sticky-sid drift.** A sticky sid is not a fixed exit for a 40–65 minute arm. The exit address was read through the exit before the first block and after the last.
  - Window 1: both sticky sessions changed address during the window (ic 97.104.24.254 → 108.80.102.171, combined 24.34.29.31 → 98.237.173.17).
  - Window 2: the one sticky session read 172.59.80.239 both times. Two reads cannot show a change in between, so whether the address held all window is unknown.

  A Cloudflare cookie solved on one address may be presented from another. Whether that cost any task is not isolated here.
- **Window 2 ran longer than estimated:** 93.5 minutes, against 78 for the same four arms in window 1. The solver-proxy arm took 51.7 minutes, against 41.4.
- **Demo pages are a weak test of solving.** C009, C010, C012, C014 and C015 are false successes on every arm in both windows, with one exception: window 1's ic+solver-proxy, where C010, C012 and C015 ended in exit failures instead, leaving 2. The API reports success, but the task's predicates fail.
  - On C012, C014 and C015 no solve ever started.
  - The Turnstile demo (C009) and the reCAPTCHA demo C010 reached the solver (2 attempts each where they did), but CapSolver never answered them.

  Only C008 (Cloudflare) and C011 (reCAPTCHA v2) ever reached a solve that cleared.

## Spend

| Item | CapSolver (getBalance) | CapSolver (ledger) | Steel (ledger) |
| --- | --- | --- | --- |
| Smoke 2026-10-25 ([record](2026-10-25-captcha-smoke-dac40424.md)) | $0.0012 | $0.006 | $0 |
| Adapter-fix sessions 2026-10-25/26 (their own records) | $0.0139 (between the smoke and window 1) | in their records | in their records |
| Window 1 | $0.0178 | $0.048 | $0.0788 |
| Window 2 | $0.0105 | $0.027 | $0 |
| Total | $0.0434 ($10.0000 → $9.9566) | | |

The caps were $20 for CapSolver and Steel together, $8 for CapSolver, and $1 for Steel per window. Spending stayed far below every cap.
