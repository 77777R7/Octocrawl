# installed_chrome on Cloud Run under Xvfb, 2026-10-14

Label: `product`. ADR 0005 keeps `installed_chrome` local because a server has no display, and opens it to hosting only after a measurement with a virtual display (Xvfb). This record is that measurement: the same 16 challenge tasks, once, from a Cloud Run job.

## How it was run

- **Code.** `ee53419e`, which is main at `a449d275` plus this PR's research files. Its product code (`packages/`) is the same as `3dd497ef`, which the local runs used.
- **Image.** `research/access/cloudrun-xvfb/Dockerfile`, built by `build.sh` in the same directory. It contains:
  - Google Chrome stable from Google's apt repository: 155.0.8059.79;
  - Xvfb, with a 1920×1080×24 screen;
  - Octocrawl with the bundled Chromium for the browser lane.
- **Chrome's sandbox stays on.** Chrome runs as a non-root user, so the launch keeps the measured flags and adds no `--no-sandbox`.
- **Job.** Cloud Run job `octocrawl-ic-xvfb` in project `octopus-w2l-20260924-7r7`, region `asia-southeast1`:
  - execution environment gen2, 4 vCPU, 8 GiB;
  - one task, no retries;
  - execution `octocrawl-ic-xvfb-8hjzp`.
- **What the job runs.** `run.sh` starts Xvfb and then the local API. The grant names `installed_chrome` alone, set in `W2L_ACCESS_GRANT`. The job then runs `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses` once, and `summarize.mjs` prints each task to the job's log.
- **Run.** `2026-10-14T03-36-57-129Z` (UTC).
- **Exit.** Cloud Run's own egress, with no proxy. The run's echo (`W2L_EGRESS_ECHO_URL=https://api.ipify.org`) recorded 34.96.48.15, an address of Google Cloud.

## The 16 tasks

| Task | Cloud Run, Xvfb (one run) | Gate on Cloud Run | Clash data centre, local (two runs) | Webshare residential, local (two runs) |
| --- | --- | --- | --- | --- |
| T001 | ✗ | 403, "verify you are human" | ✓ ✓ | ✓ ✗ |
| T002 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✗ | ✓ ✓ |
| T005 | ✗ | 403 `x-datadome`, waited 19 s | ✗ ✗ | ✗ ✓ |
| T034 | ✗ | 403 `x-datadome`, waited 19 s | ✓ ✗ | ✓ ✓ |
| T038 | ✗ | 403 `x-datadome`, waited 19 s | ✗ ✗ | ✓ ✓ |
| T045 | ✗ | 403 `x-datadome`, waited 19 s | ✗ ✗ | ✗ ✗ |
| T046 | ✗ | 403 `x-datadome`, waited 19 s | ✗ ✗ | ✓ ✓ |
| T047 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✓ | ✗ ✗ |
| T048 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✗ | ✗ ✗ |
| T049 | ✓ | the check cleared in 6 s | ✓ ✓ | ✓ ✓ |
| T053 | ✗ | 403 "access denied" | ✓ ✓ | ✓ ✗ |
| T068 | ✗ | 403 `cf-mitigated`, waited 19 s | ✗ ✗ | ✗ ✗ |
| T071 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✓ | ✓ ✗ |
| T076 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✓ | ✓ ✓ |
| B001 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ ✗ | ✗ ✗ |
| B008 | ✓ | — | ✓ ✓ | ✓ ✓ |
| **Verified** | **2** | | **11, 7** | **10, 8** |

The local columns are from [the two-exit record](2026-10-14-installed-chrome-exits-3dd497ef.md). p50 / p95 on Cloud Run were 21769 / 28310 ms. There was no false success.

## What this shows

- **The route runs on Cloud Run.** In every task the rung launched headed Chrome under Xvfb, with Chrome's own sandbox as a non-root user, and read the page. It produced no launch errors, no missing display and no `browser_unavailable`. The rung's trace named Chrome 155.0.8059.79 throughout.
- **From Cloud Run's own address it gets through almost nothing: 2 of 16.**
  - The pages answered with the blocks of every vendor: Cloudflare (`cf-mitigated`), DataDome, and a generic 403.
  - T053 passed in three of the four local runs, on both exits; the fourth timed out on Webshare. It refused this address outright with a 403 "access denied", before any challenge.
  - That points to the address, not Xvfb or the server: a Google Cloud address is refused by sites that let both a data-centre proxy exit and residential exits through.
- **What is still not separated.** This run does not tell how Xvfb itself is seen, apart from the address. That needs the same job through another exit, such as the Webshare gateway that got 10 and 8 locally.
- **For hosting, then:**
  - The display is not the obstacle; the egress is.
  - A hosted `installed_chrome` would need an exit other than Cloud Run's own.
  - The ADR keeps it local until such a run shows otherwise.

## Not shown

- More than one run.
- Cloud Run through another exit (Webshare, Clash-like data-centre proxies).
- Another region.
- The job's cost (one execution of about 6 minutes at 4 vCPU and 8 GiB).
