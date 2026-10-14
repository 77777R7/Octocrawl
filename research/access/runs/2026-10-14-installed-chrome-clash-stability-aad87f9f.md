# installed_chrome on the Clash exit: four runs in one afternoon, 2026-10-14

Label: `product`. The final commit of #493 verified 11 and then 7 of the 16 challenge tasks, in two runs back to back on the Clash exit ([acceptance record](2026-10-14-installed-chrome-acceptance-7b56397b.md)). Two runs cannot give a rate. This record adds four more runs of the same code on the same exit, so the run-to-run spread can be read.

## How it was run

- **Code.** Main at `aad87f9f`. Its product code (`packages/`) is the same as `7b56397b`. Every run's summary reports `dirty: false`.
- **Local setup.** The local Octocrawl API on port 8787, a fresh API process per run, installed Google Chrome 155.0.8059.40 headed, and an access grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **Exit.** Clash at `127.0.0.1:7890`.
- **Command:** `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses`, with `W2L_EGRESS_ECHO_URL=https://api.ipify.org`.
- **Spacing.** The plan was four runs two hours apart. Runs 3 and 4 were brought forward at Howard's request and ran back to back. So this is one afternoon, not different times of day.

| Run | Start (UTC) | Start (local) | Exit address | Run directory |
| --- | --- | --- | --- | --- |
| 1 | 04:23:58 | 12:23 | 103.142.140.55 | `2026-10-14T04-24-00-621Z` |
| 2 | 06:28:23 | 14:28 | 103.142.140.60 | `2026-10-14T06-28-26-038Z` |
| 3 | 07:22:05 | 15:22 | 103.142.140.156 | `2026-10-14T07-22-07-737Z` |
| 4 | 07:26:33 | 15:26 | 103.142.140.131 | `2026-10-14T07-26-35-413Z` |

**The Clash exit is not one fixed address.** Each run's echo saw a different address in 103.142.140.0/24. The earlier records describe it as a single exit; it is a pool in one /24. These runs did not record whether the address also changes within a run.

## The 16 tasks

| Task | Run 1 | Run 2 | Run 3 | Run 4 | Held |
| --- | --- | --- | --- | --- | --- |
| T001 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| T034 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| T047 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| T049 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| T053 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| B008 | ✓ | ✓ | ✓ | ✓ | 4/4 |
| T002 | ✓ | ✓ | ✓ | ✗ challenge | 3/4 |
| T046 | ✗ DataDome | ✓ | ✓ | ✓ | 3/4 |
| T076 | ✓ | ✓ | ✓ | ✗ challenge | 3/4 |
| B001 | ✓ | ✗ challenge | ✓ | ✓ | 3/4 |
| T071 | ✓ | ✗ challenge | ✓ | ✗ challenge | 2/4 |
| T038 | ✗ DataDome | ✓ | ✗ DataDome | ✗ DataDome | 1/4 |
| T005 | ✗ success, data checks failed | ✗ success, data checks failed | ✗ success, data checks failed | ✗ success, data checks failed | 0/4 |
| T045 | ✗ DataDome | ✗ DataDome | ✗ DataDome | ✗ DataDome | 0/4 |
| T048 | ✗ challenge | ✗ challenge | ✗ challenge | ✗ challenge | 0/4 |
| T068 | ✗ DataDome | ✗ DataDome | ✗ DataDome | ✗ DataDome | 0/4 |
| **Verified** | **10** | **10** | **11** | **8** | |
| False success | 1 (T005) | 1 (T005) | 1 (T005) | 1 (T005) | |
| p50 / p95 ms | 15748 / 25925 | 15132 / 29060 | 14051 / 26710 | 21215 / 26914 | |

## What this shows

- **Six runs of this code on Clash now give 11, 7, 10, 10, 11 and 8: a mean of 9.5 of 16, and a spread of 7 to 11.** The run of 7 in the acceptance record was the low end of this spread, not a broken exit.
- **The tasks fall into three groups:**
  - **Six held every time:** T001, T034, T047, T049, T053, B008.
  - **Five held sometimes:** T002, T046, T076, B001 three times; T071 twice; T038 once. All the variance between runs comes from these, and from which of Cloudflare's or DataDome's checks let this run's address through.
  - **Four never held:** T005, T045, T048 and T068.
- **T005 is a false success every time.** Etsy's home page comes back `success` while its data checks fail; the product's own `verification` says `failed` each time.
  - It is the one repeatable false success in this set. A candidate fix is to give the region wait more time once a check has cleared: in the acceptance runs, the wait reached its 10 s limit while the page was still loading.
- **T048 never got through Clash in these four runs.** On Clash it held in the first run of `0080ff3d` and the first run of `7b56397b`, and in both runs of `d34ea24b`. It never got through Webshare, sticky or rotating.

## Not shown

- Different times of day or days. Runs 3 and 4 were back to back.
- Whether the Clash address changes within a run.
- The bandwidth used.
