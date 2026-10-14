# installed_chrome with and without ad blocking, 2026-10-14

Label: `product`. The probe the installed_chrome route was built from (12 and 12 of 16) did none of the browser lane's own steps. One of those steps is ad blocking (`blockAds`, on by default). This record is TASKS item 6, a one-variable A/B on the 16 challenge tasks: the product as it is (A) against the same requests with `blockAds: false` (B).

## How it was run

- **Code and API.** Commit `112fd888`, whose product code (`packages/`) is main at `8c65b575` (after #500). One local API process for all eight runs: installed Google Chrome 155.0.8059.40 headed, the Clash exit, and a grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **Command:** `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses`. Arm B adds `--request '{"blockAds":false}'` (added in this PR), which sends `blockAds: false` with every task.
- **Order.** B1, A1, A2, B2, then B3, A3, A4, B4, back to back from 10:06 to 10:43 UTC. Every run summary has `dirty: false`.
- **Raw runs.** `.w2l/access/archive/2026-10-14/blockads` and `blockads-2`, outside the repository.

| Run | B1 | A1 | A2 | B2 | B3 | A3 | A4 | B4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Directory (UTC) | `10-06-28-063Z` | `10-10-21-514Z` | `10-14-32-844Z` | `10-17-54-333Z` | `10-28-20-870Z` | `10-31-55-309Z` | `10-35-24-218Z` | `10-39-29-327Z` |
| Verified | 12 | 9 | 12 | 12 | 12 | 11 | 9 | 11 |
| False success | 0 | 0 | 0 | 0 | 1 (T005) | 0 | 0 | 0 |

## Results

| | A: ad blocking (default) | B: `blockAds: false` |
| --- | --- | --- |
| Verified per run | 9, 12, 11, 9 | 12, 12, 12, 11 |
| **Total** | **41 of 64** | **47 of 64** |

| Task | A | B |
| --- | --- | --- |
| T046 (DataDome) | 0/4 | **3/4** |
| T038 (DataDome) | 0/4 | **2/4** |
| T001 | 2/4 | 3/4 |
| T048 | 3/4 | 4/4 |
| T005 | 2/4 | 1/4 |
| The other eleven | same | same |

- T034 was 2/4 in both arms. T045 and T068 never passed in either.
- The rest passed every time in both arms: T002, T047, T049, T053, T071, T076, B001, B008.

## What this shows

- **B is ahead by 6 attempts, nearly all on two DataDome tasks:** T038 and T046 together were 0 of 8 in A and 5 of 8 in B. Taken alone, that split has a one-sided Fisher p of about 0.013. The two tasks were picked after the runs, so this is a lead, not a measured effect.
- **Ad blocking blocked nothing on the tasks that differ.** The lane records `ads_blocked` before it judges a page blocked. No answer for T005, T034, T038, T046 or T048 in A1 or A2 carries one. The pages it did block on were T049, T071 and T076 (doubleclick, adroll, googlesyndication), and those passed in both arms.
- **So B's gain is not a request that ad blocking held back.** The other difference between the arms is how the lane talks to the page:
  - With ad blocking on, it opens a CDP session on the page and sends `Network.enable` and `Network.setBlockedURLs` before navigating.
  - With it off, on installed_chrome, it opens no session at all. Installed_chrome uses Chrome's own identity, which has no override, and these requests send no custom headers.
  - Whether DataDome sees that session is not shown.
- **One false success, T005 in B3, is a different problem.** The region wait read the live page with 6 prices and both checks holding, without scrolling, at 563 ms. The answer's Markdown then failed its checks, with readiness `not_extracted`. The data was on the page and was lost on the way to the Markdown: the risk TASKS item 5 names, seen here for the first time.

## What follows

- **A lead to test, not a default to change yet.** The next run keeps ad blocking off and opens the same CDP session with `Network.enable`. If T038 and T046 fall back, the session is what DataDome reads; if not, ad blocking itself is.
- Either way, the candidate change is for the installed_chrome rung alone: no CDP session on its page unless a request needs one. The browser lane's other rungs keep ad blocking.
- The T005 sample in B3 goes to TASKS item 5.

## Not shown

- Other exits, other days, more than four runs per arm.
- Which CDP call, if any, DataDome reacts to.

## Corrections

- 2026-10-14: the lead above did not hold. A follow-up A/B tested what this record left as the one remaining difference: ad blocking off in both arms, a CDP session with `Network.enable` forced in one ([record](2026-10-14-installed-chrome-cdp-session-aca819b8.md)). It found no effect, 35 of 64 in each arm.
  - That run's B configuration was the same as this record's B. It verified 35 of 64 two hours later, against 47 here, and T046 went from 3 of 4 to 0 of 4.
  - B's lead here is therefore best read as run-to-run variation, not an effect of ad blocking or of the session.
  - The next step this record proposed was done. Neither default changes.

