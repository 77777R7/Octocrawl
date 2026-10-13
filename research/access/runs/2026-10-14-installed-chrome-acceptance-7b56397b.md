# installed_chrome product acceptance, 2026-10-14

Label: `product`. This is the ADR 0005 acceptance of the `installed_chrome` rung (#492): the product on the 16 challenge tasks at least twice, and no regression on the full task set or the real-site batch. The first runs showed the rung as merged fell far short of the probe it was built from. Three fixes in this PR closed most of the gap:

- a wait for a check that clears itself;
- a gate classifier fix;
- a review fix, so the wait looks only at decisive evidence.

The last two runs are of the final commit, `7b56397b`.

## How it was run

- **API.** The local Octocrawl API (`npm run api -- --port 8787`) through the Clash data-centre exit `127.0.0.1:7890` (`HTTPS_PROXY`), on Howard's Mac (arm64).
- **Chrome.** Installed Google Chrome 155.0.8059.40, headed.
- **Grant.** An access grant naming `installed_chrome` alone (tier enhanced, attested by Howard on 2026-10-14). No paid route could take part.
- **The 16 tasks.**
  - Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access '"enhanced"' --save-responses`.
  - The runs' saved responses are in the git-ignored `.w2l/access/runs/` of the worktrees named below.
- **Each answer passed through `http`, then `browser_local`, then `installed_chrome`.** The rung ran on every task that the first two did not answer (`channelsTried`).
- **Timestamps.** Run directories are named in UTC (2026-10-13); this file is named in the operator's time zone.

## The 16 tasks

| Task | main `ebbea3d6` (as merged) | + challenge wait `d34ea24b`, run 1 | run 2 | + classifier fix `0080ff3d`, run 1 | run 2 | **Final `7b56397b`, run 1** | **run 2** | Probe: Playwright over CDP, run 1 | run 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T002 | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✗ cloudflare_challenge | ✓ | ✓ |
| T005 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ success, data checks failed | ✗ bot_detected_generic | ✗ success, data checks failed | ✗ bot_detected_generic | ✗ | ✗ |
| T034 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✓ | ✗ bot_detected_generic | ✓ | ✗ bot_detected_generic | ✓ | ✓ |
| T038 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✓ | ✓ |
| T045 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ | ✗ |
| T046 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✓ | ✓ |
| T047 | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T048 | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✗ cloudflare_challenge | ✓ | ✗ cloudflare_challenge | ✗ | ✗ |
| T049 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T053 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T068 | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ | ✗ |
| T071 | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T076 | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B001 | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✗ cloudflare_challenge | ✓ | ✓ | ✓ | ✗ cloudflare_challenge | ✓ | ✓ |
| B008 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Verified** | **2** | **6** | **6** | **11** | **9** | **11** | **7** | **12** | **12** |
| False success | 0 | 0 | 0 | 1 (T005) | 0 | 1 (T005) | 0 | | |
| p50 / p95 ms | 4697 / 25650 | 23509 / 25509 | 22734 / 29264 | 10951 / 26693 | 22027 / 23756 | 13062 / 25339 | 22044 / 23488 | | |

Run directories:

| Column | Worktree | Run directory |
| --- | --- | --- |
| main | `ic-accept` | `2026-10-13T17-51-32-739Z` |
| challenge wait, run 1 | `ic-wait` | `2026-10-13T17-53-51-816Z` |
| challenge wait, run 2 | `ic-wait` | `2026-10-13T17-58-32-978Z` |
| classifier fix, run 1 | `ic-wait` | `2026-10-13T18-47-53-075Z` |
| classifier fix, run 2 | `ic-wait` | `2026-10-13T18-51-50-039Z` |
| final, run 1 | `ic-wait` | `2026-10-13T19-27-31-444Z` |
| final, run 2 | `ic-wait` | `2026-10-13T19-31-28-096Z` |

The probe columns are from [the Playwright-over-CDP record](2026-10-14-library-probe-pwcdp.md).

## What each step found

### 1. As merged: 2 of 16

The rung answered `blocked` as soon as it saw a challenge. A T002 smoke test showed the sequence: a 403 with `cf-mitigated: challenge`, rendered after about a second, then `gate_detected`. The probe instead re-read the page for up to 20 s, while Cloudflare's managed challenge ran its script and loaded the real page.

### 2. Waiting out a check: 6 of 16, twice

The rung now re-reads the page once a second for up to 20 s (`challenge_wait`). It never clicks or types. Four more tasks were verified.

The trace showed a second gap:
- **"Cleared" pages re-flagged as blocks.** On T002, T076 and B001 the wait ended `cleared`, and the page was then still classified as a block.
- **Waits that never ended.** The DataDome tasks waited 20 s and ended `still_gated`.

Running the installed Chrome directly on these pages (12 s each) gave:

| Page | What Chrome got | What the classifier flagged |
| --- | --- | --- |
| etsy.com (T034) | 200, 16,698 characters of the real page | `x-datadome: protected` |
| tripadvisor.com (T038) | a 403 DataDome block, then a 200 real page of 22,556 characters | `x-datadome: protected` on the 200 too |
| ember-energy.org (T002), stackoverflow.com (T076) | a 403 challenge, then the 200 real page | `/cdn-cgi/challenge-platform/scripts/precursor/main.js`, which Cloudflare serves on the page past the challenge |
| g2.com (T046) | a genuine block: 403, `x-datadome-cid`, `x-dd-b`, a captcha-delivery iframe | (correct) |

The gate classifier took the `x-datadome` header as decisive on any status. It also exempted only Cloudflare's `jsd` script, not `precursor`.

### 3. Classifier fix: 11 and 9

- `x-datadome` alone names a block only on a non-2xx answer. DataDome's own block is a 403 with `x-datadome-cid` and `x-dd-b`, and its interstitial and captcha are still named from the body.
- The `precursor` script is exempt, like `jsd`.

Results:
- **Verified in both runs: 9 tasks.** T001, T002, T047, T049, T053, T071, T076, B001, B008.
- **Verified in one run:**
  - T034 and T048, in run 1 only. T048 was the one task where Playwright over CDP and raw CDP differed in the probe.
  - T005 got through DataDome in run 1, but Etsy's home page was still loading (`readiness: not_loaded`) and its data checks failed. That answer is the one false success. The product's own `verification` said `failed`.
- **Not verified in either run:**
  - T038 was blocked again in both runs. In the direct look above the same page cleared to its real content; whether the 20 s wait or the exit decides it is not isolated.
  - T046, T045 and T068 were genuine DataDome blocks. The probe also failed T045 and T068.

### 4. Final commit: 11 and 7

After review, the wait looks only at decisive evidence (`contentful: true`): a vendor's challenge header or plumbing, its widget, or a wall. An ordinary page that loads a captcha script for a form, or says "please wait", is not waited on.

- **Run 1: 11 tasks, the same set as run 1 of `0080ff3d`.**
- **Run 2: 7 tasks.** Compared with run 1, it lost T002, B001, T048 and T034.
  - On all four, Chrome waited the full 19 s and the page was still a real 403 challenge:
    - T002 and B001: `cf-mitigated`;
    - T048: Cloudflare's "attention required";
    - T034: DataDome's 403.
  - So the sites did not let this Chrome through this time. It was not a misreading.
  - By then this exit had carried six rounds of the 16 tasks and two rounds of the 92 within about 1.5 hours. Whether the exit's standing with these sites is what changed is not shown.

**Against the probe: 11 and 9, then 11 and 7, against 12 and 12.** The rung is within run-to-run variance of the probe on the Cloudflare tasks. It is behind on two DataDome tasks (T038, T046) that the probe passed in both runs.

## No regression elsewhere

The classifier serves every lane. So main and this branch were run back to back on the same machine and exit, without the grant (default access):
- the full task set (`run-set.mjs --set all`);
- the real-site batch L (`research/parity/run-sites.mjs --batch L`).

| | main `ebbea3d6` | branch `0080ff3d` |
| --- | --- | --- |
| 92 tasks verified | 43 | 42 |
| False success | 2 | 2 |
| p50 / p95 ms | 3389 / 14526 | 3059 / 13993 |
| Real-site batch L | 12/12 cases, 85/85 checks | 12/12 cases, 85/85 checks |

Four tasks differ:
- **T034:** blocked on main, verified on the branch. This is the DataDome fix.
- **T068:** blocked on both, by different gates.
- **T020 (newegg.com) and T051 (indeed.com):** verified on main, then `cloudflare_challenge` on the branch.
  - The branch's traces show a real Cloudflare challenge: a 403 with `cf-mitigated: challenge`. That rule is untouched by the fix, and the fix only removes block verdicts.
  - The branch side ran right after main from the same exit, so these are the sites' answers, not a change in the code.

## Not shown

- The Webshare exit.
- Other Chrome versions.
- More than two runs per commit, and runs spread over time rather than back to back on one exit.
- Why the stand-in Chromium of the integration tests once could not reach a loopback server for a stretch of runs on this Mac. It recovered after orphaned test browsers were killed; the cause is not confirmed.
