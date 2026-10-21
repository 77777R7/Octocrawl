# K3: installed_chrome on the 16 challenge tasks, Clash vs Webshare, paired by round, 2026-10-21

Label: `measurement`. K3 of [docs/pa-enhancement-tasks.md](../../../docs/pa-enhancement-tasks.md). Two records disagree on whether the exit should follow the bot check a host is known to run:

- [2026-10-14](2026-10-14-installed-chrome-exits-3dd497ef.md), two runs per exit one after the other: Webshare's residential exit passed the DataDome tasks T038 and T046 in both runs where Clash failed them, and Clash passed the Cloudflare tasks T047, T048 and B001 where Webshare failed all three in both runs.
- [2026-10-16](2026-10-16-installed-chrome-datadome-webshare-d4e1879e.md), eight alternating rounds on four DataDome tasks: Clash 5 of 16, Webshare 1 of 16, and Webshare failed its control pages in three of four rounds.

This run asks the question both records left open, on all 16 tasks in one window, with the two exits alternating. It decides nothing: whether to build exit selection by detection type is Howard's call in K4. No default changes because of it.

## Design (written and committed before any run)

### What varies

One variable: the exit. Everything else is the same in both arms.

- **Code:** the commit that adds this record to `main` `5beacbf3`; it changes no code. The run-set summaries name the commit they ran on.
- **Grant:** `.w2l/access/installed-chrome-grant.json`, naming `installed_chrome` alone, SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818` (copied from `.claude/worktrees/pa-delivery/.w2l/access/installed-chrome-grant.json`). No paid capability, so no paid call can be made.
- **Browser:** installed Google Chrome, headed, the same binary in both arms (version from `--version` before and after the run).
- **Proxy address seen by the API, Chrome and run-set:** `http://127.0.0.1:8796` in both arms. It is `research/access/cloudrun-xvfb/forward.mjs`, and only its upstream changes:
  - **A, Clash:** upstream `http://127.0.0.1:7890`, the data-centre pool.
  - **B, Webshare:** upstream the rotating residential gateway (`<account>-us-rotate@p.webshare.io`, from `RESIDENTIAL_PROXY` in `.w2l/access/competitors.env`), as in `research/access/sticky-vs-rotating.sh`. Sticky sessions are not used.
  - On 10-16 arm A went to 7890 directly and only arm B had the forwarder's hop. Here both arms have it, so the hop is not a difference between them.
- **API:** one process per arm run, started fresh on port 8797 with `HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:8796`, `NO_PROXY=localhost,127.0.0.1,::1` and the grant, stopped after the run. The forwarder is restarted with the arm's upstream before each arm run.
- **Tasks:** the `challenge16` subset of `research/access/subsets.v1.json`: T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008.
- **Command per arm run:** `HTTPS_PROXY=http://127.0.0.1:8796 HTTP_PROXY=http://127.0.0.1:8796 NO_PROXY=localhost,127.0.0.1,::1 W2L_API_URL=http://127.0.0.1:8797 W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access '"enhanced"' --save-responses --record <round record>`.
- **Interaction policy** as in ADR 0005: no clicks, no typing, no CAPTCHA solving; a CAPTCHA is a failure. One Chrome window at a time (run-set sends the tasks one by one).

### Order

Four rounds, each with one run of both arms, the order balanced inside the window: A B | B A | A B | B A, back to back on 2026-10-21 (UTC). Eight arm runs, 16 tasks each, 128 attempts. If a run stops early, the tasks it did not reach count as not verified and are named.

### Control page

At the start of every arm run, before the 16 tasks, two checks that the exit is up and is the arm's exit:

1. run-set's own egress echo (`W2L_EGRESS_ECHO_URL=https://api.ipify.org`), through the forwarder, recorded as the run's exit address;
2. one `POST /v1/scrape` of `https://api.ipify.org/?format=json` to the arm's API, no access option, so the API's own lane goes out through the exit; the address in its Markdown is recorded.

A control passes when both answer with an IPv4 address of the arm's kind: in A the address Clash gives at that moment (`curl -x http://127.0.0.1:7890 https://api.ipify.org` just before); in B an address that is not Clash's. A failed control is marked on that arm run; its 16 attempts stay in the denominator. Results are reported over all rounds and, apart, over the arm runs whose control passed.

