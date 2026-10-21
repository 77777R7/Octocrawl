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

## Results

Not run yet.
