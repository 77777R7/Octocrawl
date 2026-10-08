# G1 acceptance: the browser-compatible HTTP transport, two windows (2026-10-06 and 2026-10-07)

ROADMAP PA item 2. The PA task set (`research/access/tasks.v1.json`, 92 tasks) run with the compatible transport off (arm A) and on for every task host (arm B), in ABBA order, in two windows on different UTC days.

## How it was run

- Window 1: 2026-10-06 03:38–03:59 UTC, source `6afb057` (records `2026-10-06-g1-w1-*-6afb057.md`, comparison `2026-10-06-g1-w1-compare-6afb057.json`).
- Window 2: 2026-10-07 03:33–03:54 UTC, source `5afe577` (window 1's code plus its records and the `--paired` option of `ab-compare.mjs`), records `2026-10-07-g1-w2-*-5afe577.md`, comparison `2026-10-07-g1-w2-compare-5afe577.json`.
- Both windows: two local APIs, proxied (`HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:7890`, `NO_PROXY=localhost,127.0.0.1,::1`), each on a fresh task root.
  - A on port 8797, no grant.
  - B on port 8798, `W2L_ACCESS_GRANT=.w2l/access/grant-compat.json` (`{"tier":"standard","capabilities":["compatible_transport"]}`) and `W2L_COMPAT_HOSTS` set to all 91 task hosts. impit 0.14.5, profile chrome142.
  - Each API's startup lines were identical in both windows.
- Each pass: `W2L_API_URL=http://127.0.0.1:<port> node research/access/run-set.mjs --set all --record research/access/runs/<date>-g1-<window>-<pass>-<commit>.md`, cold attempts.
- Comparison: `node research/access/ab-compare.mjs --a <A1>,<A2> --b <B1>,<B2> --paired http_compat --record <file>`.

## Results

| | Window 1 | Window 2 |
| --- | --- | --- |
| Verified, A (off), two passes | 35, 34 | 37, 35 |
| Verified, B (on), two passes | 42, 42 | 40, 40 |
| False successes, A / B (attempts) | 16 / 22 | 14 / 25 |
| Frozen tasks (50): gain / regression / unstable | 6 / 0 / 1 | 5 / 0 / 0 |
| Healthy tasks (25): gain / regression | 0 / 1 | 0 / 1 |
| Blind tasks (14): gain / regression | 1 / 0 | 1 / 0 |
| Paired latency (median of B/A per task, limit 1.20) | 0.901 over 33 tasks: met | 0.906 over 34 tasks: met |

A gain means B verified the task in both passes of the window and A in neither; a regression is the reverse.

**Gains in both windows** (frozen): www.ironmountain.com (T007), fred.stlouisfed.org (T009), www.wayfair.com (T018), www.idealo.de (T029), www.investing.com (T057). Blind: www.allrecipes.com (B009).

**Gain in window 1 only:** www.bloomberg.com (T065). In window 2 arm A verified it too, so the gain is not attributable to the transport. www.temu.com (T031) was a gain in window 1 and unstable in window 2.

**Regression in both windows:** medium.com (T074, healthy). A verified it, B failed it.

**False successes added by the transport in both windows:** www.bestbuy.com (T013), www.zalando.de (T026) and www.reddit.com (T075). In each case B answered `success` from the `http_compat` rung with content that failed the task's data checks, where A answered a failure. Two further tasks added a false success only in some passes: www.facebook.com (T081, browser lane, both windows) and ec.europa.eu (T055, browser lane, window 2 only). These pages were not read further to see what the transport returned instead of the data; that is not isolated.

**Health batches** (window 1 only, records `2026-10-06-g1-health-*-6afb057.md`, compatible transport on for the batch hosts):
- Batches 1 and tables pass the same off and on.
- The failing checks on in L (2 cases) and F (14 cases) name the channel (`channelsTried`, `summary.attempts.0.channel`, a trace event): the transport replaced the `http` rung, as expected.
- F11 and F12 fail the same checks off and on.
- No content check failed on that passed off.

## Verdict

- **The rule for adopting a host is met by five hosts.** For each, the transport verified a frozen task in both windows, with no regression and within the latency limit: www.ironmountain.com, fred.stlouisfed.org, www.wayfair.com, www.idealo.de and www.investing.com. These are the recommended `W2L_COMPAT_HOSTS` until route memory with expiry replaces the list.
- **Not recommended:**
  - medium.com, which regressed;
  - www.bestbuy.com, www.zalando.de and www.reddit.com, where the transport turns a refusal into a false success;
  - www.bloomberg.com and www.temu.com, whose gain did not hold in both windows;
  - www.allrecipes.com, because blind tasks never seed a routing list.
- **The transport is not to be turned on for every host:** across the whole set it adds false successes (16→22 and 14→25 attempts).
- **Not established here:**
  - why the five hosts accept the transport;
  - what the transport received on the three false-success hosts.
</content>
</invoke>