### Groups

From the attribution in [docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md) and [the gate-signal record](2026-10-12-pa-gate-signals-enhanced-56f9a0d1.md):

- **Cloudflare (8):** T001, T002, T047, T048, T068, T071, T076, B001.
- **DataDome (7):** T005, T034, T038, T045, T046, T049, T068.
- **No vendor header (2):** T053 (imf.org, Akamai-like bare 403), B008 (imdb, 405).

T068 (economist.com) runs both and is counted in both groups, so the groups add up to 17 tasks; the overall total counts it once. A group's denominator per arm is its task count × 4 rounds (Cloudflare 32, DataDome 28, none 8, all 64).

### Measures and the bar, fixed now

- Per task, per arm run: verified (run-set's verdict, the task's predicates), status, reason, HTTP status, delivering lane, wall time. False successes per arm.
- Per group and arm: verified of attempts, over all rounds and over control-passed runs; per-round counts, so the round-to-round range inside an arm is visible.
- **A gap between the arms in a group** is reported as one only if all three hold, the same bar as 10-16:
  1. the arm ahead leads by at least 4 attempts in that group, over all rounds;
  2. it is ahead or level in at least 3 of the 4 rounds;
  3. at least two of the group's tasks are each ahead by at least 2 of 4.
  Otherwise the difference is reported as within this window's round-to-round spread. A paired sign test over the (task, round) pairs where exactly one arm verified is given beside it, as a description, not as the bar.
- **What would support exit selection by detection type:** a gap with B ahead on DataDome and a gap with A ahead on Cloudflare, in the same window. One gap alone, or none, does not.
- **Cost:** $0 by the ledger is expected (no paid capability in the grant). Webshare's bandwidth is not metered by Octocrawl and is written unknown unless read from its dashboard.

### Pacing and budget across the exit switch

ROADMAP PA item 3 left "per-host pacing and budgets across a switch" unmeasured (`ROADMAP.md:204`, `:220`). The paired run above cannot show it: each arm run is its own API process, and the exit is set by that process's environment, so a new arm starts with fresh in-memory pacing whatever the code does. Inside one process the exit changes only through the operator pool (`W2L_EGRESS_PROXIES`, with a grant naming `egress_sessions`), which this run's grant does not name.

So the assertion is a code-level test in `packages/api/test/egressPool.test.ts`, beside the existing switch tests: one engine, two live proxies, one origin.

1. A page answers 429 with `Retry-After`; the engine stays on its egress (the existing rule) and sets the host's cooldown.
2. The first proxy then refuses connections, so the next page of the same origin moves to the second proxy (`egress_switched`).
3. The test asserts that this page waits out the cooldown set before the switch (`host_cooldown_wait` with `waitMs > 0`, and the origin's second request not earlier than the `Retry-After`), and that the task's run budget is the one opened before the switch, not a new one.

It is written and run on `main` first. If it passes there, the behaviour is already right and the test is kept as the guard; the record says so rather than calling it a fix.

## Amendment, 2026-10-21 04:30 UTC (written and committed before the rounds below are run)

The first pair of arm runs went out as designed (r1-A 03:45:43–03:49:22, r1-B from 03:50:28) and r1-B failed on the exit itself, not on the sites:

- **Why.** This Mac's DNS answers for `p.webshare.io` are forged today: the system resolver, and queries sent to 1.1.1.1 and 223.5.5.5, return Twitter/Facebook addresses (199.59.148.97, 174.37.175.229, 31.13.86.21 and others) that refuse TCP on port 80. The forwarder resolved the gateway's name locally, so no connection reached Webshare. Google's DNS-over-HTTPS, asked through Clash, gives `p.webshare.io` → `ap-northeast-1.proxy.socks5.webshare.io` → 23.81.42.155 and seven other addresses; port 80 on them answers from here, and three requests through 23.81.42.155 left from three US residential addresses (50.5.82.217, 198.89.187.225, 68.184.165.130).
- **What r1-B showed.** Both controls failed: the run-set echo found no exit, and the API control got no answer in 60 s (curl's limit). All 11 tasks it reached before it was stopped at 04:26 ended at the runner's 180 s client timeout with no API answer.
- **r1-B also started with a dirty working tree:** `packages/api/test/egressPool.test.ts` had uncommitted edits from 03:48 to 03:50:39 (the pacing test, then moved to a separate worktree). No file the API or run-set loads was changed. r1-A started clean.

So that pair is kept and reported as **round 0**, outside the four rounds below and inside the "every arm run" totals. The four rounds start again in the same order, A B | B A | A B | B A, with one change to arm B: the forwarder's upstream is the gateway at **23.81.42.155:80** (the address the gateway's own DNS gave at 04:2x UTC), not its name. The login, the `-us-rotate` mode and everything else stay as designed. Arm A is unchanged (Clash resolves names itself). In both arms the sites' names are still resolved by the upstream, not by this Mac.

The rounds below run on the commit that adds this amendment (no code change from `5beacbf3`); round 0 ran on `5c2c5254` (also no code change).

## Results

Raw runs: `.w2l/access/runs/2026-10-21T03-45-43-703Z/` to `2026-10-21T05-11-40-357Z/` in this worktree, copied to `~/Code/w2l/.w2l/access/archive/2026-10-21/k3/` (outside the repository). One record per arm run: `2026-10-21-k3-r<round>-<arm>-<exit>-<commit>.md` beside this file.

### Round 0: the first attempt, stopped (kept, not in the four rounds)

- **When and how far:** 03:45:37–04:26 UTC on `5c2c5254`. Arm A of round 1 (r0-A here) finished, 03:45:43–03:49:22. Arm B started at 03:50:28 and was stopped at 04:26 after 11 of its 16 tasks; the other five (T068, T071, T076, B001, B008) were never sent. Rounds 2–4 of that attempt never started.
- **Why it stopped:** the forwarder resolved `p.webshare.io` through this Mac's DNS, which answers with forged addresses today (see the amendment), so no connection reached the gateway. Both controls failed (no echo address; the API control got nothing in 60 s), and each of the 11 tasks ended at run-set's 180 s client timeout with no API answer. r0-B also started with a dirty working tree (an uncommitted test file, not loaded by the API or run-set).
- **What changed after it:** only the amendment above: arm B's upstream is the gateway's address 23.81.42.155 instead of its name, and the four rounds start again in the designed order.
- **Results, as they came:**

| Task | Guard | r0-A Clash (exit 103.142.140.155, control passed) | r0-B Webshare (no exit, control failed) |
| --- | --- | --- | --- |
| T001 | Cloudflare | captcha 403 | no API answer in 180 s |
| T002 | Cloudflare | **✓** | no API answer in 180 s |
| T005 | DataDome | **✓** | no API answer in 180 s |
| T034 | DataDome | **✓** | no API answer in 180 s |
| T038 | DataDome | captcha 403 | no API answer in 180 s |
| T045 | DataDome | captcha 403 | no API answer in 180 s |
| T046 | DataDome | captcha 403 | no API answer in 180 s |
| T047 | Cloudflare | **✓** | no API answer in 180 s |
| T048 | Cloudflare | **✓** | no API answer in 180 s |
| T049 | DataDome | **✓** | no API answer in 180 s |
| T053 | — | **✓** | no API answer in 180 s |
| T068 | Cloudflare + DataDome | bot_detected_generic 403 | not sent |
| T071 | Cloudflare | **✓** | not sent |
| T076 | Cloudflare | **✓** | not sent |
| B001 | Cloudflare | **✓** | not sent |
| B008 | — | **✓** | not sent |
| **Verified** | | **11 of 16** (p50 10224 ms, p95 25626 ms, $0) | **0 of 16** (5 not sent, counted as not verified) |

Counting round 0 in, every arm run of the day: A 48 of 80 (11, 9, 9, 9, 10), B 7 of 80 (0, 1, 1, 3, 2).

### The four rounds

Commit `d29e2ba3` for all eight arm runs (no code change from `5beacbf3`), each started on a clean tree. Chrome 155.0.8059.85 before and after (`--version`). In arm A every verified answer was delivered by the installed_chrome rung; a lane is named only where another delivered it.

| Run | Arm | Start → end (UTC) | Echo exit (run-set) | API control exit | Control | Verified of 16 | False success | p50 / p95 ms | Working tree at start |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r1-A | A Clash | 04:27:00 → 04:30:59 | 103.142.140.155 | 103.142.140.155 | passed | 9 | 0 | 13088 / 25368 | clean |
| r1-B | B Webshare | 04:31:13 → 04:40:02 | 173.219.135.138 | 47.147.245.37 | passed | 1 | 0 | 20292 / 180004 | clean |
| r2-B | B Webshare | 04:40:16 → 04:46:59 | 76.38.58.169 | 73.36.141.159 | passed | 1 | 0 | 13435 / 180004 | clean |
| r2-A | A Clash | 04:47:05 → 04:51:14 | 103.142.140.155 | 103.142.140.155 | passed | 9 | 0 | 13927 / 25093 | clean |
| r3-A | A Clash | 04:51:21 → 04:55:22 | 103.142.140.155 | 103.142.140.155 | passed | 9 | 0 | 12541 / 25202 | clean |
| r3-B | B Webshare | 04:55:35 → 05:03:51 | 47.18.208.126 | 38.40.94.208 | passed | 3 | 0 | 18610 / 180006 | clean |
| r4-B | B Webshare | 05:04:05 → 05:11:33 | 73.210.37.128 | 73.155.101.51 | passed | 2 | 0 | 16976 / 180006 | clean |
| r4-A | A Clash | 05:11:40 → 05:15:29 | 103.142.140.155 | 103.142.140.155 | passed | 10 | 0 | 9758 / 25204 | clean |

The control passed in all eight arm runs, so the "control-passed" columns below equal the totals. In arm B the two echo checks of the same run left from two different US residential addresses, as the rotating gateway gives a new exit per connection.

| Task | Guard | r1-A | r1-B | r2-B | r2-A | r3-A | r3-B | r4-B | r4-A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | Cloudflare | captcha 403 | cloudflare_challenge 403 | connection_error | captcha 403 | captcha 403 | **✓** | connection_error | captcha 403 |
| T002 | Cloudflare | **✓** | **✓** (http) | **✓** (http) | **✓** | **✓** | **✓** (http) | **✓** (http) | **✓** |
| T005 | DataDome | captcha 403 | connection_error | connection_error | captcha 403 | captcha 403 | connection_error | connection_error | captcha 403 |
| T034 | DataDome | captcha 403 | connection_error | connection_error | captcha 403 | captcha 403 | connection_error | connection_error | **✓** |
| T038 | DataDome | captcha 403 | connection_error | connection_error | captcha 403 | captcha 403 | connection_error | connection_error | captcha 403 |
| T045 | DataDome | captcha 403 | connection_error | connection_error | captcha 403 | captcha 403 | connection_error | connection_error | captcha 403 |
| T046 | DataDome | captcha 403 | bot_detected_generic 403 | connection_error | captcha 403 | captcha 403 | bot_detected_generic 403 | connection_error | captcha 403 |
| T047 | Cloudflare | **✓** | cloudflare_challenge 403 | cloudflare_challenge 403 | **✓** | **✓** | connection_error | connection_error | **✓** |
| T048 | Cloudflare | **✓** | connection_error | connection_error | **✓** | **✓** | connection_error | cloudflare_challenge 403 | **✓** |
| T049 | DataDome | **✓** | bot_detected_generic 403 | connection_error | **✓** | **✓** | bot_detected_generic 403 | connection_error | **✓** |
| T053 | — | **✓** | connection_error | connection_error | **✓** | **✓** | **✓** | **✓** | **✓** |
| T068 | Cloudflare + DataDome | bot_detected_generic 403 | no API answer in 180 s | no API answer in 180 s | bot_detected_generic 403 | bot_detected_generic 403 | no API answer in 180 s | no API answer in 180 s | bot_detected_generic 403 |
| T071 | Cloudflare | **✓** | connection_error | connection_error | **✓** | **✓** | connection_error | connection_error | **✓** |
| T076 | Cloudflare | **✓** | connection_error | connection_error | **✓** | **✓** | connection_error | connection_error | **✓** |
| B001 | Cloudflare | **✓** | connection_error | connection_error | **✓** | **✓** | connection_error | connection_error | **✓** |
| B008 | — | **✓** | connection_error | connection_error | **✓** | **✓** | connection_error | connection_error | **✓** |
| **Verified** | | **9** | **1** | **1** | **9** | **9** | **3** | **2** | **10** |

`no API answer in 180 s` is run-set's client timeout (`task.timeoutMs`, 180 s by default; `research/access/run-set.mjs:414`): T068 on Webshare got no answer in all four rounds, so its cost and verification are unknown, not zero.

### By detection type, every attempt

| Group | Tasks | A Clash, all rounds | B Webshare, all rounds | A, per round (r1–r4) | B, per round (r1–r4) | A, control-passed runs | B, control-passed runs | Discordant pairs A only / B only | Sign test p (two-sided) | Bar met |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cloudflare | 8 | 24/32 | 5/32 | 6, 6, 6, 6 | 1, 1, 2, 1 | 24/32 (4 runs) | 5/32 (4 runs) | 20 / 1 | 0.000 | **yes, A ahead** |
| DataDome | 7 | 5/28 | 0/28 | 1, 1, 1, 2 | 0, 0, 0, 0 | 5/28 (4 runs) | 0/28 (4 runs) | 5 / 0 | 0.063 | no (A ahead by 5, ahead or level in 4 of 4 rounds, 1 tasks ahead by ≥2) |
| No vendor header | 2 | 8/8 | 2/8 | 2, 2, 2, 2 | 0, 0, 1, 1 | 8/8 (4 runs) | 2/8 (4 runs) | 6 / 0 | 0.031 | **yes, A ahead** |
| All | 16 | 37/64 | 7/64 | 9, 9, 9, 10 | 1, 1, 3, 2 | 37/64 (4 runs) | 7/64 (4 runs) | 31 / 1 | 0.000 | **yes, A ahead** |

Bar, as fixed before the run: the arm ahead leads by at least 4 attempts, is ahead or level in at least 3 of 4 rounds, and at least two of the group's tasks are each ahead by at least 2 of 4. T068 is in both vendor groups; "All" counts it once.

| Task | Guard | A Clash | B Webshare |
| --- | --- | --- | --- |
| T001 | Cloudflare | 0/4 | 1/4 |
| T002 | Cloudflare | 4/4 | 4/4 |
| T005 | DataDome | 0/4 | 0/4 |
| T034 | DataDome | 1/4 | 0/4 |
| T038 | DataDome | 0/4 | 0/4 |
| T045 | DataDome | 0/4 | 0/4 |
| T046 | DataDome | 0/4 | 0/4 |
| T047 | Cloudflare | 4/4 | 0/4 |
| T048 | Cloudflare | 4/4 | 0/4 |
| T049 | DataDome | 4/4 | 0/4 |
| T053 | — | 4/4 | 2/4 |
| T068 | Cloudflare + DataDome | 0/4 | 0/4 |
| T071 | Cloudflare | 4/4 | 0/4 |
| T076 | Cloudflare | 4/4 | 0/4 |
| B001 | Cloudflare | 4/4 | 0/4 |
| B008 | — | 4/4 | 0/4 |

### Confounder: Webshare runs that stopped before installed_chrome

On Webshare the bundled browser lane often failed to open the page at all: `page.goto: net::ERR_EMPTY_RESPONSE` through the forwarder, `failureReason: connection_error`. After that the ladder stopped, so installed_chrome, the rung this experiment is about, never ran for that task. Clash had none of these.

| Run | Stopped | Of which connection_error | No API answer | Tasks |
| --- | --- | --- | --- | --- |
| r1-A | 0 | 0 | 0 | — |
| r1-B | 8 | 7 | 1 | T005 (connection_error; http → browser_local), T034 (connection_error; http → browser_local), T045 (connection_error; http → browser_local), T068 (no API answer in 180 s), T071 (connection_error; http → browser_local), T076 (connection_error; http → browser_local), B001 (connection_error; http → browser_local), B008 (connection_error; http → browser_local) |
| r2-B | 10 | 9 | 1 | T005 (connection_error; http → browser_local), T034 (connection_error; http → browser_local), T038 (connection_error; http → browser_local), T048 (connection_error; http → browser_local), T049 (connection_error; http → browser_local), T068 (no API answer in 180 s), T071 (connection_error; http → browser_local), T076 (connection_error; http → browser_local), B001 (connection_error; http → browser_local), B008 (connection_error; http → browser_local) |
| r2-A | 0 | 0 | 0 | — |
| r3-A | 0 | 0 | 0 | — |
| r3-B | 7 | 5 | 1 | T005 (connection_error; http → browser_local), T034 (connection_error; http → browser_local), T049 (bot_detected_generic; http → browser_local), T068 (no API answer in 180 s), T071 (connection_error; http → browser_local), T076 (connection_error; http → browser_local), B008 (connection_error; http → browser_local) |
| r4-B | 6 | 5 | 1 | T005 (connection_error; http → browser_local), T034 (connection_error; http → browser_local), T068 (no API answer in 180 s), T071 (connection_error; http → browser_local), T076 (connection_error; http → browser_local), B008 (connection_error; http → browser_local) |
| r4-A | 0 | 0 | 0 | — |

"Stopped" means not verified and installed_chrome never started. Two examples from the saved responses:

- r1-B T005 (etsy.com): http `failed / connection_error` → `ladder_action_decision` actual `next_rung`; browser_local `navigate_failed` `net::ERR_EMPTY_RESPONSE` → `ladder_step` failed, `ladder_action_decision` shadow `stop`, actual `stop`. `channelsTried: http, browser_local`.
- r2-B B001 (bhphotovideo.com): http `blocked`, 403, `failureClass: bot_gate` → `next_rung`; browser_local `navigate_failed` `net::ERR_EMPTY_RESPONSE` → `stop`. `channelsTried: http, browser_local`.

So arm B measured the gateway's connections as much as the sites' bot checks. The same tables counted only on attempts where installed_chrome ran or an earlier lane delivered a verified answer ("evaluable"), and on the (task, round) pairs evaluable in both arms:

| Group | A evaluable: verified/evaluable | B evaluable: verified/evaluable | Pairs both evaluable | A only / B only on those pairs | Sign test p |
| --- | --- | --- | --- | --- | --- |
| Cloudflare | 24/32 | 5/17 | 17 | 9 / 1 | 0.021 |
| DataDome | 5/28 | 0/12 | 12 | 2 / 0 | 0.500 |
| No vendor header | 8/8 | 2/4 | 4 | 2 / 0 | 0.500 |
| All | 37/64 | 7/33 | 33 | 13 / 1 | 0.002 |

## What this shows

Only what these eight arm runs, in one 48-minute window on one machine, support:

- **Cloudflare: Clash ahead, outside the window's spread.** 24 of 32 on Clash against 5 of 32 on Webshare; Clash was ahead in every round (6, 6, 6, 6 against 1, 1, 2, 1) and five tasks led by 4 of 4 (T047, T048, T071, T076, B001). The bar is met. On the pairs where both arms reached installed_chrome or delivered earlier, 9 pairs went to Clash only and 1 to Webshare only (T001 in r3). This repeats the Cloudflare half of 2026-10-14 (Webshare 0 of 2 on T047, T048 and B001 then; 0 of 4 each now).
- **DataDome: no lead for Webshare; too few evaluable Webshare attempts to say more.** Clash 5 of 28 (T049 4 of 4, T034 1 of 4), Webshare 0 of 28. Only 12 Webshare DataDome attempts reached installed_chrome or delivered earlier, and none was verified; on the 12 pairs evaluable in both arms the split is 2 to Clash, 0 to Webshare. The bar is not met. The 2026-10-14 lead (Webshare passing T038 and T046 in both runs) did not repeat: T038 and T046 were 0 of 4 on both exits. On the four DataDome tasks of 2026-10-16 (T038, T045, T046, T068), both exits were 0 of 16 here, against 5 of 16 (Clash) and 1 of 16 (Webshare) then.
- **The crossover that exit selection by detection type needs did not appear.** That would need Webshare ahead on DataDome and Clash ahead on Cloudflare in the same window. Here Clash was ahead or level in every group: overall 37 of 64 against 7 of 64 (31 pairs Clash only, 1 Webshare only). These data do not support building it; K4 decides.
- **Day-to-day spread is larger than these runs show.** Clash gave 11 in round 0 and 9–10 in the four rounds, but DataDome tasks moved between days: T005 and T034 passed in round 0 and on 10-14, T038 and T046 passed on Clash 2 and 3 times of 4 on 10-16, and none of those did here. A window of one hour cannot say how often each exit wins on DataDome.
- **Webshare's own failures dominate arm B.** 31 of its 64 attempts stopped before installed_chrome: 26 on browser-lane connection errors and 4 with no API answer at all, plus T049 in r3-B stopped as `bot_detected_generic` on browser_local. The controls passed every time, so a control page at the start of a run does not show that the gateway will carry a browser's tunnels for the next ten minutes.
- **No false successes in any arm run.** p50 9.8–13.9 s on Clash, 13.4–20.3 s on Webshare; Webshare's p95 is the 180 s client timeout.

## Pacing and budget across the exit switch: result

- **Per-host pacing does not reset.** `packages/api/test/egressPool.test.ts` "keeps the site's pacing across a switch": one engine with the default rungs, a per-host delay of 1.5 s, two pool proxies. The first proxy answers one page and then drops the next request and goes down; the page moves to the second proxy (`egress_switched`, `unreachable`) and its first request to the site there came at least 1.4 s after the dropped one. It passes on `main` (`5beacbf3` code): the engine's rungs share one `OriginScheduler` keyed by origin across egresses (`packages/api/src/engine.ts:857`, `:899`). The test helper that builds its own rungs (`httpOnly()` in that file) gives each egress a scheduler of its own; the first draft of the test used it and saw no wait, so that draft measured the helper, not the engine.
- **The page's time budget did reset. Fixed here.** "keeps the page's time budget across a switch": the first proxy holds the page 2 s before it drops it, the site takes 1.5 s, the page has `timeout: 3000`. On `main` the page succeeded after about 3.5 s: the egress wrapper read the page again with `pageAtom.scrape`, which set a new deadline, `Date.now() + timeout` (`engine.ts:1584`), so a page could take up to three timeouts (`MAX_EGRESS_SWITCHES` = 2). The test failed on `main` (commit `c0c213b7`) and passes after the fix (`393ecabe`): the deadline is set once per page before the first read, and the read on the new egress gets what is left of it. The task's own deadline was already a cap. One consequence: a page that spends its whole timeout on an egress that hangs now fails `timeout` after the switch instead of being read again with a new timeout on the healthy egress.
- **Spend budget: not reset, by the code, not by a test.** The page's ledger (`spend.child(...)`, `packages/runtime/src/orchestrator.ts:396`) and the run's ledger come in through the context that both reads share, and the read given up keeps its paid calls on the page's record (`givenUpPaidCalls`). No test here makes a paid call across a switch: the egress-pool tests have no paid rung.
- The paired run itself could not show any of this: each arm run was its own API process, and the exit was the process's environment.

## Cost

- Spend ledger: $0 on every Clash run. On every Webshare run `unknown`, because T068 got no API answer; the 15 answered attempts in each carried no paid call, and the grant names no paid capability.
- Webshare bandwidth: unknown (not metered by Octocrawl, not read from the Webshare dashboard).

## Not shown

- Other days, other times of day, other machines. The 10-14 and 10-16 differences say a one-hour window is not enough for DataDome.
- Webshare through another gateway address or by its name with honest DNS; sticky sessions; other residential providers. Whether the `ERR_EMPTY_RESPONSE` failures come from the gateway node 23.81.42.155, from rotating mode, or from the forwarder is not isolated.
- How Webshare would do on DataDome if installed_chrome had run on the 16 attempts that stopped before it.

## Follow-ups (not done here)

- **Ladder: a browser-lane connection error ends the ladder** (not isolated). On Webshare, 26 attempts stopped after `browser_local` failed with `connection_error` (`net::ERR_EMPTY_RESPONSE`), with `ladder_action_decision` actual `stop` and installed_chrome, the next rung, never started; see the two examples above. Whether a connection error on the bundled browser should go on to installed_chrome (it shares the exit, so it may fail the same way) is a ladder question for another session.
- **robots.txt is re-read after a switch.** `robotsCacheFor(mode, egress)` keys the cache by egress (`engine.ts:872`), so a new egress reads robots.txt again; the rules it applies come from the site, but ROADMAP item 3 lists robots.txt among the state that should not reset. Not tested here.
- **Local DNS for the gateway.** This Mac's DNS forges `p.webshare.io` today; `research/access/sticky-vs-rotating.sh` and any run through `forward.mjs` by name will fail the same way until that is handled.
